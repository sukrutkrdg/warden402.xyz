import { readStats, tokenStats } from "../lib/store";

export const dynamic = "force-dynamic";

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border-edge bg-panel/60 p-5">
      <div className={`text-3xl font-bold ${accent ?? "text-white"}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-widest text-slate-500">{label}</div>
    </div>
  );
}
function Row({ label, value, color, total }: { label: string; value: number; color: string; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-slate-400">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded bg-edge"><div className={`h-full ${color}`} style={{ width: `${pct}%` }} /></div>
      <span className="w-10 text-right text-slate-300">{value}</span>
    </div>
  );
}

const DECC: Record<string, string> = { block: "text-block", review: "text-review", clear: "text-clear" };

export default async function TrackRecord() {
  const [s, ts] = await Promise.all([readStats(), tokenStats()]);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-warden/30 bg-warden/5 p-5 sm:col-span-2">
          <div className="text-xs uppercase tracking-widest text-slate-500">Provable hit-rate</div>
          <div className="mt-1 text-4xl font-bold text-warden">{ts.hitRatePct === null ? "—" : `${ts.hitRatePct}%`}</div>
          <div className="mt-1 text-xs text-slate-500">
            {ts.hitRatePct === null
              ? "Fills in as the re-checker verifies outcomes over time."
              : "of tokens we flagged block/review that later actually rugged."}
          </div>
        </div>
        <Stat label="rugs caught" value={ts.rugsCaught} accent="text-clear" />
        <Stat label="rugs missed" value={ts.rugsMissed} accent={ts.rugsMissed > 0 ? "text-block" : "text-white"} />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-white">Track Record</h1>
        <p className="max-w-2xl text-sm text-slate-400">
          Every verdict Warden issues is recorded. This is the foundation of the moat: a provable
          history of what we flagged. {s.persistent
            ? "Backed by a persistent store."
            : "Live counters (connect a KV store to persist across restarts)."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="total verdicts" value={s.total} />
        <Stat label="blocked" value={s.byDecision.block} accent="text-block" />
        <Stat label="review" value={s.byDecision.review} accent="text-review" />
        <Stat label="clear" value={s.byDecision.clear} accent="text-clear" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-edge bg-panel/60 p-5">
          <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Decision mix</h3>
          <div className="space-y-2 text-sm">
            <Row label="block" value={s.byDecision.block} color="bg-block" total={s.total} />
            <Row label="review" value={s.byDecision.review} color="bg-review" total={s.total} />
            <Row label="clear" value={s.byDecision.clear} color="bg-clear" total={s.total} />
          </div>
        </div>
        <div className="rounded-xl border border-edge bg-panel/60 p-5">
          <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Recent verdicts</h3>
          {s.recent.length === 0 && <div className="text-xs text-slate-600">no verdicts yet — try the demo on the home page</div>}
          <div className="space-y-1.5">
            {s.recent.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-12 font-semibold uppercase ${DECC[r.decision] ?? "text-slate-400"}`}>{r.decision}</span>
                <span className="w-16 text-slate-500">risk {r.riskScore}</span>
                <span className="flex-1 truncate font-mono text-slate-500">{r.target?.slice(0, 14)}…</span>
                <span className="text-slate-600">{new Date(r.at).toLocaleTimeString("en-US")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-600">
        Next: an outcome re-checker re-measures flagged tokens over time to publish a hit-rate —
        &ldquo;N rugs flagged before they rugged&rdquo; — the number a raw data wrapper can never show.
      </p>
    </div>
  );
}
