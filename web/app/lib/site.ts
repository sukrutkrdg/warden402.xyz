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

export const BRAND = {
  name: "Warden",
  tagline: "Pre-execution security for agents on Base",
  bg: "#0a0e14",
  accent: "#3ddc97",
};
