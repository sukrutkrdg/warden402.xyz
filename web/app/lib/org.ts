/**
 * Organizations — multi-tenant teams with wallet-based membership + roles.
 * Identity is a wallet address (from the SIWE session). Agents belong to an org.
 *
 * KV keys:
 *   org:<orgId>              JSON { orgId, name, ownerAddr, plan, createdAt }
 *   org:members:<orgId>      hash  addr -> role
 *   user:orgs:<addr>         set   of orgId the wallet belongs to
 *   org:agentkeys:<orgId>    set   of agent keys owned by the org
 */
import { PERSISTENT, kvPipeline } from "./store";

export type Role = "owner" | "admin" | "member";
const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };
export const canManageMembers = (r: Role | null) => !!r && RANK[r] >= RANK.admin;
export const canManageAgents = (r: Role | null) => !!r && RANK[r] >= RANK.admin;
export const canManageBilling = (r: Role | null) => r === "owner";

export interface Org { orgId: string; name: string; ownerAddr: string; plan: string; createdAt: string; planExpiresAt?: string }

const g = globalThis as unknown as { __wardenOrg?: { orgs: Map<string, string>; members: Map<string, Record<string, string>>; userOrgs: Map<string, Set<string>>; agents: Map<string, Set<string>> } };
const mem = g.__wardenOrg ?? (g.__wardenOrg = { orgs: new Map(), members: new Map(), userOrgs: new Map(), agents: new Map() });

const genOrgId = () => "org_" + Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => b.toString(16).padStart(2, "0")).join("");
const lc = (a: string) => a.toLowerCase();

// ── create / read ─────────────────────────────────────────────────
export async function createOrg(name: string, ownerAddr: string): Promise<Org> {
  const owner = lc(ownerAddr);
  const org: Org = { orgId: genOrgId(), name: name.slice(0, 60) || "My Team", ownerAddr: owner, plan: "free", createdAt: new Date().toISOString() };
  if (PERSISTENT) {
    try {
      await kvPipeline([
        ["SET", `org:${org.orgId}`, JSON.stringify(org)],
        ["HSET", `org:members:${org.orgId}`, owner, "owner"],
        ["SADD", `user:orgs:${owner}`, org.orgId],
      ]);
      return org;
    } catch { /* fall */ }
  }
  mem.orgs.set(org.orgId, JSON.stringify(org));
  mem.members.set(org.orgId, { [owner]: "owner" });
  if (!mem.userOrgs.has(owner)) mem.userOrgs.set(owner, new Set());
  mem.userOrgs.get(owner)!.add(org.orgId);
  return org;
}

export async function getOrg(orgId: string): Promise<Org | null> {
  if (PERSISTENT) { try { const [v] = await kvPipeline([["GET", `org:${orgId}`]]); if (v) return JSON.parse(v as string); } catch { /* fall */ } }
  const v = mem.orgs.get(orgId);
  return v ? JSON.parse(v) : null;
}

async function saveOrg(org: Org) {
  if (PERSISTENT) { try { await kvPipeline([["SET", `org:${org.orgId}`, JSON.stringify(org)]]); return; } catch { /* fall */ } }
  mem.orgs.set(org.orgId, JSON.stringify(org));
}

// ── membership ────────────────────────────────────────────────────
export async function getRole(orgId: string, addr: string): Promise<Role | null> {
  const a = lc(addr);
  if (PERSISTENT) { try { const [v] = await kvPipeline([["HGET", `org:members:${orgId}`, a]]); return (v as Role) ?? null; } catch { /* fall */ } }
  return (mem.members.get(orgId)?.[a] as Role) ?? null;
}

export async function getMembers(orgId: string): Promise<{ addr: string; role: Role }[]> {
  let map: Record<string, string> = {};
  if (PERSISTENT) {
    try { const [flat] = await kvPipeline([["HGETALL", `org:members:${orgId}`]]); const a = (flat as string[]) ?? []; for (let i = 0; i < a.length; i += 2) map[a[i]!] = a[i + 1]!; } catch { /* fall */ }
  }
  if (!Object.keys(map).length) map = mem.members.get(orgId) ?? {};
  return Object.entries(map).map(([addr, role]) => ({ addr, role: role as Role }));
}

export async function listUserOrgs(addr: string): Promise<{ org: Org; role: Role }[]> {
  const a = lc(addr);
  let ids: string[] = [];
  if (PERSISTENT) { try { const [s] = await kvPipeline([["SMEMBERS", `user:orgs:${a}`]]); ids = (s as string[]) ?? []; } catch { /* fall */ } }
  if (!ids.length) ids = [...(mem.userOrgs.get(a) ?? [])];
  const out: { org: Org; role: Role }[] = [];
  for (const id of ids) {
    const org = await getOrg(id); const role = await getRole(id, a);
    if (org && role) out.push({ org, role });
  }
  return out;
}

export async function addMember(orgId: string, addr: string, role: Role): Promise<{ ok: boolean }> {
  const a = lc(addr);
  if (role === "owner") return { ok: false }; // ownership transfer is a separate op
  if (PERSISTENT) { try { await kvPipeline([["HSET", `org:members:${orgId}`, a, role], ["SADD", `user:orgs:${a}`, orgId]]); return { ok: true }; } catch { /* fall */ } }
  const m = mem.members.get(orgId) ?? {}; m[a] = role; mem.members.set(orgId, m);
  if (!mem.userOrgs.has(a)) mem.userOrgs.set(a, new Set());
  mem.userOrgs.get(a)!.add(orgId);
  return { ok: true };
}

export async function removeMember(orgId: string, addr: string): Promise<{ ok: boolean }> {
  const a = lc(addr);
  if ((await getRole(orgId, a)) === "owner") return { ok: false }; // can't remove the owner
  if (PERSISTENT) { try { await kvPipeline([["HDEL", `org:members:${orgId}`, a], ["SREM", `user:orgs:${a}`, orgId]]); return { ok: true }; } catch { /* fall */ } }
  const m = mem.members.get(orgId) ?? {}; delete m[a]; mem.members.set(orgId, m);
  mem.userOrgs.get(a)?.delete(orgId);
  return { ok: true };
}

// ── org ↔ agents ──────────────────────────────────────────────────
export async function linkAgent(orgId: string, key: string) {
  if (PERSISTENT) { try { await kvPipeline([["SADD", `org:agentkeys:${orgId}`, key]]); return; } catch { /* fall */ } }
  if (!mem.agents.has(orgId)) mem.agents.set(orgId, new Set());
  mem.agents.get(orgId)!.add(key);
}
export async function listOrgAgentKeys(orgId: string): Promise<string[]> {
  if (PERSISTENT) { try { const [s] = await kvPipeline([["SMEMBERS", `org:agentkeys:${orgId}`]]); const a = (s as string[]) ?? []; if (a.length) return a; } catch { /* fall */ } }
  return [...(mem.agents.get(orgId) ?? [])];
}

export async function setOrgPlan(orgId: string, plan: string) {
  const org = await getOrg(orgId); if (!org) return;
  org.plan = plan; await saveOrg(org);
}

/** Apply a paid subscription to an org: set the plan and extend the expiry by
 *  `days` (renewal stacks on remaining time). Returns the updated org. */
export async function applyOrgPayment(orgId: string, plan: string, days = 30): Promise<Org | null> {
  const org = await getOrg(orgId); if (!org) return null;
  const base = org.planExpiresAt && Date.now() < new Date(org.planExpiresAt).getTime() ? new Date(org.planExpiresAt).getTime() : Date.now();
  org.plan = plan;
  org.planExpiresAt = new Date(base + days * 86_400_000).toISOString();
  await saveOrg(org);
  return org;
}
