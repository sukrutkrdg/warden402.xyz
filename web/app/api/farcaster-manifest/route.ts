/**
 * Farcaster / Base App Mini App manifest, served at /.well-known/farcaster.json
 * (via a rewrite in next.config.mjs).
 *
 * `accountAssociation` proves you own warden402.xyz with your Farcaster account.
 * Generate it ONCE for this domain with the Farcaster/Base manifest tool, then set:
 *   FARCASTER_HEADER, FARCASTER_PAYLOAD, FARCASTER_SIGNATURE
 * Until set, the embed still renders but the app can't be published/verified.
 */
import { getSiteUrl } from "../../lib/site";

export const dynamic = "force-dynamic";

export function GET() {
  const SITE_URL = getSiteUrl();
  return Response.json({
    accountAssociation: {
      header: process.env.FARCASTER_HEADER || "",
      payload: process.env.FARCASTER_PAYLOAD || "",
      signature: process.env.FARCASTER_SIGNATURE || "",
    },
    miniapp: {
      version: "1",
      name: "Warden",
      subtitle: "Pre-execution security for agents",
      description:
        "block / review / clear before your agent signs. Give Warden a token, a pending transaction or an address and collapse honeypots, unlimited allowances, sanctions, liquidity and holder concentration into a single decision on Base.",
      iconUrl: `${SITE_URL}/brand/icon`,
      homeUrl: SITE_URL,
      splashImageUrl: `${SITE_URL}/brand/splash`,
      splashBackgroundColor: "#0a0e14",
      heroImageUrl: `${SITE_URL}/brand/embed`,
      ogImageUrl: `${SITE_URL}/brand/embed`,
      primaryCategory: "developer-tools",
      tags: ["security", "x402", "base", "agents", "defi"],
    },
  });
}
