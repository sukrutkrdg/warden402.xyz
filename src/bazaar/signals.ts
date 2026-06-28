/**
 * Sinyal adaptörleri: Bazaar yanıtı → SignalResult.
 *
 * Gerçek Bazaar yanıtlarına göre KALİBRE edildi (probe.ts ile doğrulandı).
 * Bazaar yanıtı şu zarfla gelir: { service, builderCode, data: <PAYLOAD>, internal }.
 * Gerçek alanlar PAYLOAD = r.data.data altındadır.
 *
 * Tasarım: token-risk tek çağrıda honeypot + kontrat riski + holder yoğunluğu
 * verir (security objesi). Böylece /guard/token yalnızca 3 Bazaar çağrısı yapar:
 *   token-risk, token-pools, sanctions.
 *
 * Her parser toleranslıdır: beklenen alanı bulamazsa status='unknown' döner,
 * böylece motor degrade eder (asla sahte 'clear' üretmez).
 */
import type { ReasonCode, SignalResult } from "../schema/verdict.js";
import { bazaarGet, type BazaarResult } from "./client.js";

// ── yardımcılar ───────────────────────────────────────────────────
function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : undefined;
  return n !== undefined && Number.isFinite(n) ? n : undefined;
}
function rec(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}
/** Bazaar zarfını aç: { service, data: PAYLOAD } → PAYLOAD */
function payload(r: BazaarResult<unknown>): Record<string, unknown> | undefined {
  if (!r.ok || !r.data) return undefined;
  const outer = rec(r.data);
  return rec(outer?.data) ?? outer;
}
const UNKNOWN = (
  category: SignalResult["category"],
  source: string,
  detail: string,
): SignalResult => ({ category, status: "unknown", weight: 0, score: 0, source, detail });

// ══════════════════════════════════════════════════════════════════
// token-risk: TEK çağrı → 3 sinyal (honeypot, contract_risk, holders)
// ══════════════════════════════════════════════════════════════════
function honeypotFromRisk(p: Record<string, unknown> | undefined): SignalResult {
  const sec = rec(p?.security);
  if (!sec) return UNKNOWN("honeypot", "token-risk", "no security object");

  const isHoneypot = sec.isHoneypot === true;
  const sellTax = num(sec.sellTaxPct) ?? 0;
  const buyTax = num(sec.buyTaxPct) ?? 0;
  const reasonCodes: ReasonCode[] = [];
  let score = 0;
  let status: SignalResult["status"] = "ok";

  if (isHoneypot) {
    score = 100; status = "fail"; reasonCodes.push("HONEYPOT_DETECTED");
  } else if (sellTax >= 30 || buyTax >= 30) {
    score = 85; status = "fail"; reasonCodes.push("SELL_TAX_EXCESSIVE");
  } else if (sellTax >= 10 || buyTax >= 10) {
    score = 50; status = "warn"; reasonCodes.push("SELL_TAX_EXCESSIVE");
  }

  return {
    category: "honeypot",
    status,
    weight: 0.30,
    score,
    source: "token-risk",
    detail: isHoneypot ? "honeypot detected" : `buy/sell tax ${buyTax}%/${sellTax}%`,
    evidence: { reasonCodes, isHoneypot, sellTax, buyTax },
  };
}

function contractRiskFromRisk(p: Record<string, unknown> | undefined): SignalResult {
  const sec = rec(p?.security);
  if (!sec && p?.upgradeableProxy === undefined)
    return UNKNOWN("contract_risk", "token-risk", "no contract fields");

  const ownership = rec(p?.ownership);
  const reasonCodes: ReasonCode[] = [];
  let score = 0;

  const proxy = p?.upgradeableProxy === true;
  const mintable = sec?.isMintable === true;
  const pausable = sec?.transferPausable === true;
  const takeback = sec?.canTakeBackOwnership === true;
  const hiddenOwner = sec?.hiddenOwner === true;
  const openSource = sec?.isOpenSource; // true/false/null
  const renounced = ownership?.renounced; // true/false/null

  if (mintable) { score += 40; reasonCodes.push("OWNER_CAN_MINT"); }
  if (takeback) { score += 40; }
  if (hiddenOwner) { score += 40; }
  if (pausable) { score += 25; reasonCodes.push("OWNER_CAN_BLACKLIST"); }
  if (proxy) { score += 20; reasonCodes.push("PROXY_UPGRADEABLE"); }
  if (openSource === false) { score += 30; reasonCodes.push("SOURCE_UNVERIFIED"); }
  if (renounced === false) { score += 10; }

  score = Math.min(100, score);
  const status: SignalResult["status"] = score >= 70 ? "fail" : score >= 35 ? "warn" : "ok";
  return {
    category: "contract_risk",
    status,
    weight: 0.20,
    score,
    source: "token-risk",
    detail:
      reasonCodes.length > 0
        ? [mintable && "mint", takeback && "ownership-takeback", pausable && "transfer-pause", proxy && "proxy", openSource === false && "unverified source"]
            .filter(Boolean)
            .join(", ")
        : "owner controls clean",
    evidence: { reasonCodes, proxy, mintable, pausable, takeback, hiddenOwner, openSource, renounced },
  };
}

function holdersFromRisk(p: Record<string, unknown> | undefined): SignalResult {
  const sec = rec(p?.security);
  const top10 = num(sec?.top10HolderPct) ?? num(sec?.topHolderPct);
  if (top10 === undefined) return UNKNOWN("holder_concentration", "token-risk", "no holder percentage");

  const reasonCodes: ReasonCode[] = [];
  let score: number;
  let status: SignalResult["status"];
  if (top10 >= 80) { score = 90; status = "fail"; reasonCodes.push("HOLDER_CONCENTRATION_HIGH"); }
  else if (top10 >= 50) { score = 70; status = "fail"; reasonCodes.push("HOLDER_CONCENTRATION_HIGH"); }
  else if (top10 >= 30) { score = 45; status = "warn"; reasonCodes.push("HOLDER_CONCENTRATION_HIGH"); }
  else { score = Math.round(top10 / 2); status = "ok"; }

  return {
    category: "holder_concentration",
    status,
    weight: 0.15,
    score,
    source: "token-risk",
    detail: `top-10 holders ~${top10.toFixed(1)}%`,
    evidence: { reasonCodes, top10 },
  };
}

// ══════════════════════════════════════════════════════════════════
// token-pools → liquidity (tüm pool'ların liquidityUsd toplamı)
// ══════════════════════════════════════════════════════════════════
function liquidityFromPools(r: BazaarResult<unknown>): SignalResult {
  const p = payload(r);
  if (!p) return UNKNOWN("liquidity", "token-pools", r.error ?? "no data");
  const pools = Array.isArray(p.pools) ? (p.pools as unknown[]) : undefined;
  if (!pools) return UNKNOWN("liquidity", "token-pools", "no pools field");

  const totalLiq = pools.reduce<number>((sum, pool) => sum + (num(rec(pool)?.liquidityUsd) ?? 0), 0);
  const reasonCodes: ReasonCode[] = [];
  let score: number;
  let status: SignalResult["status"];
  if (totalLiq < 5_000) { score = 80; status = "fail"; reasonCodes.push("LIQUIDITY_LOW"); }
  else if (totalLiq < 25_000) { score = 45; status = "warn"; reasonCodes.push("LIQUIDITY_LOW"); }
  else { score = 10; status = "ok"; }

  return {
    category: "liquidity",
    status,
    weight: 0.20,
    score,
    source: "token-pools",
    detail: `liquidity ~$${Math.round(totalLiq).toLocaleString("en-US")} (${pools.length} pools)`,
    evidence: { reasonCodes, totalLiq, poolCount: pools.length },
  };
}

// ══════════════════════════════════════════════════════════════════
// sanctions → OFAC (SERT KURAL: fail => block)
// ══════════════════════════════════════════════════════════════════
function sanctionsFrom(r: BazaarResult<unknown>): SignalResult {
  const p = payload(r);
  if (!p || p.sanctioned === undefined) return UNKNOWN("sanctions", "sanctions", r.error ?? "no data");
  const matched = p.sanctioned === true;
  return {
    category: "sanctions",
    status: matched ? "fail" : "ok",
    weight: 0.05,
    score: matched ? 100 : 0,
    source: "sanctions",
    detail: matched ? `OFAC match (${String(p.matchType ?? "match")})` : "no OFAC match",
    evidence: { reasonCodes: matched ? (["SANCTIONED_ADDRESS"] as ReasonCode[]) : [] },
  };
}

/** /guard/token için tüm sinyalleri 3 PARALEL çağrıyla topla. */
export async function collectTokenSignals(address: string): Promise<SignalResult[]> {
  const [risk, pools, sanctions] = await Promise.all([
    bazaarGet("/api/x402/token-risk", { address }),
    bazaarGet("/api/x402/token-pools", { address }),
    bazaarGet("/api/x402/sanctions", { address }),
  ]);

  const riskP = payload(risk);
  // token-risk düştüyse 3 sinyal de unknown olur (parser security yokluğunu yakalar)
  return [
    honeypotFromRisk(riskP),
    contractRiskFromRisk(riskP),
    holdersFromRisk(riskP),
    liquidityFromPools(pools),
    sanctionsFrom(sanctions),
  ];
}
