import { NextRequest, NextResponse } from "next/server";
import { createAgent } from "../../../lib/firewallKv";
import { clientIp, rateLimit } from "../../../lib/rateLimit";

export const dynamic = "force-dynamic";

// POST /api/v1/agents  { agentId, policy? } → { key, agentId, policy }
// Self-service onboarding (rate-limited). Store the key — it is shown once.
export async function POST(req: NextRequest) {
  const rl = rateLimit(`agents:${clientIp(req)}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited", detail: `retry in ${rl.retryAfterSec}s` }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const agentId = String(body?.agentId ?? "").trim().slice(0, 40) || `agent_${Math.random().toString(36).slice(2, 8)}`;
  const policy = typeof body?.policy === "object" && body.policy ? body.policy : {};
  const { key, record } = await createAgent(agentId, policy);
  return NextResponse.json({ key, agentId: record.agentId, policy: record.policy });
}
