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
      <div className="rounded-xl border border-edge bg-panel/60 p-6 text-sm text-slate-400">
        Track-record verisi şu an alınamıyor. (API: {API})
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-white">Track Record</h1>
        <p className="text-sm text-slate-400">
          Her verdict snapshot'lanır ve sonuçları yeniden ölçülür. Bu, ham veri sarmalayıcısının
          asla üretemeyeceği şey: kanıtlanabilir isabet geçmişi.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="toplam verdict" value={s.totalVerdicts} />
        <Stat label="kontrol edilen sonuç" value={s.checkedOutcomes} />
        <Stat label="yakalanan rug" value={s.rugsCaught} accent="text-clear" />
        <Stat label="kaçan rug" value={s.rugsMissed} accent={s.rugsMissed > 0 ? "text-block" : "text-white"} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-edge bg-panel/60 p-5">
          <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">İsabet oranı</h3>
          <div className="text-5xl font-bold text-warden">
            {s.hitRatePct === null ? "—" : `${s.hitRatePct}%`}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {s.hitRatePct === null
              ? "Henüz yeterli doğrulanmış sonuç yok. Re-checker biriktikçe dolacak."
              : "block/review verdiğimiz ve sonradan gerçekten rug olan oranı."}
          </p>
        </div>
        <div className="rounded-xl border border-edge bg-panel/60 p-5">
          <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Karar dağılımı</h3>
          <div className="space-y-2 text-sm">
            <Row label="block" value={s.byDecision.block} color="bg-block" total={s.totalVerdicts} />
            <Row label="review" value={s.byDecision.review} color="bg-review" total={s.totalVerdicts} />
            <Row label="clear" value={s.byDecision.clear} color="bg-clear" total={s.totalVerdicts} />
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-600">güncellendi: {new Date(s.generatedAt).toLocaleString("tr-TR")}</p>
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
