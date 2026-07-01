# Warden — `warden402.xyz`

**The pre-execution security & trust layer for agents transacting on Base.**

Give Warden a token, a pending transaction, or an address → get a single decision:
**`block` · `review` · `clear`** with reasons, a risk score, and a plain-language summary.

Warden uses the [x402 Bazaar](https://402.com.tr) as its intelligence backend and builds
**judgment**, a **provable track record**, and (next) a **firewall** on top.

## Why

x402 infrastructure is ahead of demand; the missing layer is **trust**. The marketplace
vertical is crowded (Coinbase Bazaar + dozens of clones), but *pre-execution security* is
wide open. Warden owns that vertical.

## What's in here

| Path | What |
|------|------|
| `web/` | **The website** (warden402.xyz) — landing + live demo + track-record. Runs the guard **in-process**, so it deploys as a single Vercel project. |
| `src/` | Standalone **Hono Guard API** (same logic) — for agents/SDK/MCP and a persistent-ledger host. |
| `sdk/` | `@warden402/sdk` — client + `enforce`/`assertSafe` gate + LangChain tools. |
| `mcp/` | `warden402-mcp` — stdio MCP server exposing `guard_token` / `guard_tx` / `guard_address`. |
| `scripts/` | `smoke.ts` (offline decision tests), `probe.ts` (calibration), `recheck.ts` (outcome re-checker). |

## The decision contract (immutable spine)

Every endpoint returns a `Verdict` (`src/schema/verdict.ts`). Principles:

1. **The LLM never touches the verdict.** `decision` and `riskScore` come from deterministic
   rules; the LLM only writes `summary`. Auditable.
2. **Fails safe.** If a Bazaar signal can't be fetched it becomes `unknown` → `degraded:true`
   → the verdict is `review` at worst, never a false `clear`.
3. **Every verdict is snapshotted** (`verdictId` + signal evidence) → the track-record moat.

### Decision rules
- Hard rule: `honeypot` or `sanctions` fail → **block** (regardless of score).
- Weighted-average risk ≥ 70 → **block**; degraded → **review**.
- Any single `fail` (e.g. liquidity collapse) floors the decision at **review** (can't be
  diluted by the average). 2+ `warn`s → **review**. Else **clear**.

## Endpoints

| Endpoint | What it checks |
|----------|----------------|
| `GET /guard/token?address=` | honeypot, taxes, liquidity, holder concentration, OFAC |
| `POST /guard/tx` `{from,to,calldata}` | decodes calldata (unlimited approve / setApprovalForAll), sanctions + contract risk on the counterparty |
| `GET /guard/address?address=` | sanctions, contract risk, age/activity |
| `GET /track-record` | public trust stats (decision mix, hit-rate, rugs caught/missed) |

(The website exposes the same via `/api/guard`.)

## Run locally

```bash
# Single-project site (recommended) — runs guard in-process
cd web && npm install
cp .env.example .env.local   # set BAZAAR_INTERNAL_SECRET
npm run dev                  # http://localhost:3000

# Or the standalone Hono API
npm install
cp .env.example .env         # set BAZAAR_INTERNAL_SECRET
npm run smoke                # offline decision tests
npm run dev                  # http://localhost:8787
```

## Production topology

- **`web/` is the production API + site.** Deployed as a single Vercel project
  (Root Directory = `web`). It runs the guard/firewall **in-process**, so the
  endpoints agents actually call (`/api/guard`, `/api/firewall`) are live here.
  Hot path is **edge-friendly**: KV store (no `fs`) + per-IP rate limiting.
  Persistence turns on when `KV_REST_API_URL` / `KV_REST_API_TOKEN` are set.
- **`src/` (Hono API) is an optional Node host** — for teams that want a
  persistent-disk ledger or the x402 payment layer. Not required; not deployed by
  default. The `src/` modules are the canonical logic; a **drift-guard test**
  (`tests/drift.test.ts`) proves the web copy stays identical.
- **Drift is impossible to ship silently:** `npm test` fails if the two diverge.

## Deploy

See **[DEPLOY.md](./DEPLOY.md)**. TL;DR: new Vercel project, **Root Directory = `web`**,
set `BAZAAR_INTERNAL_SECRET` (+ optional `KV_REST_API_URL`/`KV_REST_API_TOKEN` for
persistent track-record), deploy. Done.

## Bazaar internal-auth

Warden calls Bazaar **without paying** x402 (so our own products don't bill themselves) via
the `X-Warden-Internal` header. Bazaar must have a matching `WARDEN_INTERNAL_SECRET`. Until
set, all signals come back `unknown` and verdicts stay safely at `review`.

## Roadmap

1. ✅ Guard MVP (`/guard/token`) + verdict contract
2. ✅ `/guard/tx` (pre-sign) + `/guard/address` + track-record + re-checker
3. ✅ SDK / MCP / website
4. ⏳ x402 payment layer (free tier → 402) + MCP Registry / Agentic.Market listing
5. ⏳ **Firewall / policy gateway** — sits in front of an agent's x402 + onchain calls:
   spend caps, allow/deny by trust score, anomaly + injection-drain detection, audit log.
   B2B, Cloudflare Worker edge. The north star.
