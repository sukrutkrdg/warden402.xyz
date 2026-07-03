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
// ── wallet discovery (EIP-6963 + legacy window.ethereum fallback) ──
// Several wallet extensions can fight over window.ethereum; the one that
// "wins" injection may have no account set up (users then see errors like
// "wallet must has at least one account"). EIP-6963 lets every installed
// wallet announce itself, so we can pick one that actually works.
interface Announced { name: string; icon?: string; rdns?: string; provider: Eip1193 }
const announced: Announced[] = [];
let selected: Eip1193 | null = null;
let discoveryStarted = false;

function discover(): void {
  if (discoveryStarted || typeof window === "undefined") return;
  discoveryStarted = true;
  window.addEventListener("eip6963:announceProvider", (ev) => {
    const d = (ev as CustomEvent<{ info?: { name?: string; icon?: string; rdns?: string }; provider?: Eip1193 }>).detail;
    if (d?.provider && !announced.some((a) => a.provider === d.provider)) {
      announced.push({ name: d.info?.name ?? "Wallet", icon: d.info?.icon, rdns: d.info?.rdns, provider: d.provider });
    }
  });
  window.dispatchEvent(new Event("eip6963:requestProvider")); // wallets reply synchronously
}

// ── explicit wallet choice (the fix for multi-extension browsers) ──
// Auto-picking a provider stalls when the "wrong" extension swallows the
// request, so the UI lists every installed wallet and connects only the one
// the user taps.
export interface WalletOption { id: string; name: string; icon?: string }

export function listWallets(): WalletOption[] {
  discover();
  const opts: WalletOption[] = announced.map((a, i) => ({ id: a.rdns || `announced-${i}`, name: a.name, icon: a.icon }));
  if (!opts.length) {
    const legacy = (globalThis as { ethereum?: Eip1193 }).ethereum;
    if (legacy) opts.push({ id: "injected", name: legacy.isMetaMask ? "MetaMask" : legacy.isCoinbaseWallet ? "Coinbase Wallet" : "Browser wallet" });
  }
  return opts;
}

/** Connect a specific wallet from listWallets(); it becomes the session provider. */
export async function connectWith(id: string): Promise<string> {
  discover();
  const found = announced.find((a, i) => (a.rdns || `announced-${i}`) === id)?.provider
    ?? (globalThis as { ethereum?: Eip1193 }).ethereum;
  if (!found) throw new Error("Wallet not found. Reload and try again.");
  const accs = ((await found.request({ method: "eth_requestAccounts" })) as string[]) ?? [];
  if (!accs.length) throw new Error("This wallet has no account. Unlock it or create/import an account, then retry.");
  selected = found;
  return accs[0]!;
}

const rank = (p: Eip1193) => (p.isMetaMask ? 0 : p.isCoinbaseWallet ? 1 : 2);

/** Every distinct provider we can reach, MetaMask/Coinbase preferred. */
function candidates(): Eip1193[] {
  discover();
  const legacy = (globalThis as { ethereum?: Eip1193 }).ethereum;
  const list: Eip1193[] = announced.map((a) => a.provider);
  for (const p of legacy?.providers ?? []) if (!list.includes(p)) list.push(p);
  if (legacy && !list.includes(legacy)) list.push(legacy);
  return list.sort((a, b) => rank(a) - rank(b));
}

function provider(): Eip1193 {
  if (selected) return selected;
  const c = candidates();
  if (!c.length) throw new Error("No wallet found. Install MetaMask or Coinbase Wallet, then reload.");
  return c[0]!;
}

/** Route a raw EIP-1193 request through the connected wallet (same provider connect() picked). */
export async function walletRequest<T = unknown>(args: { method: string; params?: unknown[] }): Promise<T> {
  return (await provider().request(args)) as T;
}

function pad32(hexNo0x: string): string {
  return hexNo0x.toLowerCase().padStart(64, "0");
}

/** ERC20 transfer(to, amount) calldata. */
function encodeTransfer(to: string, amount: bigint): string {
  return "0xa9059cbb" + pad32(to.replace(/^0x/, "")) + pad32(amount.toString(16));
}

export async function connect(): Promise<string> {
  const list = candidates();
  if (!list.length) throw new Error("No wallet found. Install MetaMask or Coinbase Wallet, then reload.");

  // 1) a wallet that is already authorized wins silently (no popup)
  for (const p of list) {
    const accs = ((await p.request({ method: "eth_accounts" }).catch(() => [])) as string[]) ?? [];
    if (accs.length) { selected = p; return accs[0]!; }
  }
  // 2) otherwise ask each in turn; a wallet with no usable account fails fast
  //    (no popup), so we fall through to the next one instead of dead-ending.
  let lastErr = "";
  for (const p of list) {
    try {
      const accs = ((await p.request({ method: "eth_requestAccounts" })) as string[]) ?? [];
      if (accs.length) { selected = p; return accs[0]!; }
    } catch (e) {
      const err = e as { code?: number; message?: string };
      if (err?.code === 4001) throw new Error("Connection request rejected in wallet.");
      lastErr = err?.message || lastErr;
    }
  }
  throw new Error(lastErr ? `${lastErr} — unlock a wallet that has an account, then retry.` : "No wallet with an account found. Unlock your wallet or create an account, then retry.");
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

/**
 * Canonical message a payer signs to PROVE they own the paying wallet, binding
 * a specific tx hash to the redemption. The server recovers the signer and
 * requires it to equal the on-chain payer (tx `from`) — this stops a third
 * party from redeeming someone else's public payment tx.
 * Pure string builder: safe to import on both client and server.
 */
export function claimMessage(txHash: string): string {
  return [
    "warden402.xyz — subscription payment claim",
    `Tx: ${txHash.toLowerCase()}`,
    `Chain: ${BASE_CHAIN_ID}`,
    "By signing you prove ownership of the paying wallet. No transaction is sent.",
  ].join("\n");
}

/** Ask the connected wallet to sign the claim message for `txHash`. */
export async function signClaim(txHash: string, from: string): Promise<string> {
  const eth = provider();
  return (await eth.request({ method: "personal_sign", params: [claimMessage(txHash), from] })) as string;
}

export const explorerTx = (hash: string) => `https://basescan.org/tx/${hash}`;
