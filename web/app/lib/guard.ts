/**
 * Warden guard motoru — SİTE İÇİNDE (in-process) çalışan sürüm.
 * Böylece web tek başına deploy edilir; ayrı API host'una gerek yok.
 * Kök repodaki Hono API ile AYNI mantık (deterministik karar + degrade kuralı).
 *
 * Gerekli env (web projesinde):
 *   BAZAAR_BASE_URL          (vars. https://402.com.tr)
 *   BAZAAR_INTERNAL_SECRET   (Bazaar'ı ödemeden çağırmak için; X-Warden-Internal)
 */

import { decodeCalldata, type DecodedCall } from "@warden/core";
export { decodeCalldata }; // re-export so other web modules keep importing from ./guard

// ── tipler ────────────────────────────────────────────────────────
export type Decision = "block" | "review" | "clear";
export type SignalStatus = "ok" | "warn" | "fail" | "unknown";
export type SignalCategory =
  | "honeypot" | "liquidity" | "holder_concentration" | "contract_risk"
  | "approvals" | "sanctions" | "age_activity" | "metadata" | "simulation";

export interface SignalResult {
  category: SignalCategory;
  status: SignalStatus;
  weight: number;
  score: number;
  source: string;
  detail?: string;
  evidence?: Record<string, unknown>;
}
export type ReasonCode =
  | "HONEYPOT_DETECTED" | "SELL_TAX_EXCESSIVE" | "LIQUIDITY_LOW" | "LIQUIDITY_UNLOCKED"
  | "OWNER_CAN_MINT" | "OWNER_CAN_BLACKLIST" | "PROXY_UPGRADEABLE"
  | "HOLDER_CONCENTRATION_HIGH" | "DANGEROUS_APPROVAL" | "SANCTIONED_ADDRESS"
  | "CONTRACT_TOO_NEW" | "SOURCE_UNVERIFIED" | "SIGNAL_UNAVAILABLE"
  | "TX_WILL_REVERT" | "CALL_TO_NON_CONTRACT" | "UNEXPECTED_ASSET_OUTFLOW";

export interface Verdict {
  verdictId: string;
  schemaVersion: "0";
  issuedAt: string;
  target: Record<string, unknown>;
  decision: Decision;
  riskScore: number;
  confidence: number;
  reasons: ReasonCode[];
  signals: SignalResult[];
  summary: string;
  degraded: boolean;
  latencyMs: number;
  decoded?: { kind: string; selector: string; unlimited: boolean; approvedAll: boolean };
  counterparty?: string;
}

// ── config ────────────────────────────────────────────────────────
const BLOCK_THRESHOLD = Number(process.env.WARDEN_BLOCK_THRESHOLD ?? 70);
const REVIEW_THRESHOLD = Number(process.env.WARDEN_REVIEW_THRESHOLD ?? 35);
const HARD_BLOCK: SignalCategory[] = ["honeypot", "sanctions"];
const CRITICAL_FOR_DEGRADE: SignalCategory[] = ["honeypot", "contract_risk", "liquidity", "sanctions"];

// ── bazaar client ─────────────────────────────────────────────────
const BASE_URL = process.env.BAZAAR_BASE_URL ?? "https://402.com.tr";
const INTERNAL_SECRET = process.env.BAZAAR_INTERNAL_SECRET ?? "";
const TIMEOUT_MS = Number(process.env.BAZAAR_TIMEOUT_MS ?? 4000);

interface BazaarResult { ok: boolean; data?: unknown; status?: number; error?: string }

// In-memory TTL cache — token risk changes slowly, so caching repeat calls
// slashes upstream cost (margin protection). Only successful reads are cached.
const CACHE_TTL_MS = Number(process.env.BAZAAR_CACHE_TTL_MS ?? 300_000); // 5 min
const gc = globalThis as unknown as { __wardenBazaarCache?: Map<string, { at: number; val: BazaarResult }> };
const cache = gc.__wardenBazaarCache ?? (gc.__wardenBazaarCache = new Map());

async function bazaarGet(path: string, params: Record<string, string>): Promise<BazaarResult> {
  const url = `${BASE_URL}${path}?${new URLSearchParams(params).toString()}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.val;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...(INTERNAL_SECRET ? { "X-Warden-Internal": INTERNAL_SECRET } : {}) },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 402) return { ok: false, status: 402, error: "Bazaar 402 — internal-auth yok" };
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    const val: BazaarResult = { ok: true, status: res.status, data: await res.json() };
    cache.set(url, { at: Date.now(), val }); // cache successes only
    return val;
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: aborted ? `timeout>${TIMEOUT_MS}ms` : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// ── yardımcılar ───────────────────────────────────────────────────
function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : undefined;
  return n !== undefined && Number.isFinite(n) ? n : undefined;
}
function rec(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}
function payload(r: BazaarResult): Record<string, unknown> | undefined {
  if (!r.ok || !r.data) return undefined;
  const outer = rec(r.data);
  return rec(outer?.data) ?? outer;
}
const UNKNOWN = (category: SignalCategory, source: string, detail: string): SignalResult =>
  ({ category, status: "unknown", weight: 0, score: 0, source, detail });

// ── token sinyalleri (token-risk → 3, pools → 1, sanctions → 1) ───
function honeypotFromRisk(p?: Record<string, unknown>): SignalResult {
  const sec = rec(p?.security);
  if (!sec) return UNKNOWN("honeypot", "token-risk", "security yok");
  const isHoneypot = sec.isHoneypot === true;
  const sellTax = num(sec.sellTaxPct) ?? 0, buyTax = num(sec.buyTaxPct) ?? 0;
  const reasonCodes: ReasonCode[] = [];
  let score = 0; let status: SignalStatus = "ok";
  if (isHoneypot) { score = 100; status = "fail"; reasonCodes.push("HONEYPOT_DETECTED"); }
  else if (sellTax >= 30 || buyTax >= 30) { score = 85; status = "fail"; reasonCodes.push("SELL_TAX_EXCESSIVE"); }
  else if (sellTax >= 10 || buyTax >= 10) { score = 50; status = "warn"; reasonCodes.push("SELL_TAX_EXCESSIVE"); }
  return { category: "honeypot", status, weight: 0.30, score, source: "token-risk",
    detail: isHoneypot ? "honeypot detected" : `tax ${buyTax}%/${sellTax}%`, evidence: { reasonCodes } };
}
function contractRiskFromRisk(p?: Record<string, unknown>): SignalResult {
  const sec = rec(p?.security);
  if (!sec && p?.upgradeableProxy === undefined) return UNKNOWN("contract_risk", "token-risk", "kontrat alanı yok");
  const ownership = rec(p?.ownership); const reasonCodes: ReasonCode[] = []; let score = 0;
  if (sec?.isMintable === true) { score += 40; reasonCodes.push("OWNER_CAN_MINT"); }
  if (sec?.canTakeBackOwnership === true) score += 40;
  if (sec?.hiddenOwner === true) score += 40;
  if (sec?.transferPausable === true) { score += 25; reasonCodes.push("OWNER_CAN_BLACKLIST"); }
  if (p?.upgradeableProxy === true) { score += 20; reasonCodes.push("PROXY_UPGRADEABLE"); }
  if (sec?.isOpenSource === false) { score += 30; reasonCodes.push("SOURCE_UNVERIFIED"); }
  if (ownership?.renounced === false) score += 10;
  score = Math.min(100, score);
  const status: SignalStatus = score >= 70 ? "fail" : score >= 35 ? "warn" : "ok";
  return { category: "contract_risk", status, weight: 0.20, score, source: "token-risk",
    detail: reasonCodes.length ? "owner control risk" : "contract controls clean", evidence: { reasonCodes } };
}
function holdersFromRisk(p?: Record<string, unknown>): SignalResult {
  const sec = rec(p?.security);
  const top10 = num(sec?.top10HolderPct) ?? num(sec?.topHolderPct);
  if (top10 === undefined) return UNKNOWN("holder_concentration", "token-risk", "holder % yok");
  const reasonCodes: ReasonCode[] = []; let score: number; let status: SignalStatus;
  if (top10 >= 80) { score = 90; status = "fail"; reasonCodes.push("HOLDER_CONCENTRATION_HIGH"); }
  else if (top10 >= 50) { score = 70; status = "fail"; reasonCodes.push("HOLDER_CONCENTRATION_HIGH"); }
  else if (top10 >= 30) { score = 45; status = "warn"; reasonCodes.push("HOLDER_CONCENTRATION_HIGH"); }
  else { score = Math.round(top10 / 2); status = "ok"; }
  return { category: "holder_concentration", status, weight: 0.15, score, source: "token-risk",
    detail: `top-10 holders ~${top10.toFixed(1)}%`, evidence: { reasonCodes } };
}
function liquidityFromPools(r: BazaarResult): SignalResult {
  const p = payload(r);
  if (!p) return UNKNOWN("liquidity", "token-pools", r.error ?? "veri yok");
  const pools = Array.isArray(p.pools) ? (p.pools as unknown[]) : undefined;
  if (!pools) return UNKNOWN("liquidity", "token-pools", "pools yok");
  const totalLiq = pools.reduce<number>((s, pool) => s + (num(rec(pool)?.liquidityUsd) ?? 0), 0);
  const reasonCodes: ReasonCode[] = []; let score: number; let status: SignalStatus;
  if (totalLiq < 5_000) { score = 80; status = "fail"; reasonCodes.push("LIQUIDITY_LOW"); }
  else if (totalLiq < 25_000) { score = 45; status = "warn"; reasonCodes.push("LIQUIDITY_LOW"); }
  else { score = 10; status = "ok"; }
  return { category: "liquidity", status, weight: 0.20, score, source: "token-pools",
    detail: `liquidity ~$${Math.round(totalLiq).toLocaleString("en-US")} (${pools.length} pools)`, evidence: { reasonCodes, totalLiq } };
}
function sanctionsFrom(r: BazaarResult, who = "adres"): SignalResult {
  const p = payload(r);
  if (!p || p.sanctioned === undefined) return UNKNOWN("sanctions", "sanctions", r.error ?? "veri yok");
  const matched = p.sanctioned === true;
  return { category: "sanctions", status: matched ? "fail" : "ok", weight: 0.05, score: matched ? 100 : 0,
    source: "sanctions", detail: matched ? `${who} on OFAC list` : `${who} not on OFAC list`,
    evidence: { reasonCodes: matched ? (["SANCTIONED_ADDRESS"] as ReasonCode[]) : [] } };
}

async function collectTokenSignals(address: string): Promise<SignalResult[]> {
  const [risk, pools, sanctions] = await Promise.all([
    bazaarGet("/api/x402/token-risk", { address }),
    bazaarGet("/api/x402/token-pools", { address }),
    bazaarGet("/api/x402/sanctions", { address }),
  ]);
  const p = payload(risk);
  return [honeypotFromRisk(p), contractRiskFromRisk(p), holdersFromRisk(p), liquidityFromPools(pools), sanctionsFrom(sanctions, "token")];
}

// ── calldata decode + tx sinyalleri ───────────────────────────────
// decodeCalldata now comes from @warden/core (single source of truth).
type Decoded = DecodedCall;
function approvalSignal(dec: Decoded): SignalResult {
  const reasonCodes: ReasonCode[] = []; let status: SignalStatus = "ok"; let score = 0; let detail = `call: ${dec.kind}`;
  const isAppr = ["approve", "increaseAllowance", "permit", "permit2Approve"].includes(dec.kind);
  if (dec.kind === "setApprovalForAll" && dec.approvedAll) { status = "fail"; score = 90; reasonCodes.push("DANGEROUS_APPROVAL"); detail = "setApprovalForAll(true) — approval over all NFTs"; }
  else if (isAppr && dec.unlimited) { status = "fail"; score = 80; reasonCodes.push("DANGEROUS_APPROVAL"); detail = `unlimited allowance (${dec.kind})`; }
  else if (isAppr && (dec.amount ?? 0n) > 0n) { status = "warn"; score = 40; reasonCodes.push("DANGEROUS_APPROVAL"); detail = `allowance granted (${dec.kind})`; }
  return { category: "approvals", status, weight: 0.30, score, source: "calldata-decode", detail, evidence: { reasonCodes } };
}
async function txContractRisk(counterparty: string): Promise<SignalResult> {
  const r = await bazaarGet("/api/x402/token-risk", { address: counterparty });
  const p = payload(r); const sec = rec(p?.security);
  if (!p || (!sec && p.upgradeableProxy === undefined && p.isContract === undefined)) return UNKNOWN("contract_risk", "token-risk", r.error ?? "veri yok");
  if (p.isContract === false) return { category: "contract_risk", status: "ok", weight: 0.20, score: 5, source: "token-risk", detail: "counterparty is an EOA" };
  const reasonCodes: ReasonCode[] = []; let score = 0;
  if (sec?.isHoneypot === true) { score += 60; reasonCodes.push("HONEYPOT_DETECTED"); }
  if (p.upgradeableProxy === true) { score += 20; reasonCodes.push("PROXY_UPGRADEABLE"); }
  if (sec?.isMintable === true) { score += 20; reasonCodes.push("OWNER_CAN_MINT"); }
  if (sec?.isOpenSource === false) { score += 30; reasonCodes.push("SOURCE_UNVERIFIED"); }
  score = Math.min(100, score);
  const status: SignalStatus = score >= 70 ? "fail" : score >= 35 ? "warn" : "ok";
  return { category: "contract_risk", status, weight: 0.20, score, source: "token-risk", detail: reasonCodes.length ? "contract risk flags" : "contract clean", evidence: { reasonCodes } };
}

// ── pre-execution simulation (Base RPC) ───────────────────────────
// Runs the tx through the node WITHOUT sending it: catches reverts, calls to a
// codeless address, and — when an Alchemy RPC is configured — real asset moves.
// Best-effort: degrades to "unknown" on RPC failure (never fabricates a pass).
const SIM_RPC = process.env.SIM_RPC_URL || process.env.BASE_RPC_URL || "https://mainnet.base.org";
const SIM_TIMEOUT_MS = Number(process.env.SIM_TIMEOUT_MS ?? 4000);

async function simRpc(method: string, params: unknown[]): Promise<{ result?: unknown; error?: { message?: string } }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SIM_TIMEOUT_MS);
  try {
    const res = await fetch(SIM_RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store", signal: ctrl.signal,
    });
    return (await res.json()) as { result?: unknown; error?: { message?: string } };
  } finally { clearTimeout(timer); }
}

async function simulateTx(input: { from: string; to: string; calldata?: string; value?: string }): Promise<SignalResult> {
  const hasData = Boolean(input.calldata && input.calldata.length > 2 && input.calldata !== "0x");
  const value = input.value && /^0x[0-9a-fA-F]+$/.test(input.value) ? input.value : "0x0";
  const call = { from: input.from, to: input.to, data: input.calldata || "0x", value };
  try {
    const [codeRes, callRes] = await Promise.all([
      simRpc("eth_getCode", [input.to, "latest"]),
      simRpc("eth_call", [call, "latest"]),
    ]);
    // RPC itself unreachable → don't fabricate a verdict.
    if (codeRes.error && callRes.error && /timeout|fetch|network/i.test(callRes.error.message ?? "")) {
      return UNKNOWN("simulation", "sim-rpc", "simulation RPC unavailable");
    }
    const code = typeof codeRes.result === "string" ? codeRes.result : "0x";
    const hasCode = code !== "0x" && code.length > 2;
    const reasonCodes: ReasonCode[] = []; const notes: string[] = []; let score = 0; let status: SignalStatus = "ok";

    // 1) calldata aimed at an address with no contract code — the call does nothing
    //    on-chain (common in spoofed/typo'd targets and fake-approve phishing UIs).
    if (hasData && !hasCode) {
      status = "warn"; score = Math.max(score, 55); reasonCodes.push("CALL_TO_NON_CONTRACT");
      notes.push("calldata targets an address with no contract code");
    }
    // 2) the exact tx reverts on simulation → it would fail on-chain (wasted gas,
    //    frequently a malicious or malformed target).
    if (callRes.error) {
      status = status === "ok" ? "warn" : status; score = Math.max(score, 45); reasonCodes.push("TX_WILL_REVERT");
      notes.push(`simulation reverted: ${String(callRes.error.message ?? "revert").slice(0, 80)}`);
    }
    // 3) real asset-diff (Alchemy-only) — flags value/token actually leaving `from`.
    const changes = await simAssetChanges(call).catch(() => null);
    if (changes && changes.outflow) {
      // An outflow to something other than the intended `to`/counterparty is the
      // classic drainer tell (approve-then-pull, delegatecall siphon).
      if (changes.toUnexpected) {
        status = "fail"; score = Math.max(score, 80); reasonCodes.push("UNEXPECTED_ASSET_OUTFLOW");
        notes.push(`simulated outflow to an unexpected address (${changes.detail})`);
      } else if (status === "ok") {
        notes.push(`simulated outflow ${changes.detail}`);
      }
    }
    return { category: "simulation", status, weight: 0.20, score, source: "sim-rpc",
      detail: notes.join("; ") || "tx simulates cleanly (no revert)", evidence: { reasonCodes } };
  } catch {
    return UNKNOWN("simulation", "sim-rpc", "simulation unavailable");
  }
}

/** Alchemy-only asset-change simulation. Returns null when not configured/unsupported. */
async function simAssetChanges(call: { from: string; to: string; data: string; value: string }): Promise<{ outflow: boolean; toUnexpected: boolean; detail: string } | null> {
  if (!/alchemy/i.test(SIM_RPC)) return null;
  const res = await simRpc("alchemy_simulateAssetChanges", [{ from: call.from, to: call.to, value: call.value, data: call.data }]);
  const changes = (res.result as { changes?: Array<Record<string, unknown>> } | undefined)?.changes;
  if (!Array.isArray(changes)) return null;
  const from = call.from.toLowerCase(), to = call.to.toLowerCase();
  for (const c of changes) {
    if (String(c.from ?? "").toLowerCase() !== from) continue; // only outflows FROM the payer
    const recipient = String(c.to ?? "").toLowerCase();
    const amt = String(c.rawAmount ?? c.amount ?? "");
    const sym = String(c.symbol ?? c.assetType ?? "asset");
    return { outflow: true, toUnexpected: recipient !== to && recipient !== "", detail: `${amt} ${sym} → ${recipient.slice(0, 10)}…` };
  }
  return { outflow: false, toUnexpected: false, detail: "" };
}

// ── karar motoru ──────────────────────────────────────────────────
export function decide(signals: SignalResult[]) {
  const fails: ReasonCode[] = []; const warns: ReasonCode[] = [];
  for (const s of signals) {
    const codes = (s.evidence?.reasonCodes as ReasonCode[] | undefined) ?? [];
    if (s.status === "fail") fails.push(...codes); else if (s.status === "warn") warns.push(...codes);
  }
  const reasons = [...new Set([...fails, ...warns])];
  const usable = signals.filter((s) => s.status !== "unknown");
  const weightSum = usable.reduce((a, s) => a + s.weight, 0);
  const riskScore = weightSum > 0 ? Math.round(usable.reduce((a, s) => a + s.score * s.weight, 0) / weightSum) : 0;
  const degraded = signals.some((s) => s.status === "unknown" && CRITICAL_FOR_DEGRADE.includes(s.category));
  const critTotal = signals.filter((s) => CRITICAL_FOR_DEGRADE.includes(s.category)).length;
  const critOk = signals.filter((s) => CRITICAL_FOR_DEGRADE.includes(s.category) && s.status !== "unknown").length;
  const confidence = critTotal > 0 ? Number((critOk / critTotal).toFixed(2)) : 0;
  const anyFail = signals.some((s) => s.status === "fail");
  const warnCount = signals.filter((s) => s.status === "warn").length;
  const hardFail = signals.some((s) => s.status === "fail" && HARD_BLOCK.includes(s.category));

  let decision: Decision;
  let outReasons = reasons;
  if (hardFail) decision = "block";
  else if (riskScore >= BLOCK_THRESHOLD) decision = "block";
  else if (degraded) { decision = "review"; if (!outReasons.includes("SIGNAL_UNAVAILABLE")) outReasons = [...outReasons, "SIGNAL_UNAVAILABLE"]; }
  else if (anyFail) decision = "review";
  else if (riskScore >= REVIEW_THRESHOLD) decision = "review";
  else if (warnCount >= 2) decision = "review";
  else decision = "clear";
  return { decision, riskScore: hardFail ? Math.max(riskScore, BLOCK_THRESHOLD) : riskScore, confidence, reasons: outReasons, degraded };
}

function summarize(d: ReturnType<typeof decide>, signals: SignalResult[]): string {
  const fired = signals.filter((s) => s.status === "fail" || s.status === "warn");
  const head = d.decision === "block" ? "Blocked" : d.decision === "review" ? "Review recommended" : "No known risk found";
  if (fired.length === 0) return d.degraded ? `${head}: some signals couldn't be fetched — proceed with caution.` : `${head}: core security signals are clean (risk ${d.riskScore}/100).`;
  const why = fired.map((s) => s.detail ?? s.source).slice(0, 3).join("; ");
  return `${head} (risk ${d.riskScore}/100). Highlights: ${why}.`;
}

function ulid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
function build(target: Record<string, unknown>, signals: SignalResult[], started: number, extra?: Partial<Verdict>): Verdict {
  const d = decide(signals);
  return {
    verdictId: ulid(), schemaVersion: "0", issuedAt: new Date().toISOString(), target,
    decision: d.decision, riskScore: d.riskScore, confidence: d.confidence, reasons: d.reasons,
    signals, summary: summarize(d, signals), degraded: d.degraded, latencyMs: Date.now() - started, ...extra,
  };
}

// ── public API (route handler bunları çağırır) ────────────────────
export async function guardToken(address: string, chainId = 8453): Promise<Verdict> {
  const started = Date.now();
  return build({ type: "token", chainId, address }, await collectTokenSignals(address), started);
}

export async function guardAddress(address: string, chainId = 8453): Promise<Verdict> {
  const started = Date.now();
  const [sanctions, contract] = await Promise.all([
    bazaarGet("/api/x402/sanctions", { address }).then((r) => sanctionsFrom(r, "address")),
    txContractRisk(address),
  ]);
  return build({ type: "address", chainId, address }, [sanctions, contract], started);
}

export async function guardTx(input: { from: string; to: string; calldata?: string; value?: string; chainId?: number }): Promise<Verdict> {
  const started = Date.now();
  const dec = decodeCalldata(input.calldata);
  const counterparty = dec.spender ?? dec.recipient ?? input.to;
  const [sanctions, contract, simulation] = await Promise.all([
    bazaarGet("/api/x402/sanctions", { address: counterparty }).then((r) => sanctionsFrom(r, "counterparty")),
    txContractRisk(counterparty),
    simulateTx({ from: input.from, to: input.to, calldata: input.calldata, value: input.value }),
  ]);
  const signals = [approvalSignal(dec), { ...sanctions, weight: 0.10 }, contract, simulation];
  return build(
    { type: "tx", chainId: input.chainId ?? 8453, from: input.from, to: input.to, calldata: input.calldata, value: input.value },
    signals, started,
    { decoded: { kind: dec.kind, selector: dec.selector, unlimited: dec.unlimited ?? false, approvedAll: dec.approvedAll ?? false }, counterparty },
  );
}
