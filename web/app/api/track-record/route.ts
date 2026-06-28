import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API = process.env.WARDEN_API_URL ?? "http://localhost:8787";

export async function GET() {
  try {
    const r = await fetch(`${API}/track-record`, { cache: "no-store" });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: "api_unreachable", detail: String(e) }, { status: 502 });
  }
}
