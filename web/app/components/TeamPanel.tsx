"use client";

import { useCallback, useEffect, useState } from "react";

interface Org { orgId: string; name: string; ownerAddr: string; plan: string }
interface Member { addr: string; role: "owner" | "admin" | "member" }
interface OrgAgent { key: string; agentId: string; plan: string; paused: boolean; checksUsed?: number; monthlyCap?: number }

const ROLE_BADGE: Record<string, string> = { owner: "text-warden", admin: "text-clear", member: "text-slate-400" };

function eth(): any { return typeof window !== "undefined" ? (window as any).ethereum : undefined; }

export function TeamPanel() {
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");
  const [orgs, setOrgs] = useState<{ org: Org; role: Member["role"] }[]>([]);
  const [sel, setSel] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState<Member["role"] | null>(null);
  const [agents, setAgents] = useState<OrgAgent[]>([]);
  const [newOrg, setNewOrg] = useState("");
  const [inviteAddr, setInviteAddr] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [newKey, setNewKey] = useState("");

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("warden_session") : null;
    const a = typeof window !== "undefined" ? localStorage.getItem("warden_addr") : null;
    if (t && a) { setToken(t); setAddress(a); }
  }, []);

  const authFetch = useCallback((url: string, init: RequestInit = {}) =>
    fetch(url, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init.headers ?? {}) } }), [token]);

  const loadOrgs = useCallback(async () => {
    const r = await authFetch("/api/org").then((x) => x.json()).catch(() => null);
    if (r?.orgs) setOrgs(r.orgs);
  }, [authFetch]);

  useEffect(() => { if (token) loadOrgs(); }, [token, loadOrgs]);

  async function connect() {
    setErr("");
    const e = eth();
    if (!e) { setErr("No wallet found. Install MetaMask or Coinbase Wallet."); return; }
    try {
      const accts = await e.request({ method: "eth_requestAccounts" });
      if (accts?.[0]) setAddress(accts[0]);
    } catch (x: any) { setErr(x?.message ?? "Wallet connection rejected."); }
  }

  async function signIn() {
    setErr(""); setBusy("signin");
    try {
      const e = eth();
      const { message } = await fetch(`/api/auth/nonce?address=${address}`).then((r) => r.json());
      const signature = await e.request({ method: "personal_sign", params: [message, address] });
      const r = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, message, signature }) }).then((x) => x.json());
      if (r?.token) { localStorage.setItem("warden_session", r.token); localStorage.setItem("warden_addr", r.address); setToken(r.token); setAddress(r.address); }
      else setErr(r?.error ?? "Sign-in failed.");
    } catch (x: any) { setErr(x?.message ?? "Sign-in failed."); } finally { setBusy(""); }
  }

  function signOut() { localStorage.removeItem("warden_session"); localStorage.removeItem("warden_addr"); setToken(""); setSel(null); setOrgs([]); }

  async function createOrg() {
    if (!newOrg.trim()) return;
    await authFetch("/api/org", { method: "POST", body: JSON.stringify({ name: newOrg.trim() }) });
    setNewOrg(""); loadOrgs();
  }

  async function openOrg(org: Org) {
    setSel(org); setNewKey("");
    const [m, a] = await Promise.all([
      authFetch(`/api/org/members?orgId=${org.orgId}`).then((x) => x.json()),
      authFetch(`/api/org/agents?orgId=${org.orgId}`).then((x) => x.json()),
    ]);
    setMembers(m.members ?? []); setMyRole(m.myRole ?? null); setAgents(a.agents ?? []);
  }

  async function invite() {
    if (!sel) return;
    const r = await authFetch("/api/org/members", { method: "POST", body: JSON.stringify({ orgId: sel.orgId, address: inviteAddr.trim(), role: inviteRole }) }).then((x) => x.json());
    if (r?.ok) { setInviteAddr(""); openOrg(sel); } else setErr(r?.error ?? "Could not add member.");
  }
  async function remove(addr: string) {
    if (!sel) return;
    await authFetch("/api/org/members", { method: "DELETE", body: JSON.stringify({ orgId: sel.orgId, address: addr }) });
    openOrg(sel);
  }
  async function createAgent() {
    if (!sel) return;
    const r = await authFetch("/api/org/agents", { method: "POST", body: JSON.stringify({ orgId: sel.orgId }) }).then((x) => x.json());
    if (r?.key) { setNewKey(r.key); openOrg(sel); } else setErr(r?.error ?? "Could not create agent.");
  }

  // ── not signed in ──
  if (!token) {
    return (
      <div className="max-w-md space-y-4 rounded-xl border border-edge bg-panel/60 p-6">
        {!address ? (
          <button onClick={connect} className="w-full rounded-lg bg-warden px-4 py-2.5 text-sm font-semibold text-ink hover:brightness-110">Connect Wallet</button>
        ) : (
          <>
            <div className="text-xs text-slate-400">connected <span className="font-mono text-slate-200">{address.slice(0, 8)}…{address.slice(-4)}</span></div>
            <button onClick={signIn} disabled={busy === "signin"} className="w-full rounded-lg bg-warden px-4 py-2.5 text-sm font-semibold text-ink hover:brightness-110 disabled:opacity-50">
              {busy === "signin" ? "check your wallet…" : "Sign in with Ethereum"}
            </button>
          </>
        )}
        {err && <div className="text-sm text-block">{err}</div>}
        <p className="text-[11px] text-slate-600">Your wallet is your identity — no password, no email. You'll sign a message (no gas, no transaction).</p>
      </div>
    );
  }

  // ── signed in ──
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">signed in <span className="font-mono text-slate-200">{address.slice(0, 8)}…{address.slice(-4)}</span></div>
        <button onClick={signOut} className="text-xs text-slate-500 underline hover:text-white">sign out</button>
      </div>

      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        {/* org list */}
        <div className="space-y-3">
          <h3 className="text-xs uppercase tracking-widest text-slate-500">Organizations</h3>
          {orgs.map(({ org, role }) => (
            <button key={org.orgId} onClick={() => openOrg(org)} className={`w-full rounded-lg border p-3 text-left ${sel?.orgId === org.orgId ? "border-warden bg-warden/5" : "border-edge bg-panel/60 hover:border-warden/50"}`}>
              <div className="text-sm font-semibold">{org.name}</div>
              <div className={`text-[11px] uppercase ${ROLE_BADGE[role]}`}>{role} · {org.plan}</div>
            </button>
          ))}
          <div className="flex gap-2 pt-2">
            <input value={newOrg} onChange={(e) => setNewOrg(e.target.value)} placeholder="New team name" className="flex-1 rounded-lg border border-edge bg-ink px-3 py-2 text-xs outline-none focus:border-warden" />
            <button onClick={createOrg} className="rounded-lg border border-edge bg-ink px-3 py-2 text-xs hover:border-warden">+ Create</button>
          </div>
        </div>

        {/* selected org */}
        <div className="space-y-5">
          {!sel ? (
            <div className="rounded-xl border border-edge bg-panel/60 p-6 text-sm text-slate-500">Select or create an organization.</div>
          ) : (
            <>
              <div className="rounded-xl border border-edge bg-panel/60 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{sel.name}</h3>
                  <span className="text-[11px] uppercase text-warden">{sel.plan} plan</span>
                </div>
                {sel.plan === "free" && <a href="/pricing" className="mt-2 inline-block text-xs text-warden underline">Upgrade this team →</a>}
              </div>

              {/* members */}
              <div className="rounded-xl border border-edge bg-panel/60 p-5">
                <h3 className="mb-3 text-sm uppercase tracking-widest text-slate-500">Members ({members.length})</h3>
                <div className="space-y-1.5">
                  {members.map((m) => (
                    <div key={m.addr} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-slate-300">{m.addr.slice(0, 10)}…{m.addr.slice(-4)}</span>
                      <span className={`uppercase ${ROLE_BADGE[m.role]}`}>{m.role}</span>
                      <span className="flex-1" />
                      {myRole && (myRole === "owner" || myRole === "admin") && m.role !== "owner" && (
                        <button onClick={() => remove(m.addr)} className="text-block underline">remove</button>
                      )}
                    </div>
                  ))}
                </div>
                {(myRole === "owner" || myRole === "admin") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input value={inviteAddr} onChange={(e) => setInviteAddr(e.target.value)} placeholder="0x wallet address" className="flex-1 rounded-lg border border-edge bg-ink px-3 py-2 font-mono text-xs outline-none focus:border-warden" />
                    <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "member")} className="rounded-lg border border-edge bg-ink px-2 py-2 text-xs">
                      <option value="member">member</option><option value="admin">admin</option>
                    </select>
                    <button onClick={invite} className="rounded-lg border border-edge bg-ink px-3 py-2 text-xs hover:border-warden">Add</button>
                  </div>
                )}
              </div>

              {/* agents */}
              <div className="rounded-xl border border-edge bg-panel/60 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm uppercase tracking-widest text-slate-500">Agents ({agents.length})</h3>
                  {(myRole === "owner" || myRole === "admin") && <button onClick={createAgent} className="rounded-lg border border-edge bg-ink px-3 py-1.5 text-xs hover:border-warden">+ New agent</button>}
                </div>
                {newKey && <div className="mb-3 rounded-lg border border-warden/40 bg-warden/5 p-2 font-mono text-[11px] break-all text-warden">New key (shown once): {newKey}</div>}
                <div className="space-y-1.5">
                  {agents.length === 0 && <div className="text-xs text-slate-600">no agents yet</div>}
                  {agents.map((a) => (
                    <div key={a.key} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-slate-300">{a.agentId}</span>
                      <span className="uppercase text-warden">{a.plan}</span>
                      <span className="flex-1" />
                      <span className="text-slate-500">{(a.checksUsed ?? 0).toLocaleString()} / {(a.monthlyCap ?? 0).toLocaleString()}</span>
                      {a.paused && <span className="text-block">paused</span>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {err && <div className="text-sm text-block">{err}</div>}
    </div>
  );
}
