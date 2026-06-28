/**
 * @warden402/sdk
 * Ajanlar için pre-execution güvenlik. Herhangi bir on-chain aksiyondan önce
 * token / tx / address'i block·review·clear ile sarmala.
 *
 *   const warden = new Warden();
 *   const v = await warden.token("0x...");
 *   if (v.decision === "block") throw new Error("unsafe");
 *
 *   // ya da tek satırda kapı:
 *   await warden.assertSafe(() => warden.token("0x..."));  // block ise fırlatır
 */

export type Decision = "block" | "review" | "clear";

export interface SignalResult {
  category: string;
  status: "ok" | "warn" | "fail" | "unknown";
  score: number;
  source: string;
  detail?: string;
}

export interface Verdict {
  verdictId: string;
  decision: Decision;
  riskScore: number;
  confidence: number;
  reasons: string[];
  signals: SignalResult[];
  summary: string;
  degraded: boolean;
  latencyMs: number;
  decoded?: { kind: string; selector: string; unlimited: boolean; approvedAll: boolean };
  counterparty?: string;
}

export interface WardenOptions {
  /** API kökü. Varsayılan https://warden402.xyz/api (Next proxy). Lokal: http://localhost:8787 */
  baseUrl?: string;
  /** Hangi karar fırlatma sayılır. Varsayılan: sadece 'block'. 'review' eklenebilir. */
  blockOn?: Decision[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class WardenBlockedError extends Error {
  constructor(public verdict: Verdict) {
    super(`Warden ${verdict.decision.toUpperCase()}: ${verdict.summary}`);
    this.name = "WardenBlockedError";
  }
}

export class Warden {
  private baseUrl: string;
  private blockOn: Decision[];
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(opts: WardenOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "https://warden402.xyz/api").replace(/\/$/, "");
    this.blockOn = opts.blockOn ?? ["block"];
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 8000;
  }

  private async req(path: string, init?: RequestInit): Promise<Verdict> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, signal: ctrl.signal });
      return (await res.json()) as Verdict;
    } finally {
      clearTimeout(t);
    }
  }

  /** Bir token'ı al-sat öncesi değerlendir. */
  token(address: string, chainId = 8453): Promise<Verdict> {
    const q = new URLSearchParams({ type: "token", address, chainId: String(chainId) });
    return this.req(`/guard?${q.toString()}`);
  }

  /** Bir adresi (counterparty) etkileşim öncesi değerlendir. */
  address(address: string, chainId = 8453): Promise<Verdict> {
    const q = new URLSearchParams({ type: "address", address, chainId: String(chainId) });
    return this.req(`/guard?${q.toString()}`);
  }

  /** Bekleyen bir işlemi imza öncesi değerlendir. */
  tx(input: { from: string; to: string; calldata: string; value?: string; chainId?: number }): Promise<Verdict> {
    return this.req(`/guard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "tx", ...input }),
    });
  }

  /** verdict blockOn listesindeyse WardenBlockedError fırlatır, değilse verdict'i döner. */
  enforce(verdict: Verdict): Verdict {
    if (this.blockOn.includes(verdict.decision)) throw new WardenBlockedError(verdict);
    return verdict;
  }

  /** Bir guard çağrısını çalıştır + enforce et. Güvensizse fırlatır. */
  async assertSafe(check: () => Promise<Verdict>): Promise<Verdict> {
    return this.enforce(await check());
  }
}

export default Warden;
