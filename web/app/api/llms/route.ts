export const dynamic = "force-dynamic";

// Served at /llms.txt (via rewrite) — a machine-readable pointer for AI agents.
export function GET() {
  const body = `# Warden — warden402.xyz

Pre-execution security & trust layer for agents transacting on Base.
Give a token, transaction or address -> block / review / clear, before you act.

## Why
Agents with wallets are a new attack surface. Warden stops honeypots, unlimited
approvals, sanctioned counterparties and low-liquidity rugs BEFORE an agent signs.
Deterministic decisions (auditable); the LLM only explains.

## For agents (free)
- MCP server: npx -y warden402-mcp   (tools: guard_token, guard_tx, guard_address)
- HTTP: GET https://warden402.xyz/api/guard?type=token&address=0x...
- HTTP: POST https://warden402.xyz/api/guard  {"type":"tx","from":"0x","to":"0x","calldata":"0x.."}
- SDK: @warden402/sdk  (warden.token / warden.tx / warden.protect)

## Firewall (for fleets)
A policy gate in front of an agent's value flow: spend caps, allow/deny, drain
protection, kill switch, audit. Get a key: https://warden402.xyz/onboard
POST https://warden402.xyz/api/v1/check  (header x-warden-agent-key)

## Links
- Site: https://warden402.xyz
- GitHub: https://github.com/sukrutkrdg/warden402.xyz
- MCP manifest: https://warden402.xyz/.well-known/mcp.json
- Contact: sukrutkrdg@gmail.com  /  https://x.com/sukrutkrdg
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
