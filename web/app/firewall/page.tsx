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

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-slate-500">Live playground</h2>
        <p className="text-xs text-slate-500">Flip the policy, fire an action, watch <span className="text-clear">allow</span> · <span className="text-review">hold</span> · <span className="text-block">deny</span> and the budget move in real time.</p>
        <FirewallPlayground />
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
