"use client";

import { useEffect, useState } from "react";

type Decision = "allow" | "hold" | "deny";
interface Budget { hourSpentUsd: number; hourRemainingUsd: number; daySpentUsd: number; dayRemainingUsd: number; perCallCapUsd: number; approvalsThisHour: number }
interface Agent { agentId: string; label: string; paused: boolean; budget: Budget; pending: number; lastDecision?: Decision }
interface Hold { id: string; agentId: string; action: { kind: string; to: string; amountUsd?: number }; result: { reasons: string[]; detail: string }; createdAt: string }
interface Data { agents: Agent[]; holds: Hold[]; series: Record<string, { label: string; usd: number }[]> }

const DECC: Record<Decision, string> = { allow: "text-clear", hold: "text-review", deny: "text-block" };

export function FleetDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [sel, setSel] = useState<string>("");

  async function load() {
    const d = (await (await fetch("/api/firewall/dashboard")).json()) as Data;
    setData(d);
    setSel((s) => s || d.agents[0]?.agentId || "");
  }
  useEffect(() => { load(); }, []);

  async function act(op: "approve" | "reject", h: Hold) {
    const d = (await (await fetch("/api/firewall/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, agentId: h.agentId, holdId: h.id }) })).json()) as Data;
    setData(d);
  }

  if (!data) return <div className="text-sm text-slate-500">loading fleet…</div>;
  const hourTotal = data.agents.reduce((a, x) => a + x.budget.hourSpentUsd, 0);
  const dayTotal = data.agents.reduce((a, x) => a + x.budget.daySpentUsd, 0);
  const series = data.series[sel] ?? [];
  const max = Math.max(1, ...series.map((b) => b.usd));

  return (
    <div className="space-y-6">
      {/* top stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="agents" value={data.agents.length} />
        <Stat label="pending approvals" value={data.holds.length} accent={data.holds.length ? "text-review" : "text-white"} />
        <Stat label="spent this hour" value={`$${hourTotal.toFixed(2)}`} />
        <Stat label="spent today" value={`$${dayTotal.toFixed(2)}`} />
      </div>

      {/* pending approvals */}
      <div className="rounded-xl border border-edge bg-panel/60 p-5">
        <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Pending approvals</h3>
        {data.holds.length === 0 && <div className="text-xs text-slate-600">nothing to approve — the fleet is clear</div>}
        <div className="space-y-2">
          {data.holds.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-review/25 bg-review/5 p-3 text-sm">
              <span className="rounded bg-edge px-2 py-0.5 text-[11px] text-slate-300">{h.agentId}</span>
              <span className="text-slate-300">{h.action.kind === "tx" ? "tx" : `pay $${h.action.amountUsd}`}</span>
              <span className="font-mono text-[11px] text-slate-500">{h.action.to.slice(0, 10)}…</span>
              <span className="flex-1 text-xs text-review">{h.result.reasons.join(", ")}</span>
              <button onClick={() => act("approve", h)} className="rounded bg-clear/90 px-3 py-1 text-xs font-semibold text-ink hover:brightness-110">Approve</button>
              <button onClick={() => act("reject", h)} className="rounded bg-block/90 px-3 py-1 text-xs font-semibold text-ink hover:brightness-110">Reject</button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* agents */}
        <div className="rounded-xl border border-edge bg-panel/60 p-5">
          <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Agents</h3>
          <div className="space-y-2">
            {data.agents.map((a) => (
              <button key={a.agentId} onClick={() => setSel(a.agentId)}
                className={`w-full rounded-lg border p-3 text-left transition ${sel === a.agentId ? "border-warden/50 bg-warden/5" : "border-edge hover:border-slate-600"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white">{a.label} <span className="text-xs text-slate-500">· {a.agentId}</span></span>
                  <span className="flex items-center gap-2 text-xs">
                    {a.paused && <span className="text-block">paused</span>}
                    {a.pending > 0 && <span className="rounded-full bg-review/15 px-2 text-review">{a.pending} hold</span>}
                    {a.lastDecision && <span className={DECC[a.lastDecision]}>{a.lastDecision}</span>}
                  </span>
                </div>
                <div className="mt-2"><MiniBar spent={a.budget.hourSpentUsd} cap={a.budget.hourSpentUsd + a.budget.hourRemainingUsd} label="hour" /></div>
              </button>
            ))}
          </div>
        </div>

        {/* spend chart */}
        <div className="rounded-xl border border-edge bg-panel/60 p-5">
          <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Spend — {sel} (12h)</h3>
          <div className="flex h-40 items-end gap-1.5">
            {series.map((b, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t bg-warden/70" style={{ height: `${(b.usd / max) * 100}%`, minHeight: b.usd > 0 ? 3 : 0 }} title={`$${b.usd}`} />
                <span className="text-[9px] text-slate-600">{b.label.replace(":00", "")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border-edge bg-panel/60 p-4">
      <div className={`text-2xl font-bold ${accent ?? "text-white"}`}>{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-widest text-slate-500">{label}</div>
    </div>
  );
}
function MiniBar({ spent, cap, label }: { spent: number; cap: number; label: string }) {
  const pct = Math.min(100, Math.round((spent / Math.max(1, cap)) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] text-slate-500"><span>{label}</span><span>${spent.toFixed(0)} / ${cap.toFixed(0)}</span></div>
      <div className="h-1.5 overflow-hidden rounded bg-edge"><div className={`h-full ${pct > 80 ? "bg-block" : pct > 50 ? "bg-review" : "bg-clear"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
