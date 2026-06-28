import Link from "next/link";
import { CryptoCheckout } from "../components/CryptoCheckout";

export const metadata = {
  title: "Warden — Pricing",
  description: "Guard is free for every agent. The Firewall is how teams running fleets pay: spend control, drain protection and audit as a service.",
};

const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "For every agent and solo builder",
    cta: { label: "Install the MCP", href: "/" },
    highlight: false,
    features: [
      "guard_token · guard_tx · guard_address",
      "MCP server (npx warden402-mcp) — no keys",
      "SDK + LangChain tools",
      "Unlimited via the public API*",
      "Community support",
    ],
  },
  {
    name: "Team",
    price: "$299",
    period: "/ month",
    tagline: "For teams running a fleet of agents",
    cta: { label: "Pay with crypto", href: "#checkout" },
    highlight: true,
    features: [
      "Everything in Free",
      "Firewall: unlimited agents + policies",
      "Spend caps, allow/deny, rate limits",
      "Drain protection + anomaly detection",
      "Kill switch + full audit log",
      "Dashboard + webhook approvals",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    tagline: "For funds, wallets and platforms",
    cta: { label: "Contact us", href: "mailto:hello@warden402.xyz" },
    highlight: false,
    features: [
      "Everything in Team",
      "Edge deploy (Cloudflare Worker)",
      "SSO + on-prem / VPC option",
      "OFAC compliance + audit export",
      "Basis-point pricing on routed value",
      "SLA + priority support",
    ],
  },
];

export default function Pricing() {
  return (
    <div className="space-y-10">
      <section className="space-y-3 text-center">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Free to adopt. Pay to run a fleet.</h1>
        <p className="mx-auto max-w-2xl text-slate-400">
          Guard is free for every agent — that is how Warden becomes the default. The Firewall is
          how teams running many agents pay: spend control, drain protection and audit as a service.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {TIERS.map((t) => (
          <div
            key={t.name}
            className={`flex flex-col rounded-2xl border p-6 ${t.highlight ? "border-warden/50 bg-warden/5 ring-1 ring-warden/30" : "border-edge bg-panel/60"}`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{t.name}</h2>
              {t.highlight && <span className="rounded-full bg-warden/15 px-2 py-0.5 text-[11px] text-warden">most popular</span>}
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-white">{t.price}</span>
              <span className="text-sm text-slate-500">{t.period}</span>
            </div>
            <p className="mt-1 text-sm text-slate-400">{t.tagline}</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2 text-slate-300">
                  <span className="text-warden">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href={t.cta.href}
              className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${t.highlight ? "bg-warden text-ink hover:brightness-110" : "border border-edge text-slate-200 hover:border-warden"}`}
            >
              {t.cta.label}
            </Link>
          </div>
        ))}
      </section>

      <section id="checkout" className="mx-auto max-w-md scroll-mt-20">
        <CryptoCheckout planName="Team — monthly" defaultAmountUsd={299} />
      </section>

      <section className="rounded-xl border border-edge bg-panel/60 p-6 text-sm text-slate-400">
        <h3 className="mb-2 font-semibold text-white">Usage-based API (optional)</h3>
        <p>
          *For heavy programmatic use, the API can switch to pay-per-call over x402: a generous free
          tier per day, then ~$0.01–0.02 per call in USDC on Base. Off by default — the public guard
          stays free. The real revenue is the Firewall, where the value (and the risk) lives.
        </p>
      </section>

      <p className="text-center text-xs text-slate-600">
        Prices are indicative while Warden is in early access. Want a tier tuned to your fleet?{" "}
        <a href="mailto:hello@warden402.xyz" className="text-warden underline">Talk to us</a>.
      </p>
    </div>
  );
}
