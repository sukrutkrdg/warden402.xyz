import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SITE = "https://warden402.xyz";

/**
 * Machine-readable x402 service catalog, served at /.well-known/x402 (rewrite).
 * This is how x402 indexers / agent marketplaces discover Warden's paid
 * endpoints without crawling the site. Prices mirror the guard payment gate;
 * when payments are disabled the endpoints are simply free (no 402s).
 */
export function GET() {
  const priceGet = process.env.WARDEN_PRICE_TOKEN ?? "$0.01";
  const pricePost = process.env.WARDEN_PRICE_TX ?? "$0.02";
  const freePerDay = Number(process.env.WARDEN_FREE_PER_DAY ?? 50);
  return NextResponse.json({
    name: "Warden",
    description:
      "Pre-execution security for agents on Base. Ask before you act: token/address/transaction risk verdicts (block/review/clear) with deterministic reason codes, calldata decoding (unlimited approvals, Permit2/permit drainers) and tx simulation.",
    x402Version: 2,
    protocol: "x402",
    network: "eip155:8453",
    asset: "USDC",
    baseUrl: SITE,
    docs: `${SITE}/llms.txt`,
    freeTier: { callsPerDay: freePerDay, note: "per IP; agents can also use free firewall keys via /onboard" },
    services: [
      {
        id: "guard-token",
        name: "Guard: token / address",
        description: "Security verdict for a token or address: honeypot, liquidity, holder concentration, contract risk, sanctions.",
        price: priceGet,
        method: "GET",
        x402: true,
        endpoint: `${SITE}/api/guard`,
        input: { type: "token | address", address: "0x… (required)", chainId: "8453 (default)" },
      },
      {
        id: "guard-tx",
        name: "Guard: transaction",
        description: "Pre-sign transaction check: calldata decode (dangerous approvals, Permit2/permit), simulation (revert, non-contract target, unexpected asset outflow).",
        price: pricePost,
        method: "POST",
        x402: true,
        endpoint: `${SITE}/api/guard`,
        input: { from: "0x… (required)", to: "0x… (required)", calldata: "0x… (optional)", value: "0x0 (optional)", chainId: 8453 },
      },
    ],
    related: {
      firewall: `${SITE}/onboard`,
      mcp: "https://www.npmjs.com/package/warden402-mcp",
      trackRecord: `${SITE}/track-record`,
    },
  });
}
