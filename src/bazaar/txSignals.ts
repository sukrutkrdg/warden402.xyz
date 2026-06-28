/**
 * Pre-sign (tx) sinyalleri.
 * Bir bekleyen işlemin calldata'sından risk üretir:
 *   - approvalSignal: sınırsız allowance / setApprovalForAll(true) — LOKAL, çağrısız
 *   - sanctions(counterparty): yetki/transfer alan adres OFAC'ta mı (SERT KURAL)
 *   - contract_risk(counterparty): etkileşilen kontrat riskli mi (token-risk)
 *
 * counterparty = spender (approve) ?? recipient (transfer) ?? to.
 */
import type { ReasonCode, SignalResult } from "../schema/verdict.js";
import { bazaarGet, type BazaarResult } from "./client.js";
import { decodeCalldata, type DecodedCall } from "../tx/decode.js";

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
const UNKNOWN = (
  category: SignalResult["category"],
  source: string,
  detail: string,
): SignalResult => ({ category, status: "unknown", weight: 0, score: 0, source, detail });

// ── approval riski (lokal, calldata'dan) ──────────────────────────
export function approvalSignal(decoded: DecodedCall): SignalResult {
  const reasonCodes: ReasonCode[] = [];
  let status: SignalResult["status"] = "ok";
  let score = 0;
  let detail = `call: ${decoded.kind}`;

  if (decoded.kind === "setApprovalForAll" && decoded.approvedAll) {
    status = "fail"; score = 90; reasonCodes.push("DANGEROUS_APPROVAL");
    detail = "setApprovalForAll(true) — unlimited approval over all NFTs";
  } else if ((decoded.kind === "approve" || decoded.kind === "increaseAllowance") && decoded.unlimited) {
    status = "fail"; score = 80; reasonCodes.push("DANGEROUS_APPROVAL");
    detail = "unlimited ERC20 allowance (uint256 max)";
  } else if ((decoded.kind === "approve" || decoded.kind === "increaseAllowance") && (decoded.amount ?? 0n) > 0n) {
    status = "warn"; score = 40; reasonCodes.push("DANGEROUS_APPROVAL");
    detail = "ERC20 allowance granted (limited)";
  }

  return {
    category: "approvals",
    status,
    weight: 0.30,
    score,
    source: "calldata-decode",
    detail,
    evidence: { reasonCodes, decoded: serializeDecoded(decoded) },
  };
}

function serializeDecoded(d: DecodedCall): Record<string, unknown> {
  return { ...d, amount: d.amount !== undefined ? d.amount.toString() : undefined };
}

// ── sanctions(counterparty) — SERT KURAL ──────────────────────────
export async function txSanctionsSignal(counterparty: string): Promise<SignalResult> {
  const r = await bazaarGet("/api/x402/sanctions", { address: counterparty });
  const p = payload(r);
  if (!p || p.sanctioned === undefined) return UNKNOWN("sanctions", "sanctions", r.error ?? "no data");
  const matched = p.sanctioned === true;
  return {
    category: "sanctions",
    status: matched ? "fail" : "ok",
    weight: 0.10,
    score: matched ? 100 : 0,
    source: "sanctions",
    detail: matched ? `counterparty on OFAC (${String(p.matchType ?? "match")})` : "counterparty not on OFAC",
    evidence: { reasonCodes: matched ? (["SANCTIONED_ADDRESS"] as ReasonCode[]) : [], counterparty },
  };
}

// ── contract_risk(counterparty) — token-risk ──────────────────────
export async function txContractRiskSignal(counterparty: string): Promise<SignalResult> {
  const r = await bazaarGet("/api/x402/token-risk", { address: counterparty });
  const p = payload(r);
  const sec = rec(p?.security);
  if (!p || (!sec && p.upgradeableProxy === undefined && p.isContract === undefined))
    return UNKNOWN("contract_risk", "token-risk", r.error ?? "no contract data");

  // EOA ise (kontrat değil) düşük risk — onaylanan adres bir cüzdan.
  if (p.isContract === false) {
    return {
      category: "contract_risk",
      status: "ok",
      weight: 0.20,
      score: 5,
      source: "token-risk",
      detail: "counterparty is an EOA (not a contract)",
      evidence: { isContract: false, counterparty },
    };
  }

  const reasonCodes: ReasonCode[] = [];
  let score = 0;
  if (sec?.isHoneypot === true) { score += 60; reasonCodes.push("HONEYPOT_DETECTED"); }
  if (p.upgradeableProxy === true) { score += 20; reasonCodes.push("PROXY_UPGRADEABLE"); }
  if (sec?.isMintable === true) { score += 20; reasonCodes.push("OWNER_CAN_MINT"); }
  if (sec?.transferPausable === true) { score += 20; reasonCodes.push("OWNER_CAN_BLACKLIST"); }
  if (sec?.isOpenSource === false) { score += 30; reasonCodes.push("SOURCE_UNVERIFIED"); }
  score = Math.min(100, score);
  const status: SignalResult["status"] = score >= 70 ? "fail" : score >= 35 ? "warn" : "ok";

  return {
    category: "contract_risk",
    status,
    weight: 0.20,
    score,
    source: "token-risk",
    detail: reasonCodes.length ? "interacted contract has risk flags" : "interacted contract clean",
    evidence: { reasonCodes, counterparty },
  };
}

export interface TxTarget {
  to: string;
  calldata?: string;
}

/** /guard/tx için sinyalleri topla (1 lokal + 2 paralel Bazaar çağrısı). */
export async function collectTxSignals(t: TxTarget): Promise<{ signals: SignalResult[]; decoded: DecodedCall; counterparty: string }> {
  const decoded = decodeCalldata(t.calldata);
  const counterparty = decoded.spender ?? decoded.recipient ?? t.to;

  const [sanctions, contract] = await Promise.all([
    txSanctionsSignal(counterparty),
    txContractRiskSignal(counterparty),
  ]);

  return {
    signals: [approvalSignal(decoded), sanctions, contract],
    decoded,
    counterparty,
  };
}
