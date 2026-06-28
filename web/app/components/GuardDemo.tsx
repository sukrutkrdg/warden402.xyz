"use client";

import { useState } from "react";
import { VerdictCard } from "./VerdictCard";
import type { Verdict } from "../lib/types";

const EXAMPLES = [
  { label: "USDC (temiz)", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  { label: "Taze token", address: "0x5Fe12d3DC320ea08c8558b4469b0B264Fdd59bA3" },
];

export function GuardDemo() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  async function run(addr?: string) {
    const a = (addr ?? address).trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(a)) {
      setVerdict({ error: "Geçerli bir EVM adresi gir (0x…40 hex)" } as Verdict);
      return;
    }
    setLoading(true);
    setVerdict(null);
    try {
      const r = await fetch(`/api/guard?type=token&address=${a}`);
      setVerdict(await r.json());
    } catch (e) {
      setVerdict({ error: String(e) } as Verdict);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="0x… token kontrat adresi (Base)"
          className="flex-1 rounded-lg border border-edge bg-panel px-4 py-3 text-sm outline-none focus:border-warden"
        />
        <button
          onClick={() => run()}
          disabled={loading}
          className="rounded-lg bg-warden px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
        >
          {loading ? "kontrol…" : "Guard"}
        </button>
      </div>
      <div className="flex gap-2 text-xs text-slate-400">
        <span>örnek:</span>
        {EXAMPLES.map((e) => (
          <button key={e.address} onClick={() => { setAddress(e.address); run(e.address); }} className="underline hover:text-white">
            {e.label}
          </button>
        ))}
      </div>
      {verdict && <VerdictCard v={verdict} />}
    </div>
  );
}
