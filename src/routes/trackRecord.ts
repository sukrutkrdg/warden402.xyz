import { Hono } from "hono";
import { computeStats } from "../store/ledger.js";

export const trackRecord = new Hono();

/**
 * GET /track-record
 * Herkese açık güven istatistikleri — moat'ın vitrini.
 * Frontend track-record sayfası bunu okur.
 */
trackRecord.get("/track-record", async (c) => {
  const stats = await computeStats();
  return c.json(stats);
});
