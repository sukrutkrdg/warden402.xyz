/** Canonical public origin (no trailing slash). Override via NEXT_PUBLIC_SITE_URL. */
export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://warden402.xyz").replace(/\/$/, "");
}

/**
 * Base App verification id (from base.dev). Public meta tag. Warden's own id;
 * override via NEXT_PUBLIC_BASE_APP_ID if you reuse this under a different app.
 */
const DEFAULT_BASE_APP_ID = "6a417fdf76506a652317fb64";
export function getBaseAppId(): string | undefined {
  return process.env.NEXT_PUBLIC_BASE_APP_ID?.trim() || DEFAULT_BASE_APP_ID;
}

/**
 * Google AdSense publisher id ("ca-pub-…"). Loading the tag is what AdSense
 * checks when it reviews the site; it must match /ads.txt in public/.
 * Set NEXT_PUBLIC_ADSENSE_CLIENT to "" to drop the tag entirely.
 */
const DEFAULT_ADSENSE_CLIENT = "ca-pub-6789973356871306";
export function getAdsenseClient(): string | undefined {
  const v = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? DEFAULT_ADSENSE_CLIENT;
  return v.trim() || undefined;
}

export const BRAND = {
  name: "Warden",
  tagline: "Pre-execution security for agents on Base",
  bg: "#0a0e14",
  accent: "#3ddc97",
};
