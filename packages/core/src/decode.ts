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

const UINT256_MAX = (1n << 256n) - 1n;
const UINT160_MAX = (1n << 160n) - 1n;
const UNLIMITED_FLOOR = UINT256_MAX - UINT256_MAX / 100n;
const UNLIMITED160_FLOOR = UINT160_MAX - UINT160_MAX / 100n;

function word(data: string, index: number): string {
  const start = 2 + 8 + index * 64;
  return data.slice(start, start + 64);
}
const addrFromWord = (w: string): string => "0x" + w.slice(24);
const bigFromWord = (w: string): bigint => (w ? BigInt("0x" + w) : 0n);

export function decodeCalldata(calldata: string | undefined): DecodedCall {
  const data = (calldata ?? "").toLowerCase();
  if (!data.startsWith("0x") || data.length < 10) return { selector: "0x", kind: "unknown" };
  const selector = data.slice(0, 10);

  // Reject truncated calldata: too short for the selector's args → undecodable.
  const NEED: Record<string, number> = { "0x095ea7b3": 2, "0x39509351": 2, "0xa22cb465": 2, "0xa9059cbb": 2, "0x23b872dd": 3, "0xd505accf": 3, "0x87517c45": 3 };
  if (NEED[selector] && data.length < 10 + NEED[selector]! * 64) return { selector, kind: "unknown" };

  switch (selector) {
    case SELECTORS.approve: {
      const amount = bigFromWord(word(data, 1));
      return { selector, kind: "approve", spender: addrFromWord(word(data, 0)), amount, unlimited: amount >= UNLIMITED_FLOOR };
    }
    case SELECTORS.increaseAllowance: {
      const amount = bigFromWord(word(data, 1));
      return { selector, kind: "increaseAllowance", spender: addrFromWord(word(data, 0)), amount, unlimited: amount >= UNLIMITED_FLOOR };
    }
    case SELECTORS.setApprovalForAll:
      return { selector, kind: "setApprovalForAll", spender: addrFromWord(word(data, 0)), approvedAll: bigFromWord(word(data, 1)) !== 0n };
    case SELECTORS.transfer:
      return { selector, kind: "transfer", recipient: addrFromWord(word(data, 0)), amount: bigFromWord(word(data, 1)) };
    case SELECTORS.transferFrom:
      return { selector, kind: "transferFrom", recipient: addrFromWord(word(data, 1)), amount: bigFromWord(word(data, 2)) };
    case SELECTORS.permit: {
      const amount = bigFromWord(word(data, 2)); // permit(owner, spender, value, ...)
      return { selector, kind: "permit", spender: addrFromWord(word(data, 1)), amount, unlimited: amount >= UNLIMITED_FLOOR };
    }
    case SELECTORS.permit2Approve: {
      const amount = bigFromWord(word(data, 2)); // approve(token, spender, uint160 amount, ...)
      return { selector, kind: "permit2Approve", spender: addrFromWord(word(data, 1)), amount, unlimited: amount >= UNLIMITED160_FLOOR };
    }
    default:
      return { selector, kind: "unknown" };
  }
}
