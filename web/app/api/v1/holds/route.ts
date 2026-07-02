import { NextRequest, NextResponse } from "next/server";
import { getAgent, listHolds, resolveHold } from "../../../lib/firewallKv";

export const dynamic = "force-dynamic";

// GET /api/v1/holds   header: x-warden-agent-key → pending holds
export async function GET(req: NextRequest) {
  const record = await getAgent(req.headers.get("x-warden-agent-key") ?? undefined);
  if (!record) return NextResponse.json({ error: "unknown_agent" }, { status: 401 });
  const all = req.nextUrl.searchParams.get("all") === "1";
  return NextResponse.json({ agentId: record.agentId, holds: await listHolds(record.agentId, !all) });
}

// POST /api/v1/holds  { holdId, action:"approve"|"reject" }
export async function POST(req: NextRequest) {
  const record = await getAgent(req.headers.get("x-warden-agent-key") ?? undefined);
  if (!record) return NextResponse.json({ error: "unknown_agent" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const holdId = String(body?.holdId ?? "");
  if (body?.action !== "approve" && body?.action !== "reject") return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  const r = await resolveHold(record.agentId, holdId, body.action === "approve");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
