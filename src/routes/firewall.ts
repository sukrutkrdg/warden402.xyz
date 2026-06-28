import { Hono } from "hono";
import { z } from "zod";
import { evaluate } from "../firewall/engine.js";
import { recordAudit, readAudit } from "../firewall/audit.js";
import {
  approvalsThisHour,
  daySpent,
  getAgentByKey,
  hourSpent,
  upsertAgent,
} from "../firewall/store.js";

const addr = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "must be a valid EVM address");

const ActionSchema = z.object({
  kind: z.enum(["x402_payment", "tx"]),
  to: addr,
  chainId: z.number().int().positive().optional(),
  amountUsd: z.number().nonnegative().optional(),
  endpoint: z.string().url().optional(),
  from: addr.optional(),
  calldata: z.string().regex(/^0x[a-fA-F0-9]*$/).optional(),
  value: z.string().optional(),
});

export const firewall = new Hono();

function agentKey(c: { req: { header: (k: string) => string | undefined } }) {
  return c.req.header("x-warden-agent-key");
}

/** POST /firewall/check — evaluate an intended action. */
firewall.post("/firewall/check", async (c) => {
  const state = getAgentByKey(agentKey(c));
  if (!state) return c.json({ error: "unknown_agent", detail: "Missing or invalid x-warden-agent-key" }, 401);

  let raw: unknown;
  try { raw = await c.req.json(); } catch { return c.json({ error: "invalid_request", detail: "expected JSON body" }, 400); }
  const parsed = ActionSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);

  const result = await evaluate(state, parsed.data);
  void recordAudit(result, parsed.data);

  // HTTP status mirrors the decision so simple clients can branch on it.
  const status = result.decision === "deny" ? 403 : result.decision === "hold" ? 202 : 200;
  return c.json(result, status);
});

/** Block obvious SSRF targets (localhost / private ranges). */
function isUnsafeUrl(u: string): boolean {
  let url: URL;
  try { url = new URL(u); } catch { return true; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  const h = url.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
  if (h === "::1" || h === "[::1]") return true;
  return false;
}

const ProxySchema = z.object({
  action: ActionSchema,
  forward: z.object({
    url: z.string().url(),
    method: z.enum(["GET", "POST"]).default("GET"),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
  }),
});

/**
 * POST /firewall/proxy — gateway mode.
 * Evaluate the action; only if ALLOW, forward the real call to forward.url and
 * return the upstream response. On hold/deny, nothing is forwarded.
 */
firewall.post("/firewall/proxy", async (c) => {
  const state = getAgentByKey(agentKey(c));
  if (!state) return c.json({ error: "unknown_agent" }, 401);
  let raw: unknown;
  try { raw = await c.req.json(); } catch { return c.json({ error: "invalid_request" }, 400); }
  const parsed = ProxySchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);
  const { action, forward } = parsed.data;

  const result = await evaluate(state, action);
  void recordAudit(result, action);

  if (result.decision !== "allow") {
    const status = result.decision === "deny" ? 403 : 202;
    return c.json({ firewall: result, forwarded: false }, status);
  }

  if (isUnsafeUrl(forward.url)) return c.json({ firewall: result, forwarded: false, error: "unsafe_forward_url" }, 400);

  try {
    const upstream = await fetch(forward.url, {
      method: forward.method,
      headers: forward.headers,
      body: forward.method === "POST" ? forward.body : undefined,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "x-warden-decision": result.decision,
        "x-warden-audit-id": result.auditId,
      },
    });
  } catch (e) {
    return c.json({ firewall: result, forwarded: true, error: "upstream_failed", detail: String(e) }, 502);
  }
});

/** GET /firewall/state — agent's live budget. */
firewall.get("/firewall/state", (c) => {
  const state = getAgentByKey(agentKey(c));
  if (!state) return c.json({ error: "unknown_agent" }, 401);
  const p = state.policy;
  return c.json({
    agentId: p.agentId,
    paused: p.paused,
    policy: p,
    budget: {
      perCallCapUsd: p.maxPerCallUsd,
      hourSpentUsd: Math.round(hourSpent(state) * 100) / 100,
      hourRemainingUsd: Math.round((p.maxPerHourUsd - hourSpent(state)) * 100) / 100,
      daySpentUsd: Math.round(daySpent(state) * 100) / 100,
      dayRemainingUsd: Math.round((p.maxPerDayUsd - daySpent(state)) * 100) / 100,
      approvalsThisHour: approvalsThisHour(state),
    },
  });
});

/** GET /firewall/audit — recent decisions for the agent. */
firewall.get("/firewall/audit", async (c) => {
  const state = getAgentByKey(agentKey(c));
  if (!state) return c.json({ error: "unknown_agent" }, 401);
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  return c.json({ agentId: state.policy.agentId, entries: await readAudit(state.policy.agentId, limit) });
});

/** POST /firewall/agents — register/update an agent + policy (admin). */
const UpsertSchema = z.object({
  key: z.string().min(8),
  agentId: z.string().min(1),
  policy: z.record(z.unknown()).optional(),
});
firewall.post("/firewall/agents", async (c) => {
  const adminToken = process.env.FIREWALL_ADMIN_TOKEN;
  if (adminToken && c.req.header("x-warden-admin") !== adminToken) {
    return c.json({ error: "forbidden" }, 403);
  }
  let raw: unknown;
  try { raw = await c.req.json(); } catch { return c.json({ error: "invalid_request" }, 400); }
  const parsed = UpsertSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);
  const { key, agentId, policy } = parsed.data;
  const saved = upsertAgent(key, { agentId, ...(policy as object) });
  return c.json({ ok: true, policy: saved });
});
