const API = process.env.WARDEN_API_URL ?? "http://localhost:8787";

interface Stats {
  totalVerdicts: number;
  byDecision: { block: number; review: number; clear: number };
  byTargetType: Record<string, number>;
  checkedOutcomes: number;
  rugsCaught: number;
  rugsMissed: number;
  hitRatePct: number | null;
  generatedAt: string;
  error?: string;
}

async function getStats(): Promise<Stats | null> {
  try {
    const r = await fetch(`${API}/track-record`, { cache: "no-store" });
    return await r.json();
  } catch {
    return null;
  }
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border-edge bg-panel/60 p-5">
      <div className={`text-3xl font-bold ${accent ?? "text-white"}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-widest text-slate-500">{label}</div>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function TrackRecord() {
  const s = await getStats();

  if (!s || s.error) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-white">Track Record</h1>
        <div className="rounded-xl border border-edge bg-panel/60 p-6 text-sm text-slate-400">
          <p className="mb-2 text-slate-300">No published stats yet.</p>
          <p>
            Every verdict is snapshotted and its outcome re-measured over time; this page
            fills in once connected to an API with a persistent ledger (see{" "}
            <span className="text-warden">DEPLOY.md</span>). The provable hit-rate — Warden&apos;s
            real moat — will show up here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-white">Track Record</h1>
        <p className="text-sm text-slate-400">
          Every verdict is snapshotted and its outcome re-measured. This is what a raw data
          wrapper can never produce: a provable hit-rate.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="total verdicts" value={s.totalVerdicts} />
        <Stat label="outcomes checked" value={s.checkedOutcomes} />
        <Stat label="rugs caught" value={s.rugsCaught} accent="text-clear" />
        <Stat label="rugs missed" value={s.rugsMissed} accent={s.rugsMissed > 0 ? "text-block" : "text-white"} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-edge bg-panel/60 p-5">
          <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Hit rate</h3>
          <div className="text-5xl font-bold text-warden">
            {s.hitRatePct === null ? "—" : `${s.hitRatePct}%`}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {s.hitRatePct === null
              ? "Not enough verified outcomes yet. Fills in as the re-checker runs."
              : "Share of tokens we flagged block/review that later actually rugged."}
          </p>
        </div>
        <div className="rounded-xl border border-edge bg-panel/60 p-5">
          <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Decision mix</h3>
          <div className="space-y-2 text-sm">
            <Row label="block" value={s.byDecision.block} color="bg-block" total={s.totalVerdicts} />
            <Row label="review" value={s.byDecision.review} color="bg-review" total={s.totalVerdicts} />
            <Row label="clear" value={s.byDecision.clear} color="bg-clear" total={s.totalVerdicts} />
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-600">updated: {new Date(s.generatedAt).toLocaleString("en-US")}</p>
    </div>
  );
}

function Row({ label, value, color, total }: { label: string; value: number; color: string; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-slate-400">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded bg-edge">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-slate-300">{value}</span>
    </div>
  );
}
