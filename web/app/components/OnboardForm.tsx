"use client";

import { useState } from "react";

export function OnboardForm() {
  const [agentId, setAgentId] = useState("");
  const [perHour, setPerHour] = useState(100);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ key: string; agentId: string } | null>(null);
  const [error, setError] = useState("");

  async function create() {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/v1/agents", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agentId || undefined, policy: { maxPerHourUsd: perHour, maxPerDayUsd: perHour * 5 } }),
      });
      const j = await r.json();
      if (j.key) setResult(j); else setError(j.detail ?? j.error ?? "failed");
    } catch (e) { setError(String(e)); } finally { setLoading(false); }
  }

  if (result) {
    const snippet = `curl -X POST https://warden402.xyz/api/v1/check \\
  -H "x-warden-agent-key: ${result.key}" \\
  -H "content-type: application/json" \\
  -d '{"kind":"tx","to":"0x..","from":"0x..","calldata":"0x095ea7b3.."}'`;
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-clear/30 bg-clear/5 p-5">
          <div className="text-sm text-clear">Agent <span className="font-semibold">{result.agentId}</span> created ✓</div>
          <div className="mt-3 text-xs uppercase tracking-widest text-slate-500">Your agent key — shown once, store it</div>
          <code className="mt-1 block break-all rounded bg-ink p-3 font-mono text-sm text-warden">{result.key}</code>
        </div>
        <div className="rounded-xl border border-edge bg-panel/60 p-5">
          <div className="mb-2 text-xs uppercase tracking-widest text-slate-500">Call the firewall before you sign</div>
          <pre className="overflow-x-auto text-xs text-slate-300">{snippet}</pre>
          <p className="mt-2 text-xs text-slate-500">Returns <span className="text-clear">allow</span> (200) · <span className="text-review">hold</span> (202) · <span className="text-block">deny</span> (403). Act only on allow.</p>
        </div>
        <button onClick={() => setResult(null)} className="text-xs text-slate-400 underline hover:text-white">create another</button>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-4 rounded-xl border border-edge bg-panel/60 p-6">
      <div>
        <label className="text-xs uppercase tracking-widest text-slate-500">Agent name (optional)</label>
        <input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="trading-bot-1"
          className="mt-1 w-full rounded-lg border border-edge bg-ink px-3 py-2.5 text-sm outline-none focus:border-warden" />
      </div>
      <div>
        <label className="text-xs uppercase tracking-widest text-slate-500">Hourly spend cap ($)</label>
        <input type="number" value={perHour} onChange={(e) => setPerHour(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-edge bg-ink px-3 py-2.5 text-sm outline-none focus:border-warden" />
      </div>
      <button onClick={create} disabled={loading}
        className="w-full rounded-lg bg-warden px-4 py-3 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50">
        {loading ? "creating…" : "Create agent & get key"}
      </button>
      {error && <div className="text-sm text-block">{error}</div>}
      <p className="text-[11px] text-slate-600">Free during early access. Sensible defaults: deny unlimited approvals, hold new counterparties, kill switch ready.</p>
    </div>
  );
}
