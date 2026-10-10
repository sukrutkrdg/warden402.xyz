# warden402-mcp

<!-- mcp-name: io.github.sukrutkrdg/warden402-mcp -->

MCP server for **Warden**: pre-execution security for AI agents on Base. The
agent calls it before any on-chain action and doesn't proceed on `block`,
`deny` or `hold`.

## Tools

| Tool | When |
|------|------|
| `guard_token` | Before buying/selling a token: can it be sold (live simulation), honeypot, tax, owner powers, liquidity, holders, deployer, OFAC |
| `guard_tx` | Before signing a transaction: unlimited approve / permit / Permit2 / setApprovalForAll, simulation, counterparty, address poisoning. Suggests a safer alternative |
| `guard_address` | Before paying or interacting with an address: OFAC, sanctioned-counterparty exposure, contract risk, identity |
| `firewall_check` | *With `WARDEN_AGENT_KEY`.* Check a payment/tx against this agent's policy: spend caps, allow/deny, unlimited approvals banned, new counterparty held → `allow · hold · deny` |
| `firewall_status` | *With `WARDEN_AGENT_KEY`.* Plan, monthly quota and actions waiting for human approval |

If Warden can't produce an answer (quota used up, bad input, network error) the
tool returns an error that says **do not proceed** — never an empty result.

## Client config

```json
{
  "mcpServers": {
    "warden402": {
      "command": "npx",
      "args": ["-y", "warden402-mcp"],
      "env": { "WARDEN_AGENT_KEY": "wk_..." }
    }
  }
}
```

- `WARDEN_AGENT_KEY` — optional. Get one free at https://warden402.xyz/onboard. Without it you get the three guard tools.
- `WARDEN_API_URL` — optional, default `https://warden402.xyz/api`.

Guard calls are free up to a daily quota per IP, then x402 pay-per-call
($0.01 token/address, $0.02 tx).

## Run locally

```bash
cd mcp && npm install && node src/index.mjs
```

Also available as a TypeScript SDK: `npm install warden402-sdk`.
