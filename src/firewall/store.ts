/**
 * Firewall state store — agents + rolling-window spend/seen/approvals.
 * In-memory for v1; the interface is stable so a KV/Postgres backend can drop in.
 */
import { AgentPolicy, DEFAULT_POLICY } from "./types.js";

interface SpendEvent {
  ts: number;
  amountUsd: number;
  counterparty: string;
  isApproval: boolean;
}

interface AgentState {
  policy: AgentPolicy;
  spends: SpendEvent[]; // pruned to last 24h
  calls: number[]; // call timestamps (pruned to last 60s)
  seen: Set<string>; // counterparties ever allowed
}

const byKey = new Map<string, AgentState>(); // apiKey → state

// A ready-to-use demo agent so /firewall works out of the box.
const DEMO_KEY = process.env.FIREWALL_DEMO_KEY ?? "demo-key";
byKey.set(DEMO_KEY, {
  policy: { agentId: "demo", ...DEFAULT_POLICY },
  spends: [],
  calls: [],
  seen: new Set(),
});

const HOUR = 3_600_000;
const DAY = 86_400_000;

export function getAgentByKey(key: string | undefined): AgentState | undefined {
  if (!key) return undefined;
  return byKey.get(key);
}

export function upsertAgent(key: string, policy: Partial<AgentPolicy> & { agentId: string }): AgentPolicy {
  const existing = byKey.get(key);
  const merged: AgentPolicy = { ...DEFAULT_POLICY, ...(existing?.policy ?? {}), ...policy };
  if (existing) existing.policy = merged;
  else byKey.set(key, { policy: merged, spends: [], calls: [], seen: new Set() });
  return merged;
}

function prune(s: AgentState) {
  const now = Date.now();
  s.spends = s.spends.filter((e) => now - e.ts < DAY);
  s.calls = s.calls.filter((t) => now - t < 60_000);
}

export function recordCall(s: AgentState): number {
  prune(s);
  s.calls.push(Date.now());
  return s.calls.length; // calls in the last 60s
}

export function callsLastMinute(s: AgentState): number {
  prune(s);
  return s.calls.length;
}

export function spentInWindow(s: AgentState, windowMs: number): number {
  const now = Date.now();
  return s.spends.filter((e) => now - e.ts < windowMs).reduce((a, e) => a + e.amountUsd, 0);
}

export function approvalsInWindow(s: AgentState, windowMs: number): number {
  const now = Date.now();
  return s.spends.filter((e) => e.isApproval && now - e.ts < windowMs).length;
}

export function hourSpent(s: AgentState) { return spentInWindow(s, HOUR); }
export function daySpent(s: AgentState) { return spentInWindow(s, DAY); }
export function approvalsThisHour(s: AgentState) { return approvalsInWindow(s, HOUR); }

export function hasSeen(s: AgentState, counterparty: string): boolean {
  return s.seen.has(counterparty.toLowerCase());
}

/** Median of recent spend amounts (>0), for anomaly detection. */
export function recentMedianSpend(s: AgentState, n = 20): number | undefined {
  const amts = s.spends.filter((e) => e.amountUsd > 0).slice(-n).map((e) => e.amountUsd).sort((a, b) => a - b);
  if (amts.length < 3) return undefined; // not enough history
  const mid = Math.floor(amts.length / 2);
  return amts.length % 2 ? amts[mid]! : (amts[mid - 1]! + amts[mid]!) / 2;
}

/** Commit a spend (only called when a request is ALLOWED). */
export function commitSpend(s: AgentState, amountUsd: number, counterparty: string, isApproval: boolean) {
  s.spends.push({ ts: Date.now(), amountUsd, counterparty: counterparty.toLowerCase(), isApproval });
  s.seen.add(counterparty.toLowerCase());
}
