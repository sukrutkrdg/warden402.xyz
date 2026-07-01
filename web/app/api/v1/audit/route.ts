import { NextRequest, NextResponse } from "next/server";
import { getAgent, readAudit } from "../../../lib/firewallKv";

export const dynamic = "force-dynamic";

// GET /api/v1/audit   header: x-warden-agent-key → recent decisions
export async function GET(req: NextRequest) {
  const record = await getAgent(req.headers.get("x-warden-agent-key") ?? undefined);
  if (!record) return NextResponse.json({ error: "unknown_agent" }, { status: 401 });
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 200);
  return NextResponse.json({ agentId: record.agentId, entries: await readAudit(record.agentId, limit) });
}
