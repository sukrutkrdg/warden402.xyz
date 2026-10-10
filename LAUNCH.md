# Warden — launch & listing kit

Copy-paste content for every listing. Updated 2026-10-10 for SDK/MCP 0.2.0.

## What to say (one paragraph, reuse everywhere)

Warden is a pre-execution security layer for AI agents that hold a wallet on
Base. Before the agent buys a token, signs a transaction or pays an address, it
asks Warden and gets **block · review · clear** with the reasons — and, when
there is one, the safer thing to sign instead. Per agent, a **Firewall**
enforces a spending policy: **allow · hold · deny**. Decisions are deterministic
rules over on-chain data — no LLM in the decision path — and every verdict is
logged to a public track record.

What it catches today:
- **Tokens you can't sell** — a live sell simulation from a real holder, not just a honeypot flag
- **Latent rug powers** — owner can mint, set balances, blacklist, swap the contract logic
- **Real dump risk** — holder concentration in wallets, with LP / CEX / burn addresses excluded
- **Wallet drains** — unlimited approve / permit / Permit2 / setApprovalForAll; an unlimited approval to a plain wallet (not a contract) is blocked outright
- **Address poisoning** — a recipient that looks like someone the wallet really pays
- **Sanctions** — OFAC-listed addresses and wallets that transact with them
- **Pre-sign simulation** — the tx reverts, or calls an address with no code

Firewall policy per agent: per-call / hourly / daily spend caps, allow & deny
lists, unlimited approvals banned, first payment to a new counterparty held for
a human, rate limit, kill switch, audit log, webhook.

Numbers you can quote (check live before posting):
- https://warden402.xyz/api/track-record — total verdicts (2,349 on 2026-10-10)
- Guard: 50 free checks per IP per day, then x402 pay-per-call ($0.01 token/address, $0.02 tx)
- Firewall: free plan = 1 agent, 1,000 checks/month · Starter $49 · Team $299

## Status

| Channel | Status |
|---|---|
| llms.txt, /.well-known/mcp.json, /.well-known/x402, farcaster.json | ✅ live |
| npm `warden402-sdk` 0.2.0 | ✅ published |
| npm `warden402-mcp` 0.2.0 | ✅ published |
| MCP Registry `io.github.sukrutkrdg/warden402-mcp` 0.2.0 | ✅ latest |
| awesome-x402 (#685) | ✅ merged |
| awesome-mcp-servers (#9033) | ❌ closed without merge — resubmit (section 6) |
| Smithery | ⏳ check / submit (section 3) |
| base.dev Mini App | ⏳ submit (section 4) |
| Product Hunt, X, Farcaster, Show HN, Reddit, directories | ⏳ not posted |

Suggested order: Smithery + awesome-mcp resubmit (passive discovery) → X thread
+ Farcaster the same day → Show HN on a weekday morning US time → Product Hunt
when there's a first user quote to put in the first comment.

## 1. Machine discovery (live)
- https://warden402.xyz/llms.txt
- https://warden402.xyz/.well-known/mcp.json
- https://warden402.xyz/.well-known/x402
- https://warden402.xyz/.well-known/farcaster.json

## 2. MCP Registry (done — for the next release)
```bash
cd mcp
mcp-publisher login github && mcp-publisher publish
```
Bump `version` in both `package.json` and `server.json`, `npm publish` first.

## 3. Smithery.ai
https://smithery.ai → Add server → connect `sukrutkrdg/warden402.xyz`, point it
at the `mcp` directory. `smithery.yaml` is ready; the agent key is an optional
config field (guard tools work without it).

## 4. base.dev — Mini App
Submit the Mini App (manifest already live). Category: developer-tools.
App id already embedded: 6a417fdf76506a652317fb64.

## 5. Product Hunt
- **Name:** Warden
- **Tagline (≤60):** A firewall for AI agents that hold a wallet
- **Description (≤260):**
  Before your agent buys a token, signs a tx or pays an address, Warden returns
  block / review / clear — with a live sell simulation, drain-approval and
  address-poisoning checks. Per-agent spend policy on top. Free MCP + SDK.
- **First comment:**
  Hi PH 👋 I build on Base, and agents with wallets scare me: one tricked
  approval drains everything, and "is this token safe?" usually means a
  honeypot flag that misses tokens you simply can't sell.

  Warden runs before every action:
  • token → we simulate an actual sell from a real holder
  • tx → we decode it; an unlimited approval to a plain wallet is blocked, and
    when an approval is too broad we hand back an exact-amount alternative
  • address → sanctions, sanctioned-counterparty exposure, look-alike recipients

  The decision is deterministic rules over on-chain data — no LLM deciding
  whether your money moves — and every verdict goes to a public track record.

  Try it in 30 seconds: `npx -y warden402-mcp` in Claude / Cursor, or
  `npm install warden402-sdk`. Running a fleet? Get an agent key at
  warden402.xyz/onboard for spend caps, holds and an audit log.

  I'd love to hear what your agents do that you'd want checked.
- **Topics:** Developer Tools, Crypto, Artificial Intelligence, Security
- **Links:** warden402.xyz · github.com/sukrutkrdg/warden402.xyz · npmjs.com/package/warden402-sdk

## 6. Awesome-list PRs
- **awesome-mcp-servers** (punkpeye/awesome-mcp-servers) — #9033 was closed
  unmerged. Read the maintainer's comment / CONTRIBUTING first (they often
  require alphabetical order, the exact emoji legend for language + scope, and
  a Glama listing), then resubmit under 🔒 Security:
  `- [sukrutkrdg/warden402-mcp](https://github.com/sukrutkrdg/warden402.xyz) 📇 ☁️ - Pre-execution security for AI agents on Base: check a token, tx or address (block/review/clear) and enforce a per-agent spend firewall.`
- **awesome-x402** — done (#685).
- **awesome-ai-agents / awesome-agents** (where a security or infra section exists):
  `- [Warden](https://warden402.xyz) - Firewall for AI agents that hold a wallet: pre-sign checks (sell simulation, drain approvals, address poisoning) and per-agent spend policy.`

## 7. X / Twitter thread
1/ AI agents are getting wallets. One tricked approval and the wallet is empty.

   Warden is a firewall that runs BEFORE your agent signs. 🛡️
   warden402.xyz

2/ Give it a token, a pending tx or an address → block · review · clear, with reasons.

   No LLM decides. Deterministic rules over on-chain data, every verdict on a public track record.

3/ Token: "no honeypot flag" ≠ sellable.
   Warden simulates an actual sell from a real holder, then checks owner powers (mint, set balances, blacklist, upgrade) and real wallet concentration.

4/ Tx: we decode the calldata.
   Unlimited approve / permit / setApprovalForAll to a plain wallet → BLOCK.
   Too broad to a contract → review + the exact-amount approval to sign instead.

5/ Paying someone? Address-poisoning check: is this recipient a look-alike of an address you actually pay?
   Plus OFAC, and exposure to sanctioned counterparties.

6/ Running a fleet? Per-agent policy: spend caps, allow/deny, new-counterparty hold for a human, kill switch, audit log.
   Free key → warden402.xyz/onboard

7/ 30-second install:
   MCP: npx -y warden402-mcp
   SDK: npm install warden402-sdk
   Fail-closed: no verdict = don't proceed.

   Built on Base, x402-native. Feedback welcome 🙏 @sukrutkrdg

## 8. Farcaster cast
Shipped Warden 0.2 🛡️ — a firewall for agents that hold a wallet on Base.

Before your agent signs: live sell simulation, drain-approval block, address-poisoning check → block · review · clear.
Per-agent spend policy on top.

npx -y warden402-mcp · npm i warden402-sdk
warden402.xyz

## 9. Show HN / Reddit
- **Show HN title:** Show HN: Warden – a firewall for AI agents that hold a wallet
- **Body:**
  Agents that hold a wallet are a new attack surface: one unlimited approval
  signed on a phishing page drains it, and the usual "is this token safe?" API
  returns a honeypot flag that misses tokens you just can't sell.

  Warden sits before every on-chain action on Base and returns
  block/review/clear with the reasons:
  - tokens: a sell is simulated from a real holder; owner powers (mint, set
    balances, blacklist, upgradeable logic); holder concentration with LP/CEX/burn
    excluded; LP lock; deployer reputation; OFAC
  - transactions: calldata decoded (approve/permit/Permit2/setApprovalForAll,
    multicall-wrapped calls degrade to review), eth_call simulation, an unlimited
    approval to an address with no code is blocked; when an approval is too
    broad it returns an exact-amount alternative
  - addresses: OFAC, exposure to sanctioned counterparties, look-alike
    (address-poisoning) recipients

  Design choices: decisions are deterministic rules (no LLM in the path); if a
  critical signal is missing the verdict can't be "clear", only "review"; the
  SDK and MCP are fail-closed (no verdict → throw / "do not proceed"). Every
  verdict goes to a public track record that is re-checked later for rugs.

  On top there's a per-agent Firewall: spend caps per call/hour/day,
  allow/deny lists, a human hold on the first payment to a new counterparty,
  kill switch, audit log.

  Free: MCP (`npx -y warden402-mcp`), SDK (`npm install warden402-sdk`),
  50 guard calls/day per IP, then x402 pay-per-call. Code:
  github.com/sukrutkrdg/warden402.xyz — I'd value criticism of the detection
  rules most.
- **Reddit** (r/ethdev, r/BaseChain, r/AI_Agents, r/CryptoDevs) — title:
  "I built a pre-sign firewall for AI agents with wallets (sell simulation, drain-approval block, address poisoning) — free MCP/SDK, feedback wanted". Body: the Show HN body.
  Read each sub's self-promo rules first; r/ethdev prefers a technical angle
  (lead with the detection rules, not the product).

## 10. Directories
- theresanaiforthat.com (AI tool)
- aiagentsdirectory.com
- glama.ai/mcp/servers (also helps the awesome-mcp-servers PR)
- x402scan.com / x402.direct (x402 ecosystem)
- Coinbase Agentic.Market (list as a safety tool)
