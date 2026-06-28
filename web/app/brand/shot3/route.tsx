import { renderShot } from "../../lib/shot";

export const runtime = "edge";

// Token guard → REVIEW (holder concentration)
export function GET() {
  return renderShot({
    kicker: "TOKEN GUARD",
    decision: "REVIEW",
    risk: 55,
    summary: "Holder concentration is high. Take a closer look.",
    signals: [
      { label: "honeypot", status: "ok", detail: "no honeypot" },
      { label: "holders", status: "fail", detail: "top-10 ~62%" },
      { label: "liquidity", status: "warn", detail: "~$18k, thin" },
      { label: "sanctions", status: "ok", detail: "no OFAC match" },
    ],
    footer: "deterministic decisions, explained in plain language",
  });
}
