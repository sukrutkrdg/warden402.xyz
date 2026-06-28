/**
 * Minimal calldata decoder — pre-sign güvenlik için. Harici ABI kütüphanesi yok;
 * yalnızca ajan ödeme/onay akışlarında en riskli desenleri tanır:
 *   - ERC20 approve(spender, amount)           → sınırsız/yüksek allowance riski
 *   - ERC20 increaseAllowance(spender, addedV)  → allowance artışı
 *   - ERC721/1155 setApprovalForAll(op, true)   → tüm NFT'lere yetki
 *   - transfer / transferFrom                   → alıcı bilgisi
 * Tanınmayan selector'lar 'unknown' olarak işaretlenir (handler degrade eder).
 */

export interface DecodedCall {
  selector: string;             // 0x + 8 hex
  kind:
    | "approve"
    | "increaseAllowance"
    | "setApprovalForAll"
    | "transfer"
    | "transferFrom"
    | "unknown";
  spender?: string;             // approve/increaseAllowance/setApprovalForAll için
  recipient?: string;           // transfer/transferFrom için
  amount?: bigint;              // approve/increaseAllowance/transfer
  approvedAll?: boolean;        // setApprovalForAll
  unlimited?: boolean;          // amount, uint256 max'a yakın mı
}

const SELECTORS = {
  approve: "0x095ea7b3",            // approve(address,uint256)
  increaseAllowance: "0x39509351",  // increaseAllowance(address,uint256)
  setApprovalForAll: "0xa22cb465",  // setApprovalForAll(address,bool)
  transfer: "0xa9059cbb",           // transfer(address,uint256)
  transferFrom: "0x23b872dd",       // transferFrom(address,address,uint256)
} as const;

const UINT256_MAX = (1n << 256n) - 1n;
/** uint256 max'ın %1'inden fazlası → pratikte "sınırsız" muamelesi. */
const UNLIMITED_FLOOR = UINT256_MAX - UINT256_MAX / 100n;

function word(data: string, index: number): string {
  // data: 0x + selector(8) + words(64 each). index 0 = ilk word.
  const start = 2 + 8 + index * 64;
  return data.slice(start, start + 64);
}
function addrFromWord(w: string): string {
  return "0x" + w.slice(24); // son 20 byte
}
function bigFromWord(w: string): bigint {
  return w ? BigInt("0x" + w) : 0n;
}

export function decodeCalldata(calldata: string | undefined): DecodedCall {
  const data = (calldata ?? "").toLowerCase();
  if (!data.startsWith("0x") || data.length < 10) {
    return { selector: "0x", kind: "unknown" };
  }
  const selector = data.slice(0, 10);

  switch (selector) {
    case SELECTORS.approve: {
      const spender = addrFromWord(word(data, 0));
      const amount = bigFromWord(word(data, 1));
      return { selector, kind: "approve", spender, amount, unlimited: amount >= UNLIMITED_FLOOR };
    }
    case SELECTORS.increaseAllowance: {
      const spender = addrFromWord(word(data, 0));
      const amount = bigFromWord(word(data, 1));
      return { selector, kind: "increaseAllowance", spender, amount, unlimited: amount >= UNLIMITED_FLOOR };
    }
    case SELECTORS.setApprovalForAll: {
      const spender = addrFromWord(word(data, 0));
      const approved = bigFromWord(word(data, 1)) !== 0n;
      return { selector, kind: "setApprovalForAll", spender, approvedAll: approved };
    }
    case SELECTORS.transfer: {
      const recipient = addrFromWord(word(data, 0));
      const amount = bigFromWord(word(data, 1));
      return { selector, kind: "transfer", recipient, amount };
    }
    case SELECTORS.transferFrom: {
      const recipient = addrFromWord(word(data, 1)); // (from, to, amount)
      const amount = bigFromWord(word(data, 2));
      return { selector, kind: "transferFrom", recipient, amount };
    }
    default:
      return { selector, kind: "unknown" };
  }
}
