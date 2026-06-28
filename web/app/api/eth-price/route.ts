import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE = process.env.BAZAAR_BASE_URL ?? "https://402.com.tr";
const SECRET = process.env.BAZAAR_INTERNAL_SECRET ?? "";
const WETH_BASE = "0x4200000000000000000000000000000000000006";

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : undefined;
  return n !== undefined && Number.isFinite(n) && n > 0 ? n : undefined;
}

// GET /api/eth-price → { usd }   (ETH price in USD, for ETH checkout amounts)
export async function GET() {
  try {
    const r = await fetch(`${BASE}/api/x402/token-price?address=${WETH_BASE}`, {
      headers: { Accept: "application/json", ...(SECRET ? { "X-Warden-Internal": SECRET } : {}) },
      cache: "no-store",
    });
    const j = (await r.json()) as Record<string, unknown>;
    const p = (j.data && typeof j.data === "object" ? (j.data as Record<string, unknown>) : j) as Record<string, unknown>;
    const usd = num(p.priceUsd) ?? num(p.price) ?? num(p.usd);
    if (!usd) return NextResponse.json({ error: "price_unavailable" }, { status: 502 });
    return NextResponse.json({ usd });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
