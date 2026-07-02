/**
 * Real (multi-tenant) Firewall — KV-backed, per-agent API keys + persistent
 * budgets. Reuses decidePolicy (single source of truth) + the guard verdict.
 * Persistent when KV is configured, in-memory fallback otherwise.
 *
 * State keys (per agent):
 *   fw:agent:<key>            agent record { agentId, policy, createdAt }
 *   fw:spend:<id>:h:<hour>    hourly spend (TTL 1h)   fw:spend:<id>:d:<day> (TTL 1d)
 *   fw:appr:<id>:h:<hour>     approvals this hour (TTL 1h)
 *   fw:seen:<id>              set of counterparties
 *   fw:audit:<id>             capped list of decisions
 */
import { guardAddress, guardTx } from "./guard";
import { decidePolicy, DEFAULT_POLICY, type AgentPolicy, type FirewallAction, type FirewallResult } from "./firewall";
import { PERSISTENT, kvPipeline } from "./store";

const g = globalThis as unknown as { __wardenFwKv?: { agents: Map<string, string>; kv: Map<string, string>; sets: Map<string, Set<string>>; lists: Map<string, string[]> } };
const mem = g.__wardenFwKv ?? (g.__wardenFwKv = { agents: new Map(), kv: new Map(), sets: new Map(), lists: new Map() });

const hourEpoch = () => Math.floor(Date.now() / 3_600_000);
const dayEpoch = () => Math.floor(Date.now() / 86_400_000);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const genKey = () => "wk_" + Array.from(crypto.getRandomValues(new Uint8Array(20))).map((b) => b.toString(16).padStart(2, "0")).join("");

export interface AgentRecord {
  agentId: string; policy: AgentPolicy; createdAt: string;
  plan: "free" | "starter" | "team" | "enterprise";
  monthlyCap: number; expiresAt?: string; payer?: string; txHash?: string;
}

export const PLAN_CAP: Record<AgentRecord["plan"], number> = { free: 1000, starter: 20000, team: 100000, enterprise: 5_000_000 };

// ── agent registry ────────────────────────────────────────────────
export async function createAgent(
  agentId: string,
  policyPatch: Partial<AgentPolicy> = {},
  opts: { plan?: AgentRecord["plan"]; expiresAt?: string; payer?: string; txHash?: string } = {},
): Promise<{ key: string; record: AgentRecord }> {
  const key = genKey();
  const plan = opts.plan ?? "free";
  const record: AgentRecord = {
    agentId, policy: { agentId, ...DEFAULT_POLICY, ...policyPatch }, createdAt: new Date().toISOString(),
    plan, monthlyCap: PLAN_CAP[plan], expiresAt: opts.expiresAt, payer: opts.payer, txHash: opts.txHash,
  };
  const val = JSON.stringify(record);
  if (PERSISTENT) { try { await kvPipeline([["SET", `fw:agent:${key}`, val], ["SADD", "fw:index", key]]); return { key, record }; } catch { /* fall */ } }
  mem.agents.set(key, val);
  return { key, record };
}

async function saveAgent(key: string, record: AgentRecord) {
  const val = JSON.stringify(record);
  if (PERSISTENT) { try { await kvPipeline([["SET", `fw:agent:${key}`, val]]); return; } catch { /* fall */ } }
  mem.agents.set(key, val);
}

// ── admin ─────────────────────────────────────────────────────────
export interface AdminAgent { key: string; agentId: string; plan: string; monthlyCap: number; expiresAt: string | null; paused: boolean; payer?: string; txHash?: string; createdAt: string; checksUsed: number }
export async function listAllAgents(): Promise<AdminAgent[]> {
  let keys: string[] = [];
  if (PERSISTENT) { try { const [k] = await kvPipeline([["SMEMBERS", "fw:index"]]); keys = (k as string[]) ?? []; } catch { /* fall */ } }
  if (!keys.length) keys = [...mem.agents.keys()];
  const out: AdminAgent[] = [];
  for (const key of keys) {
    const rec = await getAgent(key);
    if (!rec) continue;
    const used = await num(["GET", `fw:checks:${rec.agentId}:m:${monthEpoch()}`], `fw:checks:${rec.agentId}:m:${monthEpoch()}`);
    out.push({ key: key.slice(0, 10) + "…", agentId: rec.agentId, plan: rec.plan, monthlyCap: rec.monthlyCap, expiresAt: rec.expiresAt ?? null, paused: rec.policy.paused, payer: rec.payer, txHash: rec.txHash, createdAt: rec.createdAt, checksUsed: used });
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Find the full key from a masked prefix (admin actions pass the prefix). */
async function resolveKey(prefix: string): Promise<string | null> {
  const p = prefix.replace(/…$/, "");
  let keys: string[] = [];
  if (PERSISTENT) { try { const [k] = await kvPipeline([["SMEMBERS", "fw:index"]]); keys = (k as string[]) ?? []; } catch { /* fall */ } }
  if (!keys.length) keys = [...mem.agents.keys()];
  return keys.find((k) => k.startsWith(p)) ?? null;
}

export async function adminUpdate(keyPrefix: string, patch: { plan?: AgentRecord["plan"]; extendDays?: number; paused?: boolean; monthlyCap?: number }): Promise<{ ok: boolean }> {
  const key = await resolveKey(keyPrefix);
  if (!key) return { ok: false };
  const rec = await getAgent(key);
  if (!rec) return { ok: false };
  if (patch.plan) { rec.plan = patch.plan; rec.monthlyCap = PLAN_CAP[patch.plan]; }
  if (patch.monthlyCap !== undefined) rec.monthlyCap = patch.monthlyCap;
  if (patch.extendDays) { const base = rec.expiresAt && Date.now() < new Date(rec.expiresAt).getTime() ? new Date(rec.expiresAt).getTime() : Date.now(); rec.expiresAt = new Date(base + patch.extendDays * 86_400_000).toISOString(); }
  if (patch.paused !== undefined) rec.policy = { ...rec.policy, paused: patch.paused };
  await saveAgent(key, rec);
  return { ok: true };
}

export async function revokeAgent(keyPrefix: string): Promise<{ ok: boolean }> {
  const key = await resolveKey(keyPrefix);
  if (!key) return { ok: false };
  if (PERSISTENT) { try { await kvPipeline([["DEL", `fw:agent:${key}`], ["SREM", "fw:index", key]]); return { ok: true }; } catch { /* fall */ } }
  mem.agents.delete(key);
  return { ok: true };
}

export async function getAgent(key: string | undefined): Promise<AgentRecord | null> {
  if (!key) return null;
  if (PERSISTENT) {
    try { const [v] = await kvPipeline([["GET", `fw:agent:${key}`]]); if (v) return JSON.parse(v as string); } catch { /* fall */ }
  }
  const v = mem.agents.get(key);
  return v ? JSON.parse(v) : null;
}

// ── state helpers ─────────────────────────────────────────────────
async function num(cmd: (string | number)[], memKey: string): Promise<number> {
  if (PERSISTENT) { try { const [v] = await kvPipeline([cmd]); return Number(v ?? 0); } catch { /* fall */ } }
  return Number(mem.kv.get(memKey) ?? 0);
}
const monthEpoch = () => Math.floor(Date.now() / 2_592_000_000);
async function incrWindow(key: string, ttl: number): Promise<number> {
  if (PERSISTENT) { try { const [v] = await kvPipeline([["INCR", key], ["EXPIRE", key, ttl]]); return Number(v ?? 1); } catch { /* fall */ } }
  const cur = Number(mem.kv.get(key) ?? 0) + 1; mem.kv.set(key, String(cur)); return cur;
}
const incrMonthly = (id: string) => incrWindow(`fw:checks:${id}:m:${monthEpoch()}`, 2_764_800);
async function recentSpends(id: string): Promise<number[]> {
  if (PERSISTENT) { try { const [v] = await kvPipeline([["LRANGE", `fw:spendlist:${id}`, 0, 19]]); return ((v as string[]) ?? []).map(Number).filter((n: number) => n > 0); } catch { /* fall */ } }
  return (mem.lists.get(`fw:spendlist:${id}`) ?? []).map(Number).filter((n: number) => n > 0);
}
function medianOf(arr: number[]): number | undefined {
  if (arr.length < 3) return undefined;
  const a = [...arr].sort((x, y) => x - y); const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}
export async function getUsage(record: AgentRecord) {
  const used = await num(["GET", `fw:checks:${record.agentId}:m:${monthEpoch()}`], `fw:checks:${record.agentId}:m:${monthEpoch()}`);
  const expired = record.expiresAt ? Date.now() > new Date(record.expiresAt).getTime() : false;
  return { plan: record.plan, monthlyCap: record.monthlyCap, checksUsed: used, checksRemaining: Math.max(0, record.monthlyCap - used), expiresAt: record.expiresAt ?? null, expired };
}

async function seen(id: string, addr: string): Promise<boolean> {
  const a = addr.toLowerCase();
  if (PERSISTENT) { try { const [v] = await kvPipeline([["SISMEMBER", `fw:seen:${id}`, a]]); return Number(v) === 1; } catch { /* fall */ } }
  return mem.sets.get(`fw:seen:${id}`)?.has(a) ?? false;
}

async function commit(id: string, addr: string, amount: number, isApproval: boolean) {
  const a = addr.toLowerCase(), h = hourEpoch(), d = dayEpoch();
  if (PERSISTENT) {
    try {
      const cmds: (string | number)[][] = [
        ["INCRBYFLOAT", `fw:spend:${id}:h:${h}`, amount], ["EXPIRE", `fw:spend:${id}:h:${h}`, 3600],
        ["INCRBYFLOAT", `fw:spend:${id}:d:${d}`, amount], ["EXPIRE", `fw:spend:${id}:d:${d}`, 86400],
        ["SADD", `fw:seen:${id}`, a],
      ];
      if (isApproval) { cmds.push(["INCR", `fw:appr:${id}:h:${h}`], ["EXPIRE", `fw:appr:${id}:h:${h}`, 3600]); }
      if (amount > 0) { cmds.push(["LPUSH", `fw:spendlist:${id}`, amount], ["LTRIM", `fw:spendlist:${id}`, 0, 19]); }
      await kvPipeline(cmds);
      return;
    } catch { /* fall */ }
  }
  const bump = (k: string, by: number) => mem.kv.set(k, String(Number(mem.kv.get(k) ?? 0) + by));
  bump(`fw:spend:${id}:h:${h}`, amount); bump(`fw:spend:${id}:d:${d}`, amount);
  if (!mem.sets.has(`fw:seen:${id}`)) mem.sets.set(`fw:seen:${id}`, new Set());
  mem.sets.get(`fw:seen:${id}`)!.add(a);
  if (isApproval) bump(`fw:appr:${id}:h:${h}`, 1);
  if (amount > 0) { const k = `fw:spendlist:${id}`; const l = mem.lists.get(k) ?? []; l.unshift(String(amount)); mem.lists.set(k, l.slice(0, 20)); }
}

async function audit(id: string, r: FirewallResult, action: FirewallAction) {
  const entry = JSON.stringify({ auditId: r.auditId, decision: r.decision, reasons: r.reasons, to: action.to, amountUsd: action.amountUsd ?? 0, at: r.issuedAt });
  if (PERSISTENT) { try { await kvPipeline([["LPUSH", `fw:audit:${id}`, entry], ["LTRIM", `fw:audit:${id}`, 0, 99]]); return; } catch { /* fall */ } }
  const k = `fw:audit:${id}`; const l = mem.lists.get(k) ?? []; l.unshift(entry); mem.lists.set(k, l.slice(0, 100));
}

export async function readAudit(id: string, limit = 50): Promise<unknown[]> {
  if (PERSISTENT) { try { const [v] = await kvPipeline([["LRANGE", `fw:audit:${id}`, 0, limit - 1]]); return ((v as string[]) ?? []).map((s: string) => JSON.parse(s)); } catch { /* fall */ } }
  return (mem.lists.get(`fw:audit:${id}`) ?? []).slice(0, limit).map((s: string) => JSON.parse(s));
}

// ── the real check ────────────────────────────────────────────────
export async function checkKv(record: AgentRecord, action: FirewallAction): Promise<FirewallResult> {
  const started = Date.now();
  const id = record.agentId, p = record.policy;
  const amount = action.amountUsd ?? 0;
  const h = hourEpoch(), d = dayEpoch();

  // Entitlement enforcement (plan expiry + monthly quota) — before any upstream call.
  const emptyBudget = { perCallCapUsd: p.maxPerCallUsd, hourSpentUsd: 0, hourRemainingUsd: p.maxPerHourUsd, daySpentUsd: 0, dayRemainingUsd: p.maxPerDayUsd, approvalsThisHour: 0 };
  const denyEntitlement = (reasons: string[], detail: string): FirewallResult =>
    ({ auditId: uid(), agentId: id, decision: "deny", reasons, detail, budget: emptyBudget, committed: false, issuedAt: new Date().toISOString() });
  if (record.expiresAt && Date.now() > new Date(record.expiresAt).getTime()) {
    return denyEntitlement(["PLAN_EXPIRED"], "Subscription expired — renew to continue.");
  }
  const used = await incrMonthly(id);
  if (used > record.monthlyCap) {
    return denyEntitlement(["PLAN_LIMIT"], `Monthly check limit reached (${record.monthlyCap}). Upgrade your plan.`);
  }

  let verdict; let isApproval = false; let unlimited = false;
  if (action.kind === "tx") {
    verdict = await guardTx({ from: action.from ?? action.to, to: action.to, calldata: action.calldata });
    const dec = verdict.decoded;
    isApproval = dec ? ["approve", "increaseAllowance", "setApprovalForAll"].includes(dec.kind) : false;
    unlimited = Boolean(dec?.unlimited || dec?.approvedAll);
  } else {
    verdict = await guardAddress(action.to);
  }

  const minEpoch = Math.floor(Date.now() / 60_000);
  const [hourSpent, daySpent, approvalsHour, callsMin, recent, isSeen] = await Promise.all([
    num(["GET", `fw:spend:${id}:h:${h}`], `fw:spend:${id}:h:${h}`),
    num(["GET", `fw:spend:${id}:d:${d}`], `fw:spend:${id}:d:${d}`),
    num(["GET", `fw:appr:${id}:h:${h}`], `fw:appr:${id}:h:${h}`),
    incrWindow(`fw:calls:${id}:m:${minEpoch}`, 65), // per-minute call counter (enforces maxCallsPerMinute)
    recentSpends(id),
    seen(id, action.to),
  ]);

  const outcome = decidePolicy(p, {
    action, verdict, isApproval, unlimited,
    allowlisted: p.allow.some((x) => x.toLowerCase() === action.to.toLowerCase()),
    callsMin, hourSpent, daySpent, approvalsHour,
    seen: isSeen, medianSpend: medianOf(recent),
  });

  if (outcome.commit) await commit(id, action.to, amount, isApproval);

  const result: FirewallResult = {
    auditId: uid(), agentId: id, decision: outcome.decision, reasons: outcome.reasons, detail: outcome.detail, verdict,
    budget: {
      perCallCapUsd: p.maxPerCallUsd,
      hourSpentUsd: Math.round((hourSpent + (outcome.commit ? amount : 0)) * 100) / 100,
      hourRemainingUsd: Math.round((p.maxPerHourUsd - hourSpent - (outcome.commit ? amount : 0)) * 100) / 100,
      daySpentUsd: Math.round((daySpent + (outcome.commit ? amount : 0)) * 100) / 100,
      dayRemainingUsd: Math.round((p.maxPerDayUsd - daySpent - (outcome.commit ? amount : 0)) * 100) / 100,
      approvalsThisHour: approvalsHour + (outcome.commit && isApproval ? 1 : 0),
    },
    committed: outcome.commit, issuedAt: new Date().toISOString(),
  };
  void audit(id, result, action);
  void started;
  return result;
}
