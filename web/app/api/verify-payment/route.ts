import { NextRequest, NextResponse } from "next/server";
import { PAY_TO, USDC_BASE } from "../../lib/pay";

export const dynamic = "force-dynamic";

const RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

async function rpc(method: string, params: unknown[]): Promise<any> {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  const j = await r.json();
  return j.result;
}

/**
 * GET /api/verify-payment?hash=0x..
 * Confirms on-chain that the tx is a settled payment to the Warden wallet.
 * Prevents fake "I paid" claims with a made-up hash.
 */
export async function GET(req: NextRequest) {
  const hash = (req.nextUrl.searchParams.get("hash") ?? "").trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) return NextResponse.json({ verified: false, error: "invalid_hash" }, { status: 400 });

  try {
    const [tx, receipt] = await Promise.all([
      rpc("eth_getTransactionByHash", [hash]),
      rpc("eth_getTransactionReceipt", [hash]),
    ]);
    if (!tx || !receipt) return NextResponse.json({ verified: false, error: "not_found" });
    if (receipt.status !== "0x1") return NextResponse.json({ verified: false, error: "not_confirmed" });

    const to = (tx.to ?? "").toLowerCase();
    const from = (tx.from ?? "").toLowerCase();

    // ETH payment: direct transfer to the Warden wallet.
    if (to === PAY_TO.toLowerCase()) {
      const wei = BigInt(tx.value ?? "0x0");
      if (wei <= 0n) return NextResponse.json({ verified: false, error: "zero_value" });
      return NextResponse.json({ verified: true, token: "ETH", amount: Number(wei) / 1e18, from, hash });
    }

    // USDC payment: transfer(PAY_TO, amount) on the USDC contract.
    if (to === USDC_BASE.toLowerCase()) {
      const data: string = (tx.input ?? "0x").toLowerCase();
      if (!data.startsWith("0xa9059cbb")) return NextResponse.json({ verified: false, error: "not_a_transfer" });
      const recipient = "0x" + data.slice(10 + 24, 10 + 64);
      const amount = BigInt("0x" + data.slice(10 + 64, 10 + 128));
      if (recipient !== PAY_TO.toLowerCase()) return NextResponse.json({ verified: false, error: "wrong_recipient" });
      return NextResponse.json({ verified: true, token: "USDC", amount: Number(amount) / 1e6, from, hash });
    }

    return NextResponse.json({ verified: false, error: "not_to_warden" });
  } catch (e) {
    return NextResponse.json({ verified: false, error: String(e) }, { status: 502 });
  }
}
