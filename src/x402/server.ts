/**
 * x402 resource server (seller side) — mirrors the Bazaar setup so Warden
 * settles on Base mainnet through the Coinbase CDP facilitator.
 */
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createFacilitatorConfig } from "@coinbase/x402";
import { NETWORK, getPayConfig } from "./config.js";

let cached: x402ResourceServer | undefined;

export function getResourceServer(): x402ResourceServer {
  if (cached) return cached;
  const cfg = getPayConfig();
  if (!cfg.cdpApiKeyId || !cfg.cdpApiKeySecret) {
    throw new Error("Payments not configured: missing CDP_API_KEY_ID / CDP_API_KEY_SECRET");
  }
  const facilitator = new HTTPFacilitatorClient(
    createFacilitatorConfig(cfg.cdpApiKeyId, cfg.cdpApiKeySecret),
  );
  cached = new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme());
  return cached;
}
