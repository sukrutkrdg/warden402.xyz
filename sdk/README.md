# warden402-sdk

**Pre-execution security for agents on Base.** Before your agent buys a token,
signs a transaction or pays someone, ask Warden: `block · review · clear` with
the reasons — and enforce a per-agent spending policy (`allow · hold · deny`).

```bash
npm install warden402-sdk
```

## Guard — is this safe?

No key needed (free daily quota per IP, then x402 pay-per-call).

```ts
import { Warden } from "warden402-sdk";

const warden = new Warden();

// Token, before buying/selling: can it be sold, honeypot, tax, owner powers,
// liquidity, holder concentration, deployer reputation, OFAC
const v = await warden.token("0xTOKEN");
if (v.decision === "block") throw new Error(v.summary);

// Pending transaction, before signing: unlimited approve / permit /
// setApprovalForAll, simulation, counterparty, address poisoning
const tv = await warden.tx({ from, to, calldata });
if (tv.decision !== "clear") console.log(tv.reasons, tv.remediation);

// Counterparty address: OFAC, sanctioned-counterparty exposure, contract risk
const av = await warden.address("0xCOUNTERPARTY");

// One-line gate — throws WardenBlockedError on block
await warden.assertSafe(() => warden.token("0xTOKEN"));
```

**Fail-closed:** if Warden can't produce a verdict (quota exhausted, bad input,
network error, timeout) the SDK throws `WardenError` — it never returns
something your code could read as "safe".

## Firewall — is this allowed for *this* agent?

Get an agent key at **https://warden402.xyz/onboard**. Each agent has its own
policy: per-call / hourly / daily spend caps, allow & deny lists, unlimited
approvals banned, first payment to a new counterparty held for a human.

```ts
import { Warden, FirewallBlockedError } from "warden402-sdk";

const warden = new Warden({ agentKey: process.env.WARDEN_AGENT_KEY });

// Wrap the send: it only runs on "allow"
try {
  const receipt = await warden.protect(
    { kind: "tx", to, from, calldata },          // or { to, amountUsd: 5 } for a payment
    () => wallet.sendTransaction(tx),
  );
} catch (e) {
  if (e instanceof FirewallBlockedError) {
    // e.result.decision: "hold" (waiting for approval) | "deny"
    // e.result.reasons:  e.g. ["NEW_COUNTERPARTY"], ["UNLIMITED_APPROVAL"], ["OVER_PER_CALL"]
  }
}

// Or check without executing
const r = await warden.firewall({ to: "0xPAYEE", amountUsd: 5 });

// Human-in-the-loop for held actions (also in the dashboard at /account)
for (const h of await warden.holds()) await warden.resolveHold(h.holdId, "approve");

// Plan and quota
await warden.state(); // { plan, checksUsed, checksRemaining, ... }
```

## LangChain

```ts
import { wardenTools } from "warden402-sdk/langchain";

const tools = await wardenTools();                          // guard_token, guard_address, guard_tx
const tools = await wardenTools({ agentKey: "wk_..." });    // + firewall_check
```

`@langchain/core` and `zod` are optional peer dependencies.

## Options

```ts
new Warden({
  baseUrl: "https://warden402.xyz/api", // default
  agentKey: "wk_...",                   // firewall / holds / state
  blockOn: ["block", "review"],         // what enforce()/assertSafe() throw on (default ["block"])
  headers: { "x-payment": "..." },      // e.g. an x402 payment header after the free quota
  timeoutMs: 10000,
});
```

Also available as an MCP server: `npx -y warden402-mcp`.

MIT · https://warden402.xyz
