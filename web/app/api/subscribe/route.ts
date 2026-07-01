import { NextRequest, NextResponse } from "next/server";
import { createAgent } from "../../lib/firewallKv";
import { PERSISTENT, kvPipeline } from "../../lib/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/subscribe  { txHash }
 * Verifies the on-chain payment, maps the amount to a plan, and issues an agent
 * key with a 30-day expiry + monthly quota. The subscription (who paid, plan,
 * expiry, usage) lives in KV. A tx hash can only be used once.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const hash = String(body?.txHash ?? "").trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) return NextResponse.json({ error: "invalid_hash" }, { status: 400 });

  // 1) verify the payment on-chain (reuse the verify-payment route)
  const v = await fetch(new URL(`/api/verify-payment?hash=${hash}`, req.nextUrl.origin), { cache: "no-store" }).then((r) => r.json()).catch(() => null);
  if (!v?.verified) return NextResponse.json({ error: "payment_not_verified", detail: v?.error ?? "not confirmed" }, { status: 400 });

  // 2) prevent reusing the same payment
  if (PERSISTENT) {
    try {
      const [set] = await kvPipeline([["SETNX", `sub:tx:${hash}`, "1"]]);
      if (Number(set) === 0) return NextResponse.json({ error: "already_used", detail: "This payment was already redeemed." }, { status: 409 });
      await kvPipeline([["EXPIRE", `sub:tx:${hash}`, 31_536_000]]);
    } catch { /* best effort */ }
  }

  // 3) map amount → plan (USDC ~1:1; ETH → convert to USD via live price)
  let usd = 0;
  if (v.token === "USDC") usd = Number(v.amount);
  else {
    const p = await fetch(new URL("/api/eth-price", req.nextUrl.origin), { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    usd = p?.usd ? Number(v.amount) * Number(p.usd) : 0;
  }
  const plan: "starter" | "team" = usd >= 150 ? "team" : "starter";
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const agentId = `sub_${(v.from ?? "").slice(2, 10)}_${Math.random().toString(36).slice(2, 6)}`;

  const { key, record } = await createAgent(agentId, {}, { plan, expiresAt, payer: v.from, txHash: hash });

  // 4) lookup record for support / renewals
  if (PERSISTENT) {
    try { await kvPipeline([["SET", `sub:payer:${(v.from ?? "").toLowerCase()}`, JSON.stringify({ key, plan, expiresAt, txHash: hash, agentId })]]); } catch { /* best effort */ }
  }

  return NextResponse.json({ key, agentId, plan, monthlyCap: record.monthlyCap, expiresAt });
}
