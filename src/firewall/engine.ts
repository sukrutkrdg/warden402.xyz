/**
 * Firewall decision engine. Deterministic evaluation order (see FIREWALL.md).
 * Integrates the Guard verdict, per-agent policy, rolling-window spend, drain
 * protection and anomaly detection into allow | hold | deny.
 */
import { ulid } from "ulid";
import { decide } from "../engine/decide.js";
import { collectTxSignals } from "../bazaar/txSignals.js";
import { collectAddressSignals } from "../bazaar/addressSignals.js";
import { SCHEMA_VERSION, type Verdict } from "../schema/verdict.js";
import {
  approvalsThisHour,
  callsLastMinute,
  commitSpend,
  daySpent,
  hasSeen,
  hourSpent,
  recentMedianSpend,
  recordCall,
} from "./store.js";
import type { AgentPolicy, FirewallAction, FirewallReason, FirewallResult } from "./types.js";

type AgentState = NonNullable<ReturnType<typeof import("./store.js").getAgentByKey>>;

interface TargetEval {
  verdict: Verdict;
  isApproval: boolean;
  unlimited: boolean;
}

/** Build a Guard verdict on the action's target. */
async function evalTarget(action: FirewallAction): Promise<TargetEval> {
  const started = Date.now();
  if (action.kind === "tx") {
    const { signals, decoded, counterparty } = await collectTxSignals({ to: action.to, calldata: action.calldata });
    const d = decide(signals);
    const verdict: Verdict = {
      verdictId: ulid(), schemaVersion: SCHEMA_VERSION, issuedAt: new Date().toISOString(),
      target: { type: "tx", chainId: action.chainId ?? 8453, from: action.from ?? "0x", to: action.to, calldata: action.calldata ?? "0x", value: action.value },
      decision: d.decision, riskScore: d.riskScore, confidence: d.confidence, reasons: d.reasons,
      signals, summary: "", degraded: d.degraded, latencyMs: Date.now() - started,
    };
    const isApproval = decoded.kind === "approve" || decoded.kind === "increaseAllowance" || decoded.kind === "setApprovalForAll";
    const unlimited = Boolean(decoded.unlimited) || Boolean(decoded.approvedAll);
    void counterparty;
    return { verdict, isApproval, unlimited };
  }
  // x402_payment (or generic address target)
  const signals = await collectAddressSignals(action.to);
  const d = decide(signals);
  const verdict: Verdict = {
    verdictId: ulid(), schemaVersion: SCHEMA_VERSION, issuedAt: new Date().toISOString(),
    target: { type: "address", chainId: action.chainId ?? 8453, address: action.to },
    decision: d.decision, riskScore: d.riskScore, confidence: d.confidence, reasons: d.reasons,
    signals, summary: "", degraded: d.degraded, latencyMs: Date.now() - started,
  };
  return { verdict, isApproval: false, unlimited: false };
}

function inList(list: string[], addr: string): boolean {
  const a = addr.toLowerCase();
  return list.some((x) => x.toLowerCase() === a);
}

export async function evaluate(state: AgentState, action: FirewallAction): Promise<FirewallResult> {
  const started = Date.now();
  const policy: AgentPolicy = state.policy;
  const reasons: FirewallReason[] = [];
  const amount = action.amountUsd ?? 0;

  const budget = () => ({
    perCallCapUsd: policy.maxPerCallUsd,
    hourSpentUsd: Math.round(hourSpent(state) * 100) / 100,
    hourRemainingUsd: Math.round((policy.maxPerHourUsd - hourSpent(state)) * 100) / 100,
    daySpentUsd: Math.round(daySpent(state) * 100) / 100,
    dayRemainingUsd: Math.round((policy.maxPerDayUsd - daySpent(state)) * 100) / 100,
    approvalsThisHour: approvalsThisHour(state),
  });

  const finish = (decision: FirewallResult["decision"], detail: string, committed = false, verdict?: Verdict): FirewallResult => ({
    auditId: ulid(), agentId: policy.agentId, decision, reasons, detail, verdict,
    budget: budget(), committed, issuedAt: new Date().toISOString(), latencyMs: Date.now() - started,
  });

  // 1) kill switch
  if (policy.paused) { reasons.push("KILL_SWITCH"); return finish("deny", "Agent is paused (kill switch)."); }

  // 2) rate limit
  const calls = recordCall(state);
  if (calls > policy.maxCallsPerMinute) { reasons.push("RATE_LIMITED"); return finish("deny", `Rate limit: ${calls} calls in the last minute.`); }

  // 3) deny-list
  if (inList(policy.deny, action.to)) { reasons.push("DENYLISTED"); return finish("deny", "Counterparty is on the deny-list."); }

  const allowlisted = inList(policy.allow, action.to);

  // 4) Guard verdict on target
  const { verdict, isApproval, unlimited } = await evalTarget(action);
  if (verdict.decision === "block") { reasons.push("UNSAFE_TARGET"); return finish("deny", "Guard flagged the target as unsafe (block).", false, verdict); }
  if (verdict.decision === "review" && policy.blockOnReview && !allowlisted) reasons.push("TARGET_REVIEW");

  // 5) drain protection (tx)
  if (action.kind === "tx") {
    if (unlimited && policy.denyUnlimitedApprovals) { reasons.push("UNLIMITED_APPROVAL"); return finish("deny", "Unlimited token approval is denied by policy.", false, verdict); }
    if (isApproval && approvalsThisHour(state) >= policy.maxApprovalsPerHour) { reasons.push("APPROVAL_RATE"); return finish("hold", `Approval rate cap reached (${policy.maxApprovalsPerHour}/hour).`, false, verdict); }
  }

  // 6) spend caps
  if (amount > policy.maxPerCallUsd) { reasons.push("OVER_PER_CALL"); return finish("deny", `Amount $${amount} exceeds per-call cap $${policy.maxPerCallUsd}.`, false, verdict); }
  if (hourSpent(state) + amount > policy.maxPerHourUsd) { reasons.push("OVER_HOURLY"); return finish("deny", `Would exceed hourly cap $${policy.maxPerHourUsd}.`, false, verdict); }
  if (daySpent(state) + amount > policy.maxPerDayUsd) { reasons.push("OVER_DAILY"); return finish("deny", `Would exceed daily cap $${policy.maxPerDayUsd}.`, false, verdict); }

  // 7) novelty (skipped for allowlisted)
  if (!allowlisted && policy.holdOnNewCounterparty && !hasSeen(state, action.to)) reasons.push("NEW_COUNTERPARTY");

  // 8) anomaly spike (skipped for allowlisted)
  if (!allowlisted && amount > 0) {
    const median = recentMedianSpend(state);
    if (median !== undefined && amount > median * policy.anomalyMultiplier) reasons.push("ANOMALY_SPIKE");
  }

  // resolve: any hold reason → hold; else allow + commit
  const holdReasons: FirewallReason[] = ["TARGET_REVIEW", "NEW_COUNTERPARTY", "ANOMALY_SPIKE", "APPROVAL_RATE"];
  if (reasons.some((r) => holdReasons.includes(r))) {
    return finish("hold", "Action needs approval: " + reasons.join(", "), false, verdict);
  }

  if (allowlisted) reasons.push("ALLOWLISTED"); else reasons.push("WITHIN_POLICY");
  commitSpend(state, amount, action.to, isApproval);
  return finish("allow", allowlisted ? "Allowlisted counterparty, within policy." : "Within policy.", true, verdict);
}
