import { NextRequest, NextResponse } from "next/server";
import { createAgent } from "../../lib/firewallKv";
import { PERSISTENT, kvPipeline } from "../../lib/store";

export const dynamic = "force-dynamic";

const STARTER_MIN = Number(process.env.PLAN_STARTER_MIN ?? 40);
const TEAM_MIN = Number(process.env.PLAN_TEAM_MIN ?? 150);

/**
 * POST /api/subscribe  { txHash }
 * Verifies the on-chain payment, enforces a minimum amount, atomically claims
 * the tx hash (single-use, fail-closed), maps amount→plan, and issues an agent
 * key with a 30-day expiry + monthly quota. Subscription state lives in KV.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const hash = String(body?.txHash ?? "").trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) return NextResponse.json({ error: "invalid_hash" }, { status: 400 });

  // 1) verify the payment on-chain
  const v = await fetch(new URL(`/api/verify-payment?hash=${hash}`, req.nextUrl.origin), { cache: "no-store" }).then((r) => r.json()).catch(() => null);
  if (!v?.verified) return NextResponse.json({ error: "payment_not_verified", detail: v?.error ?? "not confirmed" }, { status: 400 });

  // 2) compute USD value (USDC ~1:1; ETH via live price)
  let usd = 0;
  if (v.token === "USDC") usd = Number(v.amount);
  else {
    const p = await fetch(new URL("/api/eth-price", req.nextUrl.origin), { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!p?.usd) return NextResponse.json({ error: "price_unavailable", detail: "Could not price ETH — retry." }, { status: 503 });
    usd = Number(v.amount) * Number(p.usd);
  }

  // 3) enforce plan minimum (reject dust) — before claiming the hash
  if (usd < STARTER_MIN) {
    return NextResponse.json({ error: "amount_too_low", detail: `Minimum $${STARTER_MIN} for a plan; received ~$${usd.toFixed(2)}.` }, { status: 400 });
  }

  // 4) MANDATORY single-use claim (fail-closed): requires KV, atomic SET NX
  if (!PERSISTENT) return NextResponse.json({ error: "not_configured", detail: "Payment redemption requires a persistent store." }, { status: 503 });
  try {
    const [claimed] = await kvPipeline([["SET", `sub:tx:${hash}`, "1", "NX", "EX", 31_536_000]]);
    if (claimed === null || claimed === undefined) return NextResponse.json({ error: "already_used", detail: "This payment was already redeemed." }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "redemption_failed", detail: "Could not claim the payment — please retry." }, { status: 503 });
  }

  // 5) issue the agent key
  const plan: "starter" | "team" = usd >= TEAM_MIN ? "team" : "starter";
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const agentId = `sub_${(v.from ?? "").slice(2, 10)}_${Math.random().toString(36).slice(2, 6)}`;
  const { key, record } = await createAgent(agentId, {}, { plan, expiresAt, payer: v.from, txHash: hash });

  // 6) lookup + revenue log
  try {
    await kvPipeline([
      ["SET", `sub:payer:${(v.from ?? "").toLowerCase()}`, JSON.stringify({ key, plan, expiresAt, txHash: hash, agentId })],
      ["LPUSH", "sub:log", JSON.stringify({ payer: v.from, plan, amountUsd: Math.round(usd), token: v.token, txHash: hash, agentId, at: new Date().toISOString() })],
      ["LTRIM", "sub:log", 0, 499],
    ]);
  } catch { /* best effort */ }

  return NextResponse.json({ key, agentId, plan, monthlyCap: record.monthlyCap, expiresAt });
}
