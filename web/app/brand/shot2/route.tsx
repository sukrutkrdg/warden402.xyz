import { renderShot } from "../../lib/shot";

export const runtime = "edge";

// Pre-sign guard → REVIEW (unlimited approval) — the differentiator
export function GET() {
  return renderShot({
    kicker: "PRE-SIGN GUARD",
    decision: "REVIEW",
    risk: 40,
    summary: "Unlimited token allowance detected before signing.",
    signals: [
      { label: "approval", status: "fail", detail: "unlimited ERC20 allowance" },
      { label: "counterparty", status: "ok", detail: "not on OFAC" },
      { label: "contract", status: "ok", detail: "interacted clean" },
    ],
    footer: "catches wallet-draining approvals before they sign",
  });
}
