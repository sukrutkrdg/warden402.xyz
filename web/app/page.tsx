import { GuardDemo } from "./components/GuardDemo";

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="space-y-5 pt-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-edge bg-panel px-3 py-1 text-xs text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-warden" /> Base · x402 · agent security
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
          <span className="text-warden">block / review / clear</span> before your agent signs.
        </h1>
        <p className="max-w-2xl text-slate-400">
          Warden is the pre-execution security layer for agents transacting on Base. Give it a
          token, a pending transaction or an address — and collapse honeypots, unlimited
          allowances, sanctions, liquidity and holder concentration into a single decision.
          Decisions are deterministic; the LLM only explains them.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm uppercase tracking-widest text-slate-500">Live demo — token · address · transaction</h2>
        <GuardDemo />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { t: "Deterministic decisions", d: "The decision and risk score come from fixed rules. The LLM never touches the verdict — it only writes the plain-language rationale. Fully auditable." },
          { t: "Fails safe", d: "If a security signal can't be fetched, it never returns a false 'clear' — it degrades to 'review' at worst." },
          { t: "Provable track record", d: "Every verdict is snapshotted and its outcome re-measured. We show, in numbers, the rugs we flagged before they rugged." },
        ].map((c) => (
          <div key={c.t} className="rounded-xl border border-edge bg-panel/60 p-5">
            <h3 className="font-semibold text-white">{c.t}</h3>
            <p className="mt-2 text-sm text-slate-400">{c.d}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-slate-500">For agents — API & MCP</h2>
        <div className="rounded-xl border border-edge bg-panel/60 p-5 text-sm">
          <pre className="overflow-x-auto text-slate-300">
{`# token guard
curl "https://warden402.xyz/api/guard?type=token&address=0x..."

# pre-sign (pending transaction)
curl -X POST https://warden402.xyz/api/guard \\
  -H "content-type: application/json" \\
  -d '{"type":"tx","from":"0x..","to":"0x..","calldata":"0x095ea7b3..."}'`}
          </pre>
        </div>
      </section>
    </div>
  );
}
