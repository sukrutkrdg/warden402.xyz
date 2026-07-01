import { NextRequest, NextResponse } from "next/server";
import { getAgent, getUsage } from "../../../lib/firewallKv";

export const dynamic = "force-dynamic";

// GET /api/v1/state   header: x-warden-agent-key → plan, quota, usage, expiry
export async function GET(req: NextRequest) {
  const record = await getAgent(req.headers.get("x-warden-agent-key") ?? undefined);
  if (!record) return NextResponse.json({ error: "unknown_agent" }, { status: 401 });
  return NextResponse.json({ agentId: record.agentId, ...(await getUsage(record)) });
}
