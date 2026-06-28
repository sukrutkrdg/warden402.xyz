import { NextRequest, NextResponse } from "next/server";
import { guardToken, guardAddress, guardTx } from "../../lib/guard";

export const dynamic = "force-dynamic";

const ADDR = /^0x[a-fA-F0-9]{40}$/;

/**
 * Guard — SİTE İÇİNDE (in-process). Ayrı API host'una gerek yok.
 * GET  /api/guard?type=token|address&address=0x..
 * POST /api/guard   { type:"tx", from, to, calldata, value? }
 */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "token";
  const address = (req.nextUrl.searchParams.get("address") ?? "").trim();
  const chainId = Number(req.nextUrl.searchParams.get("chainId") ?? 8453);
  if (!ADDR.test(address)) {
    return NextResponse.json({ error: "Geçerli bir EVM adresi gir (0x…40 hex)" }, { status: 400 });
  }
  try {
    const verdict = type === "address" ? await guardAddress(address, chainId) : await guardToken(address, chainId);
    return NextResponse.json(verdict);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { from, to, calldata, value, chainId } = body ?? {};
  if (!ADDR.test(from ?? "") || !ADDR.test(to ?? "")) {
    return NextResponse.json({ error: "from ve to geçerli EVM adresi olmalı" }, { status: 400 });
  }
  try {
    const verdict = await guardTx({ from, to, calldata, value, chainId });
    return NextResponse.json(verdict);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
