import { NextRequest, NextResponse } from "next/server";
import { listTokens, setOutcome } from "../../lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = process.env.BAZAAR_BASE_URL ?? "https://402.com.tr";
const SECRET = process.env.BAZAAR_INTERNAL_SECRET ?? "";
const CRON_SECRET = process.env.CRON_SECRET;

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : undefined;
  return n !== undefined && Number.isFinite(n) ? n : undefined;
}

async function currentLiquidity(address: string): Promise<number | undefined> {
  try {
    const r = await fetch(`${BASE}/api/x402/token-pools?address=${address}`, {
      headers: { Accept: "application/json", ...(SECRET ? { "X-Warden-Internal": SECRET } : {}) },
      cache: "no-store",
    });
    if (!r.ok) return undefined;
    const j = (await r.json()) as { data?: { data?: unknown } };
    const p = ((j.data as { data?: unknown })?.data ?? j.data) as { pools?: unknown[] } | undefined;
    const pools = Array.isArray(p?.pools) ? p!.pools : [];
    return pools.reduce<number>((s, pool) => s + (num((pool as { liquidityUsd?: unknown }).liquidityUsd) ?? 0), 0);
  } catch {
    return undefined;
  }
}

/**
 * GET /api/recheck — outcome re-checker. Re-measures liquidity of past token
 * verdicts and marks rugged/survived, building a provable hit-rate.
 * Protected by CRON_SECRET (Authorization: Bearer or ?secret=). Vercel Cron friendly.
 */
export async function GET(req: NextRequest) {
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization") ?? "";
    const q = req.nextUrl.searchParams.get("secret") ?? "";
    if (auth !== `Bearer ${CRON_SECRET}` && q !== CRON_SECRET) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const minAgeMs = Number(process.env.RECHECK_MIN_AGE_MS ?? 0); // prod: e.g. 86400000 (24h)
  const now = Date.now();
  const tokens = (await listTokens()).filter(
    (t) => t.outcome === "pending" && now - new Date(t.at).getTime() >= minAgeMs,
  ).slice(0, 25);

  let rugged = 0, survived = 0, skipped = 0;
  for (const t of tokens) {
    const cur = await currentLiquidity(t.address);
    if (cur === undefined) { skipped++; continue; }
    const isRug = cur < 1000 || (t.liq > 0 && cur < t.liq * 0.1);
    await setOutcome(t.address, isRug ? "rugged" : "survived", cur);
    if (isRug) rugged++; else survived++;
  }
  return NextResponse.json({ ok: true, checked: tokens.length, rugged, survived, skipped });
}
