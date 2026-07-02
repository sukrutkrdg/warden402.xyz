import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "../../../lib/firewallKv";
import { PERSISTENT, kvPipeline } from "../../../lib/store";

export const dynamic = "force-dynamic";

// GET /api/v1/receipts   header: x-warden-agent-key → this payer's payment receipts
export async function GET(req: NextRequest) {
  const record = await getAgent(req.headers.get("x-warden-agent-key") ?? undefined);
  if (!record) return NextResponse.json({ error: "unknown_agent" }, { status: 401 });
  if (!record.payer) return NextResponse.json({ receipts: [] });

  let receipts: unknown[] = [];
  if (PERSISTENT) {
    try {
      const [log] = await kvPipeline([["LRANGE", "sub:log", 0, 499]]);
      receipts = ((log as string[]) ?? [])
        .map((s) => { try { return JSON.parse(s); } catch { return null; } })
        .filter((r): r is { payer?: string } => Boolean(r) && (r as { payer?: string }).payer?.toLowerCase() === record.payer!.toLowerCase());
    } catch { /* empty */ }
  }
  return NextResponse.json({ payer: record.payer, receipts });
}
