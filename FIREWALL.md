# Warden Firewall — policy gateway for agent value flow

The north-star product. A policy gate that sits in front of an agent's outbound
**value movements** (x402 payments + onchain transactions). The agent asks the
firewall before it acts; the firewall returns **allow · hold · deny** with reasons
and live budget state, and writes everything to an audit log.

> Guard answers "is this target safe?". The Firewall answers "is this agent
> allowed to do this, right now, within budget, given everything it has already done?"

## Why nothing like this exists yet

Agents with wallets are a brand-new attack surface. Today nobody enforces:
- spend caps per agent / per counterparty / per time window
- allow/deny by trust score and category
- drain protection (unlimited approvals, approve→transfer to a fresh address)
- prompt-injection-driven wallet draining
- a kill switch + auditable record for a fleet of agents

Warden already produces the **verdict** (Guard). The Firewall turns that verdict
plus per-agent policy and spend history into an enforceable decision.

## Decision model

Input: an agent identity (API key) + an intended `action`.

```
action = x402_payment { to, amountUsd, endpoint?, chainId? }
       | tx           { from, to, calldata, value?, chainId? }
```

Output: `allow | hold | deny` + reasons + Guard verdict + budget state + auditId.
- **allow** — within policy; firewall records the spend and forwards/permits.
- **hold** — needs human approval (e.g. new counterparty, review verdict, anomaly).
- **deny** — hard violation (kill switch, deny-list, unsafe target, over budget, drain).

### Evaluation order (deterministic)
1. `paused` (kill switch) → **deny** KILL_SWITCH
2. rate limit (calls/min) → **deny** RATE_LIMITED
3. deny-list match → **deny** DENYLISTED
4. Guard verdict on the target:
   - `block` → **deny** UNSAFE_TARGET
   - `review` → **hold** TARGET_REVIEW (if policy.blockOnReview)
5. tx drain protection:
   - unlimited approval + `denyUnlimitedApprovals` → **deny** UNLIMITED_APPROVAL
   - approvals/hour exceeded → **hold** APPROVAL_RATE
6. spend caps:
   - amount > per-call cap → **deny** OVER_PER_CALL
   - hour/day projected over cap → **deny** OVER_HOURLY / OVER_DAILY
7. novelty: unseen counterparty + `holdOnNewCounterparty` → **hold** NEW_COUNTERPARTY
8. anomaly: spend spike vs recent baseline → **hold** ANOMALY_SPIKE
9. allow-list match short-circuits novelty/anomaly holds (but never bypasses deny,
   verdict-block, or spend caps)
10. else → **allow** (and commit spend + mark counterparty seen)

## Policy (policy-as-code)

```jsonc
{
  "agentId": "agent_trader_1",
  "paused": false,
  "maxPerCallUsd": 25,
  "maxPerHourUsd": 100,
  "maxPerDayUsd": 500,
  "maxCallsPerMinute": 30,
  "allow": ["0x..."],            // counterparties that skip novelty/anomaly holds
  "deny":  ["0x..."],            // always denied
  "minVerdict": "review",        // worst acceptable Guard verdict (block always denied)
  "blockOnReview": true,         // 'review' verdict → hold instead of allow
  "denyUnlimitedApprovals": true,
  "maxApprovalsPerHour": 5,
  "holdOnNewCounterparty": true,
  "anomalyMultiplier": 5         // call > N× recent median spend → hold
}
```

## Endpoints

| Endpoint | What |
|----------|------|
| `POST /firewall/check` | Evaluate an intended action (advisory). Header `x-warden-agent-key`. |
| `GET  /firewall/state` | Agent's live budget + recent counterparties. |
| `GET  /firewall/audit` | Recent decisions for the agent (audit trail). |
| `POST /firewall/agents` | Register/update an agent + policy (admin). |

## Roadmap
- v1 (this): identity, policy engine, spend tracker, drain/anomaly, /check, audit. In-memory store.
- v2: proxy mode (`/firewall/proxy`) — route the real x402 call through; gate + forward.
- v3: Postgres/KV store, dashboard, Cloudflare Worker edge deploy, webhook approvals.
