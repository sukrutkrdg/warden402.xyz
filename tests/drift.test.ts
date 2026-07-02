/**
 * Drift guard — the guard logic lives in two places (canonical src/ modules and
 * the consolidated web/app/lib/guard.ts used by the deployed site). This test
 * runs identical inputs through BOTH and asserts they agree, so the two copies
 * can never silently diverge.
 */
import { describe, it, expect } from "vitest";
import { decide as srcDecide } from "../src/engine/decide.js";
import { decodeCalldata as srcDecode } from "../src/tx/decode.js";
import { decide as webDecide, decodeCalldata as webDecode } from "../web/app/lib/guard";
import type { SignalResult, SignalCategory, SignalStatus } from "../src/schema/verdict.js";

function sig(category: SignalCategory, status: SignalStatus, weight: number, score: number, reasonCodes: string[] = []): SignalResult {
  return { category, status, weight, score, source: "t", evidence: { reasonCodes } };
}

const SCENARIOS: SignalResult[][] = [
  [sig("honeypot", "ok", 0.3, 5), sig("contract_risk", "ok", 0.2, 10), sig("liquidity", "ok", 0.2, 10), sig("holder_concentration", "ok", 0.15, 15), sig("sanctions", "ok", 0.05, 0)],
  [sig("honeypot", "fail", 0.3, 90, ["HONEYPOT_DETECTED"]), sig("liquidity", "ok", 0.2, 5)],
  [sig("sanctions", "fail", 0.05, 100, ["SANCTIONED_ADDRESS"]), sig("honeypot", "ok", 0.3, 5)],
  [sig("honeypot", "unknown", 0, 0), sig("liquidity", "ok", 0.2, 5)],
  [sig("liquidity", "fail", 0.2, 80, ["LIQUIDITY_LOW"]), sig("honeypot", "ok", 0.3, 0), sig("contract_risk", "ok", 0.2, 5), sig("holder_concentration", "ok", 0.15, 10), sig("sanctions", "ok", 0.05, 0)],
  [sig("honeypot", "warn", 0.3, 40), sig("liquidity", "warn", 0.2, 45, ["LIQUIDITY_LOW"]), sig("contract_risk", "ok", 0.2, 20)],
  [sig("honeypot", "warn", 0.3, 75), sig("contract_risk", "fail", 0.2, 80), sig("liquidity", "warn", 0.2, 70)],
  [sig("holder_concentration", "fail", 0.15, 70, ["HOLDER_CONCENTRATION_HIGH"]), sig("honeypot", "ok", 0.3, 0), sig("liquidity", "ok", 0.2, 10), sig("contract_risk", "ok", 0.2, 0), sig("sanctions", "ok", 0.05, 0)],
];

describe("drift guard: src engine === web engine", () => {
  it.each(SCENARIOS.map((s, i) => [i, s] as const))("decide() agrees on scenario %i", (_i, signals) => {
    const a = srcDecide(signals);
    const b = webDecide(signals);
    expect(b.decision).toBe(a.decision);
    expect(b.riskScore).toBe(a.riskScore);
    expect(b.degraded).toBe(a.degraded);
    expect(b.confidence).toBe(a.confidence);
  });

  const SPENDER = "1111111254eeb25477b68fb85ed929f73a960582";
  const CALLDATAS = [
    "0x095ea7b3" + "000000000000000000000000" + SPENDER + "f".repeat(64), // unlimited approve
    "0x095ea7b3" + "000000000000000000000000" + SPENDER + ("0".repeat(60) + "2710"), // limited approve
    "0xa22cb465" + "000000000000000000000000" + SPENDER + ("0".repeat(63) + "1"), // setApprovalForAll true
    "0xa9059cbb" + "000000000000000000000000" + SPENDER + ("0".repeat(60) + "2710"), // transfer
    "0xd505accf" + "000000000000000000000000" + "0".repeat(40) + "000000000000000000000000" + SPENDER + "f".repeat(64), // permit unlimited
    "0x87517c45" + "000000000000000000000000" + "0".repeat(40) + "000000000000000000000000" + SPENDER + ("0".repeat(24) + "f".repeat(40)), // permit2 uint160 max
    "0xdeadbeef",
    "0x",
  ];

  it.each(CALLDATAS.map((c, i) => [i, c] as const))("decodeCalldata() agrees on calldata %i", (_i, cd) => {
    const a = srcDecode(cd);
    const b = webDecode(cd);
    expect(b.kind).toBe(a.kind);
    expect(Boolean(b.unlimited)).toBe(Boolean(a.unlimited));
    expect(Boolean(b.approvedAll)).toBe(Boolean(a.approvedAll));
    expect((b.spender ?? "").toLowerCase()).toBe((a.spender ?? "").toLowerCase());
  });
});
