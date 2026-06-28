/**
 * Guard payment gate.
 *
 * Order for /guard/* routes:
 *   1) payments disabled  → free, unlimited (default)
 *   2) within free quota  → free (N calls/IP/day)
 *   3) quota exhausted    → delegate to x402 paymentMiddleware (402 → pay → settle)
 *
 * The website demo never goes through this (it runs the guard in-process).
 */
import type { Context, MiddlewareHandler } from "hono";
import { paymentMiddleware } from "@x402/hono";
import { NETWORK, getPayConfig } from "./config.js";
import { getResourceServer } from "./server.js";

// ── in-memory per-IP daily free counter ───────────────────────────
const counters = new Map<string, { day: string; used: number }>();
function today() {
  return new Date().toISOString().slice(0, 10);
}
function consumeFree(ip: string, limit: number): { allowed: boolean; remaining: number } {
  const d = today();
  const cur = counters.get(ip);
  if (!cur || cur.day !== d) {
    counters.set(ip, { day: d, used: 1 });
    return { allowed: true, remaining: limit - 1 };
  }
  if (cur.used >= limit) return { allowed: false, remaining: 0 };
  cur.used += 1;
  return { allowed: true, remaining: limit - cur.used };
}

function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return c.req.header("x-real-ip") || "unknown";
}

// ── lazily-built x402 payment middleware (only when enabled) ───────
let payMw: MiddlewareHandler | undefined;
function getPayMw(): MiddlewareHandler {
  if (payMw) return payMw;
  const cfg = getPayConfig();
  const routes = Object.fromEntries(
    Object.entries(cfg.prices).map(([path, price]) => [
      path,
      { accepts: { scheme: "exact" as const, price, network: NETWORK, payTo: cfg.payTo } },
    ]),
  );
  payMw = paymentMiddleware(routes, getResourceServer());
  return payMw;
}

/** Apply to /guard/* routes. */
export const guardPaymentGate: MiddlewareHandler = async (c, next) => {
  const cfg = getPayConfig();
  if (!cfg.enabled) return next(); // free, unlimited (default)

  const ip = clientIp(c);
  const free = consumeFree(ip, cfg.freePerDay);
  if (free.allowed) {
    c.header("x-free-tier", "true");
    c.header("x-free-remaining", String(free.remaining));
    return next();
  }

  // Quota exhausted → require payment via x402.
  return getPayMw()(c, next);
};
