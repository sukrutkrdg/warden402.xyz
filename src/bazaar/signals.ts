/**
 * Sinyal adaptörleri: Bazaar yanıtı → SignalResult.
 *
 * NOT: Aşağıdaki alan adları Bazaar yanıt şekline göre KALİBRE edilecek.
 * Her parser toleranslıdır: beklenen alanı bulamazsa status='unknown' döner,
 * böylece motor degrade eder (asla sahte 'clear' üretmez).
 * `scripts/probe.ts` ile gerçek yanıtları çekip alan adlarını doğrulayacağız.
 */
import type { ReasonCode, SignalResult } from "../schema/verdict.js";
import { bazaarGet } from "./client.js";

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : undefined;
  return n !== undefined && Number.isFinite(n) ? n : undefined;
}
function pick(obj: unknown, ...keys: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) if (k in rec && rec[k] != null) return rec[k];
  return undefined;
}

const UNKNOWN = (category: SignalResult["category"], source: string, detail: string): SignalResult => ({
  category,
  status: "unknown",
  weight: 0,
  score: 0,
  source,
  detail,
});

// ── 1) rug-score → honeypot/contract çekirdek sinyali ─────────────
export async function rugScoreSignal(address: string): Promise<SignalResult> {
  const r = await bazaarGet("/api/x402/rug-score", { address });
  if (!r.ok || !r.data) return UNKNOWN("honeypot", "rug-score", r.error ?? "no data");

  // Beklenen: 0-100 rug probability + flagged signals
  const score = num(pick(r.data, "rugScore", "score", "rug_probability", "probability"));
  if (score === undefined) return UNKNOWN("honeypot", "rug-score", "skor alanı bulunamadı");

  const flags = (pick(r.data, "flags", "signals", "flagged") as unknown[]) ?? [];
  const reasonCodes = mapRugFlags(flags);
  const status: SignalResult["status"] = score >= 70 ? "fail" : score >= 35 ? "warn" : "ok";

  return {
    category: "honeypot",
    status,
    weight: 0.30,
    score,
    source: "rug-score",
    detail: `rug-score ${score}/100`,
    evidence: { raw: r.data, reasonCodes, flags },
  };
}

function mapRugFlags(flags: unknown[]): ReasonCode[] {
  const out: ReasonCode[] = [];
  const text = JSON.stringify(flags).toLowerCase();
  if (text.includes("honeypot")) out.push("HONEYPOT_DETECTED");
  if (text.includes("mint")) out.push("OWNER_CAN_MINT");
  if (text.includes("blacklist")) out.push("OWNER_CAN_BLACKLIST");
  if (text.includes("proxy") || text.includes("upgrad")) out.push("PROXY_UPGRADEABLE");
  if (text.includes("tax")) out.push("SELL_TAX_EXCESSIVE");
  return out;
}

// ── 2) token-risk → contract_risk (ownership / proxy / conformance) ─
export async function contractRiskSignal(address: string): Promise<SignalResult> {
  const r = await bazaarGet("/api/x402/token-risk", { address });
  if (!r.ok || !r.data) return UNKNOWN("contract_risk", "token-risk", r.error ?? "no data");

  const score = num(pick(r.data, "riskScore", "score", "risk"));
  const isProxy = Boolean(pick(r.data, "proxy", "isProxy", "upgradeable"));
  const verified = pick(r.data, "verified", "sourceVerified");
  const reasonCodes: ReasonCode[] = [];
  if (isProxy) reasonCodes.push("PROXY_UPGRADEABLE");
  if (verified === false) reasonCodes.push("SOURCE_UNVERIFIED");

  if (score === undefined && reasonCodes.length === 0)
    return UNKNOWN("contract_risk", "token-risk", "risk alanı bulunamadı");

  const s = score ?? (reasonCodes.length ? 50 : 0);
  const status: SignalResult["status"] = s >= 70 ? "fail" : s >= 35 || reasonCodes.length ? "warn" : "ok";
  return {
    category: "contract_risk",
    status,
    weight: 0.20,
    score: s,
    source: "token-risk",
    detail: isProxy ? "yükseltilebilir proxy" : `risk ${s}/100`,
    evidence: { raw: r.data, reasonCodes },
  };
}

// ── 3) holders → holder_concentration (+ LP-lock ipucu) ───────────
export async function holdersSignal(address: string): Promise<SignalResult> {
  const r = await bazaarGet("/api/x402/holders", { address });
  if (!r.ok || !r.data) return UNKNOWN("holder_concentration", "holders", r.error ?? "no data");

  // top holder yüzdesi (0-100). Alan adları kalibre edilecek.
  const topPct = num(pick(r.data, "topHolderPct", "top1", "topHolderPercent", "concentration"));
  if (topPct === undefined) return UNKNOWN("holder_concentration", "holders", "yoğunluk alanı yok");

  const score = Math.min(100, Math.round(topPct)); // kaba: top holder % ≈ risk
  const reasonCodes: ReasonCode[] = topPct >= 50 ? ["HOLDER_CONCENTRATION_HIGH"] : [];
  const status: SignalResult["status"] = topPct >= 50 ? "fail" : topPct >= 30 ? "warn" : "ok";
  return {
    category: "holder_concentration",
    status,
    weight: 0.15,
    score,
    source: "holders",
    detail: `en büyük holder ~%${topPct}`,
    evidence: { raw: r.data, reasonCodes },
  };
}

// ── 4) token-pools → liquidity derinliği ──────────────────────────
export async function liquiditySignal(address: string): Promise<SignalResult> {
  const r = await bazaarGet("/api/x402/token-pools", { address });
  if (!r.ok || !r.data) return UNKNOWN("liquidity", "token-pools", r.error ?? "no data");

  const liqUsd = num(pick(r.data, "totalLiquidityUsd", "liquidityUsd", "liquidity", "totalLiquidity"));
  if (liqUsd === undefined) return UNKNOWN("liquidity", "token-pools", "likidite alanı yok");

  // Düşük likidite = yüksek risk. Eşikler kabaca: <5k kritik, <25k uyarı.
  let score = 0;
  let status: SignalResult["status"] = "ok";
  const reasonCodes: ReasonCode[] = [];
  if (liqUsd < 5_000) { score = 80; status = "fail"; reasonCodes.push("LIQUIDITY_LOW"); }
  else if (liqUsd < 25_000) { score = 45; status = "warn"; reasonCodes.push("LIQUIDITY_LOW"); }
  else { score = 10; status = "ok"; }

  return {
    category: "liquidity",
    status,
    weight: 0.20,
    score,
    source: "token-pools",
    detail: `likidite ~$${Math.round(liqUsd).toLocaleString("en-US")}`,
    evidence: { raw: r.data, reasonCodes },
  };
}

// ── 5) sanctions → OFAC (SERT KURAL: fail => block) ───────────────
export async function sanctionsSignal(address: string): Promise<SignalResult> {
  const r = await bazaarGet("/api/x402/sanctions", { address });
  if (!r.ok || !r.data) return UNKNOWN("sanctions", "sanctions", r.error ?? "no data");

  const matched = Boolean(pick(r.data, "match", "matched", "sanctioned", "isSanctioned"));
  return {
    category: "sanctions",
    status: matched ? "fail" : "ok",
    weight: 0.05,
    score: matched ? 100 : 0,
    source: "sanctions",
    detail: matched ? "OFAC SDN eşleşmesi" : "yaptırım eşleşmesi yok",
    evidence: { raw: r.data, reasonCodes: matched ? (["SANCTIONED_ADDRESS"] as ReasonCode[]) : [] },
  };
}

/** /guard/token için tüm sinyalleri PARALEL topla. */
export async function collectTokenSignals(address: string): Promise<SignalResult[]> {
  return Promise.all([
    rugScoreSignal(address),
    contractRiskSignal(address),
    holdersSignal(address),
    liquiditySignal(address),
    sanctionsSignal(address),
  ]);
}
