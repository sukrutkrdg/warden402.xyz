import { NextRequest, NextResponse } from "next/server";
import { sessionAddr } from "../../../lib/auth";
import { canManageAgents, getOrg, getRole, linkAgent, listOrgAgentKeys } from "../../../lib/org";
import { createAgent, getAgent, getUsage, type AgentRecord } from "../../../lib/firewallKv";

export const dynamic = "force-dynamic";

// GET /api/org/agents?orgId=..  → org's agents + usage (any member)
export async function GET(req: NextRequest) {
  const addr = sessionAddr(req);
  if (!addr) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  const role = await getRole(orgId, addr);
  if (!role) return NextResponse.json({ error: "not_a_member" }, { status: 403 });

  const keys = await listOrgAgentKeys(orgId);
  const agents = [];
  for (const key of keys) {
    const rec = await getAgent(key);
    if (!rec) continue;
    const usage = await getUsage(rec);
    agents.push({ ...usage, key: key.slice(0, 10) + "…", agentId: rec.agentId, plan: rec.plan, paused: rec.policy.paused });
  }
  return NextResponse.json({ agents, canManage: canManageAgents(role) });
}

// POST /api/org/agents  { orgId, label? }  → create an agent under the org (admin+)
export async function POST(req: NextRequest) {
  const addr = sessionAddr(req);
  if (!addr) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const orgId = String(body?.orgId ?? "");
  const role = await getRole(orgId, addr);
  if (!canManageAgents(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const org = await getOrg(orgId);
  if (!org) return NextResponse.json({ error: "no_org" }, { status: 404 });

  const agentId = `${orgId}_${String(body?.label ?? "agent").replace(/[^a-z0-9]/gi, "").slice(0, 12) || "agent"}_${Math.random().toString(36).slice(2, 6)}`;
  const { key, record } = await createAgent(agentId, {}, { plan: (org.plan as AgentRecord["plan"]) || "free" });
  await linkAgent(orgId, key);
  return NextResponse.json({ key, agentId: record.agentId, plan: record.plan, monthlyCap: record.monthlyCap });
}
