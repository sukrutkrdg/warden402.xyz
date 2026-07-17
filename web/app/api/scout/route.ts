import { NextRequest, NextResponse } from "next/server";
import { guardToken } from "../../lib/guard";
import { recordToken, recordVerdict, recordHeartbeat } from "../../lib/store";
import { logError } from "../../lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = process.env.BAZAAR_BASE_URL ?? "https://402.com.tr";
const SECRET = process.env.BAZAAR_INTERNAL_SECRET ?? "";
const CRON_SECRET = process.env.CRON_SECRET;

async function fetchAddresses(ep: string): Promise<string[]> {
  try {
    const r = await fetch(`${BASE}/api/x402/${ep}`, {
      headers: { Accept: "application/json", ...(SECRET ? { "X-Warden-Internal": SECRET } : {}) },
      cache: "no-store",
    });
    if (!r.ok) { logError("scout.fetch", `${ep} → HTTP ${r.status}`); return []; }
    const j = (await r.json()) as { data?: { data?: unknown } };
    const p = ((j.data as { data?: unknown })?.data ?? j.data) as Record<string, unknown> | unknown[];
    const arr = Array.isArray(p) ? p : ((p as Record<string, unknown>).tokens ?? (p as Record<string, unknown>).items ?? []) as unknown[];
    const out: string[] = [];
    for (const t of arr as Record<string, unknown>[]) {
      const a = (t.address ?? t.tokenAddress ?? t.addr ?? (t.baseToken as { address?: string })?.address) as string | undefined;
      if (a && /^0x[a-fA-F0-9]{40}$/.test(a)) out.push(a);
    }
    return out;
  } catch (e) {
    logError("scout.fetch", e, { ep });
    return [];
  }
}

/**
 * GET /api/scout — auto-discover fresh Base tokens and guard them, so the
 * track-record dataset (and hit-rate) accumulates without waiting for users.
 * Protected by CRON_SECRET. Pair with /api/recheck (daily) to mark outcomes.
 */
export async function GET(req: NextRequest) {
  // Fail closed: require CRON_SECRET to be configured AND matched.
  const auth = req.headers.get("authorization") ?? "";
  const q = req.nextUrl.searchParams.get("secret") ?? "";
  if (!CRON_SECRET || (auth !== `Bearer ${CRON_SECRET}` && q !== CRON_SECRET)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const addrs = [...new Set([...(await fetchAddresses("new-tokens")), ...(await fetchAddresses("trending-tokens"))])].slice(0, 20);
  let guarded = 0;
  const byDecision: Record<string, number> = { block: 0, review: 0, clear: 0 };
  for (const address of addrs) {
    try {
      const v = await guardToken(address);
      const liqSig = v.signals.find((s) => s.category === "liquidity");
      const liq = Number((liqSig?.evidence as { totalLiq?: number } | undefined)?.totalLiq ?? 0);
      await recordVerdict({ decision: v.decision, riskScore: v.riskScore, target: address });
      await recordToken(address, v.decision, v.riskScore, liq);
      byDecision[v.decision] = (byDecision[v.decision] ?? 0) + 1;
      guarded++;
    } catch (e) { logError("scout.guard", e, { address }); }
  }
  // Heartbeat: proves the cron ran even when the upstream returned no tokens
  // (in which case `found`/`guarded` are 0 but `at` still advances).
  await recordHeartbeat("scout", { ok: true, found: addrs.length, guarded, byDecision });
  return NextResponse.json({ ok: true, found: addrs.length, guarded, byDecision });
}
