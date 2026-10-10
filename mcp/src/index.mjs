#!/usr/bin/env node
/**
 * warden402-mcp
 *
 * MCP stdio server exposing Warden's pre-execution security as agent tools:
 * give it a token / pending transaction / address → block · review · clear.
 * With WARDEN_AGENT_KEY set it also exposes the per-agent Firewall
 * (spend caps, allow/deny, unlimited-approval ban, new-counterparty hold).
 *
 * The agent should call these BEFORE any on-chain action (buy, sign, approve,
 * pay) and not proceed on 'block' / 'deny' / 'hold'.
 *
 * Optional env:
 *   WARDEN_API_URL    – Warden API root (default https://warden402.xyz/api)
 *   WARDEN_AGENT_KEY  – agent key (wk_...) from https://warden402.xyz/onboard; enables firewall tools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = (process.env.WARDEN_API_URL ?? "https://warden402.xyz/api").replace(/\/$/, "");
const AGENT_KEY = process.env.WARDEN_AGENT_KEY?.trim() || undefined;
const VERSION = "0.2.0";
const log = (m) => process.stderr.write(`[warden402-mcp] ${m}\n`);

async function call(path, init = {}) {
  try {
    const res = await fetch(`${API}${path}`, init);
    const data = await res.json().catch(() => undefined);
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, data: { error: String(e) } };
  }
}

// Anything that isn't a verdict (402 quota, 400 bad input, network error) is
// reported as an explicit "do not proceed" — never as an empty, safe-looking answer.
function noAnswer(status, data, what) {
  const why = data?.detail ?? data?.error ?? (status ? `HTTP ${status}` : "network error");
  const hint = status === 402 ? " Free daily quota used up — pay via x402 or retry tomorrow." : "";
  return {
    isError: true,
    content: [{ type: "text", text: `NO ${what} (${why}).${hint} Do NOT proceed with the action.` }],
  };
}

function verdictText({ status, data }) {
  if (!data?.decision) return noAnswer(status, data, "VERDICT");
  const head =
    `DECISION=${String(data.decision).toUpperCase()} risk=${data.riskScore}/100` +
    (data.degraded ? " (degraded)" : "") +
    (data.reasons?.length ? ` reasons=${data.reasons.join(",")}` : "");
  const fix = data.remediation?.length ? `\nREMEDIATION: ${data.remediation.join(" | ")}` : "";
  return { content: [{ type: "text", text: head + fix }, { type: "text", text: JSON.stringify(data, null, 2) }] };
}

function firewallText({ status, data }) {
  if (!data?.decision) return noAnswer(status, data, "FIREWALL DECISION");
  const next =
    data.decision === "allow" ? "Proceed." :
    data.decision === "hold" ? "Do NOT proceed yet — waiting for human approval (warden402.xyz/account)." :
    "Do NOT proceed.";
  const head = `FIREWALL=${String(data.decision).toUpperCase()} reasons=${(data.reasons ?? []).join(",")} — ${data.detail ?? ""} ${next}`;
  return { content: [{ type: "text", text: head }, { type: "text", text: JSON.stringify(data, null, 2) }] };
}

const server = new McpServer({ name: "warden402", version: VERSION });

server.tool(
  "guard_token",
  "Check a Base token contract BEFORE buying or selling it: can it actually be sold (live simulation), honeypot, sell tax, owner powers, liquidity, holder concentration, deployer reputation and OFAC. Returns block/review/clear. Do not buy on 'block'.",
  { address: z.string().describe("Token contract address (0x + 40 hex)"), chainId: z.coerce.number().optional().describe("Chain id (default 8453, Base)") },
  async ({ address, chainId }) => {
    const q = new URLSearchParams({ type: "token", address, ...(chainId ? { chainId: String(chainId) } : {}) });
    return verdictText(await call(`/guard?${q.toString()}`));
  },
);

server.tool(
  "guard_tx",
  "Check a pending transaction BEFORE signing it. Decodes the calldata (unlimited approve, permit, Permit2, setApprovalForAll), simulates it, checks the counterparty (OFAC, contract risk) and address poisoning. Returns block/review/clear plus a safer alternative when there is one. Do not sign on 'block' or 'review'.",
  {
    from: z.string().describe("Sender address"),
    to: z.string().describe("Target contract / address"),
    calldata: z.string().describe("Transaction calldata (0x...)"),
    value: z.string().optional().describe("Value in wei (optional)"),
    chainId: z.coerce.number().optional(),
  },
  async ({ from, to, calldata, value, chainId }) => {
    const body = { type: "tx", from, to, calldata, ...(value ? { value } : {}), ...(chainId ? { chainId } : {}) };
    return verdictText(await call(`/guard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  },
);

server.tool(
  "guard_address",
  "Check a counterparty address BEFORE interacting with or paying it: OFAC sanctions, exposure to sanctioned counterparties, contract risk and identity. Returns block/review/clear.",
  { address: z.string().describe("Address to check (0x + 40 hex)"), chainId: z.coerce.number().optional() },
  async ({ address, chainId }) => {
    const q = new URLSearchParams({ type: "address", address, ...(chainId ? { chainId: String(chainId) } : {}) });
    return verdictText(await call(`/guard?${q.toString()}`));
  },
);

if (AGENT_KEY) {
  const auth = { "x-warden-agent-key": AGENT_KEY };

  server.tool(
    "firewall_check",
    "Check an intended payment or transaction against THIS agent's spending policy before executing it (per-call/hourly/daily caps, allow/deny lists, unlimited approvals banned, first payment to a new counterparty held). Returns allow / hold / deny. Only proceed on 'allow'.",
    {
      kind: z.enum(["x402_payment", "tx"]).optional().describe("'x402_payment' (default) for a payment, 'tx' for a transaction to sign"),
      to: z.string().describe("Payee or target contract"),
      amountUsd: z.coerce.number().optional().describe("Amount in USD (payments)"),
      from: z.string().optional().describe("Sender address (tx)"),
      calldata: z.string().optional().describe("Calldata (tx)"),
      chainId: z.coerce.number().optional(),
    },
    async (action) => {
      const body = { kind: action.kind ?? "x402_payment", ...action };
      return firewallText(await call(`/v1/check`, { method: "POST", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify(body) }));
    },
  );

  server.tool(
    "firewall_status",
    "This agent's plan, monthly check quota and the actions currently held for human approval.",
    {},
    async () => {
      const [state, holds] = await Promise.all([call(`/v1/state`, { headers: auth }), call(`/v1/holds`, { headers: auth })]);
      if (!state.data?.agentId) return noAnswer(state.status, state.data, "AGENT STATE");
      const pending = (holds.data?.holds ?? []).filter((h) => h.status === "pending");
      const text = `agent=${state.data.agentId} plan=${state.data.plan} checks ${state.data.checksUsed}/${state.data.monthlyCap} · ${pending.length} held action(s) awaiting approval`;
      return { content: [{ type: "text", text }, { type: "text", text: JSON.stringify({ state: state.data, pendingHolds: pending }, null, 2) }] };
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
log(`ready → ${API}${AGENT_KEY ? " (firewall tools enabled)" : ""}`);
