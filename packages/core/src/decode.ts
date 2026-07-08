/**
 * Minimal calldata decoder — pre-sign security. No external ABI library;
 * recognizes only the riskiest patterns in agent payment/approval flows:
 *   - ERC20 approve / increaseAllowance          → unlimited/high allowance risk
 *   - ERC721/1155 setApprovalForAll(op, true)     → approval over all NFTs
 *   - EIP-2612 permit / Permit2 approve           → gasless unlimited allowance
 *   - transfer / transferFrom                     → recipient info
 * Unknown selectors are marked 'unknown' (the handler degrades).
 */

export interface DecodedCall {
  selector: string;
  kind:
    | "approve"
    | "increaseAllowance"
    | "setApprovalForAll"
    | "permit"          // EIP-2612 permit (gasless allowance)
    | "permit2Approve"  // Uniswap Permit2 approve
    | "transfer"
    | "transferFrom"
    | "unknown";
  spender?: string;
  recipient?: string;
  amount?: bigint;
  approvedAll?: boolean;
  unlimited?: boolean;
}

const SELECTORS = {
  approve: "0x095ea7b3",
  increaseAllowance: "0x39509351",
  setApprovalForAll: "0xa22cb465",
  transfer: "0xa9059cbb",
  transferFrom: "0x23b872dd",
  permit: "0xd505accf",
  permit2Approve: "0x87517c45",
} as const;

// "Unlimited" is not just ~uint256-max. Any allowance beyond every plausible
// token supply (max real supply ≈ 1e27 ≈ 2^90) is effectively infinite, so a
// drainer can dodge a near-max check by requesting e.g. 2^200. Treat anything
// at/above 2^128 as unlimited — far above any real supply, far below max.
const PRACTICAL_UNLIMITED = 1n << 128n;

function word(data: string, index: number): string {
  const start = 2 + 8 + index * 64;
  return data.slice(start, start + 64);
}
const addrFromWord = (w: string): string => "0x" + w.slice(24);
// Guard against non-hex words (malformed calldata) — BigInt() would throw and
// crash the whole verdict. A malformed word is treated as 0 here; the caller
// separately rejects/degrades calldata that isn't clean hex.
const bigFromWord = (w: string): bigint => (w && /^[0-9a-f]+$/.test(w) ? BigInt("0x" + w) : 0n);

export function decodeCalldata(calldata: string | undefined): DecodedCall {
  const data = (calldata ?? "").toLowerCase();
  if (!data.startsWith("0x") || data.length < 10) return { selector: "0x", kind: "unknown" };
  // Non-hex payload can't be a real tx → don't try to decode (and never throw).
  if (!/^0x[0-9a-f]*$/.test(data)) return { selector: data.slice(0, 10), kind: "unknown" };
  const selector = data.slice(0, 10);

  // Reject truncated calldata: too short for the selector's args → undecodable.
  const NEED: Record<string, number> = { "0x095ea7b3": 2, "0x39509351": 2, "0xa22cb465": 2, "0xa9059cbb": 2, "0x23b872dd": 3, "0xd505accf": 3, "0x87517c45": 3 };
  if (NEED[selector] && data.length < 10 + NEED[selector]! * 64) return { selector, kind: "unknown" };

  switch (selector) {
    case SELECTORS.approve: {
      const amount = bigFromWord(word(data, 1));
      return { selector, kind: "approve", spender: addrFromWord(word(data, 0)), amount, unlimited: amount >= PRACTICAL_UNLIMITED };
    }
    case SELECTORS.increaseAllowance: {
      const amount = bigFromWord(word(data, 1));
      return { selector, kind: "increaseAllowance", spender: addrFromWord(word(data, 0)), amount, unlimited: amount >= PRACTICAL_UNLIMITED };
    }
    case SELECTORS.setApprovalForAll:
      return { selector, kind: "setApprovalForAll", spender: addrFromWord(word(data, 0)), approvedAll: bigFromWord(word(data, 1)) !== 0n };
    case SELECTORS.transfer:
      return { selector, kind: "transfer", recipient: addrFromWord(word(data, 0)), amount: bigFromWord(word(data, 1)) };
    case SELECTORS.transferFrom:
      return { selector, kind: "transferFrom", recipient: addrFromWord(word(data, 1)), amount: bigFromWord(word(data, 2)) };
    case SELECTORS.permit: {
      const amount = bigFromWord(word(data, 2)); // permit(owner, spender, value, ...)
      return { selector, kind: "permit", spender: addrFromWord(word(data, 1)), amount, unlimited: amount >= PRACTICAL_UNLIMITED };
    }
    case SELECTORS.permit2Approve: {
      const amount = bigFromWord(word(data, 2)); // approve(token, spender, uint160 amount, ...)
      return { selector, kind: "permit2Approve", spender: addrFromWord(word(data, 1)), amount, unlimited: amount >= PRACTICAL_UNLIMITED };
    }
    default:
      return { selector, kind: "unknown" };
  }
}
