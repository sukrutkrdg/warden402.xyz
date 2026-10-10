# Warden — pre-execution security for AI agents on Base

[![npm warden402-mcp](https://img.shields.io/npm/v/warden402-mcp?label=warden402-mcp)](https://www.npmjs.com/package/warden402-mcp)
[![npm warden402-sdk](https://img.shields.io/npm/v/warden402-sdk?label=warden402-sdk)](https://www.npmjs.com/package/warden402-sdk)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Before your agent buys a token, signs a transaction or pays an address, ask
Warden. You get **`block` · `review` · `clear`** with the reasons, a risk score
and — when there is one — the safer thing to sign instead. On top, a per-agent
**Firewall** enforces a spending policy: **`allow` · `hold` · `deny`**.

Live at **[warden402.xyz](https://warden402.xyz)** · public track record at
[warden402.xyz/track-record](https://warden402.xyz/track-record)

## Quick start

**MCP** (Claude, Cursor, any MCP client) — no key needed:

```json
{
  "mcpServers": {
    "warden402": {
      "command": "npx",
      "args": ["-y", "warden402-mcp"],
      "env": { "WARDEN_AGENT_KEY": "wk_... (optional, enables firewall tools)" }
    }
  }
}
```

Tools: `guard_token`, `guard_tx`, `guard_address`, and with an agent key
`firewall_check`, `firewall_status`. → [mcp/README.md](./mcp/README.md)

**SDK** (TypeScript, fail-closed):

```ts
import { Warden } from "warden402-sdk";
const warden = new Warden({ agentKey: process.env.WARDEN_AGENT_KEY });

await warden.assertSafe(() => warden.token("0xTOKEN"));         // throws on block
await warden.protect({ to: payee, amountUsd: 5 }, () => pay());  // runs only on allow
```

→ [sdk/README.md](./sdk/README.md) (also LangChain tools)

**HTTP**:

```bash
curl "https://warden402.xyz/api/guard?address=0xTOKEN"                 # token
curl "https://warden402.xyz/api/guard?type=address&address=0xADDR"     # address
curl -X POST https://warden402.xyz/api/guard -H 'content-type: application/json' \
  -d '{"type":"tx","from":"0x..","to":"0x..","calldata":"0x.."}'       # transaction
```

50 free guard calls per IP per day, then x402 pay-per-call ($0.01 token/address,
$0.02 tx, USDC on Base). Firewall agent keys: [warden402.xyz/onboard](https://warden402.xyz/onboard)
(free: 1 agent, 1,000 checks/month).

## What it checks

| Target | Signals |
|---|---|
| **Token** | live sell simulation from a real holder (can you get out?), honeypot & taxes, owner powers (mint, set balances, blacklist, upgradeable logic), contract controls, wallet holder concentration (LP / CEX / burn excluded), liquidity, LP lock, deployer reputation, OFAC |
| **Transaction** | calldata decode (approve, increaseAllowance, EIP-2612 permit, Permit2, setApprovalForAll, transfer); approval target (unlimited approval to an address with no code → block); `eth_call` simulation (revert, call to non-contract); counterparty OFAC + contract risk; address poisoning on outgoing transfers. Returns `remediation` — e.g. an exact-amount approval to sign instead |
| **Address** | OFAC, exposure to sanctioned counterparties, contract risk, identity (verified / named / anonymous) |

Signal data comes from the [x402 Bazaar](https://402.com.tr) plus Base RPC.

## How decisions are made

1. **No LLM in the decision path.** Decision, score and summary are deterministic
   rules over the collected signals — same input, same verdict.
2. **Fails safe.** A critical signal that can't be fetched is `unknown` →
   `degraded: true` → the verdict is `review` at worst, never a false `clear`.
   The SDK and MCP are fail-closed too: no verdict → throw / "do not proceed".
3. **Hard blocks** regardless of score: honeypot, sanctioned target, token that
   can't be sold, poisoned look-alike recipient, unlimited approval to a plain wallet.
4. Otherwise: weighted risk ≥ 70 → `block`; any `fail` or risk ≥ 35 or 2+ `warn`s → `review`; else `clear`.
5. **Every verdict is recorded** and re-checked later for rugs — the public track record.

## Firewall (per agent)

Policy-as-code in front of an agent's value flow: per-call / hourly / daily
spend caps, allow & deny lists, unlimited approvals banned, first payment to a
new counterparty held for a human (approve/reject in `/account` or via API),
calls-per-minute limit, anomaly multiplier, kill switch, audit log, webhook on
hold. Team accounts sign in with a wallet (SIWE), with roles and plans.
→ [FIREWALL.md](./FIREWALL.md)

## Repository

| Path | What |
|---|---|
| `web/` | The production site **and** API (Next.js on Vercel): guard, firewall, track record, accounts, x402 payment gate |
| `packages/core/` | Shared verdict schema + calldata decoder (`@warden/core`) |
| `mcp/` | `warden402-mcp` — stdio MCP server |
| `sdk/` | `warden402-sdk` — TypeScript client + LangChain tools |
| `src/` | Optional standalone Hono API (Node host); a drift test keeps its engine identical to `web/` |
| `tests/` | Vitest: decision engine, calldata decoder, firewall policy, drift guard, web signals |

```bash
npm install && npm test                      # unit tests
cd web && cp .env.example .env.local && npm run dev   # site + API on :3000
```

Deploy notes: [DEPLOY.md](./DEPLOY.md).

## License

MIT — see [LICENSE](./LICENSE).
