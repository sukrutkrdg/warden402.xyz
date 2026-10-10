/**
 * warden402-sdk
 * Pre-execution security for agents on Base. Wrap any token / tx / address in
 * block · review · clear before the agent acts.
 *
 *   const warden = new Warden();
 *   const v = await warden.token("0x...");
 *   if (v.decision === "block") throw new Error("unsafe");
 *
 *   // or as a one-line gate (throws on block):
 *   await warden.assertSafe(() => warden.token("0x..."));
 *
 * Fail-closed: any answer that isn't a verdict (quota exhausted, bad input,
 * network error) throws WardenError — it is never read as "safe".
 */

export type Decision = "block" | "review" | "clear";

export interface SignalResult {
  category: string;
  status: "ok" | "warn" | "fail" | "unknown";
  weight?: number;
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
  /** Concrete next steps when the verdict isn't clear (e.g. sign an exact-amount approval instead). */
  remediation?: string[];
}

export type FirewallDecision = "allow" | "hold" | "deny";

export interface FirewallAction {
  /** "x402_payment" (default) for a payment, "tx" for a transaction to sign. */
  kind?: "x402_payment" | "tx";
  to: string;
  amountUsd?: number;
  from?: string;
  calldata?: string;
  chainId?: number;
}

export interface FirewallResult {
  auditId: string;
  agentId: string;
  decision: FirewallDecision;
  reasons: string[];
  detail: string;
  verdict?: Verdict;
  budget?: {
    perCallCapUsd: number;
    hourSpentUsd: number;
    hourRemainingUsd: number;
    daySpentUsd: number;
    dayRemainingUsd: number;
    approvalsThisHour: number;
  };
  committed?: boolean;
  issuedAt?: string;
}

export interface Hold {
  holdId: string;
  action: FirewallAction;
  reasons: string[];
  amountUsd: number;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
}

export interface WardenOptions {
  /** API root. Default https://warden402.xyz/api */
  baseUrl?: string;
  /** Agent key (wk_...) from https://warden402.xyz/onboard — needed for firewall / holds / state. */
  agentKey?: string;
  /** Which guard decisions throw in enforce()/assertSafe(). Default: ["block"]. */
  blockOn?: Decision[];
  /** Extra headers on every request, e.g. an x402 payment header once the free quota is used. */
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** The API did not return a usable answer (HTTP error, quota, bad input, timeout). Never treat as safe. */
export class WardenError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) {
    super(message);
    this.name = "WardenError";
  }
}

export class WardenBlockedError extends Error {
  constructor(public verdict: Verdict) {
    super(`Warden ${verdict.decision.toUpperCase()}: ${verdict.summary}`);
    this.name = "WardenBlockedError";
  }
}

export class FirewallBlockedError extends Error {
  constructor(public result: FirewallResult) {
    super(`Firewall ${result.decision.toUpperCase()}: ${result.detail} [${result.reasons.join(", ")}]`);
    this.name = "FirewallBlockedError";
  }
}

const DECISIONS = new Set(["block", "review", "clear"]);
const FW_DECISIONS = new Set(["allow", "hold", "deny"]);

export class Warden {
  private baseUrl: string;
  private agentKey?: string;
  private blockOn: Decision[];
  private headers: Record<string, string>;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(opts: WardenOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "https://warden402.xyz/api").replace(/\/$/, "");
    this.agentKey = opts.agentKey;
    this.blockOn = opts.blockOn ?? ["block"];
    this.headers = opts.headers ?? {};
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  private async call(path: string, init: RequestInit = {}, okStatuses: number[] = []): Promise<{ status: number; body: any }> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: { accept: "application/json", ...this.headers, ...(init.headers as Record<string, string> | undefined) },
        signal: ctrl.signal,
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok && !okStatuses.includes(res.status)) {
        const why = body?.detail ?? body?.error ?? res.statusText;
        throw new WardenError(`Warden HTTP ${res.status}: ${why}`, res.status, body);
      }
      return { status: res.status, body };
    } catch (e) {
      if (e instanceof WardenError) throw e;
      const aborted = e instanceof Error && e.name === "AbortError";
      throw new WardenError(aborted ? `Warden timeout after ${this.timeoutMs}ms` : `Warden request failed: ${String(e)}`);
    } finally {
      clearTimeout(t);
    }
  }

  private async verdict(path: string, init?: RequestInit): Promise<Verdict> {
    const { status, body } = await this.call(path, init);
    if (!body || !DECISIONS.has(body.decision)) throw new WardenError("Warden returned no verdict", status, body);
    return body as Verdict;
  }

  private key(agentKey?: string): string {
    const k = agentKey ?? this.agentKey;
    if (!k) throw new WardenError("agentKey required — create one at https://warden402.xyz/onboard");
    return k;
  }

  /** Assess a token before buying/selling it. */
  token(address: string, chainId = 8453): Promise<Verdict> {
    const q = new URLSearchParams({ type: "token", address, chainId: String(chainId) });
    return this.verdict(`/guard?${q.toString()}`);
  }

  /** Assess a counterparty address before interacting with it. */
  address(address: string, chainId = 8453): Promise<Verdict> {
    const q = new URLSearchParams({ type: "address", address, chainId: String(chainId) });
    return this.verdict(`/guard?${q.toString()}`);
  }

  /** Assess a pending transaction before signing it. */
  tx(input: { from: string; to: string; calldata?: string; value?: string; chainId?: number }): Promise<Verdict> {
    return this.verdict(`/guard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "tx", ...input }),
    });
  }

  /**
   * Firewall — check an intended action against this agent's policy
   * (spend caps, allow/deny lists, unlimited-approval ban, new-counterparty hold).
   *   const r = await warden.firewall({ to, amountUsd: 5 });
   *   if (r.decision !== "allow") stop();
   */
  async firewall(action: FirewallAction, agentKey?: string): Promise<FirewallResult> {
    // 202 = hold, 403 = deny: both are real decisions, not errors.
    const { status, body } = await this.call(`/v1/check`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-warden-agent-key": this.key(agentKey) },
      body: JSON.stringify({ kind: action.kind ?? "x402_payment", ...action }),
    }, [202, 403]);
    if (!body || !FW_DECISIONS.has(body.decision)) throw new WardenError("Warden firewall returned no decision", status, body);
    return body as FirewallResult;
  }

  /**
   * Middleware: run the action through the Firewall, then call `send` only on
   * "allow". Throws FirewallBlockedError on hold/deny.
   *   await warden.protect({ kind: "tx", to, from, calldata }, () => wallet.sendTransaction(tx));
   */
  async protect<T>(action: FirewallAction, send: () => Promise<T>, agentKey?: string): Promise<T> {
    const r = await this.firewall(action, agentKey);
    if (r.decision !== "allow") throw new FirewallBlockedError(r);
    return send();
  }

  /** Pending holds for this agent (actions waiting for a human approve/reject). */
  async holds(agentKey?: string): Promise<Hold[]> {
    const { body } = await this.call(`/v1/holds`, { headers: { "x-warden-agent-key": this.key(agentKey) } });
    return (body?.holds ?? []) as Hold[];
  }

  /** Approve or reject a held action. An approved counterparty is allowed next time. */
  async resolveHold(holdId: string, action: "approve" | "reject", agentKey?: string): Promise<void> {
    await this.call(`/v1/holds`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-warden-agent-key": this.key(agentKey) },
      body: JSON.stringify({ holdId, action }),
    });
  }

  /** Plan, monthly quota and usage for this agent. */
  async state(agentKey?: string): Promise<{ agentId: string; plan: string; monthlyCap: number; checksUsed: number; checksRemaining: number; expiresAt: string | null; expired: boolean }> {
    const { body } = await this.call(`/v1/state`, { headers: { "x-warden-agent-key": this.key(agentKey) } });
    return body;
  }

  /** Throws WardenBlockedError if the verdict's decision is in blockOn, else returns it. */
  enforce(verdict: Verdict): Verdict {
    if (this.blockOn.includes(verdict.decision)) throw new WardenBlockedError(verdict);
    return verdict;
  }

  /** Run a guard call and enforce it. Throws when unsafe or when no verdict came back. */
  async assertSafe(check: () => Promise<Verdict>): Promise<Verdict> {
    return this.enforce(await check());
  }
}

export default Warden;
