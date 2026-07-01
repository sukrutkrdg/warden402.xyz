import { NextRequest, NextResponse } from "next/server";
import { approveHold, listAgents, pendingHolds, rejectHold, seedDashboard, spendSeries } from "../../../lib/firewall";

export const dynamic = "force-dynamic";

function snapshot() {
  const agents = listAgents();
  const holds = agents.flatMap((a) => pendingHolds(a.agentId));
  const series: Record<string, { label: string; usd: number }[]> = {};
  for (const a of agents) series[a.agentId] = spendSeries(a.agentId, 12);
  return { agents, holds, series };
}

// GET /api/firewall/dashboard → { agents, holds, series }
export async function GET() {
  seedDashboard();
  return NextResponse.json(snapshot());
}

// POST /api/firewall/dashboard  { op:"approve"|"reject", agentId, holdId }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { op, agentId, holdId } = body ?? {};
  if (op === "approve") approveHold(holdId, agentId);
  else if (op === "reject") rejectHold(holdId, agentId);
  else return NextResponse.json({ error: "invalid op" }, { status: 400 });
  return NextResponse.json(snapshot());
}
