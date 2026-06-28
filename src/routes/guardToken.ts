import { Hono } from "hono";
import { ulid } from "ulid";
import { z } from "zod";
import { collectTokenSignals } from "../bazaar/signals.js";
import { decide } from "../engine/decide.js";
import { buildSummary } from "../llm/summary.js";
import { recordVerdict } from "../store/ledger.js";
import { SCHEMA_VERSION, type Verdict } from "../schema/verdict.js";

const Query = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "geçerli bir EVM adresi olmalı"),
  chainId: z.coerce.number().int().positive().default(8453), // Base
});

export const guardToken = new Hono();

/**
 * GET /guard/token?address=0x...&chainId=8453
 * Pre-trade token verdict. Flagship endpoint.
 */
guardToken.get("/guard/token", async (c) => {
  const parsed = Query.safeParse({
    address: c.req.query("address"),
    chainId: c.req.query("chainId"),
  });
  if (!parsed.success) {
    return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);
  }
  const { address, chainId } = parsed.data;
  const started = Date.now();

  // 1) Sinyalleri paralel topla (bazaarClient hata/timeout'ta 'unknown' döner)
  const signals = await collectTokenSignals(address);

  // 2) DETERMİNİSTİK karar
  const decided = decide(signals);

  // 3) Düz-dil summary (Claude — karara dokunmaz)
  const summary = await buildSummary({ type: "token", chainId, address }, decided, signals);

  // 4) Verdict'i kur
  const verdict: Verdict = {
    verdictId: ulid(),
    schemaVersion: SCHEMA_VERSION,
    issuedAt: new Date().toISOString(),
    target: { type: "token", chainId, address },
    decision: decided.decision,
    riskScore: decided.riskScore,
    confidence: decided.confidence,
    reasons: decided.reasons,
    signals,
    summary,
    degraded: decided.degraded,
    latencyMs: Date.now() - started,
  };

  // 5) Ledger'a yaz (track-record); dönüşü bloklamaz
  void recordVerdict(verdict);

  // HTTP durumu kararı yansıtsın: block => 200 ama net body (ajan body'ye bakar)
  return c.json(verdict);
});
