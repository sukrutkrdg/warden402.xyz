import { renderShot } from "../../lib/shot";

export const runtime = "edge";

// Token guard → CLEAR (USDC)
export function GET() {
  return renderShot({
    kicker: "TOKEN GUARD",
    decision: "CLEAR",
    risk: 7,
    summary: "No known risk found. Core security signals are clean.",
    signals: [
      { label: "honeypot", status: "ok", detail: "tax 0% / 0%" },
      { label: "contract", status: "ok", detail: "controls clean" },
      { label: "holders", status: "ok", detail: "top-10 ~25.8%" },
      { label: "liquidity", status: "ok", detail: "~$39.2M, 10 pools" },
      { label: "sanctions", status: "ok", detail: "no OFAC match" },
    ],
    footer: "block · review · clear before your agent signs",
  });
}
