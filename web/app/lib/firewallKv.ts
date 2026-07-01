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

interface AgentRecord { agentId: string; policy: AgentPolicy; createdAt: string }

// ── agent registry ────────────────────────────────────────────────
export async function createAgent(agentId: string, policyPatch: Partial<AgentPolicy> = {}): Promise<{ key: string; record: AgentRecord }> {
  const key = genKey();
  const record: AgentRecord = { agentId, policy: { agentId, ...DEFAULT_POLICY, ...policyPatch }, createdAt: new Date().toISOString() };
  const val = JSON.stringify(record);
  if (PERSISTENT) { try { await kvPipeline([["SET", `fw:agent:${key}`, val]]); return { key, record }; } catch { /* fall */ } }
  mem.agents.set(key, val);
  return { key, record };
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
      await kvPipeline(cmds);
      return;
    } catch { /* fall */ }
  }
  const bump = (k: string, by: number) => mem.kv.set(k, String(Number(mem.kv.get(k) ?? 0) + by));
  bump(`fw:spend:${id}:h:${h}`, amount); bump(`fw:spend:${id}:d:${d}`, amount);
  if (!mem.sets.has(`fw:seen:${id}`)) mem.sets.set(`fw:seen:${id}`, new Set());
  mem.sets.get(`fw:seen:${id}`)!.add(a);
  if (isApproval) bump(`fw:appr:${id}:h:${h}`, 1);
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

  let verdict; let isApproval = false; let unlimited = false;
  if (action.kind === "tx") {
    verdict = await guardTx({ from: action.from ?? action.to, to: action.to, calldata: action.calldata });
    const dec = verdict.decoded;
    isApproval = dec ? ["approve", "increaseAllowance", "setApprovalForAll"].includes(dec.kind) : false;
    unlimited = Boolean(dec?.unlimited || dec?.approvedAll);
  } else {
    verdict = await guardAddress(action.to);
  }

  const [hourSpent, daySpent, approvalsHour] = await Promise.all([
    num(["GET", `fw:spend:${id}:h:${h}`], `fw:spend:${id}:h:${h}`),
    num(["GET", `fw:spend:${id}:d:${d}`], `fw:spend:${id}:d:${d}`),
    num(["GET", `fw:appr:${id}:h:${h}`], `fw:appr:${id}:h:${h}`),
  ]);

  const outcome = decidePolicy(p, {
    action, verdict, isApproval, unlimited,
    allowlisted: p.allow.some((x) => x.toLowerCase() === action.to.toLowerCase()),
    callsMin: 0, hourSpent, daySpent, approvalsHour,
    seen: await seen(id, action.to), medianSpend: undefined,
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
