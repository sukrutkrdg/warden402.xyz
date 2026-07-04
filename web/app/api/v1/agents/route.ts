import { NextRequest, NextResponse } from "next/server";
import { createAgent } from "../../../lib/firewallKv";
import { clientIp, rateLimit } from "../../../lib/rateLimit";

export const dynamic = "force-dynamic";

// POST /api/v1/agents  { label?, policy? } → { key, agentId, policy }
// Self-service onboarding (rate-limited). Store the key — it is shown once.
//
// SECURITY: the agentId is the namespace for ALL per-agent state (budgets,
// audit, holds, seen-set). It MUST be server-generated and unguessable — never
// taken from the caller — or an attacker could register a second key under a
// victim's agentId and share/read their budget, audit trail and holds.
// Any caller-supplied text is a display-only label folded into a random id.
export async function POST(req: NextRequest) {
  const rl = rateLimit(`agents:${clientIp(req)}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited", detail: `retry in ${rl.retryAfterSec}s` }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const label = String(body?.label ?? body?.agentId ?? "agent").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "agent";
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(9))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const agentId = `${label}_${rand}`; // label is cosmetic; rand makes it unguessable + unique
  const policy = typeof body?.policy === "object" && body.policy ? body.policy : {};
  const { key, record } = await createAgent(agentId, policy);
  return NextResponse.json({ key, agentId: record.agentId, policy: record.policy });
}
