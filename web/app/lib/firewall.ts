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
export interface Hold { id: string; agentId: string; action: FirewallAction; result: FirewallResult; createdAt: string; status: "pending" | "approved" | "rejected" }
interface AgentState { policy: AgentPolicy; spends: SpendEvent[]; calls: number[]; seen: Set<string>; audit: FirewallResult[]; holds: Hold[]; label: string }

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const HOUR = 3_600_000, DAY = 86_400_000;
const g = globalThis as unknown as { __wardenFw?: Map<string, AgentState> };
const agents: Map<string, AgentState> = g.__wardenFw ?? (g.__wardenFw = new Map());

function agent(id = "demo"): AgentState {
  let s = agents.get(id);
  if (!s) { s = { policy: { agentId: id, ...DEFAULT_POLICY }, spends: [], calls: [], seen: new Set(), audit: [], holds: [], label: id }; agents.set(id, s); }
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
    if (decision === "hold") {
      s.holds.unshift({ id: uid(), agentId: id, action, result: r, createdAt: r.issuedAt, status: "pending" });
      s.holds = s.holds.slice(0, 50);
    }
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

// ── dashboard (multi-agent) ───────────────────────────────────────
export function pendingHolds(id = "demo") { return agent(id).holds.filter((h) => h.status === "pending"); }

export function approveHold(holdId: string, id = "demo") {
  const s = agent(id);
  const h = s.holds.find((x) => x.id === holdId);
  if (!h || h.status !== "pending") return { ok: false };
  h.status = "approved";
  const amt = h.action.amountUsd ?? 0;
  s.spends.push({ ts: Date.now(), amountUsd: amt, counterparty: h.action.to.toLowerCase(), isApproval: h.action.kind === "tx" });
  s.seen.add(h.action.to.toLowerCase());
  return { ok: true };
}
export function rejectHold(holdId: string, id = "demo") {
  const h = agent(id).holds.find((x) => x.id === holdId);
  if (!h || h.status !== "pending") return { ok: false };
  h.status = "rejected";
  return { ok: true };
}

export interface AgentSummary { agentId: string; label: string; paused: boolean; budget: ReturnType<typeof getBudget>; pending: number; lastDecision?: FirewallDecision }
export function listAgents(): AgentSummary[] {
  return [...agents.values()].map((s) => ({
    agentId: s.policy.agentId,
    label: s.label,
    paused: s.policy.paused,
    budget: getBudget(s.policy.agentId),
    pending: s.holds.filter((h) => h.status === "pending").length,
    lastDecision: s.audit[0]?.decision,
  }));
}

/** Hourly spend buckets for a chart (last `hours`). */
export function spendSeries(id = "demo", hours = 12): { label: string; usd: number }[] {
  const s = agent(id);
  const now = Date.now();
  const buckets: { label: string; usd: number }[] = [];
  for (let i = hours - 1; i >= 0; i--) {
    const start = now - (i + 1) * HOUR, end = now - i * HOUR;
    const usd = s.spends.filter((e) => e.ts >= start && e.ts < end).reduce((a, e) => a + e.amountUsd, 0);
    buckets.push({ label: `${new Date(end).getHours()}:00`, usd: Math.round(usd * 100) / 100 });
  }
  return buckets;
}

/** Seed a few demo agents with lifelike history so the dashboard is never empty. */
export function seedDashboard() {
  if (agents.size > 1 || (agents.size === 1 && agents.get("demo")!.spends.length > 0)) return;
  const now = Date.now();
  const mk = (id: string, label: string, policy: Partial<AgentPolicy>, spends: [number, number][], pending?: FirewallAction) => {
    const s = agent(id);
    s.label = label;
    s.policy = { ...s.policy, ...policy };
    for (const [hoursAgo, amt] of spends) {
      s.spends.push({ ts: now - hoursAgo * HOUR, amountUsd: amt, counterparty: USDC.toLowerCase(), isApproval: false });
      s.seen.add(USDC.toLowerCase());
      s.audit.unshift({ auditId: uid(), agentId: id, decision: "allow", reasons: ["WITHIN_POLICY"], detail: "Within policy.", budget: getBudget(id), committed: true, issuedAt: new Date(now - hoursAgo * HOUR).toISOString() });
    }
    if (pending) {
      const res: FirewallResult = { auditId: uid(), agentId: id, decision: "hold", reasons: ["NEW_COUNTERPARTY"], detail: "Needs approval: NEW_COUNTERPARTY", budget: getBudget(id), committed: false, issuedAt: new Date().toISOString() };
      s.holds.unshift({ id: uid(), agentId: id, action: pending, result: res, createdAt: res.issuedAt, status: "pending" });
      s.audit.unshift(res);
    }
  };
  mk("trader-1", "Trading bot", { maxPerHourUsd: 200, maxPerDayUsd: 1000 },
    [[5, 42], [4, 18], [3, 63], [2, 9], [1, 27], [0.2, 88]],
    { kind: "x402_payment", to: "0x00000000219ab540356cBB839Cbe05303d7705Fa", amountUsd: 35 });
  mk("payments-2", "Payments agent", { maxPerHourUsd: 100 },
    [[6, 12], [3, 8], [1, 15], [0.15, 22]]);
  mk("defi-3", "DeFi automation", { maxPerHourUsd: 150, denyUnlimitedApprovals: true },
    [[4, 55], [2, 40], [0.3, 61]],
    { kind: "tx", to: USDC, from: USDC, amountUsd: 0 });
}
