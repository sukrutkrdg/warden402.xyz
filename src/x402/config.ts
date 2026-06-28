/**
 * x402 payment config for the Warden API.
 *
 * SAFE DEFAULT: payments are OFF unless PAYMENTS_ENABLED=true AND CDP keys are
 * set. When off, the API stays fully free (the website demo always stays free).
 */
import type { Network } from "@x402/core/types";

export const NETWORK: Network = "eip155:8453"; // Base mainnet
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export interface PayConfig {
  enabled: boolean;
  payTo: string;
  cdpApiKeyId: string | undefined;
  cdpApiKeySecret: string | undefined;
  /** free calls per IP per day before payment is required */
  freePerDay: number;
  prices: Record<string, string>; // path → "$0.0x"
}

export function getPayConfig(): PayConfig {
  // Default payTo = the owner's Bazaar wallet (same owner). Override via env.
  const payTo = process.env.WARDEN_PAY_TO?.trim() || "0x973a31858f4d2125f48c880542da11a2796f12d6";
  const cdpApiKeyId = process.env.CDP_API_KEY_ID?.trim() || undefined;
  const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET?.trim() || undefined;
  const flag = (process.env.PAYMENTS_ENABLED ?? "false").toLowerCase() === "true";
  // Only truly enabled when the flag is on AND we can actually settle.
  const enabled = flag && Boolean(payTo && cdpApiKeyId && cdpApiKeySecret);
  return {
    enabled,
    payTo,
    cdpApiKeyId,
    cdpApiKeySecret,
    freePerDay: Number(process.env.WARDEN_FREE_PER_DAY ?? 50),
    prices: {
      "/guard/token": process.env.WARDEN_PRICE_TOKEN ?? "$0.01",
      "/guard/address": process.env.WARDEN_PRICE_ADDRESS ?? "$0.01",
      "/guard/tx": process.env.WARDEN_PRICE_TX ?? "$0.02",
    },
  };
}
