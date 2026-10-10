import { GuardDemo } from "./components/GuardDemo";

// Answers to the questions people actually search before wiring an agent to a
// wallet. Rendered on the page and mirrored as FAQPage structured data.
const FAQ = [
  {
    q: "What is pre-execution security for an AI agent?",
    a: "It is a check that runs before an agent signs anything. Warden takes the token, pending transaction or counterparty address the agent is about to touch, collects independent risk signals, and returns one of three answers — block, review or clear — with the reasons behind it. Nothing is signed until that answer comes back.",
  },
  {
    q: "How does Warden detect honeypot tokens and rug pulls on Base?",
    a: "Seven signals per token: honeypot simulation, contract permissions (mint, blacklist, upgradeable proxy), holder concentration, liquidity and LP lock status, deployer reputation, sanctions screening and trading history. Any single hard failure escalates the verdict to at least review, so a token never comes back clear on partial evidence.",
  },
  {
    q: "What stops an agent from approving an unlimited token allowance?",
    a: "Warden decodes the calldata before signing — approve, increaseAllowance, Permit2 and EIP-2612 permit included — and flags any allowance at or above a practical-unlimited floor. An unlimited approval to a plain wallet (an address with no contract code) is blocked outright, and when an approval is too broad Warden returns an exact-amount alternative to sign instead. If the calldata cannot be decoded at all, the verdict degrades to review rather than falsely clearing.",
  },
  {
    q: "Does an LLM make the decision?",
    a: "No. The decision, the risk score and the summary are fully deterministic — fixed rules over the collected on-chain signals, with no language model in the decision path. The same inputs always give the same verdict, so every outcome is reproducible and auditable.",
  },
  {
    q: "What happens if a risk signal is unavailable?",
    a: "It never returns a false clear. A missing or failed signal is marked unknown, the response is flagged degraded, and the verdict falls back to review at worst. Fail-safe beats fail-silent when money is about to move.",
  },
  {
    q: "How do I add Warden to my agent?",
    a: "Three ways, all free to start: the HTTP API at /api/guard, the warden402-mcp MCP server (npx -y warden402-mcp, no API key required), or the SDK (npm install warden402-sdk). Teams running fleets add the Firewall — spend caps, allow and deny lists, drain protection and a kill switch in front of every payment.",
  },
];

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
          token, a pending transaction or an address — a live sell simulation, owner powers, drain
          approvals, address poisoning, sanctions, liquidity and holder concentration collapse into a
          single decision. Deterministic rules over on-chain data; no LLM in the decision path.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm uppercase tracking-widest text-slate-500">Live demo — token · address · transaction</h2>
        <GuardDemo />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { t: "Deterministic decisions", d: "The decision and risk score come from fixed rules over on-chain data — no LLM decides whether money moves. Same input, same verdict. Fully auditable." },
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
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-edge bg-panel/60 p-5 text-sm">
            <div className="mb-2 text-xs uppercase tracking-widest text-slate-500">HTTP API</div>
            <pre className="overflow-x-auto text-slate-300">
{`# token guard
curl "https://warden402.xyz/api/guard?type=token&address=0x..."

# pre-sign (pending transaction)
curl -X POST https://warden402.xyz/api/guard \\
  -H "content-type: application/json" \\
  -d '{"type":"tx","from":"0x..","to":"0x..","calldata":"0x.."}'`}
            </pre>
          </div>
          <div className="rounded-xl border border-edge bg-panel/60 p-5 text-sm">
            <div className="mb-2 text-xs uppercase tracking-widest text-slate-500">MCP server — no keys</div>
            <pre className="overflow-x-auto text-slate-300">
{`{
  "mcpServers": {
    "warden402": {
      "command": "npx",
      "args": ["-y", "warden402-mcp"]
    }
  }
}`}
            </pre>
            <div className="mt-2 text-xs text-slate-500">
              tools: guard_token · guard_tx · guard_address
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-warden/30 bg-warden/5 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Running a fleet of agents?</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              The Firewall puts spend caps, allow/deny, drain protection and a kill switch in
              front of every agent payment and transaction — every decision audited.
            </p>
          </div>
          <a href="/firewall" className="shrink-0 rounded-lg bg-warden px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-110">
            Explore the Firewall →
          </a>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm uppercase tracking-widest text-slate-500">Frequently asked</h2>
        <div className="divide-y divide-edge/60 rounded-xl border border-edge bg-panel/60">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none font-semibold text-white marker:content-none">
                <span className="text-warden group-open:hidden">+ </span>
                <span className="hidden text-warden group-open:inline">− </span>
                {item.q}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{item.a}</p>
            </details>
          ))}
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQ.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: { "@type": "Answer", text: item.a },
              })),
            }),
          }}
        />
      </section>
    </div>
  );
}
