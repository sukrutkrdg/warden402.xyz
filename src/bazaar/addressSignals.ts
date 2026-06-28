/**
 * /guard/address sinyalleri — bir karşı tarafı (counterparty) değerlendir:
 *   - sanctions (SERT KURAL)        [txSanctionsSignal'i yeniden kullanır]
 *   - contract_risk (token-risk)    [txContractRiskSignal'i yeniden kullanır]
 *   - age_activity (address-intel)  [yeni/aktivitesiz adres uyarısı]
 */
import type { SignalResult } from "../schema/verdict.js";
import { bazaarGet, type BazaarResult } from "./client.js";
import { txContractRiskSignal, txSanctionsSignal } from "./txSignals.js";

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : undefined;
  return n !== undefined && Number.isFinite(n) ? n : undefined;
}
function rec(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}
function payload(r: BazaarResult<unknown>): Record<string, unknown> | undefined {
  if (!r.ok || !r.data) return undefined;
  const outer = rec(r.data);
  return rec(outer?.data) ?? outer;
}

async function ageActivitySignal(address: string): Promise<SignalResult> {
  const r = await bazaarGet("/api/x402/address-intel", { address });
  const p = payload(r);
  if (!p) {
    return { category: "age_activity", status: "unknown", weight: 0, score: 0, source: "address-intel", detail: r.error ?? "no data" };
  }
  // Toleranslı: tx sayısı düşük/sıfır → taze/şüpheli aktivite.
  const txCount = num(p.txCount) ?? num(p.transactionCount) ?? num(rec(p.activity)?.txCount);
  if (txCount === undefined) {
    return { category: "age_activity", status: "ok", weight: 0.05, score: 0, source: "address-intel", detail: "limited activity data" };
  }
  let status: SignalResult["status"] = "ok";
  let score = 0;
  if (txCount === 0) { status = "warn"; score = 40; }
  else if (txCount < 5) { status = "warn"; score = 25; }
  return {
    category: "age_activity",
    status,
    weight: 0.05,
    score,
    source: "address-intel",
    detail: `~${txCount} transactions`,
    evidence: { txCount },
  };
}

export async function collectAddressSignals(address: string): Promise<SignalResult[]> {
  const [sanctions, contract, age] = await Promise.all([
    txSanctionsSignal(address),
    txContractRiskSignal(address),
    ageActivitySignal(address),
  ]);
  return [sanctions, contract, age];
}
