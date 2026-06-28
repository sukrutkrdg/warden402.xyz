/**
 * Warden Firewall — in-process (website playground) version.
 * Same policy model as the Hono API (src/firewall). Reuses ./guard for verdicts.
 * In-memory per serverless instance — fine for the demo; resets on cold start.
 */
import { guardAddress, guardTx, type Verdict } from "./guard";

export type FirewallDecision = "allow" | "hold" | "deny";

export interface AgentPolicy {
  agentId: string;
  paused: boolean;
  maxPerCallUsd: number;
  maxPerHourUsd: number;
  maxPerDayUsd: number;
  maxCallsPerMinute: number;
  allow: string[];
  deny: string[];
  blockOnReview: boolean;
  denyUnlimitedApprovals: boolean;
  maxApprovalsPerHour: number;
  holdOnNewCounterparty: boolean;
  anomalyMultiplier: number;
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

export interface FirewallAction {
  kind: "x402_payment" | "tx";
  to: string;
  amountUsd?: number;
  from?: string;
  calldata?: string;
  chainId?: number;
}

export interface FirewallResult {
  auditId: string;
  agentId: string;
  decision: FirewallDecision;
  reasons: string[];
  detail: string;
  verdict?: Verdict;
  budget: {
    perCallCapUsd: number;
    hourSpentUsd: number;
    hourRemainingUsd: number;
    daySpentUsd: number;
    dayRemainingUsd: number;
    approvalsThisHour: number;
  };
  committed: boolean;
  issuedAt: string;
}

interface SpendEvent { ts: number; amountUsd: number; counterparty: string; isApproval: boolean }
interface AgentState { policy: AgentPolicy; spends: SpendEvent[]; calls: number[]; seen: Set<string>; audit: FirewallResult[] }

const HOUR = 3_600_000, DAY = 86_400_000;
const g = globalThis as unknown as { __wardenFw?: Map<string, AgentState> };
const agents: Map<string, AgentState> = g.__wardenFw ?? (g.__wardenFw = new Map());

function agent(id = "demo"): AgentState {
  let s = agents.get(id);
  if (!s) { s = { policy: { agentId: id, ...DEFAULT_POLICY }, spends: [], calls: [], seen: new Set(), audit: [] }; agents.set(id, s); }
  return s;
}
function prune(s: AgentState) { const n = Date.now(); s.spends = s.spends.filter((e) => n - e.ts < DAY); s.calls = s.calls.filter((t) => n - t < 60_000); }
function spent(s: AgentState, w: number) { const n = Date.now(); return s.spends.filter((e) => n - e.ts < w).reduce((a, e) => a + e.amountUsd, 0); }
function approvals(s: AgentState, w: number) { const n = Date.now(); return s.spends.filter((e) => e.isApproval && n - e.ts < w).length; }
function median(s: AgentState) {
  const a = s.spends.filter((e) => e.amountUsd > 0).slice(-20).map((e) => e.amountUsd).sort((x, y) => x - y);
  if (a.length < 3) return undefined;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}
function inList(l: string[], a: string) { return l.some((x) => x.toLowerCase() === a.toLowerCase()); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

export function getPolicy(id = "demo") { return agent(id).policy; }
export function setPolicy(patch: Partial<AgentPolicy>, id = "demo") { const s = agent(id); s.policy = { ...s.policy, ...patch }; return s.policy; }
export function resetAgent(id = "demo") { agents.delete(id); return agent(id).policy; }
export function getAudit(id = "demo") { return agent(id).audit.slice(0, 25); }
export function getBudget(id = "demo") {
  const s = agent(id); prune(s); const p = s.policy;
  return {
    perCallCapUsd: p.maxPerCallUsd,
    hourSpentUsd: Math.round(spent(s, HOUR) * 100) / 100,
    hourRemainingUsd: Math.round((p.maxPerHourUsd - spent(s, HOUR)) * 100) / 100,
    daySpentUsd: Math.round(spent(s, DAY) * 100) / 100,
    dayRemainingUsd: Math.round((p.maxPerDayUsd - spent(s, DAY)) * 100) / 100,
    approvalsThisHour: approvals(s, HOUR),
  };
}

export async function check(action: FirewallAction, id = "demo"): Promise<FirewallResult> {
  const s = agent(id); prune(s);
  const p = s.policy;
  const reasons: string[] = [];
  const amount = action.amountUsd ?? 0;
  const fin = (decision: FirewallDecision, detail: string, committed = false, verdict?: Verdict): FirewallResult => {
    const r: FirewallResult = { auditId: uid(), agentId: id, decision, reasons, detail, verdict, budget: getBudget(id), committed, issuedAt: new Date().toISOString() };
    s.audit.unshift(r);
    s.audit = s.audit.slice(0, 50);
    return r;
  };

  if (p.paused) { reasons.push("KILL_SWITCH"); return fin("deny", "Agent is paused (kill switch)."); }
  s.calls.push(Date.now());
  if (s.calls.length > p.maxCallsPerMinute) { reasons.push("RATE_LIMITED"); return fin("deny", `Rate limit: ${s.calls.length} calls/min.`); }
  if (inList(p.deny, action.to)) { reasons.push("DENYLISTED"); return fin("deny", "Counterparty is on the deny-list."); }
  const allowed = inList(p.allow, action.to);

  // Guard verdict on the target
  let verdict: Verdict; let isApproval = false; let unlimited = false;
  if (action.kind === "tx") {
    verdict = await guardTx({ from: action.from ?? action.to, to: action.to, calldata: action.calldata });
    const dec = verdict.decoded;
    isApproval = dec ? ["approve", "increaseAllowance", "setApprovalForAll"].includes(dec.kind) : false;
    unlimited = Boolean(dec?.unlimited || dec?.approvedAll);
  } else {
    verdict = await guardAddress(action.to);
  }
  if (verdict.decision === "block") { reasons.push("UNSAFE_TARGET"); return fin("deny", "Guard flagged the target as unsafe (block).", false, verdict); }
  if (verdict.decision === "review" && p.blockOnReview && !allowed) reasons.push("TARGET_REVIEW");

  if (action.kind === "tx") {
    if (unlimited && p.denyUnlimitedApprovals) { reasons.push("UNLIMITED_APPROVAL"); return fin("deny", "Unlimited token approval is denied by policy.", false, verdict); }
    if (isApproval && approvals(s, HOUR) >= p.maxApprovalsPerHour) { reasons.push("APPROVAL_RATE"); return fin("hold", `Approval rate cap reached (${p.maxApprovalsPerHour}/hour).`, false, verdict); }
  }

  if (amount > p.maxPerCallUsd) { reasons.push("OVER_PER_CALL"); return fin("deny", `Amount $${amount} exceeds per-call cap $${p.maxPerCallUsd}.`, false, verdict); }
  if (spent(s, HOUR) + amount > p.maxPerHourUsd) { reasons.push("OVER_HOURLY"); return fin("deny", `Would exceed hourly cap $${p.maxPerHourUsd}.`, false, verdict); }
  if (spent(s, DAY) + amount > p.maxPerDayUsd) { reasons.push("OVER_DAILY"); return fin("deny", `Would exceed daily cap $${p.maxPerDayUsd}.`, false, verdict); }

  if (!allowed && p.holdOnNewCounterparty && !s.seen.has(action.to.toLowerCase())) reasons.push("NEW_COUNTERPARTY");
  if (!allowed && amount > 0) { const m = median(s); if (m !== undefined && amount > m * p.anomalyMultiplier) reasons.push("ANOMALY_SPIKE"); }

  const holds = ["TARGET_REVIEW", "NEW_COUNTERPARTY", "ANOMALY_SPIKE", "APPROVAL_RATE"];
  if (reasons.some((r) => holds.includes(r))) return fin("hold", "Needs approval: " + reasons.join(", "), false, verdict);

  reasons.push(allowed ? "ALLOWLISTED" : "WITHIN_POLICY");
  s.spends.push({ ts: Date.now(), amountUsd: amount, counterparty: action.to.toLowerCase(), isApproval });
  s.seen.add(action.to.toLowerCase());
  return fin("allow", allowed ? "Allowlisted, within policy." : "Within policy.", true, verdict);
}
