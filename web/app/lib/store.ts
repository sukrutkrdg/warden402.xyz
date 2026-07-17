/**
 * Storage abstraction for the track-record ledger.
 * Backed by Upstash Redis (REST) when configured — persistent + edge-ready —
 * otherwise an in-memory fallback (per serverless instance).
 *
 * Env (set on Vercel to enable persistence):
 *   KV_REST_API_URL, KV_REST_API_TOKEN   (Vercel KV / Upstash defaults)
 */
import { logError } from "./log";

type Decision = "block" | "review" | "clear";

const URL = process.env.KV_REST_API_URL?.replace(/\/$/, "");
const TOKEN = process.env.KV_REST_API_TOKEN;
export const PERSISTENT = Boolean(URL && TOKEN);

const K_TOTAL = "wr:total";
const K_DEC = (d: string) => `wr:dec:${d}`;
const K_RECENT = "wr:recent";
const RECENT_CAP = 100;

// ── in-memory fallback ────────────────────────────────────────────
const g = globalThis as unknown as { __wardenKV?: { counters: Map<string, number>; recent: string[]; tokens: Map<string, string>; beats: Map<string, string> } };
const mem = g.__wardenKV ?? (g.__wardenKV = { counters: new Map<string, number>(), recent: [] as string[], tokens: new Map<string, string>(), beats: new Map<string, string>() });

// ── Upstash REST pipeline ─────────────────────────────────────────
export async function kvPipeline(commands: (string | number)[][]): Promise<unknown[]> {
  return pipeline(commands);
}

async function pipeline(commands: (string | number)[][]): Promise<unknown[]> {
  const res = await fetch(`${URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  // Upstash returns 429 (rate limit) / 5xx as a NON-array body. The old code did
  // `json.map` on it and, on a shape that happened to map, surfaced `undefined`
  // results as 0 — making a rate-limited read look like "no data / empty store".
  // Throw instead so callers fail closed / fall back explicitly, and it's visible.
  if (!res.ok) throw new Error(`KV HTTP ${res.status}${res.status === 429 ? " (rate limited)" : ""}`);
  const json = await res.json();
  if (!Array.isArray(json)) throw new Error(`KV non-array response: ${JSON.stringify(json).slice(0, 120)}`);
  return (json as { result?: unknown; error?: string }[]).map((r) => {
    if (r && typeof r === "object" && "error" in r && r.error) throw new Error(`KV command error: ${String(r.error).slice(0, 120)}`);
    return r.result;
  });
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
    } catch (e) {
      // KV read failed (e.g. rate limit) — log it so a transient outage isn't
      // silently shown as an empty ledger (total=0), and fall back to memory.
      logError("kv.readStats", e);
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

// ── token verdicts + outcome tracking (the moat) ──────────────────
const K_TOKENS = "wr:tokens";
export type Outcome = "pending" | "rugged" | "survived";
export interface TokenRec { address: string; decision: Decision; riskScore: number; liq: number; at: string; outcome: Outcome; curLiq?: number; checkedAt?: string }

/** Record a token's FIRST verdict + liquidity snapshot (never overwritten). */
export async function recordToken(address: string, decision: Decision, riskScore: number, liq: number): Promise<void> {
  const addr = address.toLowerCase();
  const val = JSON.stringify({ address: addr, decision, riskScore, liq, at: new Date().toISOString(), outcome: "pending" as Outcome });
  if (PERSISTENT) {
    try { await pipeline([["HSETNX", K_TOKENS, addr, val]]); return; } catch { /* fall through */ }
  }
  if (!mem.tokens.has(addr)) mem.tokens.set(addr, val);
}

export async function listTokens(): Promise<TokenRec[]> {
  if (PERSISTENT) {
    try {
      const [flat] = await pipeline([["HGETALL", K_TOKENS]]);
      const arr = (flat as string[]) ?? [];
      const out: TokenRec[] = [];
      for (let i = 1; i < arr.length; i += 2) { try { out.push(JSON.parse(arr[i]!)); } catch { /* skip */ } }
      if (out.length) return out;
    } catch { /* fall through */ }
  }
  return [...mem.tokens.values()].map((v) => JSON.parse(v));
}

export async function setOutcome(address: string, outcome: Outcome, curLiq: number): Promise<void> {
  const addr = address.toLowerCase();
  // Read the single record with HGET — not a full HGETALL scan. Called once per
  // token inside the recheck loop, so a scan here made recheck O(n²) and would
  // eventually time out the cron as the token store grew.
  let rec: TokenRec | undefined;
  if (PERSISTENT) {
    try { const [v] = await pipeline([["HGET", K_TOKENS, addr]]); if (v) rec = JSON.parse(v as string) as TokenRec; } catch { /* fall through */ }
  }
  if (!rec) { const m = mem.tokens.get(addr); if (m) rec = JSON.parse(m) as TokenRec; }
  if (!rec) return;
  const val = JSON.stringify({ ...rec, outcome, curLiq, checkedAt: new Date().toISOString() });
  if (PERSISTENT) {
    try { await pipeline([["HSET", K_TOKENS, addr, val]]); return; } catch { /* fall through */ }
  }
  mem.tokens.set(addr, val);
}

// ── cron heartbeats (observability) ───────────────────────────────
// Each cron writes when it last ran and what it did, so "did scout run?" is
// answerable without guessing from the verdict counters (which don't move when
// the upstream returns no tokens). Surfaced in /api/track-record.
export async function recordHeartbeat(job: string, data: Record<string, unknown>): Promise<void> {
  const val = JSON.stringify({ at: new Date().toISOString(), ...data });
  if (PERSISTENT) { try { await pipeline([["SET", `wr:cron:${job}`, val]]); return; } catch { /* fall */ } }
  mem.beats.set(job, val);
}
export async function readHeartbeat(job: string): Promise<Record<string, unknown> | null> {
  if (PERSISTENT) { try { const [v] = await pipeline([["GET", `wr:cron:${job}`]]); if (v) return JSON.parse(v as string); } catch { /* fall */ } }
  const v = mem.beats.get(job);
  return v ? JSON.parse(v) : null;
}

export interface TokenStats { checked: number; rugsCaught: number; rugsMissed: number; hitRatePct: number | null }
export async function tokenStats(): Promise<TokenStats> {
  const list = await listTokens();
  let rugsCaught = 0, rugsMissed = 0, checked = 0;
  for (const t of list) {
    if (t.outcome === "pending") continue;
    checked++;
    if (t.outcome === "rugged") {
      if (t.decision === "clear") rugsMissed++;
      else rugsCaught++;
    }
  }
  const denom = rugsCaught + rugsMissed;
  return { checked, rugsCaught, rugsMissed, hitRatePct: denom > 0 ? Math.round((rugsCaught / denom) * 100) : null };
}
