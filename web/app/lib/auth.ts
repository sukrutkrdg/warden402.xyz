/**
 * Wallet auth (Sign-In with Ethereum, EIP-4361-style) + signed sessions.
 * No external provider: the wallet signs a nonce'd message, we verify the
 * signature recovers the claimed address, then issue an HMAC-signed session
 * token. Crypto-native, zero third-party dependency.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyMessage } from "viem";
import { PERSISTENT, kvPipeline } from "./store";

const SECRET = process.env.SESSION_SECRET ?? "dev-insecure-change-me";
const mem = (globalThis as unknown as { __wardenNonce?: Map<string, number> }).__wardenNonce ?? ((globalThis as unknown as { __wardenNonce?: Map<string, number> }).__wardenNonce = new Map());

const b64u = (s: string | Buffer) => Buffer.from(s).toString("base64url");

// ── sessions ──────────────────────────────────────────────────────
export function signSession(addr: string, days = 30): string {
  const payload = b64u(JSON.stringify({ addr: addr.toLowerCase(), exp: Date.now() + days * 86_400_000 }));
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
export function verifySession(token?: string | null): string | null {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof p.exp !== "number" || p.exp < Date.now()) return null;
    return String(p.addr).toLowerCase();
  } catch { return null; }
}

/** Read the caller's wallet address from the session header, or null. */
export function sessionAddr(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("x-warden-session") ?? "";
  return verifySession(h.replace(/^Bearer\s+/i, "").trim());
}

// ── nonces (single-use, 5-min TTL) ────────────────────────────────
export async function issueNonce(): Promise<string> {
  const nonce = b64u(createHmac("sha256", SECRET).update(String(Math.random()) + Date.now()).digest()).slice(0, 24);
  if (PERSISTENT) { try { await kvPipeline([["SET", `auth:nonce:${nonce}`, "1", "EX", 300]]); return nonce; } catch { /* fall */ } }
  mem.set(nonce, Date.now() + 300_000);
  return nonce;
}
async function consumeNonce(nonce: string): Promise<boolean> {
  if (!nonce) return false;
  if (PERSISTENT) {
    try { const [v] = await kvPipeline([["GETDEL", `auth:nonce:${nonce}`]]); return Boolean(v); } catch { /* fall */ }
  }
  const exp = mem.get(nonce); mem.delete(nonce);
  return Boolean(exp && exp > Date.now());
}

/**
 * Verify a SIWE-style login: the signed message must embed a nonce we issued,
 * and the signature must recover `address`. Returns the lowercased address.
 */
export async function verifyLogin(address: string, message: string, signature: string): Promise<string | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  const m = message.match(/Nonce:\s*([A-Za-z0-9_-]+)/);
  const nonce = m?.[1] ?? "";
  if (!(await consumeNonce(nonce))) return null; // replay / expired
  try {
    const ok = await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
    return ok ? address.toLowerCase() : null;
  } catch { return null; }
}

/** The canonical login message the client asks the wallet to sign. */
export function loginMessage(address: string, nonce: string): string {
  return [
    "warden402.xyz wants you to sign in with your Ethereum account:",
    address,
    "",
    "Sign in to Warden — pre-execution security for agents on Base.",
    "",
    "URI: https://warden402.xyz",
    "Chain ID: 8453",
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}
