import { NextRequest, NextResponse } from "next/server";
import { sessionAddr } from "../../../lib/auth";
import { applyOrgPayment, canManageBilling, getRole } from "../../../lib/org";
import { PERSISTENT, kvPipeline } from "../../../lib/store";

export const dynamic = "force-dynamic";

const STARTER_MIN = Number(process.env.PLAN_STARTER_MIN ?? 40);
const TEAM_MIN = Number(process.env.PLAN_TEAM_MIN ?? 150);

// POST /api/org/subscribe  { orgId, txHash }  → verify crypto payment, upgrade/renew the org (owner only)
export async function POST(req: NextRequest) {
  const addr = sessionAddr(req);
  if (!addr) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const orgId = String(body?.orgId ?? "");
  const hash = String(body?.txHash ?? "").trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) return NextResponse.json({ error: "invalid_hash" }, { status: 400 });
  if (!canManageBilling(await getRole(orgId, addr))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // 1) verify on-chain
  const v = await fetch(new URL(`/api/verify-payment?hash=${hash}`, req.nextUrl.origin), { cache: "no-store" }).then((r) => r.json()).catch(() => null);
  if (!v?.verified) return NextResponse.json({ error: "payment_not_verified", detail: v?.error ?? "not confirmed" }, { status: 400 });

  // 1b) OWNERSHIP: the on-chain payer must be the authenticated (SIWE) wallet.
  // The session already proves control of `addr`, so no extra signature is needed —
  // this just stops an owner from redeeming a payment made by someone else.
  if (String(v.from ?? "").toLowerCase() !== addr.toLowerCase()) {
    return NextResponse.json({ error: "not_payment_owner", detail: "Pay from the wallet you signed in with." }, { status: 403 });
  }

  // 2) USD value
  let usd = 0;
  if (v.token === "USDC") usd = Number(v.amount);
  else {
    const p = await fetch(new URL("/api/eth-price", req.nextUrl.origin), { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!p?.usd) return NextResponse.json({ error: "price_unavailable" }, { status: 503 });
    usd = Number(v.amount) * Number(p.usd);
  }
  if (usd < STARTER_MIN) return NextResponse.json({ error: "amount_too_low", detail: `Minimum $${STARTER_MIN}; received ~$${usd.toFixed(2)}.` }, { status: 400 });

  // 3) mandatory single-use claim (fail-closed)
  if (!PERSISTENT) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const [claimed] = await kvPipeline([["SET", `sub:tx:${hash}`, "1", "NX", "EX", 31_536_000]]);
    if (claimed === null || claimed === undefined) return NextResponse.json({ error: "already_used" }, { status: 409 });
  } catch { return NextResponse.json({ error: "redemption_failed" }, { status: 503 }); }

  // 4) apply plan (renewal stacks 30 days)
  const plan = usd >= TEAM_MIN ? "team" : "starter";
  const org = await applyOrgPayment(orgId, plan, 30);
  try {
    await kvPipeline([["LPUSH", "sub:log", JSON.stringify({ payer: addr, orgId, plan, amountUsd: Math.round(usd), token: v.token, txHash: hash, at: new Date().toISOString() })], ["LTRIM", "sub:log", 0, 499]]);
  } catch { /* best effort */ }

  return NextResponse.json({ ok: true, plan, planExpiresAt: org?.planExpiresAt });
}
