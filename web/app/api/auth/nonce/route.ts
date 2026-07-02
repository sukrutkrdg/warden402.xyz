import { NextRequest, NextResponse } from "next/server";
import { issueNonce, loginMessage } from "../../../lib/auth";

export const dynamic = "force-dynamic";

// GET /api/auth/nonce?address=0x..  → { nonce, message }  (message is what the wallet signs)
export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  const nonce = await issueNonce();
  return NextResponse.json({ nonce, message: loginMessage(address, nonce) });
}
