"use client";

import { useEffect, useState } from "react";

interface Agent { key: string; agentId: string; plan: string; monthlyCap: number; expiresAt: string | null; paused: boolean; payer?: string; checksUsed: number; createdAt: string }
interface Payment { payer?: string; plan: string; amountUsd: number; token: string; txHash: string; at: string }
interface Data { agents: Agent[]; payments: Payment[]; counts: { agents: number; paid: number; revenueUsd: number }; trackRecord: { total: number; hitRatePct: number | null; rugsCaught: number } }

export function AdminPanel() {
  const [token, setToken] = useState("");
  const [input, setInput] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => { const s = localStorage.getItem("warden_admin"); if (s) { setToken(s); setInput(s); } }, []);
  useEffect(() => { if (token) load(); }, [token]);

  const [eas, setEas] = useState<any>(null);
  const [attestTarget, setAttestTarget] = useState("");
  const [easMsg, setEasMsg] = useState("");

  async function load() {
    setError("");
    const r = await fetch(`/api/admin`, { headers: { "x-warden-admin": token } });
    if (r.status === 403) { setError("Invalid admin token."); setData(null); return; }
    setData(await r.json());
    setEas(await fetch(`/api/attest`, { headers: { "x-warden-admin": token } }).then((x) => x.json()).catch(() => null));
  }
  async function easOp(payload: object, label: string) {
    setEasMsg(label + "…");
    const r = await fetch("/api/attest", { method: "POST", headers: { "content-type": "application/json", "x-warden-admin": token }, body: JSON.stringify(payload) }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    setEasMsg(r.error ? `error: ${r.detail ?? r.error}` : (r.easscan ? `sent: ${r.easscan}` : "done"));
    load();
  }
  async function act(payload: object, label: string) {
    setBusy(label);
    try { await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json", "x-warden-admin": token }, body: JSON.stringify(payload) }); await load(); }
    finally { setBusy(""); }
  }
  function signIn() { const t = input.trim(); if (!t) return; localStorage.setItem("warden_admin", t); setToken(t); }

  if (!token || !data) {
    return (
      <div className="max-w-md space-y-3 rounded-xl border border-edge bg-panel/60 p-6">
        <label className="text-xs uppercase tracking-widest text-slate-500">Admin token</label>
        <input type="password" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signIn()}
          className="w-full rounded-lg border border-edge bg-ink px-3 py-2.5 font-mono text-sm outline-none focus:border-warden" />
        <button onClick={signIn} className="w-full rounded-lg bg-warden px-4 py-2.5 text-sm font-semibold text-ink hover:brightness-110">Enter</button>
        {error && <div className="text-sm text-block">{error}</div>}
        <p className="text-[11px] text-slate-600">Set ADMIN_TOKEN in Vercel env to enable.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="agents" value={data.counts.agents} />
        <Stat label="paid" value={data.counts.paid} accent="text-warden" />
        <Stat label="revenue" value={`$${data.counts.revenueUsd.toLocaleString()}`} accent="text-clear" />
        <Stat label="hit-rate" value={data.trackRecord.hitRatePct === null ? "—" : `${data.trackRecord.hitRatePct}%`} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => act({ op: "scout" }, "scout")} disabled={!!busy} className="rounded-lg border border-edge bg-ink px-3 py-2 text-xs hover:border-warden disabled:opacity-50">{busy === "scout" ? "running…" : "Run scout"}</button>
        <button onClick={() => act({ op: "recheck" }, "recheck")} disabled={!!busy} className="rounded-lg border border-edge bg-ink px-3 py-2 text-xs hover:border-warden disabled:opacity-50">{busy === "recheck" ? "running…" : "Run re-checker"}</button>
        <CompButton onCreate={(agentId, plan, days) => act({ op: "comp", agentId, plan, days }, "comp")} />
      </div>

      {eas && (
        <div className="rounded-xl border border-edge bg-panel/60 p-5">
          <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">On-chain (Base EAS)</h3>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span>attest: <span className={eas.enabled ? "text-clear" : "text-block"}>{eas.enabled ? "enabled" : "disabled (set ATTESTER_PRIVATE_KEY)"}</span></span>
            <span>schema: <span className={eas.schemaRegistered ? "text-clear" : "text-review"}>{eas.schemaRegistered ? "registered" : "not registered"}</span></span>
            <span>builder code: <span className="text-warden">{eas.builderCode}</span></span>
            {eas.attester && <span className="font-mono text-slate-500">{eas.attester.slice(0, 10)}…</span>}
          </div>
          {eas.enabled && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!eas.schemaRegistered && <button onClick={() => easOp({ op: "register" }, "registering schema")} className="rounded-lg border border-warden/40 bg-warden/10 px-3 py-2 text-xs text-warden">Register schema</button>}
              <input value={attestTarget} onChange={(e) => setAttestTarget(e.target.value)} placeholder="0x token to attest" className="w-56 rounded border border-edge bg-ink px-2 py-1.5 font-mono text-xs outline-none" />
              <button onClick={() => easOp({ op: "attest", target: attestTarget, decision: "block", riskScore: 80, reasons: ["MANUAL"] }, "attesting")} className="rounded-lg border border-edge bg-ink px-3 py-2 text-xs hover:border-warden">Attest on Base</button>
              {easMsg && <span className="text-xs text-slate-500">{easMsg}</span>}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-edge bg-panel/60 p-5">
        <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Agents & subscriptions</h3>
        <div className="space-y-2">
          {data.agents.length === 0 && <div className="text-xs text-slate-600">no agents yet</div>}
          {data.agents.map((a) => (
            <div key={a.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-edge p-2.5 text-xs">
              <span className="font-mono text-slate-500">{a.key}</span>
              <span className="text-slate-300">{a.agentId}</span>
              <span className={`rounded px-2 py-0.5 uppercase ${a.plan === "free" ? "bg-edge text-slate-400" : "bg-warden/15 text-warden"}`}>{a.plan}</span>
              <span className="text-slate-500">{a.checksUsed}/{a.monthlyCap}</span>
              <span className="text-slate-500">{a.expiresAt ? new Date(a.expiresAt).toLocaleDateString("en-US") : "—"}</span>
              {a.paused && <span className="text-block">paused</span>}
              <span className="flex-1" />
              <button onClick={() => act({ op: "update", keyPrefix: a.key, patch: { extendDays: 30 } }, a.key)} className="rounded bg-edge px-2 py-1 hover:text-warden">+30d</button>
              <button onClick={() => act({ op: "update", keyPrefix: a.key, patch: { plan: "team" } }, a.key)} className="rounded bg-edge px-2 py-1 hover:text-warden">→team</button>
              <button onClick={() => act({ op: "update", keyPrefix: a.key, patch: { paused: !a.paused } }, a.key)} className="rounded bg-edge px-2 py-1 hover:text-review">{a.paused ? "unpause" : "pause"}</button>
              <button onClick={() => act({ op: "revoke", keyPrefix: a.key }, a.key)} className="rounded bg-block/80 px-2 py-1 font-semibold text-ink">revoke</button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-panel/60 p-5">
        <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Payments</h3>
        <div className="space-y-1.5">
          {data.payments.length === 0 && <div className="text-xs text-slate-600">no payments yet</div>}
          {data.payments.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-clear">${p.amountUsd}</span><span className="text-slate-500">{p.token}</span>
              <span className="uppercase text-warden">{p.plan}</span>
              <span className="font-mono text-slate-600">{p.payer?.slice(0, 10)}…</span>
              <a href={`https://basescan.org/tx/${p.txHash}`} target="_blank" rel="noreferrer" className="font-mono text-slate-600 underline">tx</a>
              <span className="flex-1" /><span className="text-slate-600">{new Date(p.at).toLocaleString("en-US")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return <div className="rounded-xl border border-edge bg-panel/60 p-4"><div className={`text-2xl font-bold ${accent ?? "text-white"}`}>{value}</div><div className="mt-1 text-[11px] uppercase tracking-widest text-slate-500">{label}</div></div>;
}
function CompButton({ onCreate }: { onCreate: (agentId: string, plan: string, days: number) => void }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-lg border border-warden/40 bg-warden/10 px-3 py-2 text-xs text-warden hover:bg-warden/20">+ Comp / Enterprise agent</button>;
  return (
    <span className="flex items-center gap-1">
      <input value={id} onChange={(e) => setId(e.target.value)} placeholder="agentId" className="w-28 rounded border border-edge bg-ink px-2 py-1 text-xs outline-none" />
      <button onClick={() => { onCreate(id || "comp", "team", 30); setOpen(false); setId(""); }} className="rounded bg-warden px-2 py-1 text-xs font-semibold text-ink">team 30d</button>
      <button onClick={() => { onCreate(id || "ent", "enterprise", 365); setOpen(false); setId(""); }} className="rounded bg-warden px-2 py-1 text-xs font-semibold text-ink">ent 1y</button>
      <button onClick={() => setOpen(false)} className="text-xs text-slate-500">✕</button>
    </span>
  );
}
