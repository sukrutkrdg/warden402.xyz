/**
 * Verdict Ledger — her verdict'i sinyal snapshot'ıyla kalıcı yaz.
 * Bu, track-record / moat'ın temelidir: ileride bir re-checker bu kayıtları
 * gerçek sonuçlarla (token rug yaptı mı?) eşleştirip isabet oranı yayınlayacak.
 *
 * v1: append-only JSONL (data/verdicts.jsonl).  Sonra: Postgres (Supabase/Neon).
 * Arayüz sabit kalır, yalnızca bu dosyanın gövdesi değişir.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Verdict } from "../schema/verdict.js";

const LEDGER_PATH = process.env.WARDEN_LEDGER_PATH ?? "data/verdicts.jsonl";

export interface LedgerEntry extends Verdict {
  // sonuç doğrulama alanları (re-checker sonradan dolduracak)
  outcome?: "pending" | "rugged" | "survived" | "flagged_later" | "unknown";
  outcomeCheckedAt?: string;
}

export async function recordVerdict(v: Verdict): Promise<void> {
  const entry: LedgerEntry = { ...v, outcome: "pending" };
  try {
    await mkdir(dirname(LEDGER_PATH), { recursive: true });
    await appendFile(LEDGER_PATH, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    // Ledger yazımı verdict dönüşünü ASLA bloklamaz — sadece logla.
    console.error("[ledger] yazılamadı:", err);
  }
}
