import { describe, it, expect } from "vitest";
import { decodeCalldata } from "../src/tx/decode.js";

const SPENDER = "1111111254eeb25477b68fb85ed929f73a960582";
const MAX = "f".repeat(64);
const ZERO = "0".repeat(64);
const addr = (a: string) => "000000000000000000000000" + a;

describe("decodeCalldata() — drain detection", () => {
  it("unlimited approve is flagged", () => {
    const d = decodeCalldata("0x095ea7b3" + addr(SPENDER) + MAX);
    expect(d.kind).toBe("approve");
    expect(d.unlimited).toBe(true);
    expect(d.spender?.toLowerCase()).toBe("0x" + SPENDER);
  });

  it("limited approve is not unlimited", () => {
    const small = "0".repeat(60) + "2710"; // 10000
    const d = decodeCalldata("0x095ea7b3" + addr(SPENDER) + small);
    expect(d.kind).toBe("approve");
    expect(d.unlimited).toBe(false);
    expect((d.amount ?? 0n) > 0n).toBe(true);
  });

  it("setApprovalForAll(true) is flagged as approvedAll", () => {
    const d = decodeCalldata("0xa22cb465" + addr(SPENDER) + ("0".repeat(63) + "1"));
    expect(d.kind).toBe("setApprovalForAll");
    expect(d.approvedAll).toBe(true);
  });

  it("setApprovalForAll(false) is not approvedAll", () => {
    const d = decodeCalldata("0xa22cb465" + addr(SPENDER) + ZERO);
    expect(d.approvedAll).toBe(false);
  });

  it("transfer decodes recipient + amount", () => {
    const d = decodeCalldata("0xa9059cbb" + addr(SPENDER) + ("0".repeat(60) + "2710"));
    expect(d.kind).toBe("transfer");
    expect(d.recipient?.toLowerCase()).toBe("0x" + SPENDER);
  });

  it("unknown selector → unknown", () => {
    expect(decodeCalldata("0xdeadbeef").kind).toBe("unknown");
    expect(decodeCalldata("0x").kind).toBe("unknown");
    expect(decodeCalldata(undefined).kind).toBe("unknown");
  });
});
