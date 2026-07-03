"use client";

import { useState } from "react";
import { connectWith, listWallets, type WalletOption } from "../lib/pay";

/**
 * Connect button + explicit wallet chooser (EIP-6963).
 * With several wallet extensions installed, auto-picking one silently stalls
 * when the wrong extension grabs the request — so when more than one wallet is
 * present we list them and only call the one the user taps.
 */
export function WalletPicker({ onConnected, onError, label = "Connect Wallet" }: {
  onConnected: (address: string) => void;
  onError: (message: string) => void;
  label?: string;
}) {
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [busy, setBusy] = useState("");

  async function start() {
    onError("");
    const list = listWallets();
    if (!list.length) { onError("No wallet found. Install MetaMask or Coinbase Wallet, then reload."); return; }
    if (list.length === 1) { await doConnect(list[0]!.id); return; }
    setWallets(list);
  }

  async function doConnect(id: string) {
    setBusy(id);
    try {
      onConnected(await connectWith(id));
      setWallets(null);
    } catch (e) {
      const err = e as { code?: number; message?: string };
      onError(err?.code === 4001 ? "Connection request rejected in wallet." : err?.message || "Could not connect. Unlock the wallet and try again.");
    } finally { setBusy(""); }
  }

  if (!wallets) {
    return (
      <button onClick={start} className="w-full rounded-lg bg-warden px-4 py-2.5 text-sm font-semibold text-ink hover:brightness-110">
        {label}
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-widest text-slate-500">Choose a wallet</div>
      {wallets.map((w) => (
        <button key={w.id} onClick={() => doConnect(w.id)} disabled={Boolean(busy)}
          className="flex w-full items-center gap-3 rounded-lg border border-edge bg-ink px-4 py-2.5 text-left text-sm text-slate-200 transition hover:border-warden disabled:opacity-50">
          {w.icon ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URI from EIP-6963, next/image unnecessary
            <img src={w.icon} alt="" className="h-5 w-5 rounded" />
          ) : (
            <span className="h-5 w-5 rounded bg-edge" />
          )}
          <span className="flex-1 font-medium">{w.name}</span>
          {busy === w.id && <span className="text-xs text-slate-500">opening…</span>}
        </button>
      ))}
      <button onClick={() => setWallets(null)} className="w-full text-center text-xs text-slate-500 hover:text-slate-300">cancel</button>
    </div>
  );
}
