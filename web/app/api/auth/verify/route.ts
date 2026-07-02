import { NextRequest, NextResponse } from "next/server";
import { signSession, verifyLogin } from "../../../lib/auth";

export const dynamic = "force-dynamic";

// POST /api/auth/verify  { address, message, signature } → { token, address }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { address, message, signature } = body ?? {};
  if (!address || !message || !signature) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  const addr = await verifyLogin(String(address), String(message), String(signature));
  if (!addr) return NextResponse.json({ error: "invalid_signature_or_nonce" }, { status: 401 });
  return NextResponse.json({ token: signSession(addr), address: addr });
}
