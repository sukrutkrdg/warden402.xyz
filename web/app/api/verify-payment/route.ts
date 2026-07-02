import { NextRequest, NextResponse } from "next/server";
import { PAY_TO, USDC_BASE } from "../../lib/pay";

export const dynamic = "force-dynamic";

const RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const padAddr = (a: string) => "0x000000000000000000000000" + a.replace(/^0x/, "").toLowerCase();
const topicToAddr = (t: string) => "0x" + t.slice(-40);

async function rpc(method: string, params: unknown[]): Promise<any> {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store" });
  return (await r.json()).result;
}

/**
 * GET /api/verify-payment?hash=0x..
 * Confirms on-chain that the tx settled a payment to the Warden wallet.
 * Verifies via ERC-20 Transfer LOGS (works for EOAs AND Base Smart Wallet /
 * ERC-4337 UserOps, where the outer tx.to is the bundler/EntryPoint).
 */
export async function GET(req: NextRequest) {
  const hash = (req.nextUrl.searchParams.get("hash") ?? "").trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) return NextResponse.json({ verified: false, error: "invalid_hash" }, { status: 400 });

  try {
    const [tx, receipt] = await Promise.all([rpc("eth_getTransactionByHash", [hash]), rpc("eth_getTransactionReceipt", [hash])]);
    if (!tx || !receipt) return NextResponse.json({ verified: false, error: "not_found" });
    if (receipt.status !== "0x1") return NextResponse.json({ verified: false, error: "not_confirmed" });

    // 1) USDC payment — scan Transfer logs for a transfer to PAY_TO on the USDC contract.
    const payToTopic = padAddr(PAY_TO);
    const usdcLog = (receipt.logs ?? []).find((l: any) =>
      l.address?.toLowerCase() === USDC_BASE.toLowerCase() &&
      l.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC &&
      l.topics?.[2]?.toLowerCase() === payToTopic,
    );
    if (usdcLog) {
      const amount = BigInt(usdcLog.data && usdcLog.data !== "0x" ? usdcLog.data : "0x0");
      if (amount <= 0n) return NextResponse.json({ verified: false, error: "zero_value" });
      return NextResponse.json({ verified: true, token: "USDC", amount: Number(amount) / 1e6, from: topicToAddr(usdcLog.topics[1]), hash });
    }

    // 2) ETH payment — direct transfer to PAY_TO (EOA path).
    if ((tx.to ?? "").toLowerCase() === PAY_TO.toLowerCase()) {
      const wei = BigInt(tx.value ?? "0x0");
      if (wei <= 0n) return NextResponse.json({ verified: false, error: "zero_value" });
      return NextResponse.json({ verified: true, token: "ETH", amount: Number(wei) / 1e18, from: (tx.from ?? "").toLowerCase(), hash });
    }

    return NextResponse.json({ verified: false, error: "not_to_warden" });
  } catch (e) {
    return NextResponse.json({ verified: false, error: String(e) }, { status: 502 });
  }
}
