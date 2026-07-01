import { NextRequest, NextResponse } from "next/server";
import { adminUpdate, createAgent, listAllAgents, revokeAgent } from "../../lib/firewallKv";
import { PERSISTENT, kvPipeline, readStats, tokenStats } from "../../lib/store";

export const dynamic = "force-dynamic";

const ADMIN = process.env.ADMIN_TOKEN;

function authed(req: NextRequest): boolean {
  if (!ADMIN) return false; // locked until configured
  const h = req.headers.get("x-warden-admin") ?? "";
  const q = req.nextUrl.searchParams.get("token") ?? "";
  return h === ADMIN || q === ADMIN;
}

async function payments(): Promise<unknown[]> {
  if (!PERSISTENT) return [];
  try { const [l] = await kvPipeline([["LRANGE", "sub:log", 0, 99]]); return ((l as string[]) ?? []).map((s) => JSON.parse(s)); } catch { return []; }
}

// GET /api/admin?token=... → { agents, payments, stats }
export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [agents, pay, stats, tstats] = await Promise.all([listAllAgents(), payments(), readStats(), tokenStats()]);
  const revenue = (pay as { amountUsd?: number }[]).reduce((a, p) => a + (p.amountUsd ?? 0), 0);
  return NextResponse.json({
    agents, payments: pay,
    counts: { agents: agents.length, paid: agents.filter((a) => a.plan !== "free").length, revenueUsd: revenue },
    trackRecord: { total: stats.total, ...tstats },
  });
}

// POST /api/admin  { op, ... }
export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const op = body?.op;

  if (op === "update") return NextResponse.json(await adminUpdate(String(body.keyPrefix), body.patch ?? {}));
  if (op === "revoke") return NextResponse.json(await revokeAgent(String(body.keyPrefix)));
  if (op === "comp") {
    const days = Number(body.days ?? 30);
    const { key, record } = await createAgent(String(body.agentId || `comp_${Math.random().toString(36).slice(2, 7)}`), {}, { plan: body.plan ?? "team", expiresAt: new Date(Date.now() + days * 86_400_000).toISOString() });
    return NextResponse.json({ key, agentId: record.agentId, plan: record.plan, expiresAt: record.expiresAt });
  }
  if (op === "scout" || op === "recheck") {
    const secret = process.env.CRON_SECRET ?? "";
    const r = await fetch(new URL(`/api/${op}${secret ? `?secret=${secret}` : ""}`, req.nextUrl.origin), { cache: "no-store" }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    return NextResponse.json(r);
  }
  return NextResponse.json({ error: "invalid op" }, { status: 400 });
}
