/**
 * bazaarClient — Warden'ın TEK Bazaar erişim noktası.
 * Buradaki tek dosyayı değiştirerek yarın in-process'e ya da başka bir
 * veri kaynağına geçebilirsin. Tüm ağ riski (timeout, hata, ücret) burada yönetilir.
 *
 * internal-auth: X-Warden-Internal header'ı ile Bazaar'ın x402 ödeme duvarı
 * atlanır → Warden kendi kendine fatura kesmez.
 */

const BASE_URL = process.env.BAZAAR_BASE_URL ?? "https://402.com.tr";
const INTERNAL_SECRET = process.env.BAZAAR_INTERNAL_SECRET ?? "";
const TIMEOUT_MS = Number(process.env.BAZAAR_TIMEOUT_MS ?? 4000);

export interface BazaarResult<T> {
  ok: boolean;          // false => çağrı düştü → sinyal 'unknown' olmalı
  data?: T;
  status?: number;
  error?: string;
  cached?: boolean;
}

// Basit in-memory TTL cache (aynı adres için tekrar çağrıları kıs).
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: BazaarResult<unknown> }>();

function cacheKey(path: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return `${path}?${q}`;
}

/**
 * Bazaar'dan tek bir endpoint çağır. Hata/timeout ASLA throw etmez —
 * { ok:false } döner, böylece üst katman sinyali 'unknown' yapar (degrade).
 */
export async function bazaarGet<T = unknown>(
  path: string,
  params: Record<string, string>,
): Promise<BazaarResult<T>> {
  const key = cacheKey(path, params);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ...(hit.value as BazaarResult<T>), cached: true };
  }

  const url = `${BASE_URL}${path}?${new URLSearchParams(params).toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        // internal-auth: ödeme duvarını atla
        ...(INTERNAL_SECRET ? { "X-Warden-Internal": INTERNAL_SECRET } : {}),
      },
      signal: controller.signal,
    });

    // 402 => ödeme istendi: internal-auth çalışmıyor demektir. Sinyali 'unknown' bırak,
    // ama net bir hata ver ki yapılandırmayı görelim. (Asla otomatik ödeme YAPMA.)
    if (res.status === 402) {
      const result: BazaarResult<T> = {
        ok: false,
        status: 402,
        error: "Bazaar 402 — internal-auth not active (BAZAAR_INTERNAL_SECRET?)",
      };
      cache.set(key, { at: Date.now(), value: result });
      return result;
    }

    if (!res.ok) {
      const result: BazaarResult<T> = { ok: false, status: res.status, error: `HTTP ${res.status}` };
      cache.set(key, { at: Date.now(), value: result });
      return result;
    }

    const data = (await res.json()) as T;
    const result: BazaarResult<T> = { ok: true, status: res.status, data };
    cache.set(key, { at: Date.now(), value: result });
    return result;
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: aborted ? `timeout>${TIMEOUT_MS}ms` : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
