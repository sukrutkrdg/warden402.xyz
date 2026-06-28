/**
 * Vercel serverless giriş noktası — Hono app'i Vercel'de çalıştırır.
 * vercel.json tüm yolları buraya yönlendirir.
 *
 * NOT: Vercel serverless dosya sistemi geçicidir; JSONL ledger orada KALICI
 * OLMAZ. Üretimde track-record için KV/Postgres'e geç (bkz. DEPLOY.md).
 */
import { handle } from "hono/vercel";
import { app } from "../src/app.js";

export const config = { runtime: "nodejs" };

export default handle(app);
