/**
 * recheck — track-record outcome doğrulayıcı.
 *
 * Geçmiş TOKEN verdict'leri için güncel likiditeyi yeniden ölçer ve sonucu işaretler:
 *   - rugged   : likidite ilk ölçümün <%10'una düştü VEYA < $1.000
 *   - survived : aksi halde
 * Sonuçlar data/outcomes.json'a yazılır; /track-record bunları isabet oranına çevirir.
 *
 * Cron ile periyodik çalıştır:  node --env-file=.env --import tsx scripts/recheck.ts
 */
import { bazaarGet } from "../src/bazaar/client.js";
import { readEntries, readOutcomes, setOutcome } from "../src/store/ledger.js";

function rec(v: unknown) { return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined; }
function num(v: unknown) { const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : undefined; return n !== undefined && Number.isFinite(n) ? n : undefined; }

async function currentLiquidity(address: string): Promise<number | undefined> {
  const r = await bazaarGet("/api/x402/token-pools", { address });
  if (!r.ok || !r.data) return undefined;
  const p = rec(rec(r.data)?.data) ?? rec(r.data);
  const pools = Array.isArray(p?.pools) ? (p!.pools as unknown[]) : [];
  return pools.reduce<number>((s, pool) => s + (num(rec(pool)?.liquidityUsd) ?? 0), 0);
}

const MIN_AGE_MS = Number(process.env.WARDEN_RECHECK_MIN_AGE_MS ?? 0); // test için 0; prod'da ör. 24s

async function main() {
  const [entries, outcomes] = await Promise.all([readEntries(), readOutcomes()]);
  let checked = 0;
  for (const e of entries) {
    if (e.target.type !== "token") continue;
    if (outcomes[e.verdictId] && outcomes[e.verdictId]!.outcome !== "pending") continue;
    if (Date.now() - new Date(e.issuedAt).getTime() < MIN_AGE_MS) continue;

    const liqSig = e.signals.find((s) => s.category === "liquidity");
    const origLiq = num(rec(liqSig?.evidence)?.totalLiq);
    const curLiq = await currentLiquidity(e.target.address);
    if (origLiq === undefined || curLiq === undefined) continue;

    const rugged = curLiq < 1_000 || (origLiq > 0 && curLiq < origLiq * 0.10);
    await setOutcome(e.verdictId, rugged ? "rugged" : "survived");
    checked++;
    console.log(`${e.target.address} ${e.decision} | orig $${Math.round(origLiq)} → now $${Math.round(curLiq)} ⇒ ${rugged ? "RUGGED" : "survived"}`);
  }
  console.log(`\n${checked} token verdict'i yeniden kontrol edildi.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
