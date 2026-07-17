/**
 * Minimal structured logging. The codebase swallows failures in `catch {}`
 * blocks (KV, Bazaar, webhooks, sim, crons) — invisible under real traffic.
 * Tag + emit them as single-line JSON so they're greppable in Vercel logs and
 * an operator can tell when KV flaps, Bazaar is down, or a cron silently fails.
 */
export function logError(tag: string, err: unknown, extra?: Record<string, unknown>): void {
  const msg = err instanceof Error ? err.message : String(err);
  try { console.error(JSON.stringify({ lvl: "error", tag, msg, ...extra, at: new Date().toISOString() })); } catch { console.error(`[${tag}] ${msg}`); }
}

export function logWarn(tag: string, msg: string, extra?: Record<string, unknown>): void {
  try { console.warn(JSON.stringify({ lvl: "warn", tag, msg, ...extra, at: new Date().toISOString() })); } catch { console.warn(`[${tag}] ${msg}`); }
}

export function logInfo(tag: string, msg: string, extra?: Record<string, unknown>): void {
  try { console.log(JSON.stringify({ lvl: "info", tag, msg, ...extra, at: new Date().toISOString() })); } catch { console.log(`[${tag}] ${msg}`); }
}
