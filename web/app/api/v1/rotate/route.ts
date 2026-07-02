import { NextRequest, NextResponse } from "next/server";
import { getAgent, rotateKey } from "../../../lib/firewallKv";

export const dynamic = "force-dynamic";

// POST /api/v1/rotate   header: x-warden-agent-key → { key: <new key> }
// Issues a new key (same plan/quota/expiry), revokes the old one.
export async function POST(req: NextRequest) {
  const oldKey = req.headers.get("x-warden-agent-key") ?? undefined;
  const record = await getAgent(oldKey);
  if (!record) return NextResponse.json({ error: "unknown_agent" }, { status: 401 });
  const r = await rotateKey(oldKey!);
  if (!r) return NextResponse.json({ error: "rotate_failed" }, { status: 500 });
  return NextResponse.json({ key: r.key, agentId: record.agentId, note: "Old key revoked. Store the new key." });
}
