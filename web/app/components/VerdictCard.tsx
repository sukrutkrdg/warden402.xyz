import { DECISION_META, type Verdict } from "../lib/types";

const STATUS_DOT: Record<string, string> = {
  ok: "bg-clear",
  warn: "bg-review",
  fail: "bg-block",
  unknown: "bg-slate-600",
};

export function VerdictCard({ v }: { v: Verdict }) {
  if (v.error) {
    return (
      <div className="rounded-xl border border-block/40 bg-block/10 p-5 text-sm text-block">
        Error: {v.error}
      </div>
    );
  }
  const meta = DECISION_META[v.decision];
  return (
    <div className={`rounded-xl border border-edge p-5 ring-1 ${meta.ring}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{meta.emoji}</span>
          <span className={`text-xl font-bold tracking-wider ${meta.color}`}>{meta.label}</span>
          {v.degraded && (
            <span className="rounded bg-review/15 px-2 py-0.5 text-[11px] text-review">degraded</span>
          )}
        </div>
        <div className="text-right text-xs text-slate-400">
          <div>risk <span className="text-white">{v.riskScore}</span>/100</div>
          <div>confidence {Math.round(v.confidence * 100)}%</div>
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-300">{v.summary}</p>

      {v.reasons?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {v.reasons.map((r) => (
            <span key={r} className="rounded bg-edge px-2 py-0.5 text-[11px] text-slate-300">{r}</span>
          ))}
        </div>
      )}

      {v.decoded && (
        <div className="mt-3 text-xs text-slate-400">
          call: <span className="text-slate-200">{v.decoded.kind}</span>
          {v.decoded.unlimited && <span className="ml-2 text-block">· unlimited allowance</span>}
          {v.decoded.approvedAll && <span className="ml-2 text-block">· approveForAll</span>}
        </div>
      )}

      <div className="mt-4 space-y-1.5">
        {v.signals.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s.status] ?? "bg-slate-600"}`} />
            <span className="w-44 text-slate-400">{s.category}</span>
            <span className="w-12 text-slate-500">{s.score}</span>
            <span className="flex-1 text-slate-300">{s.detail}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-[11px] text-slate-600">
        <span>{v.verdictId}</span>
        <span>{v.latencyMs}ms</span>
      </div>
    </div>
  );
}
