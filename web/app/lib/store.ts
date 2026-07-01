/**
 * Storage abstraction for the track-record ledger.
 * Backed by Upstash Redis (REST) when configured — persistent + edge-ready —
 * otherwise an in-memory fallback (per serverless instance).
 *
 * Env (set on Vercel to enable persistence):
 *   KV_REST_API_URL, KV_REST_API_TOKEN   (Vercel KV / Upstash defaults)
 */
type Decision = "block" | "review" | "clear";

const URL = process.env.KV_REST_API_URL?.replace(/\/$/, "");
const TOKEN = process.env.KV_REST_API_TOKEN;
export const PERSISTENT = Boolean(URL && TOKEN);

const K_TOTAL = "wr:total";
const K_DEC = (d: string) => `wr:dec:${d}`;
const K_RECENT = "wr:recent";
const RECENT_CAP = 100;

// ── in-memory fallback ────────────────────────────────────────────
const g = globalThis as unknown as { __wardenKV?: { counters: Map<string, number>; recent: string[] } };
const mem = g.__wardenKV ?? (g.__wardenKV = { counters: new Map(), recent: [] });

// ── Upstash REST pipeline ─────────────────────────────────────────
async function pipeline(commands: (string | number)[][]): Promise<unknown[]> {
  const res = await fetch(`${URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  const json = (await res.json()) as { result: unknown }[];
  return json.map((r) => r.result);
}

export interface TrackStats {
  total: number;
  byDecision: Record<Decision, number>;
  recent: { decision: Decision; riskScore: number; target: string; at: string }[];
  persistent: boolean;
}

/** Record a verdict into the ledger (counters + capped recent list). */
export async function recordVerdict(v: { decision: Decision; riskScore: number; target?: string }): Promise<void> {
  const entry = JSON.stringify({ decision: v.decision, riskScore: v.riskScore, target: v.target ?? "", at: new Date().toISOString() });
  if (PERSISTENT) {
    try {
      await pipeline([
        ["INCR", K_TOTAL],
        ["INCR", K_DEC(v.decision)],
        ["LPUSH", K_RECENT, entry],
        ["LTRIM", K_RECENT, 0, RECENT_CAP - 1],
      ]);
      return;
    } catch {
      /* fall through to memory */
    }
  }
  mem.counters.set(K_TOTAL, (mem.counters.get(K_TOTAL) ?? 0) + 1);
  mem.counters.set(K_DEC(v.decision), (mem.counters.get(K_DEC(v.decision)) ?? 0) + 1);
  mem.recent.unshift(entry);
  mem.recent.length = Math.min(mem.recent.length, RECENT_CAP);
}

export async function readStats(): Promise<TrackStats> {
  let total = 0;
  const byDecision: Record<Decision, number> = { block: 0, review: 0, clear: 0 };
  let recentRaw: string[] = [];

  if (PERSISTENT) {
    try {
      const [t, b, r, c, recent] = await pipeline([
        ["GET", K_TOTAL],
        ["GET", K_DEC("block")],
        ["GET", K_DEC("review")],
        ["GET", K_DEC("clear")],
        ["LRANGE", K_RECENT, 0, 19],
      ]);
      total = Number(t ?? 0);
      byDecision.block = Number(b ?? 0);
      byDecision.review = Number(r ?? 0);
      byDecision.clear = Number(c ?? 0);
      recentRaw = (recent as string[]) ?? [];
    } catch {
      /* fall through */
    }
  }
  if (!PERSISTENT || total === 0) {
    total = mem.counters.get(K_TOTAL) ?? total;
    byDecision.block = mem.counters.get(K_DEC("block")) ?? byDecision.block;
    byDecision.review = mem.counters.get(K_DEC("review")) ?? byDecision.review;
    byDecision.clear = mem.counters.get(K_DEC("clear")) ?? byDecision.clear;
    if (recentRaw.length === 0) recentRaw = mem.recent.slice(0, 20);
  }

  const recent = recentRaw.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  return { total, byDecision, recent, persistent: PERSISTENT };
}
