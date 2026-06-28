import { NextRequest, NextResponse } from "next/server";
import { check, getAudit, getBudget, getPolicy, resetAgent, setPolicy } from "../../lib/firewall";

export const dynamic = "force-dynamic";

// GET /api/firewall            → { policy, budget, audit }
// GET /api/firewall?reset=1    → reset the demo agent
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("reset")) resetAgent();
  return NextResponse.json({ policy: getPolicy(), budget: getBudget(), audit: getAudit() });
}

// POST /api/firewall  { action } | { policy }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body?.policy) {
    const policy = setPolicy(body.policy);
    return NextResponse.json({ policy, budget: getBudget() });
  }
  const a = body?.action;
  if (!a || !/^0x[a-fA-F0-9]{40}$/.test(a.to ?? "")) {
    return NextResponse.json({ error: "invalid action (need to: 0x..40hex)" }, { status: 400 });
  }
  const result = await check(a);
  return NextResponse.json({ result, budget: getBudget(), audit: getAudit() });
}
