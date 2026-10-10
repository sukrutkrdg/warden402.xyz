export const dynamic = "force-dynamic";

// Served at /llms.txt (via rewrite) — a machine-readable pointer for AI agents.
export function GET() {
  const body = `# Warden — warden402.xyz

Pre-execution security & trust layer for agents transacting on Base.
Give a token, transaction or address -> block / review / clear, before you act.

## Why
Agents with wallets are a new attack surface. Warden checks BEFORE an agent signs:
tokens you can't sell (live sell simulation), owner rug powers, wallet holder
concentration, drain approvals (unlimited approve/permit/setApprovalForAll — blocked
outright when the spender is a plain wallet), address poisoning, OFAC sanctions and
sanctioned-counterparty exposure, low-liquidity rugs. When an approval is too broad
it returns an exact-amount alternative. Deterministic rules over on-chain data, no LLM
in the decision path; a missing critical signal can never produce "clear".

## For agents (free)
- MCP server: npx -y warden402-mcp   (tools: guard_token, guard_tx, guard_address; + firewall_check, firewall_status with WARDEN_AGENT_KEY)
- HTTP: GET https://warden402.xyz/api/guard?type=token&address=0x...
- HTTP: POST https://warden402.xyz/api/guard  {"type":"tx","from":"0x","to":"0x","calldata":"0x.."}
- SDK: npm install warden402-sdk  (warden.token / warden.tx / warden.address / warden.protect / warden.firewall)

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
