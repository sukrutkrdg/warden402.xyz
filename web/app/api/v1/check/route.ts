import { NextRequest, NextResponse } from "next/server";
import { checkKv, getAgent } from "../../../lib/firewallKv";
import { clientIp, rateLimit } from "../../../lib/rateLimit";

export const dynamic = "force-dynamic";

const ADDR = /^0x[a-fA-F0-9]{40}$/;

/**
 * POST /api/v1/check   header: x-warden-agent-key
 * body: { kind:"x402_payment"|"tx", to, amountUsd?, from?, calldata?, chainId? }
 * → real per-agent firewall decision (allow|hold|deny) with persistent budgets.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`v1check:${clientIp(req)}`, Number(process.env.WARDEN_RATE_LIMIT ?? 60), 60_000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited", detail: `retry in ${rl.retryAfterSec}s` }, { status: 429 });

  const record = await getAgent(req.headers.get("x-warden-agent-key") ?? undefined);
  if (!record) return NextResponse.json({ error: "unknown_agent", detail: "Missing or invalid x-warden-agent-key" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const kind = body?.kind === "tx" ? "tx" : "x402_payment";
  const to = String(body?.to ?? "");
  if (!ADDR.test(to)) return NextResponse.json({ error: "invalid_request", detail: "to must be a 0x..40 hex address" }, { status: 400 });
  if (body?.from && !ADDR.test(body.from)) return NextResponse.json({ error: "invalid_request", detail: "from must be a valid address" }, { status: 400 });

  const result = await checkKv(record, {
    kind, to,
    amountUsd: typeof body?.amountUsd === "number" ? body.amountUsd : undefined,
    from: body?.from, calldata: body?.calldata, chainId: body?.chainId,
  });

  const status = result.decision === "deny" ? 403 : result.decision === "hold" ? 202 : 200;
  return NextResponse.json(result, { status });
}
