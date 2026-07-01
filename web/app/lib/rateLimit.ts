/**
 * Simple in-memory per-IP fixed-window rate limiter for the public API routes.
 * Protects upstream (Bazaar) cost + blunts abuse. Per serverless instance — good
 * enough as a first line; swap for Upstash Redis for a global limit later.
 */
const g = globalThis as unknown as { __wardenRL?: Map<string, { count: number; resetAt: number }> };
const buckets = g.__wardenRL ?? (g.__wardenRL = new Map());

export interface RateResult { ok: boolean; remaining: number; retryAfterSec: number }

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, remaining: limit - b.count, retryAfterSec: 0 };
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}
