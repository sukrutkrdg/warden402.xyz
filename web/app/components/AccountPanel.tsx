"use client";

import { useEffect, useState } from "react";

interface State { agentId: string; plan: string; monthlyCap: number; checksUsed: number; checksRemaining: number; expiresAt: string | null; expired: boolean }
interface AuditEntry { decision: string; reasons: string[]; to: string; amountUsd: number; at: string }
const DECC: Record<string, string> = { allow: "text-clear", hold: "text-review", deny: "text-block" };

export function AccountPanel() {
  const [key, setKey] = useState("");
  const [input, setInput] = useState("");
  const [state, setState] = useState<State | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [holds, setHolds] = useState<{ holdId: string; action: { kind: string; to: string; amountUsd?: number }; reasons: string[]; createdAt: string }[]>([]);
  const [webhook, setWebhook] = useState("");
  const [webhookMsg, setWebhookMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("warden_key") : null;
    if (saved) { setKey(saved); setInput(saved); }
  }, []);
  useEffect(() => { if (key) load(key); }, [key]);

  async function load(k: string) {
    setLoading(true); setError("");
    try {
      const [s, a, h] = await Promise.all([
        fetch("/api/v1/state", { headers: { "x-warden-agent-key": k } }).then((r) => r.json()),
        fetch("/api/v1/audit?limit=25", { headers: { "x-warden-agent-key": k } }).then((r) => r.json()),
        fetch("/api/v1/holds", { headers: { "x-warden-agent-key": k } }).then((r) => r.json()).catch(() => ({ holds: [] })),
      ]);
      if (s.error) { setError("Invalid agent key."); setState(null); return; }
      setState(s); setAudit(a.entries ?? []); setHolds(h.holds ?? []);
    } catch (e) { setError(String(e)); } finally { setLoading(false); }
  }
  async function resolveHold(holdId: string, action: "approve" | "reject") {
    await fetch("/api/v1/holds", { method: "POST", headers: { "content-type": "application/json", "x-warden-agent-key": key }, body: JSON.stringify({ holdId, action }) });
    load(key);
  }
  async function saveWebhook() {
    const r = await fetch("/api/v1/webhook", { method: "POST", headers: { "content-type": "application/json", "x-warden-agent-key": key }, body: JSON.stringify({ url: webhook || null }) }).then((x) => x.json());
    setWebhookMsg(r.ok ? "saved ✓" : `error: ${r.error}`);
  }

  function signIn() {
    const k = input.trim();
    if (!/^wk_[a-f0-9]{40}$/.test(k)) { setError("Enter a valid agent key (wk_…)."); return; }
    localStorage.setItem("warden_key", k); setKey(k);
  }
  function signOut() { localStorage.removeItem("warden_key"); setKey(""); setState(null); setAudit([]); setInput(""); }
  async function rotate() {
    if (!confirm("Rotate your key? The current key will stop working immediately.")) return;
    const r = await fetch("/api/v1/rotate", { method: "POST", headers: { "x-warden-agent-key": key } }).then((x) => x.json()).catch(() => null);
    if (r?.key) { localStorage.setItem("warden_key", r.key); setInput(r.key); setKey(r.key); alert("New key:\n" + r.key + "\n\nStore it — shown once."); }
    else setError("Rotate failed.");
  }

  if (!key || !state) {
    return (
      <div className="max-w-md space-y-3 rounded-xl border border-edge bg-panel/60 p-6">
        <label className="text-xs uppercase tracking-widest text-slate-500">Agent key</label>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signIn()}
          placeholder="wk_…" className="w-full rounded-lg border border-edge bg-ink px-3 py-2.5 font-mono text-sm outline-none focus:border-warden" />
        <button onClick={signIn} disabled={loading} className="w-full rounded-lg bg-warden px-4 py-2.5 text-sm font-semibold text-ink hover:brightness-110 disabled:opacity-50">
          {loading ? "loading…" : "View my account"}
        </button>
        {error && <div className="text-sm text-block">{error}</div>}
        <p className="text-[11px] text-slate-600">No key yet? <a href="/onboard" className="text-warden underline">Create an agent</a> or <a href="/pricing" className="text-warden underline">choose a plan</a>.</p>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((state.checksUsed / Math.max(1, state.monthlyCap)) * 100));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">agent <span className="font-mono text-slate-200">{state.agentId}</span></div>
        <div className="flex items-center gap-3">
          <button onClick={rotate} className="text-xs text-review underline hover:brightness-125">rotate key</button>
          <button onClick={signOut} className="text-xs text-slate-500 underline hover:text-white">sign out</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-warden/30 bg-warden/5 p-5">
          <div className="text-xs uppercase tracking-widest text-slate-500">Plan</div>
          <div className="mt-1 text-2xl font-bold uppercase text-warden">{state.plan}</div>
          <div className="mt-1 text-xs text-slate-500">{state.expiresAt ? `until ${new Date(state.expiresAt).toLocaleDateString("en-US")}` : "no expiry"}{state.expired && <span className="text-block"> · expired</span>}</div>
        </div>
        <div className="rounded-xl border border-edge bg-panel/60 p-5 sm:col-span-2">
          <div className="mb-1 flex justify-between text-xs text-slate-400"><span>Monthly checks</span><span>{state.checksUsed.toLocaleString()} / {state.monthlyCap.toLocaleString()}</span></div>
          <div className="h-2 overflow-hidden rounded bg-edge"><div className={`h-full ${pct > 80 ? "bg-block" : pct > 50 ? "bg-review" : "bg-clear"}`} style={{ width: `${pct}%` }} /></div>
          <div className="mt-2 text-xs text-slate-500">{state.checksRemaining.toLocaleString()} remaining this month</div>
        </div>
      </div>

      {holds.length > 0 && (
        <div className="rounded-xl border border-review/30 bg-review/5 p-5">
          <h3 className="mb-3 text-sm uppercase tracking-widest text-review">Pending approvals ({holds.length})</h3>
          <div className="space-y-2">
            {holds.map((h) => (
              <div key={h.holdId} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-300">{h.action.kind === "tx" ? "tx" : `pay $${h.action.amountUsd}`}</span>
                <span className="font-mono text-slate-500">{h.action.to.slice(0, 12)}…</span>
                <span className="flex-1 text-review">{h.reasons.join(", ")}</span>
                <button onClick={() => resolveHold(h.holdId, "approve")} className="rounded bg-clear/90 px-3 py-1 font-semibold text-ink">Approve</button>
                <button onClick={() => resolveHold(h.holdId, "reject")} className="rounded bg-block/90 px-3 py-1 font-semibold text-ink">Reject</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-edge bg-panel/60 p-5">
        <h3 className="mb-2 text-sm uppercase tracking-widest text-slate-500">Webhook (notify on hold)</h3>
        <div className="flex gap-2">
          <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://your-app.com/warden-hook" className="flex-1 rounded-lg border border-edge bg-ink px-3 py-2 text-xs outline-none focus:border-warden" />
          <button onClick={saveWebhook} className="rounded-lg border border-edge bg-ink px-3 py-2 text-xs hover:border-warden">Save</button>
        </div>
        {webhookMsg && <div className="mt-1 text-xs text-slate-500">{webhookMsg}</div>}
      </div>

      <div className="rounded-xl border border-edge bg-panel/60 p-5">
        <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Recent decisions</h3>
        {audit.length === 0 && <div className="text-xs text-slate-600">no calls yet — start calling /api/v1/check with your key</div>}
        <div className="space-y-1.5">
          {audit.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className={`w-12 font-semibold uppercase ${DECC[e.decision] ?? "text-slate-400"}`}>{e.decision}</span>
              <span className="w-24 text-slate-500">{e.amountUsd ? `$${e.amountUsd}` : "tx"}</span>
              <span className="hidden flex-1 truncate font-mono text-slate-600 sm:block">{e.to?.slice(0, 16)}…</span>
              <span className="flex-1 truncate text-slate-400">{(e.reasons ?? []).join(", ")}</span>
              <span className="text-slate-600">{new Date(e.at).toLocaleTimeString("en-US")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
