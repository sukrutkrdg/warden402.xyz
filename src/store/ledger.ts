/**
 * Verdict Ledger — her verdict'i sinyal snapshot'ıyla kalıcı yaz + okuma/istatistik.
 * Track-record / moat'ın temeli: bir re-checker bu kayıtları gerçek sonuçlarla
 * (token rug yaptı mı?) eşleştirir; istatistik herkese açık sayfada yayınlanır.
 *
 * v1: append-only JSONL (data/verdicts.jsonl) + outcomes (data/outcomes.json).
 * Sonra: Postgres. Arayüz sabit; yalnızca bu dosyanın gövdesi değişir.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Decision, Verdict } from "../schema/verdict.js";

const LEDGER_PATH = process.env.WARDEN_LEDGER_PATH ?? "data/verdicts.jsonl";
const OUTCOMES_PATH = process.env.WARDEN_OUTCOMES_PATH ?? "data/outcomes.json";

export type Outcome = "pending" | "rugged" | "survived" | "flagged_later" | "unknown";

export interface LedgerEntry extends Verdict {
  outcome?: Outcome;
  outcomeCheckedAt?: string;
}

export async function recordVerdict(v: Verdict): Promise<void> {
  try {
    await mkdir(dirname(LEDGER_PATH), { recursive: true });
    await appendFile(LEDGER_PATH, JSON.stringify(v) + "\n", "utf8");
  } catch (err) {
    // Ledger yazımı verdict dönüşünü ASLA bloklamaz.
    console.error("[ledger] write failed:", err);
  }
}

export async function readEntries(): Promise<Verdict[]> {
  try {
    const txt = await readFile(LEDGER_PATH, "utf8");
    return txt
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Verdict);
  } catch {
    return [];
  }
}

export async function readOutcomes(): Promise<Record<string, { outcome: Outcome; checkedAt: string }>> {
  try {
    return JSON.parse(await readFile(OUTCOMES_PATH, "utf8"));
  } catch {
    return {};
  }
}

export async function setOutcome(verdictId: string, outcome: Outcome): Promise<void> {
  const all = await readOutcomes();
  all[verdictId] = { outcome, checkedAt: new Date().toISOString() };
  await mkdir(dirname(OUTCOMES_PATH), { recursive: true });
  await writeFile(OUTCOMES_PATH, JSON.stringify(all, null, 2), "utf8");
}

// ── İstatistik (public track-record için) ─────────────────────────
export interface TrackRecordStats {
  totalVerdicts: number;
  byDecision: Record<Decision, number>;
  byTargetType: Record<string, number>;
  // sonuç doğrulaması:
  checkedOutcomes: number;
  rugsCaught: number;          // block/review verdiği VE sonradan rug olan
  rugsMissed: number;          // clear verdiği AMA sonradan rug olan
  hitRatePct: number | null;   // rugsCaught / (rugsCaught + rugsMissed)
  generatedAt: string;
}

export async function computeStats(): Promise<TrackRecordStats> {
  const [entries, outcomes] = await Promise.all([readEntries(), readOutcomes()]);
  const byDecision: Record<Decision, number> = { block: 0, review: 0, clear: 0 };
  const byTargetType: Record<string, number> = {};
  let checkedOutcomes = 0;
  let rugsCaught = 0;
  let rugsMissed = 0;

  for (const e of entries) {
    byDecision[e.decision] = (byDecision[e.decision] ?? 0) + 1;
    byTargetType[e.target.type] = (byTargetType[e.target.type] ?? 0) + 1;
    const o = outcomes[e.verdictId];
    if (o && o.outcome !== "pending" && o.outcome !== "unknown") {
      checkedOutcomes++;
      const rugged = o.outcome === "rugged" || o.outcome === "flagged_later";
      if (rugged) {
        if (e.decision === "clear") rugsMissed++;
        else rugsCaught++;
      }
    }
  }

  const denom = rugsCaught + rugsMissed;
  return {
    totalVerdicts: entries.length,
    byDecision,
    byTargetType,
    checkedOutcomes,
    rugsCaught,
    rugsMissed,
    hitRatePct: denom > 0 ? Math.round((rugsCaught / denom) * 100) : null,
    generatedAt: new Date().toISOString(),
  };
}
