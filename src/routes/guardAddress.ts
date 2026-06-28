import { Hono } from "hono";
import { ulid } from "ulid";
import { z } from "zod";
import { collectAddressSignals } from "../bazaar/addressSignals.js";
import { decide } from "../engine/decide.js";
import { buildSummary } from "../llm/summary.js";
import { recordVerdict } from "../store/ledger.js";
import { SCHEMA_VERSION, type Verdict } from "../schema/verdict.js";

const Query = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "geçerli bir EVM adresi olmalı"),
  chainId: z.coerce.number().int().positive().default(8453),
});

export const guardAddress = new Hono();

/**
 * GET /guard/address?address=0x...&chainId=8453
 * Counterparty verdict — bir adresle etkileşmeden önce risk değerlendirir
 * (sanctions, kontrat riski, yaş/aktivite).
 */
guardAddress.get("/guard/address", async (c) => {
  const parsed = Query.safeParse({ address: c.req.query("address"), chainId: c.req.query("chainId") });
  if (!parsed.success) {
    return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);
  }
  const { address, chainId } = parsed.data;
  const started = Date.now();

  const signals = await collectAddressSignals(address);
  const decided = decide(signals);
  const summary = await buildSummary({ type: "address", chainId, address }, decided, signals);

  const verdict: Verdict = {
    verdictId: ulid(),
    schemaVersion: SCHEMA_VERSION,
    issuedAt: new Date().toISOString(),
    target: { type: "address", chainId, address },
    decision: decided.decision,
    riskScore: decided.riskScore,
    confidence: decided.confidence,
    reasons: decided.reasons,
    signals,
    summary,
    degraded: decided.degraded,
    latencyMs: Date.now() - started,
  };

  void recordVerdict(verdict);
  return c.json(verdict);
});
