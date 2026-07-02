import { describe, it, expect } from "vitest";
import { decidePolicy, DEFAULT_POLICY, type AgentPolicy, type PolicyCtx } from "../web/app/lib/firewall";

function policy(over: Partial<AgentPolicy> = {}): AgentPolicy {
  return { agentId: "t", ...DEFAULT_POLICY, ...over };
}
function ctx(over: Partial<PolicyCtx> = {}): PolicyCtx {
  return {
    action: { kind: "tx", to: "0x1111111111111111111111111111111111111111" },
    verdict: { decision: "clear" } as PolicyCtx["verdict"],
    isApproval: false, unlimited: false, allowlisted: false,
    callsMin: 1, hourSpent: 0, daySpent: 0, approvalsHour: 0, seen: true,
    ...over,
  };
}

describe("decidePolicy — firewall core", () => {
  it("paused → deny (kill switch)", () => {
    expect(decidePolicy(policy({ paused: true }), ctx()).decision).toBe("deny");
  });
  it("rate limit exceeded → deny", () => {
    expect(decidePolicy(policy({ maxCallsPerMinute: 5 }), ctx({ callsMin: 6 })).reasons).toContain("RATE_LIMITED");
  });
  it("deny-list → deny", () => {
    const to = "0x2222222222222222222222222222222222222222";
    expect(decidePolicy(policy({ deny: [to] }), ctx({ action: { kind: "tx", to } })).reasons).toContain("DENYLISTED");
  });
  it("block verdict → deny (unsafe target)", () => {
    expect(decidePolicy(policy(), ctx({ verdict: { decision: "block" } as PolicyCtx["verdict"] })).reasons).toContain("UNSAFE_TARGET");
  });
  it("unlimited approval → deny", () => {
    expect(decidePolicy(policy(), ctx({ unlimited: true })).reasons).toContain("UNLIMITED_APPROVAL");
  });
  it("over per-call cap → deny", () => {
    expect(decidePolicy(policy({ maxPerCallUsd: 25 }), ctx({ action: { kind: "x402_payment", to: "0x3333333333333333333333333333333333333333", amountUsd: 50 } })).reasons).toContain("OVER_PER_CALL");
  });
  it("would exceed hourly cap → deny", () => {
    expect(decidePolicy(policy({ maxPerHourUsd: 100 }), ctx({ action: { kind: "x402_payment", to: "0x4444444444444444444444444444444444444444", amountUsd: 10 }, hourSpent: 95 })).reasons).toContain("OVER_HOURLY");
  });
  it("new counterparty → hold", () => {
    expect(decidePolicy(policy(), ctx({ seen: false })).decision).toBe("hold");
  });
  it("review verdict with blockOnReview → hold", () => {
    expect(decidePolicy(policy(), ctx({ verdict: { decision: "review" } as PolicyCtx["verdict"] })).decision).toBe("hold");
  });
  it("anomaly spike (amount >> median) → hold", () => {
    // caps raised so per-call/hourly don't fire first — anomaly is the trigger
    const r = decidePolicy(policy({ anomalyMultiplier: 5, maxPerCallUsd: 1000, maxPerHourUsd: 10000, maxPerDayUsd: 10000 }), ctx({ action: { kind: "x402_payment", to: "0x5555555555555555555555555555555555555555", amountUsd: 100 }, medianSpend: 10 }));
    expect(r.reasons).toContain("ANOMALY_SPIKE");
    expect(r.decision).toBe("hold");
  });
  it("clean, seen, within budget → allow", () => {
    const r = decidePolicy(policy(), ctx({ action: { kind: "x402_payment", to: "0x6666666666666666666666666666666666666666", amountUsd: 5 }, seen: true }));
    expect(r.decision).toBe("allow");
    expect(r.commit).toBe(true);
  });
  it("allowlisted skips novelty/anomaly holds (but not spend caps)", () => {
    const to = "0x7777777777777777777777777777777777777777";
    // amount 20 is within the $25 per-call cap but would trip anomaly (median 1) and novelty
    const r = decidePolicy(policy({ allow: [to] }), ctx({ action: { kind: "x402_payment", to, amountUsd: 20 }, allowlisted: true, seen: false, medianSpend: 1 }));
    expect(r.decision).toBe("allow");
    expect(r.reasons).toContain("ALLOWLISTED");
  });
});
