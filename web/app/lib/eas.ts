/**
 * On-chain verdict attestations — Ethereum Attestation Service (EAS) on Base.
 * Turns Warden from an off-chain API into a real on-chain protocol: every verdict
 * can be written to Base as an EAS attestation, with the project's Builder Code
 * attached to the tx calldata for Base attribution.
 *
 * Env (set to enable — safe default OFF):
 *   ATTESTER_PRIVATE_KEY   hex key of a low-balance Base wallet (pays gas)
 *   EAS_SCHEMA_UID         schema UID from a one-time register (see /api/attest op=register)
 *   BASE_BUILDER_CODE      default bc_mq7ey4g0 (attribution)
 *   BASE_RPC_URL           optional RPC override
 */
import { createPublicClient, createWalletClient, encodeAbiParameters, encodeFunctionData, http, keccak256, encodePacked, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

export const EAS_ADDRESS = "0x4200000000000000000000000000000000000021" as const;        // Base EAS
export const SCHEMA_REGISTRY = "0x4200000000000000000000000000000000000020" as const;    // Base SchemaRegistry
export const SCHEMA = "address target,uint8 decision,uint8 riskScore,string reasons";
export const BUILDER_CODE = process.env.BASE_BUILDER_CODE?.trim() || "bc_mq7ey4g0";

const RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
const KEY = process.env.ATTESTER_PRIVATE_KEY?.trim();
export const SCHEMA_UID = process.env.EAS_SCHEMA_UID?.trim() as `0x${string}` | undefined;
export const ATTEST_ENABLED = Boolean(KEY);

const DECISION_CODE: Record<string, number> = { clear: 0, review: 1, block: 2 };

const REGISTER_ABI = [{ type: "function", name: "register", stateMutability: "nonpayable", inputs: [{ name: "schema", type: "string" }, { name: "resolver", type: "address" }, { name: "revocable", type: "bool" }], outputs: [{ type: "bytes32" }] }] as const;
const GET_SCHEMA_ABI = [{ type: "function", name: "getSchema", stateMutability: "view", inputs: [{ name: "uid", type: "bytes32" }], outputs: [{ type: "tuple", components: [{ name: "uid", type: "bytes32" }, { name: "resolver", type: "address" }, { name: "revocable", type: "bool" }, { name: "schema", type: "string" }] }] }] as const;
const ATTEST_ABI = [{ type: "function", name: "attest", stateMutability: "payable", inputs: [{ name: "request", type: "tuple", components: [{ name: "schema", type: "bytes32" }, { name: "data", type: "tuple", components: [{ name: "recipient", type: "address" }, { name: "expirationTime", type: "uint64" }, { name: "revocable", type: "bool" }, { name: "refUID", type: "bytes32" }, { name: "data", type: "bytes" }, { name: "value", type: "uint256" }] }] }], outputs: [{ type: "bytes32" }] }] as const;

function account() {
  if (!KEY) throw new Error("ATTESTER_PRIVATE_KEY not set — on-chain attestations disabled.");
  // Sanitize common paste issues: whitespace, surrounding quotes.
  let k = KEY.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
  if (!k.startsWith("0x")) k = `0x${k}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error("ATTESTER_PRIVATE_KEY must be a 64-hex-character private key (0x optional) — NOT a seed phrase / mnemonic.");
  }
  return privateKeyToAccount(k as `0x${string}`);
}
function wallet() { return createWalletClient({ account: account(), chain: base, transport: http(RPC) }); }
const publicClient = createPublicClient({ chain: base, transport: http(RPC) });

/** Append the Builder Code to calldata so Base attributes the on-chain action. */
function withBuilderCode(data: `0x${string}`): `0x${string}` {
  return (data + stringToHex(BUILDER_CODE).slice(2)) as `0x${string}`;
}

/** Deterministic EAS schema UID (so we know it without parsing logs). */
export function computeSchemaUID(resolver = "0x0000000000000000000000000000000000000000", revocable = true): `0x${string}` {
  return keccak256(encodePacked(["string", "address", "bool"], [SCHEMA, resolver as `0x${string}`, revocable]));
}

/** One-time: register the Warden verdict schema on Base EAS. Returns { txHash, schemaUID }. */
export async function registerSchema(): Promise<{ txHash: string; schemaUID: string }> {
  const data = withBuilderCode(encodeFunctionData({ abi: REGISTER_ABI, functionName: "register", args: [SCHEMA, "0x0000000000000000000000000000000000000000", true] }));
  const txHash = await wallet().sendTransaction({ to: SCHEMA_REGISTRY, data });
  return { txHash, schemaUID: computeSchemaUID() };
}

export interface VerdictAttestation { target: string; decision: string; riskScore: number; reasons: string[] }

/** Write a verdict on-chain as an EAS attestation. Returns tx hash + attestation UID. */
export async function attestVerdict(v: VerdictAttestation): Promise<{ txHash: string; uid: string | null }> {
  const schema = SCHEMA_UID ?? computeSchemaUID();
  const encoded = encodeAbiParameters(
    [{ type: "address" }, { type: "uint8" }, { type: "uint8" }, { type: "string" }],
    [v.target as `0x${string}`, DECISION_CODE[v.decision] ?? 1, Math.min(255, v.riskScore), v.reasons.join(",")],
  );
  const data = withBuilderCode(encodeFunctionData({
    abi: ATTEST_ABI, functionName: "attest",
    args: [{ schema, data: { recipient: v.target as `0x${string}`, expirationTime: 0n, revocable: true, refUID: "0x0000000000000000000000000000000000000000000000000000000000000000", data: encoded, value: 0n } }],
  }));
  const txHash = await wallet().sendTransaction({ to: EAS_ADDRESS, data });
  let uid: string | null = null;
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const log = receipt.logs.find((l) => l.address.toLowerCase() === EAS_ADDRESS.toLowerCase());
    if (log?.data && log.data.length >= 66) uid = log.data.slice(0, 66);
  } catch { /* uid best-effort */ }
  return { txHash, uid };
}

/** Read the actual on-chain registration state (not just the env var). */
export async function isSchemaRegistered(): Promise<boolean> {
  try {
    const uid = SCHEMA_UID ?? computeSchemaUID();
    const r = (await publicClient.readContract({ address: SCHEMA_REGISTRY, abi: GET_SCHEMA_ABI, functionName: "getSchema", args: [uid] })) as { schema: string };
    return Boolean(r?.schema && r.schema.length > 0);
  } catch {
    return false;
  }
}

// BaseScan reliably renders any tx; EAS Scan indexes by attestation UID, not tx.
export const easscanTx = (hash: string) => `https://basescan.org/tx/${hash}`;
export const easscanAttestation = (uid: string) => `https://base.easscan.org/attestation/view/${uid}`;
export async function attesterAddress(): Promise<string> { return account().address; }
export { publicClient };
