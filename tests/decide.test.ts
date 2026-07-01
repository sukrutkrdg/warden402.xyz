import { describe, it, expect } from "vitest";
import { decide } from "../src/engine/decide.js";
import type { SignalResult, SignalCategory, SignalStatus } from "../src/schema/verdict.js";

function sig(category: SignalCategory, status: SignalStatus, weight: number, score: number, reasonCodes: string[] = []): SignalResult {
  return { category, status, weight, score, source: "test", evidence: { reasonCodes } };
}

describe("decide() — deterministic decision engine", () => {
  it("all-clean signals → clear", () => {
    const d = decide([
      sig("honeypot", "ok", 0.3, 5),
      sig("contract_risk", "ok", 0.2, 10),
      sig("liquidity", "ok", 0.2, 10),
      sig("holder_concentration", "ok", 0.15, 15),
      sig("sanctions", "ok", 0.05, 0),
    ]);
    expect(d.decision).toBe("clear");
    expect(d.degraded).toBe(false);
  });

  it("HARD RULE: honeypot fail → block regardless of low average", () => {
    const d = decide([
      sig("honeypot", "fail", 0.3, 90, ["HONEYPOT_DETECTED"]),
      sig("liquidity", "ok", 0.2, 5),
    ]);
    expect(d.decision).toBe("block");
    expect(d.reasons).toContain("HONEYPOT_DETECTED");
  });

  it("HARD RULE: sanctions fail → block", () => {
    const d = decide([
      sig("sanctions", "fail", 0.05, 100, ["SANCTIONED_ADDRESS"]),
      sig("honeypot", "ok", 0.3, 5),
    ]);
    expect(d.decision).toBe("block");
  });

  it("DEGRADE: a critical signal unknown → never clear, at worst review", () => {
    const d = decide([
      sig("honeypot", "unknown", 0, 0),
      sig("liquidity", "ok", 0.2, 5),
    ]);
    expect(d.decision).toBe("review");
    expect(d.degraded).toBe(true);
    expect(d.reasons).toContain("SIGNAL_UNAVAILABLE");
  });

  it("ESCALATION: a single non-hard fail (liquidity) can't be diluted → review", () => {
    const d = decide([
      sig("liquidity", "fail", 0.2, 80, ["LIQUIDITY_LOW"]),
      sig("honeypot", "ok", 0.3, 0),
      sig("contract_risk", "ok", 0.2, 5),
      sig("holder_concentration", "ok", 0.15, 10),
      sig("sanctions", "ok", 0.05, 0),
    ]);
    // weighted average is low, but a fail must floor at review
    expect(d.decision).toBe("review");
  });

  it("2+ warns → review", () => {
    const d = decide([
      sig("honeypot", "warn", 0.3, 40),
      sig("liquidity", "warn", 0.2, 45, ["LIQUIDITY_LOW"]),
      sig("contract_risk", "ok", 0.2, 20),
    ]);
    expect(d.decision).toBe("review");
  });

  it("high weighted risk → block", () => {
    const d = decide([
      sig("honeypot", "warn", 0.3, 75),
      sig("contract_risk", "fail", 0.2, 80),
      sig("liquidity", "warn", 0.2, 70),
    ]);
    expect(d.decision).toBe("block");
  });

  it("confidence reflects fraction of critical signals available", () => {
    const d = decide([
      sig("honeypot", "ok", 0.3, 0),
      sig("contract_risk", "unknown", 0, 0),
      sig("liquidity", "ok", 0.2, 0),
      sig("sanctions", "ok", 0.05, 0),
    ]);
    // 3 of 4 critical available
    expect(d.confidence).toBeGreaterThan(0.7);
    expect(d.confidence).toBeLessThan(0.8);
  });
});
