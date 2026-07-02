import { NextRequest, NextResponse } from "next/server";
import { sessionAddr } from "../../../lib/auth";
import { addMember, canManageMembers, getMembers, getRole, removeMember, type Role } from "../../../lib/org";

export const dynamic = "force-dynamic";

async function guard(req: NextRequest, orgId: string): Promise<{ addr: string; role: Role } | NextResponse> {
  const addr = sessionAddr(req);
  if (!addr) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const role = await getRole(orgId, addr);
  if (!role) return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  return { addr, role };
}

// GET /api/org/members?orgId=..  → members (any member)
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  const g = await guard(req, orgId);
  if (g instanceof NextResponse) return g;
  return NextResponse.json({ members: await getMembers(orgId), myRole: g.role });
}

// POST /api/org/members  { orgId, address, role }  → add/invite member (admin+)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const orgId = String(body?.orgId ?? "");
  const g = await guard(req, orgId);
  if (g instanceof NextResponse) return g;
  if (!canManageMembers(g.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const address = String(body?.address ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  const role = (body?.role === "admin" ? "admin" : "member") as Role;
  return NextResponse.json(await addMember(orgId, address, role));
}

// DELETE /api/org/members  { orgId, address }  → remove member (admin+)
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const orgId = String(body?.orgId ?? "");
  const g = await guard(req, orgId);
  if (g instanceof NextResponse) return g;
  if (!canManageMembers(g.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await removeMember(orgId, String(body?.address ?? "")));
}
