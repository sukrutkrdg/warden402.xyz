import { NextRequest, NextResponse } from "next/server";
import { getAgent, setWebhook } from "../../../lib/firewallKv";

export const dynamic = "force-dynamic";

// POST /api/v1/webhook  { url }  header: x-warden-agent-key
// Set (or clear with null) the URL Warden POSTs to on every hold.
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-warden-agent-key") ?? undefined;
  const record = await getAgent(key);
  if (!record) return NextResponse.json({ error: "unknown_agent" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const url = body?.url ? String(body.url) : null;
  const r = await setWebhook(key!, url);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
