/**
 * Warden Firewall — types & policy schema.
 * See FIREWALL.md for the full model.
 */
import type { Verdict } from "../schema/verdict.js";

export type FirewallDecision = "allow" | "hold" | "deny";

export type FirewallReason =
  | "KILL_SWITCH"
  | "RATE_LIMITED"
  | "DENYLISTED"
  | "UNSAFE_TARGET"
  | "TARGET_REVIEW"
  | "UNLIMITED_APPROVAL"
  | "APPROVAL_RATE"
  | "OVER_PER_CALL"
  | "OVER_HOURLY"
  | "OVER_DAILY"
  | "NEW_COUNTERPARTY"
  | "ANOMALY_SPIKE"
  | "ALLOWLISTED"
  | "WITHIN_POLICY";

export interface AgentPolicy {
  agentId: string;
  paused: boolean;
  // budgets (USDC)
  maxPerCallUsd: number;
  maxPerHourUsd: number;
  maxPerDayUsd: number;
  maxCallsPerMinute: number;
  // counterparties
  allow: string[]; // skip novelty/anomaly holds
  deny: string[]; // always denied
  // trust (Guard verdict)
  blockOnReview: boolean; // 'review' verdict → hold
  // drain protection
  denyUnlimitedApprovals: boolean;
  maxApprovalsPerHour: number;
  // novelty / anomaly
  holdOnNewCounterparty: boolean;
  anomalyMultiplier: number; // call > N× recent median → hold
}

export const DEFAULT_POLICY: Omit<AgentPolicy, "agentId"> = {
  paused: false,
  maxPerCallUsd: 25,
  maxPerHourUsd: 100,
  maxPerDayUsd: 500,
  maxCallsPerMinute: 30,
  allow: [],
  deny: [],
  blockOnReview: true,
  denyUnlimitedApprovals: true,
  maxApprovalsPerHour: 5,
  holdOnNewCounterparty: true,
  anomalyMultiplier: 5,
};

export type ActionKind = "x402_payment" | "tx";

export interface FirewallAction {
  kind: ActionKind;
  to: string; // counterparty / contract address (or payTo for a payment)
  chainId?: number;
  // x402_payment
  amountUsd?: number;
  endpoint?: string;
  // tx
  from?: string;
  calldata?: string;
  value?: string;
}

export interface BudgetState {
  perCallCapUsd: number;
  hourSpentUsd: number;
  hourRemainingUsd: number;
  daySpentUsd: number;
  dayRemainingUsd: number;
  approvalsThisHour: number;
}

export interface FirewallResult {
  auditId: string;
  agentId: string;
  decision: FirewallDecision;
  reasons: FirewallReason[];
  detail: string;
  verdict?: Verdict; // Guard verdict on the target
  budget: BudgetState;
  committed: boolean; // whether the spend was recorded (only on allow)
  issuedAt: string;
  latencyMs: number;
}
