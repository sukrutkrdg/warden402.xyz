import { Hono } from "hono";
import { ulid } from "ulid";
import { z } from "zod";
import { collectTxSignals } from "../bazaar/txSignals.js";
import { decide } from "../engine/decide.js";
import { buildSummary } from "../llm/summary.js";
import { recordVerdict } from "../store/ledger.js";
import { SCHEMA_VERSION, type Verdict } from "../schema/verdict.js";

const addr = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "geçerli bir EVM adresi olmalı");

const Body = z.object({
  chainId: z.number().int().positive().default(8453),
  from: addr,
  to: addr,
  calldata: z.string().regex(/^0x[a-fA-F0-9]*$/, "0x ile başlayan hex olmalı").default("0x"),
  value: z.string().optional(),
});

export const guardTx = new Hono();

/**
 * POST /guard/tx
 * Body: { chainId?, from, to, calldata, value? }
 * Pre-sign verdict — bir işlem imzalanmadan ÖNCE risk değerlendirir
 * (sınırsız approval, sanctioned counterparty, riskli kontrat).
 */
guardTx.post("/guard/tx", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_request", details: "JSON body bekleniyor" }, 400);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);
  }
  const { chainId, from, to, calldata, value } = parsed.data;
  const started = Date.now();

  const { signals, decoded, counterparty } = await collectTxSignals({ to, calldata });
  const decided = decide(signals);
  const summary = await buildSummary({ type: "tx", chainId, from, to, calldata, value }, decided, signals);

  const verdict: Verdict & { decoded?: unknown; counterparty?: string } = {
    verdictId: ulid(),
    schemaVersion: SCHEMA_VERSION,
    issuedAt: new Date().toISOString(),
    target: { type: "tx", chainId, from, to, calldata, value },
    decision: decided.decision,
    riskScore: decided.riskScore,
    confidence: decided.confidence,
    reasons: decided.reasons,
    signals,
    summary,
    degraded: decided.degraded,
    latencyMs: Date.now() - started,
    // tx'e özel zenginleştirme (şema dışı, bilgilendirme):
    decoded: { kind: decoded.kind, selector: decoded.selector, unlimited: decoded.unlimited ?? false, approvedAll: decoded.approvedAll ?? false },
    counterparty,
  };

  void recordVerdict(verdict);
  return c.json(verdict);
});
