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
      // Domain-bound ownership proof for warden402.xyz (FID 287286).
      // Env vars override if you deploy to a different domain.
      header:
        process.env.FARCASTER_HEADER ||
        "eyJmaWQiOjI4NzI4NiwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDg0ODhiNkY5NThiMTVlQzQxZjZiNmMyRWY4MkFEQzEwNTc4NTU5NjkifQ",
      payload: process.env.FARCASTER_PAYLOAD || "eyJkb21haW4iOiJ3YXJkZW40MDIueHl6In0",
      signature:
        process.env.FARCASTER_SIGNATURE ||
        "PGHVeNyYvLUQSzStMw4s7owAyFhfIMpgV4iEWEXBSJ49ttcpm4mvNEfDBbWD6nRj/ltyypdsnJ06Rf1kTmzQYRw=",
    },
    miniapp: {
      version: "1",
      name: "Warden",
      subtitle: "Pre-execution security",
      description:
        "Block, review or clear before your agent signs. Check any token, transaction or address for honeypots, unlimited approvals, sanctions and liquidity risk on Base.",
      iconUrl: `${SITE_URL}/brand/icon`,
      homeUrl: SITE_URL,
      splashImageUrl: `${SITE_URL}/brand/splash`,
      splashBackgroundColor: "#0a0e14",
      heroImageUrl: `${SITE_URL}/brand/embed`,
      ogImageUrl: `${SITE_URL}/brand/embed`,
      screenshotUrls: [
        `${SITE_URL}/brand/shot1`,
        `${SITE_URL}/brand/shot2`,
        `${SITE_URL}/brand/shot3`,
      ],
      primaryCategory: "developer-tools",
      tags: ["security", "x402", "base", "agents", "defi"],
    },
  });
}
