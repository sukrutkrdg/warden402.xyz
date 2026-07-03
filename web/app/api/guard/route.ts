import { NextRequest, NextResponse } from "next/server";
import { guardToken, guardAddress, guardTx } from "../../lib/guard";
import { clientIp, rateLimit } from "../../lib/rateLimit";
import { recordToken, recordVerdict } from "../../lib/store";
import { guardPayGate, type PayGate } from "../../lib/x402";

export const dynamic = "force-dynamic";

const ADDR = /^0x[a-fA-F0-9]{40}$/;
const LIMIT = Number(process.env.WARDEN_RATE_LIMIT ?? 30); // per IP per minute

function limited(req: NextRequest): NextResponse | null {
  const rl = rateLimit(`guard:${clientIp(req)}`, LIMIT, 60_000);
  if (rl.ok) return null;
  return NextResponse.json(
    { error: "rate_limited", detail: `Too many requests — retry in ${rl.retryAfterSec}s` },
    { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
  );
}

/** Apply x402 gate metadata (free-tier headers) + settle the payment on success. */
async function finish(gate: PayGate & { ok: true }, res: NextResponse): Promise<NextResponse> {
  if (gate.freeHeaders) Object.entries(gate.freeHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return gate.settle ? gate.settle(res) : res;
}

/**
 * Guard — SİTE İÇİNDE (in-process). Ayrı API host'una gerek yok.
 * GET  /api/guard?type=token|address&address=0x..
 * POST /api/guard   { type:"tx", from, to, calldata, value? }
 */
export async function GET(req: NextRequest) {
  const rl = limited(req); if (rl) return rl;
  const type = req.nextUrl.searchParams.get("type") ?? "token";
  const address = (req.nextUrl.searchParams.get("address") ?? "").trim();
  const chainId = Number(req.nextUrl.searchParams.get("chainId") ?? 8453);
  if (!ADDR.test(address)) {
    return NextResponse.json({ error: "Geçerli bir EVM adresi gir (0x…40 hex)" }, { status: 400 });
  }
  const gate = await guardPayGate(req); if (!gate.ok) return gate.res;
  try {
    const verdict = type === "address" ? await guardAddress(address, chainId) : await guardToken(address, chainId);
    void recordVerdict({ decision: verdict.decision, riskScore: verdict.riskScore, target: address });
    if (type !== "address") {
      const liqSig = verdict.signals.find((s) => s.category === "liquidity");
      const liq = Number((liqSig?.evidence as { totalLiq?: number } | undefined)?.totalLiq ?? 0);
      void recordToken(address, verdict.decision, verdict.riskScore, liq);
    }
    // On-chain: auto-attest block verdicts to Base EAS (gated, fire-and-forget).
    if (process.env.AUTO_ATTEST === "true" && verdict.decision === "block") {
      import("../../lib/eas").then((m) => m.attestVerdict({ target: address, decision: verdict.decision, riskScore: verdict.riskScore, reasons: verdict.reasons })).catch(() => {});
    }
    return finish(gate, NextResponse.json(verdict));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = limited(req); if (rl) return rl;
  const body = await req.json().catch(() => ({}));
  const { from, to, calldata, value, chainId } = body ?? {};
  if (!ADDR.test(from ?? "") || !ADDR.test(to ?? "")) {
    return NextResponse.json({ error: "from ve to geçerli EVM adresi olmalı" }, { status: 400 });
  }
  const gate = await guardPayGate(req); if (!gate.ok) return gate.res;
  try {
    const verdict = await guardTx({ from, to, calldata, value, chainId });
    return finish(gate, NextResponse.json(verdict));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
