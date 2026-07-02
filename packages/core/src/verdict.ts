/**
 * Warden — Verdict Schema (v0)
 * The shared decision contract returned by every Warden endpoint (token / tx /
 * address). This schema is the immutable backbone: SDK, firewall and track-record
 * all bind to it.
 */

export type Decision = "block" | "review" | "clear";
//  block  = agent MUST NOT act (high/certain risk)
//  review = human/extra check needed (uncertainty OR missing signal)
//  clear  = no known risk, may proceed
//  RULE: if a signal is unavailable the verdict can never be 'clear' → at worst 'review'.

export type RiskScore = number; // 0..100  (0 = clean, 100 = certainly malicious)

export type SignalCategory =
  | "honeypot"
  | "liquidity"
  | "holder_concentration"
  | "contract_risk"
  | "approvals"
  | "sanctions"
  | "age_activity"
  | "metadata";

export type SignalStatus = "ok" | "warn" | "fail" | "unknown";

export interface SignalResult {
  category: SignalCategory;
  status: SignalStatus;        // unknown = no data (triggers degrade)
  weight: number;              // contribution weight (0..1)
  score: number;               // raw risk contribution (0..100)
  source: string;              // which Bazaar endpoint
  detail?: string;
  evidence?: Record<string, unknown>;
}

export type ReasonCode =
  | "HONEYPOT_DETECTED"
  | "SELL_TAX_EXCESSIVE"
  | "LIQUIDITY_LOW"
  | "LIQUIDITY_UNLOCKED"
  | "OWNER_CAN_MINT"
  | "OWNER_CAN_BLACKLIST"
  | "PROXY_UPGRADEABLE"
  | "HOLDER_CONCENTRATION_HIGH"
  | "DANGEROUS_APPROVAL"
  | "SANCTIONED_ADDRESS"
  | "CONTRACT_TOO_NEW"
  | "SOURCE_UNVERIFIED"
  | "SIGNAL_UNAVAILABLE"; // degrade → review

export type Target =
  | { type: "token"; chainId: number; address: string }
  | { type: "tx"; chainId: number; from: string; to: string; calldata: string; value?: string }
  | { type: "address"; chainId: number; address: string };

export interface Verdict {
  verdictId: string;
  schemaVersion: "0";
  issuedAt: string;
  target: Target;
  decision: Decision;
  riskScore: RiskScore;
  confidence: number;      // 0..1
  reasons: ReasonCode[];
  signals: SignalResult[];
  summary: string;
  degraded: boolean;       // at least one 'unknown' signal → 'clear' forbidden
  latencyMs: number;
}

export const SCHEMA_VERSION = "0" as const;
