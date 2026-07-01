# Warden — launch & listing kit

Copy-paste content for every listing. Do them top to bottom.

## 1. Machine discovery (DONE — live on the site)
- https://warden402.xyz/llms.txt
- https://warden402.xyz/.well-known/mcp.json
- https://warden402.xyz/.well-known/farcaster.json

## 2. MCP Registry (official) — you run it
```bash
cd mcp
npx -y @modelcontextprotocol/publisher publish   # or: mcp-publisher publish
```
Uses GitHub auth for the `io.github.sukrutkrdg/*` namespace. `server.json` is ready.

## 3. Smithery.ai
Go to https://smithery.ai → Add server → connect `sukrutkrdg/warden402.xyz`,
point it at the `mcp` directory. `smithery.yaml` is ready (no secrets to configure).

## 4. base.dev — Mini App
Submit the Mini App (manifest already live). Category: developer-tools.
App id already embedded: 6a417fdf76506a652317fb64.

## 5. Product Hunt (biggest one-day spike)
- **Name:** Warden
- **Tagline:** Pre-execution security for AI agents on Base
- **Description:**
  Warden checks a token, transaction or address BEFORE your agent signs — and
  returns block / review / clear. It catches honeypots, unlimited approvals,
  sanctioned counterparties and low-liquidity rugs. Free MCP + SDK for agents;
  a Firewall (spend caps, drain protection, kill switch, audit) for teams
  running a fleet. Deterministic decisions; the LLM only explains.
- **First comment:**
  Agents with wallets are a brand-new attack surface — one bad approval can
  drain a wallet. Warden is the guard that runs before every action. Free for
  agents (npx -y warden402-mcp). Would love feedback from anyone building agents
  on Base. Built by @sukrutkrdg.
- **Topics:** Developer Tools, Crypto, Artificial Intelligence
- **Links:** warden402.xyz · github.com/sukrutkrdg/warden402.xyz

## 6. Awesome-list PRs (GitHub)
Add this line to each list's relevant section, then open a PR:

- **awesome-mcp-servers** (punkpeye/awesome-mcp-servers), Security section:
  `- [warden402-mcp](https://github.com/sukrutkrdg/warden402.xyz) - Pre-execution safety for agents on Base: guard a token/tx/address → block·review·clear.`
- **awesome-x402** (if present):
  `- [Warden](https://warden402.xyz) - Pre-execution security & trust layer for x402 agents on Base.`
- **awesome-ai-agents / awesome-agents**:
  `- [Warden](https://warden402.xyz) - Firewall for AI agents that hold a wallet: spend caps, drain protection, kill switch, audit.`

## 7. X / Twitter (thread)
1/ Agents are getting wallets. One tricked approval can drain them.
   Meet Warden — security that runs BEFORE your agent signs. 🛡️ warden402.xyz
2/ Give it a token, a pending tx, or an address → block · review · clear.
   Honeypots, unlimited approvals, sanctions, rug liquidity — one call.
3/ Free for agents: `npx -y warden402-mcp` (guard_token / guard_tx / guard_address).
   SDK + LangChain too.
4/ Running a fleet? The Firewall adds spend caps, drain protection, a kill
   switch and an audit log — per agent. Get a key: warden402.xyz/onboard
5/ Deterministic decisions (auditable); the LLM only explains. On Base, x402-native.
   Try it → warden402.xyz  · built by @sukrutkrdg

## 8. Farcaster cast
Shipped Warden 🛡️ — pre-execution security for agents on Base.
block · review · clear before your agent signs. Free MCP: npx -y warden402-mcp
Mini App + demo → warden402.xyz

## 9. Show HN / Reddit
- **Show HN title:** Show HN: Warden – a firewall for AI agents that hold a wallet
- **Body:** Agents with wallets are a new attack surface — a single unlimited
  approval can drain a wallet. Warden runs before every action and returns
  block/review/clear (honeypots, approvals, sanctions, rug liquidity). Free MCP
  + SDK for agents; a Firewall (spend caps, drain protection, kill switch, audit)
  for fleets. Deterministic decisions; the LLM only explains. On Base, x402-native.
  Demo + code: warden402.xyz
- **Subreddits:** r/ethdev, r/BaseChain, r/AI_Agents, r/CryptoDevs

## 10. Directories
- theresanaiforthat.com (submit AI tool)
- aiagentsdirectory.com
- x402scan.com / x402.direct (x402 ecosystem)
- Coinbase Agentic.Market (list as a safety tool)
