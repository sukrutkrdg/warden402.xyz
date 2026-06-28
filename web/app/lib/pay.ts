/**
 * Crypto checkout — pay in USDC or ETH on Base, directly to the Warden wallet.
 * Uses the injected wallet (EIP-1193 window.ethereum) with raw ERC20 encoding —
 * no heavy web3 deps. USDC is 1:1 with USD; ETH amount is derived from a live price.
 */

export const PAY_TO = "0x973a31858f4d2125f48c880542da11a2796f12d6";
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // 6 decimals
export const BASE_CHAIN_ID = 8453;
export const BASE_CHAIN_HEX = "0x2105";

export type PayToken = "USDC" | "ETH";

interface Eip1193 {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}
function provider(): Eip1193 {
  const eth = (globalThis as { ethereum?: Eip1193 }).ethereum;
  if (!eth) throw new Error("No wallet found. Install MetaMask or Coinbase Wallet.");
  return eth;
}

function pad32(hexNo0x: string): string {
  return hexNo0x.toLowerCase().padStart(64, "0");
}

/** ERC20 transfer(to, amount) calldata. */
function encodeTransfer(to: string, amount: bigint): string {
  return "0xa9059cbb" + pad32(to.replace(/^0x/, "")) + pad32(amount.toString(16));
}

export async function connect(): Promise<string> {
  const accs = (await provider().request({ method: "eth_requestAccounts" })) as string[];
  if (!accs?.length) throw new Error("No account selected.");
  return accs[0]!;
}

export async function ensureBase(): Promise<void> {
  const eth = provider();
  const chainId = (await eth.request({ method: "eth_chainId" })) as string;
  if (chainId?.toLowerCase() === BASE_CHAIN_HEX) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_CHAIN_HEX }] });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: BASE_CHAIN_HEX,
        chainName: "Base",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: ["https://mainnet.base.org"],
        blockExplorerUrls: ["https://basescan.org"],
      }],
    });
  }
}

/** Convert a USD amount + token into the on-chain amount (wei / 6-dec units). */
export function toUnits(token: PayToken, amountUsd: number, ethPriceUsd?: number): bigint {
  if (token === "USDC") return BigInt(Math.round(amountUsd * 1_000_000)); // 6 decimals
  if (!ethPriceUsd || ethPriceUsd <= 0) throw new Error("ETH price unavailable, try again.");
  const eth = amountUsd / ethPriceUsd;
  // 9-decimal precision is plenty; scale up to wei.
  return BigInt(Math.round(eth * 1e9)) * 1_000_000_000n;
}

/** Send the payment. Returns the tx hash. */
export async function pay(token: PayToken, amountUsd: number, ethPriceUsd?: number): Promise<string> {
  const eth = provider();
  const from = await connect();
  await ensureBase();
  const units = toUnits(token, amountUsd, ethPriceUsd);

  const tx =
    token === "USDC"
      ? { from, to: USDC_BASE, data: encodeTransfer(PAY_TO, units), value: "0x0" }
      : { from, to: PAY_TO, value: "0x" + units.toString(16) };

  const hash = (await eth.request({ method: "eth_sendTransaction", params: [tx] })) as string;
  return hash;
}

export const explorerTx = (hash: string) => `https://basescan.org/tx/${hash}`;
