import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API = process.env.WARDEN_API_URL ?? "http://localhost:8787";

/**
 * Tarayıcı → bu route → Hono Guard API. (CORS / API URL gizleme için proxy.)
 * GET /api/guard?type=token|address&address=0x..
 * POST /api/guard  { type:"tx", from, to, calldata }
 */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "token";
  const address = req.nextUrl.searchParams.get("address") ?? "";
  const path = type === "address" ? "/guard/address" : "/guard/token";
  try {
    const r = await fetch(`${API}${path}?address=${encodeURIComponent(address)}`, { cache: "no-store" });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: "api_unreachable", detail: String(e) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    const r = await fetch(`${API}/guard/tx`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: "api_unreachable", detail: String(e) }, { status: 502 });
  }
}
