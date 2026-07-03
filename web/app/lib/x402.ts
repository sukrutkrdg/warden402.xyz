/**
 * x402 payment gate for the public guard API (in-process, Next.js port of src/x402).
 *
 * SAFE DEFAULT OFF: without PAYMENTS_ENABLED=true AND CDP keys the API stays
 * fully free (the website demo always stays free). When enabled:
 *   1) requests carrying a payment header skip the free tier entirely
 *   2) N free calls per IP per day (KV-backed, in-memory fallback)
 *   3) quota exhausted → HTTP 402 with x402 payment requirements; payment is
 *      verified before the handler runs and settled only after it succeeds,
 *      through the Coinbase CDP facilitator on Base mainnet.
 *
 * Env (Vercel): PAYMENTS_ENABLED, CDP_API_KEY_ID, CDP_API_KEY_SECRET,
 *   WARDEN_PAY_TO?, WARDEN_FREE_PER_DAY?, WARDEN_PRICE_TOKEN?, WARDEN_PRICE_TX?
 */
import { NextRequest, NextResponse } from "next/server";
import {
  FacilitatorResponseError,
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createFacilitatorConfig } from "@coinbase/x402";
import { PERSISTENT, kvPipeline } from "./store";
import { clientIp } from "./rateLimit";

const NETWORK = "eip155:8453" as const; // Base mainnet

interface PayConfig {
  enabled: boolean;
  payTo: string;
  cdpApiKeyId?: string;
  cdpApiKeySecret?: string;
  freePerDay: number;
  priceGet: string; // token/address lookups
  pricePost: string; // tx simulation is heavier
}

function getPayConfig(): PayConfig {
  const payTo = process.env.WARDEN_PAY_TO?.trim() || "0x973a31858f4d2125f48c880542da11a2796f12d6";
  const cdpApiKeyId = process.env.CDP_API_KEY_ID?.trim() || undefined;
  const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET?.trim() || undefined;
  const flag = (process.env.PAYMENTS_ENABLED ?? "false").toLowerCase() === "true";
  return {
    enabled: flag && Boolean(payTo && cdpApiKeyId && cdpApiKeySecret),
    payTo,
    cdpApiKeyId,
    cdpApiKeySecret,
    freePerDay: Number(process.env.WARDEN_FREE_PER_DAY ?? 50),
    priceGet: process.env.WARDEN_PRICE_TOKEN ?? "$0.01",
    pricePost: process.env.WARDEN_PRICE_TX ?? "$0.02",
  };
}

// ── daily free counter (KV with in-memory fallback) ───────────────
const g = globalThis as unknown as { __wardenX402Free?: { day: string; used: Map<string, number> } };
function memFree(): { day: string; used: Map<string, number> } {
  const day = new Date().toISOString().slice(0, 10);
  if (!g.__wardenX402Free || g.__wardenX402Free.day !== day) g.__wardenX402Free = { day, used: new Map() };
  return g.__wardenX402Free;
}

async function consumeFree(ip: string, limit: number): Promise<{ allowed: boolean; remaining: number }> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `x402:free:${ip}:${day}`;
  if (PERSISTENT) {
    try {
      const [n] = await kvPipeline([["INCR", key], ["EXPIRE", key, 172_800]]);
      const used = Number(n ?? 0);
      return { allowed: used <= limit, remaining: Math.max(0, limit - used) };
    } catch { /* fall back to memory */ }
  }
  const m = memFree();
  const used = (m.used.get(ip) ?? 0) + 1;
  m.used.set(ip, used);
  return { allowed: used <= limit, remaining: Math.max(0, limit - used) };
}

// ── x402 HTTP resource server (lazy, cached per instance) ─────────
let httpServer: x402HTTPResourceServer | undefined;
let initPromise: Promise<void> | null = null;
let initialized = false;

function getHttpServer(cfg: PayConfig): x402HTTPResourceServer {
  if (httpServer) return httpServer;
  const facilitator = new HTTPFacilitatorClient(createFacilitatorConfig(cfg.cdpApiKeyId!, cfg.cdpApiKeySecret!));
  const server = new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme());
  const accepts = (price: string) => ({ accepts: { scheme: "exact" as const, price, network: NETWORK, payTo: cfg.payTo } });
  httpServer = new x402HTTPResourceServer(server, {
    "GET /api/guard": accepts(cfg.priceGet),
    "POST /api/guard": accepts(cfg.pricePost),
  });
  return httpServer;
}

async function ensureInitialized(server: x402HTTPResourceServer): Promise<void> {
  if (initialized) return;
  if (!initPromise) initPromise = server.initialize();
  try {
    await initPromise;
    initialized = true;
  } catch (e) {
    initPromise = null; // allow retry on the next request
    throw e;
  }
}

// ── NextRequest adapter (mirrors @x402/hono's HonoAdapter) ────────
class NextAdapter {
  constructor(private req: NextRequest) {}
  getHeader(name: string): string | undefined { return this.req.headers.get(name) ?? undefined; }
  getMethod(): string { return this.req.method; }
  getPath(): string { return this.req.nextUrl.pathname; }
  getUrl(): string { return this.req.url; }
  getAcceptHeader(): string { return this.req.headers.get("accept") || ""; }
  getUserAgent(): string { return this.req.headers.get("user-agent") || ""; }
  getQueryParams(): Record<string, string> { return Object.fromEntries(this.req.nextUrl.searchParams); }
  getQueryParam(name: string): string | undefined { return this.req.nextUrl.searchParams.get(name) ?? undefined; }
  async getBody(): Promise<unknown> { return this.req.clone().json().catch(() => undefined); } // clone: the route reads the body too
}

function toNextResponse(r: { status: number; headers: Record<string, string>; body?: unknown; isHtml?: boolean }): NextResponse {
  if (r.isHtml) return new NextResponse(String(r.body ?? ""), { status: r.status, headers: r.headers });
  return NextResponse.json(r.body ?? {}, { status: r.status, headers: r.headers });
}

export type PayGate =
  | { ok: true; freeHeaders?: Record<string, string>; settle?: (res: NextResponse) => Promise<NextResponse> }
  | { ok: false; res: NextResponse };

/**
 * Apply the payment gate to a guard request. Call before doing any work.
 * On `ok`, produce the verdict response, then pass it through `settle` (if set)
 * so the payment is captured only for successful responses.
 */
export async function guardPayGate(req: NextRequest): Promise<PayGate> {
  const cfg = getPayConfig();
  if (!cfg.enabled) return { ok: true }; // free, unlimited (default)

  const paymentHeader = req.headers.get("payment-signature") || req.headers.get("x-payment") || undefined;

  // Free tier only for unpaid requests — paying callers don't burn quota.
  if (!paymentHeader) {
    const free = await consumeFree(clientIp(req), cfg.freePerDay);
    if (free.allowed) return { ok: true, freeHeaders: { "x-free-tier": "true", "x-free-remaining": String(free.remaining) } };
  }

  const server = getHttpServer(cfg);
  try {
    await ensureInitialized(server);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, res: NextResponse.json({ error: "facilitator_unavailable", detail: msg }, { status: 502 }) };
  }

  const context = { adapter: new NextAdapter(req), path: req.nextUrl.pathname, method: req.method, paymentHeader };
  let result: Awaited<ReturnType<x402HTTPResourceServer["processHTTPRequest"]>>;
  try {
    result = await server.processHTTPRequest(context as Parameters<x402HTTPResourceServer["processHTTPRequest"]>[0]);
  } catch (e) {
    if (e instanceof FacilitatorResponseError) return { ok: false, res: NextResponse.json({ error: e.message }, { status: 502 }) };
    throw e;
  }

  switch (result.type) {
    case "no-payment-required":
      return { ok: true };
    case "payment-error":
      return { ok: false, res: toNextResponse(result.response) };
    case "payment-verified": {
      const { cancellationDispatcher, paymentPayload, paymentRequirements, declaredExtensions } = result;
      return {
        ok: true,
        settle: async (res: NextResponse): Promise<NextResponse> => {
          if (res.status >= 400) {
            await cancellationDispatcher.cancel({ reason: "handler_failed", responseStatus: res.status }).catch(() => {});
            return res; // failed handlers are never charged
          }
          const responseBody = Buffer.from(await res.clone().arrayBuffer());
          const responseHeaders: Record<string, string> = {};
          res.headers.forEach((v, k) => { responseHeaders[k] = v; });
          try {
            const settled = await server.processSettlement(paymentPayload, paymentRequirements, declaredExtensions, {
              request: context as Parameters<x402HTTPResourceServer["processHTTPRequest"]>[0],
              responseBody,
              responseHeaders,
            });
            if (!settled.success) return toNextResponse(settled.response);
            Object.entries(settled.headers).forEach(([k, v]) => res.headers.set(k, String(v)));
            return res;
          } catch (e) {
            if (e instanceof FacilitatorResponseError) return NextResponse.json({ error: e.message }, { status: 502 });
            return NextResponse.json({ error: "settlement_failed" }, { status: 402 });
          }
        },
      };
    }
  }
}
