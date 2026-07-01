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
  providers?: Eip1193[];
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
}
function provider(): Eip1193 {
  let eth = (globalThis as { ethereum?: Eip1193 }).ethereum;
  if (!eth) throw new Error("No wallet found. Install MetaMask or Coinbase Wallet, then reload.");
  // Multiple injected wallets → pick a usable one.
  if (Array.isArray(eth.providers) && eth.providers.length) {
    eth = eth.providers.find((p) => p.isMetaMask) ?? eth.providers.find((p) => p.isCoinbaseWallet) ?? eth.providers[0]!;
  }
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
  const eth = provider();
  let accs: string[] = [];
  try {
    accs = ((await eth.request({ method: "eth_requestAccounts" })) as string[]) ?? [];
  } catch (e) {
    const err = e as { code?: number; message?: string };
    if (err?.code === 4001) throw new Error("Connection request rejected in wallet.");
    throw new Error(err?.message || "Could not open the wallet. Unlock it and try again.");
  }
  if (!accs.length) accs = ((await eth.request({ method: "eth_accounts" })) as string[]) ?? [];
  if (!accs.length) throw new Error("Your wallet has no account. Unlock it or create/import an account, then retry.");
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

/** Read the payer's balance (wei for ETH, 6-dec units for USDC). */
async function balanceOf(token: PayToken, from: string): Promise<bigint> {
  const eth = provider();
  if (token === "ETH") return BigInt((await eth.request({ method: "eth_getBalance", params: [from, "latest"] })) as string);
  const data = "0x70a08231" + from.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  const res = (await eth.request({ method: "eth_call", params: [{ to: USDC_BASE, data }, "latest"] })) as string;
  return res && res !== "0x" ? BigInt(res) : 0n;
}

/** Send the payment. Returns the tx hash. */
export async function pay(token: PayToken, amountUsd: number, ethPriceUsd?: number): Promise<string> {
  const eth = provider();
  const from = await connect();
  await ensureBase();
  const units = toUnits(token, amountUsd, ethPriceUsd);

  // Pre-flight balance check so we never submit a doomed transaction.
  const bal = await balanceOf(token, from);
  const needed = token === "ETH" ? units + units / 20n : units; // small ETH gas buffer
  if (bal < needed) {
    const have = token === "ETH" ? Number(bal) / 1e18 : Number(bal) / 1e6;
    throw new Error(`Insufficient ${token} balance on Base — you have ~${have.toFixed(token === "ETH" ? 5 : 2)} ${token}.`);
  }

  const tx =
    token === "USDC"
      ? { from, to: USDC_BASE, data: encodeTransfer(PAY_TO, units), value: "0x0" }
      : { from, to: PAY_TO, value: "0x" + units.toString(16) };

  const hash = (await eth.request({ method: "eth_sendTransaction", params: [tx] })) as string;
  return hash;
}

export const explorerTx = (hash: string) => `https://basescan.org/tx/${hash}`;
