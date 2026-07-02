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

const g = globalThis as unknown as { __wardenFwKv?: { agents: Map<string, string>; kv: Map<string, string>; sets: Map<string, Set<string>>; lists: Map<string, string[]>; holds: Map<string, Record<string, string>> } };
const mem = g.__wardenFwKv ?? (g.__wardenFwKv = { agents: new Map(), kv: new Map(), sets: new Map(), lists: new Map(), holds: new Map() });

const hourEpoch = () => Math.floor(Date.now() / 3_600_000);
const dayEpoch = () => Math.floor(Date.now() / 86_400_000);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const genKey = () => "wk_" + Array.from(crypto.getRandomValues(new Uint8Array(20))).map((b) => b.toString(16).padStart(2, "0")).join("");

export interface AgentRecord {
  agentId: string; policy: AgentPolicy; createdAt: string;
  plan: "free" | "starter" | "team" | "enterprise";
  monthlyCap: number; expiresAt?: string; payer?: string; txHash?: string;
  webhookUrl?: string; // POSTed on every hold (fire-and-forget)
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

/** Rotate an agent's key: issue a new key with the same record (plan, expiry,
 *  quota — usage is keyed by agentId so it carries over), revoke the old one. */
export async function rotateKey(oldKey: string): Promise<{ key: string } | null> {
  const rec = await getAgent(oldKey);
  if (!rec) return null;
  const key = genKey();
  const val = JSON.stringify(rec);
  if (PERSISTENT) {
    try { await kvPipeline([["SET", `fw:agent:${key}`, val], ["SADD", "fw:index", key], ["DEL", `fw:agent:${oldKey}`], ["SREM", "fw:index", oldKey]]); return { key }; } catch { /* fall */ }
  }
  mem.agents.set(key, val); mem.agents.delete(oldKey);
  return { key };
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

// ── webhooks (notify on hold) ──────────────────────────────────────
function safeWebhookUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const h = url.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return false;
    return true;
  } catch { return false; }
}
async function notifyWebhook(url: string, payload: unknown) {
  if (!safeWebhookUrl(url)) return;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000);
  try { await fetch(url, { method: "POST", headers: { "content-type": "application/json", "user-agent": "warden-webhook" }, body: JSON.stringify(payload), signal: ctrl.signal }); } catch { /* fire-and-forget */ } finally { clearTimeout(t); }
}
export async function setWebhook(key: string, url: string | null): Promise<{ ok: boolean; error?: string }> {
  const rec = await getAgent(key); if (!rec) return { ok: false, error: "unknown_agent" };
  if (url && !safeWebhookUrl(url)) return { ok: false, error: "invalid_url" };
  rec.webhookUrl = url ?? undefined;
  await saveAgent(key, rec);
  return { ok: true };
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

/** Atomically add `amount` to the hour+day spend and return the NEW totals.
 *  Used as reserve-then-verify to close the TOCTOU overspend race. Pass a
 *  negative amount to roll back. */
async function reserveSpend(id: string, amount: number): Promise<{ hour: number; day: number }> {
  const h = hourEpoch(), d = dayEpoch();
  if (PERSISTENT) {
    try {
      const res = await kvPipeline([
        ["INCRBYFLOAT", `fw:spend:${id}:h:${h}`, amount], ["EXPIRE", `fw:spend:${id}:h:${h}`, 3600],
        ["INCRBYFLOAT", `fw:spend:${id}:d:${d}`, amount], ["EXPIRE", `fw:spend:${id}:d:${d}`, 86400],
      ]);
      return { hour: Number(res[0] ?? 0), day: Number(res[2] ?? 0) };
    } catch { /* fall */ }
  }
  const bump = (k: string, by: number) => { const n = Number(mem.kv.get(k) ?? 0) + by; mem.kv.set(k, String(n)); return n; };
  return { hour: bump(`fw:spend:${id}:h:${h}`, amount), day: bump(`fw:spend:${id}:d:${d}`, amount) };
}

/** Commit non-spend side effects after a spend reserve has succeeded. */
async function commitMeta(id: string, addr: string, amount: number, isApproval: boolean) {
  const a = addr.toLowerCase(), h = hourEpoch();
  if (PERSISTENT) {
    try {
      const cmds: (string | number)[][] = [["SADD", `fw:seen:${id}`, a]];
      if (isApproval) { cmds.push(["INCR", `fw:appr:${id}:h:${h}`], ["EXPIRE", `fw:appr:${id}:h:${h}`, 3600]); }
      if (amount > 0) { cmds.push(["LPUSH", `fw:spendlist:${id}`, amount], ["LTRIM", `fw:spendlist:${id}`, 0, 19]); }
      await kvPipeline(cmds);
      return;
    } catch { /* fall */ }
  }
  if (!mem.sets.has(`fw:seen:${id}`)) mem.sets.set(`fw:seen:${id}`, new Set());
  mem.sets.get(`fw:seen:${id}`)!.add(a);
  if (isApproval) mem.kv.set(`fw:appr:${id}:h:${h}`, String(Number(mem.kv.get(`fw:appr:${id}:h:${h}`) ?? 0) + 1));
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
    isApproval = dec ? ["approve", "increaseAllowance", "setApprovalForAll", "permit", "permit2Approve"].includes(dec.kind) : false;
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

  // Atomic reserve-then-verify: closes the concurrent-overspend race that a
  // read-then-check-then-commit sequence leaves open.
  let final = outcome;
  if (outcome.commit && amount > 0) {
    const tot = await reserveSpend(id, amount);
    if (tot.hour > p.maxPerHourUsd || tot.day > p.maxPerDayUsd) {
      await reserveSpend(id, -amount); // roll back
      const reason = tot.hour > p.maxPerHourUsd ? "OVER_HOURLY" : "OVER_DAILY";
      final = { decision: "deny", reasons: [reason], detail: `Would exceed ${reason === "OVER_HOURLY" ? "hourly" : "daily"} cap (concurrent).`, commit: false };
    }
  }
  if (final.commit) await commitMeta(id, action.to, amount, isApproval);

  const result: FirewallResult = {
    auditId: uid(), agentId: id, decision: final.decision, reasons: final.reasons, detail: final.detail, verdict,
    budget: {
      perCallCapUsd: p.maxPerCallUsd,
      hourSpentUsd: Math.round((hourSpent + (final.commit ? amount : 0)) * 100) / 100,
      hourRemainingUsd: Math.round((p.maxPerHourUsd - hourSpent - (final.commit ? amount : 0)) * 100) / 100,
      daySpentUsd: Math.round((daySpent + (final.commit ? amount : 0)) * 100) / 100,
      dayRemainingUsd: Math.round((p.maxPerDayUsd - daySpent - (final.commit ? amount : 0)) * 100) / 100,
      approvalsThisHour: approvalsHour + (final.commit && isApproval ? 1 : 0),
    },
    committed: final.commit, issuedAt: new Date().toISOString(),
  };
  void audit(id, result, action);
  if (final.decision === "hold") {
    void persistHold(id, { holdId: result.auditId, action, reasons: final.reasons, amountUsd: amount, createdAt: result.issuedAt, status: "pending" });
    if (record.webhookUrl) void notifyWebhook(record.webhookUrl, { event: "hold", agentId: id, holdId: result.auditId, action, reasons: final.reasons, at: result.issuedAt });
  }
  void started;
  return result;
}

// ── holds (paid path) — persisted so a customer can approve/reject ───
export interface HoldRec { holdId: string; action: FirewallAction; reasons: string[]; amountUsd: number; createdAt: string; status: "pending" | "approved" | "rejected" }
async function persistHold(id: string, h: HoldRec) {
  if (PERSISTENT) { try { await kvPipeline([["HSET", `fw:holds:${id}`, h.holdId, JSON.stringify(h)]]); return; } catch { /* fall */ } }
  const k = `fw:holds:${id}`; const map = mem.holds.get(k) ?? {}; map[h.holdId] = JSON.stringify(h); mem.holds.set(k, map);
}
export async function listHolds(id: string, onlyPending = true): Promise<HoldRec[]> {
  let out: HoldRec[] = [];
  if (PERSISTENT) {
    try { const [flat] = await kvPipeline([["HGETALL", `fw:holds:${id}`]]); const a = (flat as string[]) ?? []; for (let i = 1; i < a.length; i += 2) { try { out.push(JSON.parse(a[i]!)); } catch { /* skip */ } } } catch { /* fall */ }
  }
  if (!out.length) { const m = mem.holds.get(`fw:holds:${id}`); if (m) out = Object.values(m).map((s) => JSON.parse(s as string)); }
  out.sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
  return onlyPending ? out.filter((h) => h.status === "pending") : out;
}
export async function resolveHold(id: string, holdId: string, approve: boolean): Promise<{ ok: boolean; error?: string }> {
  const holds = await listHolds(id, false);
  const h = holds.find((x) => x.holdId === holdId);
  if (!h || h.status !== "pending") return { ok: false, error: "not_found_or_resolved" };
  if (approve) {
    // Manual approval intentionally overrides the hold; record the spend.
    if ((h.amountUsd ?? 0) > 0) await reserveSpend(id, h.amountUsd);
    await commitMeta(id, h.action.to, h.amountUsd ?? 0, h.action.kind === "tx");
    h.status = "approved";
  } else {
    h.status = "rejected";
  }
  await persistHold(id, h);
  return { ok: true };
}
