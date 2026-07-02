/**
 * Warden guard motoru — SİTE İÇİNDE (in-process) çalışan sürüm.
 * Böylece web tek başına deploy edilir; ayrı API host'una gerek yok.
 * Kök repodaki Hono API ile AYNI mantık (deterministik karar + degrade kuralı).
 *
 * Gerekli env (web projesinde):
 *   BAZAAR_BASE_URL          (vars. https://402.com.tr)
 *   BAZAAR_INTERNAL_SECRET   (Bazaar'ı ödemeden çağırmak için; X-Warden-Internal)
 */

// ── tipler ────────────────────────────────────────────────────────
export type Decision = "block" | "review" | "clear";
export type SignalStatus = "ok" | "warn" | "fail" | "unknown";
export type SignalCategory =
  | "honeypot" | "liquidity" | "holder_concentration" | "contract_risk"
  | "approvals" | "sanctions" | "age_activity" | "metadata";

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
  | "CONTRACT_TOO_NEW" | "SOURCE_UNVERIFIED" | "SIGNAL_UNAVAILABLE";

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
const UINT256_MAX = (1n << 256n) - 1n;
const UINT160_MAX = (1n << 160n) - 1n;
const UNLIMITED_FLOOR = UINT256_MAX - UINT256_MAX / 100n;
const UNLIMITED160_FLOOR = UINT160_MAX - UINT160_MAX / 100n;
interface Decoded { selector: string; kind: string; spender?: string; recipient?: string; amount?: bigint; approvedAll?: boolean; unlimited?: boolean }
function w(d: string, i: number) { const s = 2 + 8 + i * 64; return d.slice(s, s + 64); }
function addr(x: string) { return "0x" + x.slice(24); }
function big(x: string) { return x ? BigInt("0x" + x) : 0n; }
export function decodeCalldata(calldata?: string): Decoded {
  const d = (calldata ?? "").toLowerCase();
  if (!d.startsWith("0x") || d.length < 10) return { selector: "0x", kind: "unknown" };
  const sel = d.slice(0, 10);
  if (sel === "0x095ea7b3" || sel === "0x39509351") { const amount = big(w(d, 1)); return { selector: sel, kind: sel === "0x095ea7b3" ? "approve" : "increaseAllowance", spender: addr(w(d, 0)), amount, unlimited: amount >= UNLIMITED_FLOOR }; }
  if (sel === "0xa22cb465") return { selector: sel, kind: "setApprovalForAll", spender: addr(w(d, 0)), approvedAll: big(w(d, 1)) !== 0n };
  if (sel === "0xa9059cbb") return { selector: sel, kind: "transfer", recipient: addr(w(d, 0)), amount: big(w(d, 1)) };
  if (sel === "0x23b872dd") return { selector: sel, kind: "transferFrom", recipient: addr(w(d, 1)), amount: big(w(d, 2)) };
  if (sel === "0xd505accf") { const amount = big(w(d, 2)); return { selector: sel, kind: "permit", spender: addr(w(d, 1)), amount, unlimited: amount >= UNLIMITED_FLOOR }; } // EIP-2612 permit
  if (sel === "0x87517c45") { const amount = big(w(d, 2)); return { selector: sel, kind: "permit2Approve", spender: addr(w(d, 1)), amount, unlimited: amount >= UNLIMITED160_FLOOR }; } // Permit2 approve
  return { selector: sel, kind: "unknown" };
}
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
  const [sanctions, contract] = await Promise.all([
    bazaarGet("/api/x402/sanctions", { address: counterparty }).then((r) => sanctionsFrom(r, "counterparty")),
    txContractRisk(counterparty),
  ]);
  const signals = [approvalSignal(dec), { ...sanctions, weight: 0.10 }, contract];
  return build(
    { type: "tx", chainId: input.chainId ?? 8453, from: input.from, to: input.to, calldata: input.calldata, value: input.value },
    signals, started,
    { decoded: { kind: dec.kind, selector: dec.selector, unlimited: dec.unlimited ?? false, approvedAll: dec.approvedAll ?? false }, counterparty },
  );
}
