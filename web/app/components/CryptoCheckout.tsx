"use client";

import { useEffect, useState } from "react";
import { PAY_TO, connect, explorerTx, pay, signClaim, type PayToken } from "../lib/pay";

export function CryptoCheckout({ planName, defaultAmountUsd }: { planName: string; defaultAmountUsd: number }) {
  const [token, setToken] = useState<PayToken>("USDC");
  const [amount, setAmount] = useState(defaultAmountUsd);
  const [ethPrice, setEthPrice] = useState<number | undefined>();
  const [status, setStatus] = useState<"idle" | "paying" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);
  const [account, setAccount] = useState<string>("");
  const [connecting, setConnecting] = useState(false);
  const [verified, setVerified] = useState<{ token: string; amount: number } | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [sub, setSub] = useState<{ key: string; plan: string; expiresAt: string } | null>(null);

  async function onConnect() {
    setConnecting(true); setError("");
    try { setAccount(await connect()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setConnecting(false); }
  }

  useEffect(() => {
    setHasWallet(typeof window !== "undefined" && Boolean((window as { ethereum?: unknown }).ethereum));
  }, []);

  useEffect(() => {
    if (token === "ETH" && !ethPrice) {
      fetch("/api/eth-price").then((r) => r.json()).then((j) => j.usd && setEthPrice(j.usd)).catch(() => {});
    }
  }, [token, ethPrice]);

  const ethAmount = token === "ETH" && ethPrice ? (amount / ethPrice).toFixed(6) : null;

  async function onPay() {
    setStatus("paying"); setError(""); setTxHash(""); setVerified(null); setUnconfirmed(false);
    try {
      const hash = await pay(token, amount, ethPrice);
      setTxHash(hash); setStatus("success");
      // Confirm on-chain — only a settled transfer to Warden counts as paid.
      let ok = false;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const v = await fetch(`/api/verify-payment?hash=${hash}`).then((r) => r.json()).catch(() => null);
        if (v?.verified) { setVerified({ token: v.token, amount: v.amount }); ok = true; break; }
        if (v?.error && v.error !== "not_found" && v.error !== "not_confirmed") break; // definitive failure
      }
      if (!ok) setUnconfirmed(true);
      else {
        // Prove ownership of the paying wallet, then redeem → issue an agent key.
        const from = account || (await connect());
        const signature = await signClaim(hash, from);
        const s = await fetch("/api/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txHash: hash, signature }) }).then((r) => r.json()).catch(() => null);
        if (s?.key) setSub({ key: s.key, plan: s.plan, expiresAt: s.expiresAt });
        else if (s?.error) setError(s.detail || s.error);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
      setError(msg === "[object Object]" ? "Wallet request failed or was rejected." : msg);
      setStatus("error");
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

      {hasWallet === false ? (
        <div className="mt-5 rounded-lg border border-review/30 bg-review/5 p-3 text-sm text-review">
          No crypto wallet detected in this browser. Install{" "}
          <a href="https://www.coinbase.com/wallet/downloads" target="_blank" rel="noreferrer" className="underline">Coinbase Wallet</a>{" "}
          or <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="underline">MetaMask</a>, then reload.
          <p className="mt-1 text-xs text-slate-500">On mobile, open warden402.xyz inside your wallet app&apos;s browser.</p>
        </div>
      ) : !account ? (
        <button onClick={onConnect} disabled={connecting}
          className="mt-5 w-full rounded-lg border border-warden bg-warden/10 px-4 py-3 text-sm font-semibold text-warden transition hover:bg-warden/20 disabled:opacity-50">
          {connecting ? "Opening wallet…" : "Connect wallet"}
        </button>
      ) : (
        <>
          <div className="mt-4 text-xs text-slate-500">connected: <span className="font-mono text-slate-300">{account.slice(0, 6)}…{account.slice(-4)}</span></div>
          <button onClick={onPay} disabled={status === "paying"}
            className="mt-2 w-full rounded-lg bg-warden px-4 py-3 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50">
            {status === "paying" ? "Confirm in your wallet…" : `Pay ${token} on Base`}
          </button>
        </>
      )}

      {status === "success" && (
        <div className={`mt-4 rounded-lg border p-3 text-sm ${verified ? "border-clear/30 bg-clear/5 text-clear" : unconfirmed ? "border-block/30 bg-block/5 text-block" : "border-review/30 bg-review/5 text-review"}`}>
          {verified
            ? `On-chain confirmed ✓ ${verified.amount} ${verified.token} received.`
            : unconfirmed
            ? "Not confirmed. The transaction may have failed or reverted (e.g. insufficient balance) — no plan was activated."
            : "Transaction submitted — confirming on-chain…"}{" "}
          <a href={explorerTx(txHash)} target="_blank" rel="noreferrer" className="underline">View on BaseScan</a>
          {verified && !sub && <p className="mt-1 text-xs text-slate-400">Activating your plan…</p>}
        </div>
      )}
      {sub && (
        <div className="mt-3 rounded-lg border border-warden/40 bg-warden/5 p-3 text-sm">
          <div className="text-warden">Plan active: <span className="font-semibold uppercase">{sub.plan}</span> · until {new Date(sub.expiresAt).toLocaleDateString("en-US")}</div>
          <div className="mt-2 text-xs uppercase tracking-widest text-slate-500">Your agent key — store it</div>
          <code className="mt-1 block break-all rounded bg-ink p-2 font-mono text-xs text-warden">{sub.key}</code>
          <p className="mt-1 text-xs text-slate-500">Use it as <span className="text-slate-300">x-warden-agent-key</span> on /api/v1/check.</p>
        </div>
      )}
      {status === "error" && <div className="mt-4 rounded-lg border border-block/30 bg-block/5 p-3 text-sm text-block">{error}</div>}

      <p className="mt-3 text-[11px] text-slate-600">
        Connects your wallet (MetaMask / Coinbase Wallet), switches to Base, and sends {token} directly. No custody, no card.
      </p>
    </div>
  );
}
