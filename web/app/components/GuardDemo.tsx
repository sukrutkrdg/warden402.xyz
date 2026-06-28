"use client";

import { useState } from "react";
import { VerdictCard } from "./VerdictCard";
import type { Verdict } from "../lib/types";

type Mode = "token" | "address" | "tx";

const TOKEN_EXAMPLES = [
  { label: "USDC (clean)", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  { label: "Fresh token", address: "0x5Fe12d3DC320ea08c8558b4469b0B264Fdd59bA3" },
];

// A real unlimited-approval calldata: approve(spender, 2^256-1)
const UNLIMITED_APPROVE =
  "0x095ea7b30000000000000000000000001111111254eeb25477b68fb85ed929f73a960582ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

const TABS: { id: Mode; label: string }[] = [
  { id: "token", label: "Token" },
  { id: "address", label: "Address" },
  { id: "tx", label: "Transaction" },
];

export function GuardDemo() {
  const [mode, setMode] = useState<Mode>("token");
  const [address, setAddress] = useState("");
  const [from, setFrom] = useState("0x6aAFF8af0ae8017725312C388bA3745dfE91185B");
  const [to, setTo] = useState("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  const [calldata, setCalldata] = useState(UNLIMITED_APPROVE);
  const [loading, setLoading] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  async function run(addr?: string) {
    setLoading(true);
    setVerdict(null);
    try {
      let r: Response;
      if (mode === "tx") {
        r = await fetch("/api/guard", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "tx", from, to, calldata }),
        });
      } else {
        const a = (addr ?? address).trim();
        if (!/^0x[a-fA-F0-9]{40}$/.test(a)) {
          setVerdict({ error: "Enter a valid EVM address (0x…40 hex)" } as Verdict);
          setLoading(false);
          return;
        }
        r = await fetch(`/api/guard?type=${mode}&address=${a}`);
      }
      setVerdict(await r.json());
    } catch (e) {
      setVerdict({ error: String(e) } as Verdict);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-edge bg-panel/60 p-1 text-sm w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setMode(t.id); setVerdict(null); }}
            className={`rounded-md px-4 py-1.5 transition ${mode === t.id ? "bg-warden text-ink font-semibold" : "text-slate-400 hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode !== "tx" ? (
        <>
          <div className="flex gap-2">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder={mode === "token" ? "0x… token contract address (Base)" : "0x… counterparty address (Base)"}
              className="flex-1 rounded-lg border border-edge bg-panel px-4 py-3 text-sm outline-none focus:border-warden"
            />
            <button onClick={() => run()} disabled={loading} className="rounded-lg bg-warden px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50">
              {loading ? "checking…" : "Guard"}
            </button>
          </div>
          {mode === "token" && (
            <div className="flex gap-2 text-xs text-slate-400">
              <span>examples:</span>
              {TOKEN_EXAMPLES.map((e) => (
                <button key={e.address} onClick={() => { setAddress(e.address); run(e.address); }} className="underline hover:text-white">
                  {e.label}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="from 0x…" className="rounded-lg border border-edge bg-panel px-4 py-2.5 text-xs outline-none focus:border-warden" />
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="to 0x… (token/contract)" className="rounded-lg border border-edge bg-panel px-4 py-2.5 text-xs outline-none focus:border-warden" />
          </div>
          <textarea value={calldata} onChange={(e) => setCalldata(e.target.value)} placeholder="calldata 0x…" rows={3} className="w-full rounded-lg border border-edge bg-panel px-4 py-2.5 font-mono text-xs outline-none focus:border-warden" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">prefilled: an unlimited <span className="text-review">approve()</span> — Warden flags it before you sign</span>
            <button onClick={() => run()} disabled={loading} className="rounded-lg bg-warden px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50">
              {loading ? "checking…" : "Guard tx"}
            </button>
          </div>
        </div>
      )}

      {verdict && <VerdictCard v={verdict} />}
    </div>
  );
}
