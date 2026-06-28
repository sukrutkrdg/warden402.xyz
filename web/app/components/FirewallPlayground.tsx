"use client";

import { useEffect, useState } from "react";

type Decision = "allow" | "hold" | "deny";
interface Budget { perCallCapUsd: number; hourSpentUsd: number; hourRemainingUsd: number; daySpentUsd: number; dayRemainingUsd: number; approvalsThisHour: number }
interface Result { decision: Decision; reasons: string[]; detail: string; verdict?: { riskScore: number }; issuedAt: string }
interface State { policy: any; budget: Budget; audit: Result[] }

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SPENDER = "0x1111111254EEB25477B68fb85Ed929f73A960582";
const UNLIMITED = `0x095ea7b3000000000000000000000000${SPENDER.slice(2).toLowerCase()}ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`;

const DEC: Record<Decision, { c: string; bg: string; emoji: string }> = {
  allow: { c: "text-clear", bg: "ring-clear/40 bg-clear/10", emoji: "✅" },
  hold: { c: "text-review", bg: "ring-review/40 bg-review/10", emoji: "⏸️" },
  deny: { c: "text-block", bg: "ring-block/40 bg-block/10", emoji: "⛔" },
};

const PRESETS = [
  { label: "Pay $8 to a service", action: { kind: "x402_payment", to: USDC, amountUsd: 8 } },
  { label: "Pay $50 (over cap)", action: { kind: "x402_payment", to: USDC, amountUsd: 50 } },
  { label: "Unlimited approve", action: { kind: "tx", to: USDC, from: USDC, calldata: UNLIMITED } },
];

export function FirewallPlayground() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() { setState(await (await fetch("/api/firewall")).json()); }
  useEffect(() => { refresh(); }, []);

  async function run(action: any) {
    setLoading(true);
    try {
      const r = await fetch("/api/firewall", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json();
      setState((s) => (s ? { ...s, budget: j.budget, audit: j.audit } : s));
    } finally { setLoading(false); }
  }
  async function patchPolicy(policy: any) {
    const r = await fetch("/api/firewall", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ policy }) });
    const j = await r.json();
    setState((s) => (s ? { ...s, policy: j.policy, budget: j.budget } : s));
  }
  async function reset() { setState(await (await fetch("/api/firewall?reset=1")).json()); }

  if (!state) return <div className="text-sm text-slate-500">loading firewall…</div>;
  const p = state.policy;
  const last = state.audit[0];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* left: controls */}
      <div className="space-y-5">
        <div className="rounded-xl border border-edge bg-panel/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm uppercase tracking-widest text-slate-500">Agent policy</h3>
            <button onClick={reset} className="text-xs text-slate-400 underline hover:text-white">reset</button>
          </div>
          <div className="space-y-2.5 text-sm">
            <Toggle label="Paused (kill switch)" v={p.paused} on={(v) => patchPolicy({ paused: v })} />
            <Toggle label="Hold on new counterparty" v={p.holdOnNewCounterparty} on={(v) => patchPolicy({ holdOnNewCounterparty: v })} />
            <Toggle label="Deny unlimited approvals" v={p.denyUnlimitedApprovals} on={(v) => patchPolicy({ denyUnlimitedApprovals: v })} />
            <Toggle label="Block on review verdict" v={p.blockOnReview} on={(v) => patchPolicy({ blockOnReview: v })} />
            <Num label="Per-call cap ($)" v={p.maxPerCallUsd} on={(v) => patchPolicy({ maxPerCallUsd: v })} />
            <Num label="Hourly cap ($)" v={p.maxPerHourUsd} on={(v) => patchPolicy({ maxPerHourUsd: v })} />
          </div>
        </div>

        <div className="rounded-xl border border-edge bg-panel/60 p-5">
          <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Try an action</h3>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((x) => (
              <button key={x.label} onClick={() => run(x.action)} disabled={loading}
                className="rounded-lg border border-edge bg-ink px-3 py-2 text-xs text-slate-200 hover:border-warden disabled:opacity-50">
                {x.label}
              </button>
            ))}
          </div>
        </div>

        {/* budget */}
        <div className="rounded-xl border border-edge bg-panel/60 p-5">
          <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Live budget</h3>
          <Bar label="Hourly" spent={state.budget.hourSpentUsd} cap={p.maxPerHourUsd} />
          <Bar label="Daily" spent={state.budget.daySpentUsd} cap={p.maxPerDayUsd} />
          <div className="mt-2 text-xs text-slate-500">approvals this hour: {state.budget.approvalsThisHour}</div>
        </div>
      </div>

      {/* right: decision + audit */}
      <div className="space-y-5">
        {last && (
          <div className={`rounded-xl border border-edge p-5 ring-1 ${DEC[last.decision].bg}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{DEC[last.decision].emoji}</span>
              <span className={`text-xl font-bold uppercase tracking-wider ${DEC[last.decision].c}`}>{last.decision}</span>
              {last.verdict && <span className="ml-auto text-xs text-slate-400">target risk {last.verdict.riskScore}/100</span>}
            </div>
            <p className="mt-3 text-sm text-slate-300">{last.detail}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {last.reasons.map((r) => <span key={r} className="rounded bg-edge px-2 py-0.5 text-[11px] text-slate-300">{r}</span>)}
            </div>
          </div>
        )}
        <div className="rounded-xl border border-edge bg-panel/60 p-5">
          <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Audit trail</h3>
          <div className="space-y-1.5">
            {state.audit.length === 0 && <div className="text-xs text-slate-600">no decisions yet — try an action</div>}
            {state.audit.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-12 font-semibold uppercase ${DEC[e.decision].c}`}>{e.decision}</span>
                <span className="flex-1 truncate text-slate-400">{e.reasons.join(", ")}</span>
                <span className="text-slate-600">{new Date(e.issuedAt).toLocaleTimeString("en-US")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <button onClick={() => on(!v)} className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left hover:bg-edge/30">
      <span className="text-slate-300">{label}</span>
      <span className={`flex h-5 w-9 items-center rounded-full px-0.5 ${v ? "bg-warden" : "bg-edge"}`}>
        <span className={`h-4 w-4 rounded-full bg-ink transition ${v ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}
function Num({ label, v, on }: { label: string; v: number; on: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-300">{label}</span>
      <input type="number" value={v} onChange={(e) => on(Number(e.target.value))} className="w-24 rounded border border-edge bg-ink px-2 py-1 text-right text-slate-200 outline-none focus:border-warden" />
    </div>
  );
}
function Bar({ label, spent, cap }: { label: string; spent: number; cap: number }) {
  const pct = Math.min(100, Math.round((spent / cap) * 100));
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-xs text-slate-400"><span>{label}</span><span>${spent} / ${cap}</span></div>
      <div className="h-2 overflow-hidden rounded bg-edge"><div className={`h-full ${pct > 80 ? "bg-block" : pct > 50 ? "bg-review" : "bg-clear"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
