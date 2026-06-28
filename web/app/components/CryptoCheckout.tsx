"use client";

import { useEffect, useState } from "react";
import { PAY_TO, explorerTx, pay, type PayToken } from "../lib/pay";

export function CryptoCheckout({ planName, defaultAmountUsd }: { planName: string; defaultAmountUsd: number }) {
  const [token, setToken] = useState<PayToken>("USDC");
  const [amount, setAmount] = useState(defaultAmountUsd);
  const [ethPrice, setEthPrice] = useState<number | undefined>();
  const [status, setStatus] = useState<"idle" | "paying" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (token === "ETH" && !ethPrice) {
      fetch("/api/eth-price").then((r) => r.json()).then((j) => j.usd && setEthPrice(j.usd)).catch(() => {});
    }
  }, [token, ethPrice]);

  const ethAmount = token === "ETH" && ethPrice ? (amount / ethPrice).toFixed(6) : null;

  async function onPay() {
    setStatus("paying"); setError(""); setTxHash("");
    try {
      const hash = await pay(token, amount, ethPrice);
      setTxHash(hash); setStatus("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setStatus("error");
    }
  }

  return (
    <div className="rounded-2xl border border-warden/40 bg-panel/60 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Checkout — {planName}</h3>
        <span className="rounded-full border border-edge px-2 py-0.5 text-[11px] text-slate-400">Base · crypto only</span>
      </div>

      {/* token toggle */}
      <div className="mt-5 flex gap-2">
        {(["USDC", "ETH"] as PayToken[]).map((t) => (
          <button key={t} onClick={() => setToken(t)}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${token === t ? "border-warden bg-warden/10 text-warden" : "border-edge text-slate-300 hover:border-slate-500"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* amount */}
      <div className="mt-4">
        <label className="text-xs uppercase tracking-widest text-slate-500">Amount (USD)</label>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-slate-500">$</span>
          <input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full rounded-lg border border-edge bg-ink px-3 py-2.5 text-sm outline-none focus:border-warden" />
        </div>
        <div className="mt-2 text-xs text-slate-500">
          You pay:{" "}
          <span className="text-slate-300">
            {token === "USDC" ? `${amount} USDC` : ethAmount ? `${ethAmount} ETH` : "fetching ETH price…"}
          </span>{" "}
          on Base
        </div>
      </div>

      {/* pay to */}
      <div className="mt-4 rounded-lg border border-edge bg-ink p-3 text-xs">
        <div className="text-slate-500">Funds go to</div>
        <div className="mt-1 break-all font-mono text-slate-300">{PAY_TO}</div>
      </div>

      <button onClick={onPay} disabled={status === "paying"}
        className="mt-5 w-full rounded-lg bg-warden px-4 py-3 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50">
        {status === "paying" ? "Confirm in your wallet…" : `Pay ${token} on Base`}
      </button>

      {status === "success" && (
        <div className="mt-4 rounded-lg border border-clear/30 bg-clear/5 p-3 text-sm text-clear">
          Payment sent ✓{" "}
          <a href={explorerTx(txHash)} target="_blank" rel="noreferrer" className="underline">View on BaseScan</a>
          <p className="mt-1 text-xs text-slate-400">Email the tx hash to hello@warden402.xyz to activate your plan.</p>
        </div>
      )}
      {status === "error" && <div className="mt-4 rounded-lg border border-block/30 bg-block/5 p-3 text-sm text-block">{error}</div>}

      <p className="mt-3 text-[11px] text-slate-600">
        Connects your wallet (MetaMask / Coinbase Wallet), switches to Base, and sends {token} directly. No custody, no card.
      </p>
    </div>
  );
}
