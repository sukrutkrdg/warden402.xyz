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
  | "approvals" | "sanctions" | "age_activity" | "metadata" | "simulation"
  | "deployer" | "lp_lock" | "address_trust"
  | "sellability" | "owner_powers" | "address_poisoning" | "sanctioned_exposure";

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
  | "TX_WILL_REVERT" | "CALL_TO_NON_CONTRACT" | "UNEXPECTED_ASSET_OUTFLOW"
  | "DEPLOYER_HIGH_RISK" | "DEPLOYER_CAUTION" | "COUNTERPARTY_ANONYMOUS"
  | "CANNOT_SELL" | "SELL_RESTRICTED" | "OWNER_POWERS_CRITICAL" | "OWNER_POWERS_HIGH"
  | "ADDRESS_POISONING" | "SANCTIONED_EXPOSURE";

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
  /** Concrete next steps when the verdict isn't clear (e.g. an exact-amount approval to sign instead). */
  remediation?: string[];
}

// ── config ────────────────────────────────────────────────────────
const BLOCK_THRESHOLD = Number(process.env.WARDEN_BLOCK_THRESHOLD ?? 70);
const REVIEW_THRESHOLD = Number(process.env.WARDEN_REVIEW_THRESHOLD ?? 35);
// sellability fails only when the token cannot be sold at all; address_poisoning
// fails only on a strong look-alike match — both are funds-lost-for-certain.
const HARD_BLOCK: SignalCategory[] = ["honeypot", "sanctions", "sellability", "address_poisoning"];
// A tx must not `clear` when we couldn't decode its calldata or run the
// simulation — both degrade to review. (These categories only exist on the tx
// path, so token verdicts are unaffected.)
const CRITICAL_FOR_DEGRADE: SignalCategory[] = ["honeypot", "contract_risk", "liquidity", "sanctions", "approvals", "simulation"];

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
  // An empty {security:{}} (common for a brand-new token with no record) must
  // NOT read as safe — require at least one recognized field, else degrade.
  const KNOWN = ["isHoneypot", "sellTaxPct", "buyTaxPct"];
  if (!sec || !KNOWN.some((k) => sec[k] !== undefined)) return UNKNOWN("honeypot", "token-risk", "no honeypot data");
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
  const KNOWN = ["isMintable", "canTakeBackOwnership", "hiddenOwner", "transferPausable", "isOpenSource"];
  const hasSec = sec && KNOWN.some((k) => sec[k] !== undefined);
  if (!hasSec && p?.upgradeableProxy === undefined) return UNKNOWN("contract_risk", "token-risk", "no contract data");
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

// deployer reputation → who created the token, can you trust them?
// Bazaar returns reputationScore 0-100 (higher = MORE trustworthy). Warden's
// convention is higher score = higher RISK, so we invert it.
function deployerSignal(r: BazaarResult): SignalResult {
  const p = payload(r);
  const repScore = num(p?.reputationScore);
  const reputation = typeof p?.reputation === "string" ? (p.reputation as string) : undefined;
  if (repScore === undefined || !reputation || reputation === "unknown") return UNKNOWN("deployer", "deployer-rep", r.error ?? "no deployer data");
  const score = Math.max(0, Math.min(100, 100 - repScore));
  const reasonCodes: ReasonCode[] = []; let status: SignalStatus = "ok";
  if (reputation === "high_risk") { status = "fail"; reasonCodes.push("DEPLOYER_HIGH_RISK"); }
  else if (reputation === "caution") { status = "warn"; reasonCodes.push("DEPLOYER_CAUTION"); }
  return { category: "deployer", status, weight: 0.15, score, source: "deployer-rep",
    detail: `deployer reputation: ${reputation}`, evidence: { reasonCodes } };
}

// LP lock → is liquidity locked/burned or can the deployer pull it (rug setup)?
// Bazaar returns rugRisk low|medium|high + lpUnlockedPercent.
function lpLockSignal(r: BazaarResult): SignalResult {
  const p = payload(r);
  const rugRisk = typeof p?.rugRisk === "string" ? (p.rugRisk as string) : undefined;
  const unlockedPct = num(p?.lpUnlockedPercent);
  if (!rugRisk) return UNKNOWN("lp_lock", "lp-lock", r.error ?? "no lp-lock data");
  const reasonCodes: ReasonCode[] = []; let score = 10; let status: SignalStatus = "ok";
  if (rugRisk === "high") { score = 80; status = "fail"; reasonCodes.push("LIQUIDITY_UNLOCKED"); }
  else if (rugRisk === "medium") { score = 45; status = "warn"; reasonCodes.push("LIQUIDITY_UNLOCKED"); }
  return { category: "lp_lock", status, weight: 0.15, score, source: "lp-lock",
    detail: unlockedPct !== undefined ? `LP unlocked ${unlockedPct}% (rug risk ${rugRisk})` : `LP rug risk ${rugRisk}`, evidence: { reasonCodes } };
}

// counterparty identity → Coinbase-verified / named / anonymous. Anonymous is a
// mild signal, not a block (most legit wallets are anon); verified is reassuring.
function addressTrustSignal(r: BazaarResult): SignalResult {
  const p = payload(r);
  const verdict = typeof p?.verdict === "string" ? (p.verdict as string) : undefined;
  if (!verdict || verdict === "unknown") return UNKNOWN("address_trust", "address-trust", r.error ?? "no trust data");
  const reasonCodes: ReasonCode[] = []; let score = 0; let status: SignalStatus = "ok";
  if (verdict === "named") score = 5;
  else if (verdict === "anonymous") { score = 20; status = "warn"; reasonCodes.push("COUNTERPARTY_ANONYMOUS"); }
  return { category: "address_trust", status, weight: 0.10, score, source: "address-trust",
    detail: `counterparty identity: ${verdict}`, evidence: { reasonCodes } };
}

// sellability → can you actually get OUT? Bazaar combines the security feed with
// its own live transfer simulation from a real holder. canSell:false is the
// honeypot proven by simulation, so it hard-blocks.
function sellabilitySignal(r: BazaarResult): SignalResult {
  const p = payload(r);
  if (!p || p.degraded === true || typeof p.canSell !== "boolean") return UNKNOWN("sellability", "sellability", r.error ?? "sellability unconfirmed");
  const reasons = Array.isArray(p.reasons) ? (p.reasons as unknown[]).map(String) : [];
  if (p.canSell === false) {
    return { category: "sellability", status: "fail", weight: 0.20, score: 95, source: "sellability",
      detail: `cannot sell${reasons[0] ? `: ${reasons[0]}` : ""}`, evidence: { reasonCodes: ["CANNOT_SELL"] } };
  }
  if (p.riskLevel === "medium") {
    return { category: "sellability", status: "warn", weight: 0.20, score: 45, source: "sellability",
      detail: `sell restricted (${p.verdict ?? "high tax or pausable transfers"})`, evidence: { reasonCodes: ["SELL_RESTRICTED"] } };
  }
  return { category: "sellability", status: "ok", weight: 0.20, score: 0, source: "sellability", detail: "sellable", evidence: { reasonCodes: [] } };
}

// owner powers → what the owner can still do AFTER you buy (mint, set balances,
// blacklist, swap the logic). The latent rug surface a clean-looking token hides.
function ownerPowersSignal(r: BazaarResult): SignalResult {
  const p = payload(r);
  const verdict = typeof p?.verdict === "string" ? (p.verdict as string) : undefined;
  const powers = Array.isArray(p?.powers) ? (p!.powers as unknown[]).map((x) => String(rec(x)?.flag ?? "")).filter(Boolean) : [];
  const list = powers.length ? ` (${powers.slice(0, 3).join(", ")})` : "";
  switch (verdict) {
    case "owner_controlled_danger":
      return { category: "owner_powers", status: "fail", weight: 0.15, score: 85, source: "owner-powers",
        detail: `owner holds a critical power${list}`, evidence: { reasonCodes: ["OWNER_POWERS_CRITICAL"] } };
    case "weaponizable":
      return { category: "owner_powers", status: "warn", weight: 0.15, score: 55, source: "owner-powers",
        detail: `owner can weaponize the token${list}`, evidence: { reasonCodes: ["OWNER_POWERS_HIGH"] } };
    case "limited_controls":
      return { category: "owner_powers", status: "ok", weight: 0.15, score: 15, source: "owner-powers",
        detail: `limited owner controls${list}`, evidence: { reasonCodes: [] } };
    case "renounced_clean":
      return { category: "owner_powers", status: "ok", weight: 0.15, score: 0, source: "owner-powers",
        detail: "ownership renounced, no mutable powers", evidence: { reasonCodes: [] } };
    default:
      return UNKNOWN("owner_powers", "owner-powers", r.error ?? "no owner-powers data");
  }
}

// holder forensics → concentration in unlabelled WALLETS (LP/CEX/burn excluded),
// which is the real dump risk. Raw top-10 % flags every token whose supply sits
// in a pool or a CEX. Falls back to token-risk's raw top-10 when unavailable.
function holdersFromForensics(r: BazaarResult, fallback: SignalResult): SignalResult {
  const p = payload(r);
  const level = typeof p?.concentrationRisk === "string" ? (p.concentrationRisk as string) : undefined;
  const holderCount = num(p?.holderCount);
  if (!level || !holderCount) return fallback; // holderCount 0 = no holder data, not "zero holders"
  const walletPct = num(p?.walletConcentrationPercent) ?? 0;
  const largest = num(p?.largestWalletPercent) ?? 0;
  const flags = Array.isArray(p?.flags) ? (p!.flags as unknown[]).map(String) : [];
  const detail = `wallets hold ~${walletPct.toFixed(1)}% (largest ${largest.toFixed(1)}%), ${holderCount.toLocaleString("en-US")} holders`;
  const reasonCodes: ReasonCode[] = []; let score: number; let status: SignalStatus;
  if (level === "high") { score = 75; status = "fail"; reasonCodes.push("HOLDER_CONCENTRATION_HIGH"); }
  else if (level === "medium" || flags.includes("very_few_holders")) { score = 45; status = "warn"; reasonCodes.push("HOLDER_CONCENTRATION_HIGH"); }
  else { score = Math.round(walletPct / 2); status = "ok"; }
  return { category: "holder_concentration", status, weight: 0.15, score, source: "holder-forensics",
    detail, evidence: { reasonCodes, flags } };
}

async function collectTokenSignals(address: string): Promise<SignalResult[]> {
  const [risk, pools, sanctions, deployer, lplock, sell, owner, holders] = await Promise.all([
    bazaarGet("/api/x402/token-risk", { address }),
    bazaarGet("/api/x402/token-pools", { address }),
    bazaarGet("/api/x402/sanctions", { address }),
    bazaarGet("/api/x402/deployer-rep", { address }),
    bazaarGet("/api/x402/lp-lock", { address }),
    bazaarGet("/api/x402/sellability", { address }),
    bazaarGet("/api/x402/owner-powers", { address }),
    bazaarGet("/api/x402/holder-forensics", { address }),
  ]);
  const p = payload(risk);
  return [
    honeypotFromRisk(p), contractRiskFromRisk(p), holdersFromForensics(holders, holdersFromRisk(p)),
    liquidityFromPools(pools), sanctionsFrom(sanctions, "token"), deployerSignal(deployer), lpLockSignal(lplock),
    sellabilitySignal(sell), ownerPowersSignal(owner),
  ];
}

// address poisoning → is the recipient a look-alike of someone this wallet
// really pays (the dust copy-paste trap)? Only meaningful for outgoing transfers.
function poisoningSignal(r: BazaarResult): SignalResult {
  const p = payload(r);
  const verdict = typeof p?.verdict === "string" ? (p.verdict as string) : undefined;
  if (verdict === "poisoning_suspected")
    return { category: "address_poisoning", status: "fail", weight: 0.30, score: 95, source: "address-poisoning",
      detail: "recipient is a look-alike of an address this wallet pays — likely poisoned", evidence: { reasonCodes: ["ADDRESS_POISONING"] } };
  if (verdict === "weak_resemblance")
    return { category: "address_poisoning", status: "warn", weight: 0.30, score: 45, source: "address-poisoning",
      detail: "recipient partially resembles a known counterparty", evidence: { reasonCodes: ["ADDRESS_POISONING"] } };
  if (verdict === "known_counterparty" || verdict === "no_resemblance")
    return { category: "address_poisoning", status: "ok", weight: 0.30, score: 0, source: "address-poisoning",
      detail: verdict === "known_counterparty" ? "recipient is a known counterparty" : "no look-alike of known counterparties", evidence: { reasonCodes: [] } };
  return UNKNOWN("address_poisoning", "address-poisoning", r.error ?? "no poisoning data");
}

// sanctioned exposure → has this address transacted with OFAC-listed addresses?
// Taint by association, not a sanction on the address itself → warn, not block.
function sanctionedExposureSignal(r: BazaarResult): SignalResult {
  const p = payload(r);
  const verdict = typeof p?.verdict === "string" ? (p.verdict as string) : undefined;
  if (verdict === "sanctioned_exposure") {
    const n = Array.isArray(p?.sanctionedCounterparties) ? (p!.sanctionedCounterparties as unknown[]).length : 0;
    return { category: "sanctioned_exposure", status: "warn", weight: 0.15, score: 60, source: "sanctioned-exposure",
      detail: `transacted with ${n || "an"} OFAC-listed address${n === 1 ? "" : "es"} (90d)`, evidence: { reasonCodes: ["SANCTIONED_EXPOSURE"] } };
  }
  if (verdict === "clear" || verdict === "no_activity")
    return { category: "sanctioned_exposure", status: "ok", weight: 0.15, score: 0, source: "sanctioned-exposure",
      detail: verdict === "clear" ? "no OFAC-listed counterparties (90d)" : "no recent USDC activity to screen", evidence: { reasonCodes: [] } };
  return UNKNOWN("sanctioned_exposure", "sanctioned-exposure", r.error ?? "no exposure data");
}

// ── calldata decode + tx sinyalleri ───────────────────────────────
// decodeCalldata now comes from @warden/core (single source of truth).
type Decoded = DecodedCall;
function approvalSignal(dec: Decoded): SignalResult {
  // Calldata we can't decode is NOT safe-by-default: a drainer can wrap an
  // approve inside multicall / router entrypoints we don't recognize. Empty
  // calldata (selector "0x") is a plain value transfer — nothing to approve.
  // Anything else undecoded → `unknown` so the tx degrades to review (never clear).
  if (dec.kind === "unknown") {
    if (dec.selector === "0x") return { category: "approvals", status: "ok", weight: 0.30, score: 0, source: "calldata-decode", detail: "no calldata (value transfer)" };
    return { category: "approvals", status: "unknown", weight: 0, score: 0, source: "calldata-decode", detail: `undecoded call (${dec.selector}) — cannot prove it is safe` };
  }
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
  // A honeypot counterparty is a hard fail (score ≥70) — interacting with it
  // should never sit at a mild warn.
  if (sec?.isHoneypot === true) { score += 80; reasonCodes.push("HONEYPOT_DETECTED"); }
  if (sec?.transferPausable === true) { score += 25; reasonCodes.push("OWNER_CAN_BLACKLIST"); }
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

async function simulateTx(input: { from: string; to: string; calldata?: string; value?: string; intended?: string }): Promise<SignalResult> {
  const hasData = Boolean(input.calldata && input.calldata.length > 2 && input.calldata !== "0x");
  const value = input.value && /^0x[0-9a-fA-F]+$/.test(input.value) ? input.value : "0x0";
  const call = { from: input.from, to: input.to, data: input.calldata || "0x", value };
  try {
    const [codeRes, callRes] = await Promise.all([
      simRpc("eth_getCode", [input.to, "latest"]),
      simRpc("eth_call", [call, "latest"]),
    ]);
    // If BOTH calls error the RPC is unreachable/broken (eth_getCode almost never
    // reverts) → degrade to unknown rather than manufacturing revert/no-code
    // findings from a generic RPC error.
    if (codeRes.error && callRes.error) {
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
    const changes = await simAssetChanges(call, input.intended).catch(() => null);
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
async function simAssetChanges(call: { from: string; to: string; data: string; value: string }, intended?: string): Promise<{ outflow: boolean; toUnexpected: boolean; detail: string } | null> {
  if (!/alchemy/i.test(SIM_RPC)) return null;
  const res = await simRpc("alchemy_simulateAssetChanges", [{ from: call.from, to: call.to, value: call.value, data: call.data }]);
  const changes = (res.result as { changes?: Array<Record<string, unknown>> } | undefined)?.changes;
  if (!Array.isArray(changes)) return null;
  const from = call.from.toLowerCase();
  // The legitimate recipient is the DECODED payee (transfer recipient / approval
  // spender), not the tx `to` — for an ERC20 transfer `to` is the token contract,
  // so comparing against `to` alone would flag every real payment. Accept both.
  const okDest = new Set([call.to.toLowerCase(), (intended ?? "").toLowerCase()].filter(Boolean));
  for (const c of changes) {
    if (String(c.from ?? "").toLowerCase() !== from) continue; // only outflows FROM the payer
    const recipient = String(c.to ?? "").toLowerCase();
    const amt = String(c.rawAmount ?? c.amount ?? "");
    const sym = String(c.symbol ?? c.assetType ?? "asset");
    return { outflow: true, toUnexpected: recipient !== "" && !okDest.has(recipient), detail: `${amt} ${sym} → ${recipient.slice(0, 10)}…` };
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

// Concrete fix for the agent, not just "no": an exact-amount approval to sign
// instead of an unlimited one (built by Bazaar's safe-approve), or verify the payee.
function remediationFor(dec: Decoded, token: string, approval: SignalResult, poisoning?: SignalResult): { remediation?: string[] } {
  const out: string[] = [];
  if (dec.kind === "setApprovalForAll" && dec.approvedAll) {
    out.push(`Don't grant operator rights over every NFT — approve only the single tokenId the spender needs (approve(${dec.spender}, tokenId)).`);
  } else if (approval.status !== "ok" && dec.spender && (dec.kind === "approve" || dec.kind === "increaseAllowance")) {
    const url = `${BASE_URL}/api/x402/safe-approve?${new URLSearchParams({ token, spender: dec.spender, amount: "<exact amount>" }).toString()}`;
    out.push(`Approve only the exact amount this action needs, never unlimited. Exact-amount calldata: ${url}`);
  } else if (approval.status !== "ok" && dec.spender) {
    out.push(`Sign a ${dec.kind} for the exact amount and a short deadline only — an unlimited ${dec.kind} lets ${dec.spender} pull funds at any time.`);
  }
  if (poisoning && poisoning.status !== "ok" && poisoning.status !== "unknown") {
    out.push("Do not copy the recipient from transaction history. Re-check every character of the address against a trusted source.");
  }
  return out.length ? { remediation: out } : {};
}

// ── public API (route handler bunları çağırır) ────────────────────
export async function guardToken(address: string, chainId = 8453): Promise<Verdict> {
  const started = Date.now();
  return build({ type: "token", chainId, address }, await collectTokenSignals(address), started);
}

export async function guardAddress(address: string, chainId = 8453): Promise<Verdict> {
  const started = Date.now();
  const [sanctions, contract, trust, exposure] = await Promise.all([
    bazaarGet("/api/x402/sanctions", { address }).then((r) => sanctionsFrom(r, "address")),
    txContractRisk(address),
    bazaarGet("/api/x402/address-trust", { address }).then(addressTrustSignal),
    bazaarGet("/api/x402/sanctioned-exposure", { wallet: address }).then(sanctionedExposureSignal),
  ]);
  return build({ type: "address", chainId, address }, [sanctions, contract, trust, exposure], started);
}

export async function guardTx(input: { from: string; to: string; calldata?: string; value?: string; chainId?: number }): Promise<Verdict> {
  const started = Date.now();
  const dec = decodeCalldata(input.calldata);
  const counterparty = dec.spender ?? dec.recipient ?? input.to;
  // Outgoing payment = ERC-20 transfer/transferFrom, or a plain value send (no calldata).
  const payee = dec.recipient ?? (dec.selector === "0x" ? input.to : undefined);
  const [sanctions, contract, simulation, poisoning] = await Promise.all([
    bazaarGet("/api/x402/sanctions", { address: counterparty }).then((r) => sanctionsFrom(r, "counterparty")),
    txContractRisk(counterparty),
    simulateTx({ from: input.from, to: input.to, calldata: input.calldata, value: input.value, intended: dec.recipient ?? dec.spender }),
    payee ? bazaarGet("/api/x402/address-poisoning", { wallet: input.from, to: payee }).then(poisoningSignal) : Promise.resolve(undefined),
  ]);
  const approval = approvalSignal(dec);
  const signals = [approval, { ...sanctions, weight: 0.10 }, contract, simulation, ...(poisoning ? [poisoning] : [])];
  return build(
    { type: "tx", chainId: input.chainId ?? 8453, from: input.from, to: input.to, calldata: input.calldata, value: input.value },
    signals, started,
    {
      decoded: { kind: dec.kind, selector: dec.selector, unlimited: dec.unlimited ?? false, approvedAll: dec.approvedAll ?? false }, counterparty,
      ...remediationFor(dec, input.to, approval, poisoning),
    },
  );
}
