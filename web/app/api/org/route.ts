import { NextRequest, NextResponse } from "next/server";
import { sessionAddr } from "../../lib/auth";
import { createOrg, listUserOrgs } from "../../lib/org";

export const dynamic = "force-dynamic";

// GET /api/org  → { address, orgs: [{ org, role }] }
export async function GET(req: NextRequest) {
  const addr = sessionAddr(req);
  if (!addr) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  return NextResponse.json({ address: addr, orgs: await listUserOrgs(addr) });
}

// POST /api/org  { name } → create a new org (caller becomes owner)
export async function POST(req: NextRequest) {
  const addr = sessionAddr(req);
  if (!addr) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const org = await createOrg(String(body?.name ?? "My Team"), addr);
  return NextResponse.json({ org });
}
