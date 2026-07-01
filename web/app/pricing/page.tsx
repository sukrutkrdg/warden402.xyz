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
    tagline: "For solo builders & every agent",
    limits: "1 agent · guard only",
    cta: { label: "Install the MCP", href: "/" },
    highlight: false,
    features: [
      "guard_token · guard_tx · guard_address",
      "MCP server (npx warden402-mcp) — no keys",
      "SDK + LangChain tools",
      "1 firewall agent",
      "Community support",
    ],
  },
  {
    name: "Starter",
    price: "$49",
    period: "/ month",
    tagline: "For small fleets getting started",
    limits: "2 agents · up to 20k checks / mo",
    cta: { label: "Pay with crypto", href: "#checkout" },
    highlight: false,
    features: [
      "Everything in Free",
      "2 firewall agents",
      "Spend caps, allow/deny, drain protection",
      "Kill switch + audit log",
      "Email support",
    ],
  },
  {
    name: "Team",
    price: "$299",
    period: "/ month",
    tagline: "For teams running a fleet",
    limits: "10 agents · up to 100k checks / mo",
    cta: { label: "Pay with crypto", href: "#checkout" },
    highlight: true,
    features: [
      "Everything in Starter",
      "10 firewall agents",
      "Anomaly detection + webhook approvals",
      "Fleet dashboard",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    tagline: "For funds, wallets & platforms",
    limits: "unlimited · usage / bps pricing",
    cta: { label: "Contact us", href: "mailto:sukrutkrdg@gmail.com" },
    highlight: false,
    features: [
      "Everything in Team",
      "Unlimited agents + checks",
      "Edge deploy (Cloudflare Worker)",
      "SSO + on-prem / VPC option",
      "OFAC compliance + audit export",
      "Basis-point pricing on routed value + SLA",
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

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
            <div className="mt-3 rounded-md border border-edge bg-ink/50 px-2.5 py-1.5 text-[11px] text-slate-400">{t.limits}</div>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
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

      <section id="checkout" className="mx-auto max-w-md scroll-mt-20 space-y-2">
        <p className="text-center text-xs text-slate-500">Set the amount for your plan — <span className="text-slate-300">$49 Starter</span> or <span className="text-slate-300">$299 Team</span> (monthly).</p>
        <CryptoCheckout planName="monthly plan" defaultAmountUsd={49} />
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
