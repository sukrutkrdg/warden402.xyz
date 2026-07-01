import { FirewallPlayground } from "../components/FirewallPlayground";

export const metadata = {
  title: "Warden Firewall — policy gateway for agent value flow",
  description: "Spend caps, allow/deny, drain protection and a kill switch in front of an agent's x402 payments and onchain transactions.",
};

export default function FirewallPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-edge bg-panel px-3 py-1 text-xs text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-warden" /> north star · B2B
        </div>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Firewall — a policy gate for agent value flow</h1>
        <p className="max-w-2xl text-slate-400">
          Guard answers <span className="text-slate-200">&ldquo;is this target safe?&rdquo;</span>. The Firewall answers
          <span className="text-slate-200"> &ldquo;is this agent allowed to do this, right now, within budget, given everything it has already done?&rdquo;</span>
          {" "}Spend caps, allow/deny, drain protection, anomaly detection and a kill switch — every decision audited.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm uppercase tracking-widest text-slate-500">What it&apos;s for</h2>
        <div className="rounded-xl border border-edge bg-panel/60 p-6">
          <p className="text-slate-300">
            Think <span className="text-white">corporate-card controls, but for AI agents that hold a wallet.</span>{" "}
            You give an agent spend limits, approval flows and an expense log — and Warden enforces
            them on every payment and transaction, in real time.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-block/30 bg-block/5 p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-block">Without Warden</div>
              <ul className="space-y-1.5 text-sm text-slate-400">
                <li>· An agent is tricked into an unlimited approval → wallet drained</li>
                <li>· A buggy agent spends $10,000/hour instead of $100</li>
                <li>· A regulator asks for proof — you have no record</li>
              </ul>
            </div>
            <div className="rounded-lg border border-clear/30 bg-clear/5 p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-clear">With Warden</div>
              <ul className="space-y-1.5 text-sm text-slate-400">
                <li>· Spend caps stop the runaway agent at $100</li>
                <li>· Unlimited approvals &amp; sanctioned addresses are blocked automatically</li>
                <li>· Every decision is logged — compliance you can prove</li>
                <li>· A kill switch pauses a misbehaving agent instantly</li>
              </ul>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            For teams running a fleet of agents — trading bots, agent platforms, DeFi automation, funds.
            Losing this means a drained wallet, so it&apos;s where the real value (and pricing) lives.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm uppercase tracking-widest text-slate-500">Live playground</h2>
          <span className="rounded-full border border-edge bg-panel px-2 py-0.5 text-[11px] text-slate-400">demo sandbox</span>
        </div>
        <p className="text-xs text-slate-500">
          A shared, throwaway demo agent — not a real dashboard. Flip the policy, fire an action, watch{" "}
          <span className="text-clear">allow</span> · <span className="text-review">hold</span> · <span className="text-block">deny</span>{" "}
          and the budget move in real time. Real customers get their own isolated agent, key, budget and audit.
        </p>
        <a href="/dashboard" className="inline-block text-xs text-warden underline hover:brightness-110">See the full fleet dashboard →</a>
        <FirewallPlayground />
      </section>

      <section className="flex flex-col items-start gap-3 rounded-xl border border-warden/30 bg-warden/5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Ready to protect a real agent?</h2>
          <p className="mt-1 text-sm text-slate-400">Get a key and gate every action with one call. Free during early access.</p>
        </div>
        <a href="/onboard" className="shrink-0 rounded-lg bg-warden px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-110">Get an agent key →</a>
      </section>

      <section className="rounded-xl border border-edge bg-panel/60 p-5 text-sm">
        <h3 className="mb-2 text-sm uppercase tracking-widest text-slate-500">For agents — API</h3>
        <pre className="overflow-x-auto text-slate-300">
{`curl -X POST https://warden402.xyz/api/firewall \\
  -H "content-type: application/json" \\
  -d '{"action":{"kind":"tx","to":"0x..","from":"0x..","calldata":"0x095ea7b3.."}}'
# → { result: { decision: "deny", reasons: ["UNLIMITED_APPROVAL"], ... } }`}
        </pre>
      </section>
    </div>
  );
}
