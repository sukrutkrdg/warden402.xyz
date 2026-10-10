/**
 * Web-only signal categories (sellability, owner_powers, address_poisoning,
 * sanctioned_exposure) — the src engine has no counterpart, so these are pinned
 * here rather than in the drift test.
 */
import { describe, it, expect } from "vitest";
import { decide, type SignalResult, type SignalCategory, type SignalStatus } from "../web/app/lib/guard";

function sig(category: SignalCategory, status: SignalStatus, weight: number, score: number, reasonCodes: string[] = []): SignalResult {
  return { category, status, weight, score, source: "t", evidence: { reasonCodes } };
}
const CLEAN = [sig("honeypot", "ok", 0.3, 0), sig("contract_risk", "ok", 0.2, 5), sig("liquidity", "ok", 0.2, 10), sig("sanctions", "ok", 0.05, 0)];

describe("web signals — decide()", () => {
  it("cannot-sell (live simulation) hard-blocks even when every other signal is clean", () => {
    const d = decide([...CLEAN, sig("sellability", "fail", 0.2, 95, ["CANNOT_SELL"])]);
    expect(d.decision).toBe("block");
    expect(d.reasons).toContain("CANNOT_SELL");
  });

  it("a poisoned look-alike recipient hard-blocks", () => {
    const d = decide([sig("approvals", "ok", 0.3, 0), sig("address_poisoning", "fail", 0.3, 95, ["ADDRESS_POISONING"])]);
    expect(d.decision).toBe("block");
  });

  it("critical owner power is a review, not a block on its own", () => {
    const d = decide([...CLEAN, sig("owner_powers", "fail", 0.15, 85, ["OWNER_POWERS_CRITICAL"])]);
    expect(d.decision).toBe("review");
  });

  it("sanctioned exposure (taint by association) warns but does not block", () => {
    const d = decide([sig("sanctions", "ok", 0.05, 0), sig("sanctioned_exposure", "warn", 0.15, 60, ["SANCTIONED_EXPOSURE"])]);
    expect(d.decision).toBe("review");
    expect(d.reasons).toContain("SANCTIONED_EXPOSURE");
  });

  it("unknown new signals don't degrade a token (they aren't critical)", () => {
    const d = decide([...CLEAN, sig("sellability", "unknown", 0, 0), sig("owner_powers", "unknown", 0, 0)]);
    expect(d.degraded).toBe(false);
    expect(d.decision).toBe("clear");
  });
});

describe("web signals — approval target", () => {
  it("unlimited approval to a plain wallet hard-blocks", () => {
    const d = decide([sig("approvals", "fail", 0.3, 80, ["DANGEROUS_APPROVAL"]), sig("approval_target", "fail", 0.3, 95, ["APPROVAL_TO_EOA"]), sig("sanctions", "ok", 0.1, 0)]);
    expect(d.decision).toBe("block");
    expect(d.reasons).toContain("APPROVAL_TO_EOA");
  });
  it("unlimited approval to a contract stays review", () => {
    const d = decide([sig("approvals", "fail", 0.3, 80, ["DANGEROUS_APPROVAL"]), sig("approval_target", "ok", 0.3, 0), sig("sanctions", "ok", 0.1, 0), sig("simulation", "ok", 0.2, 0)]);
    expect(d.decision).toBe("review");
  });
});
