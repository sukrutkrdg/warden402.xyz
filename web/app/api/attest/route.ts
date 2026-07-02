import { NextRequest, NextResponse } from "next/server";
import { ATTEST_ENABLED, BUILDER_CODE, SCHEMA, SCHEMA_UID, attestVerdict, attesterAddress, computeSchemaUID, easscanAttestation, easscanTx, isSchemaRegistered, registerSchema } from "../../lib/eas";

export const dynamic = "force-dynamic";

const ADMIN = process.env.ADMIN_TOKEN;
function authed(req: NextRequest) {
  return Boolean(ADMIN) && (req.headers.get("x-warden-admin") === ADMIN || req.nextUrl.searchParams.get("token") === ADMIN);
}

// GET /api/attest → on-chain attestation config/status (admin)
export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({
    enabled: ATTEST_ENABLED,
    builderCode: BUILDER_CODE,
    schema: SCHEMA,
    schemaUID: SCHEMA_UID ?? computeSchemaUID(),
    schemaRegistered: await isSchemaRegistered(),
    attester: ATTEST_ENABLED ? await attesterAddress().catch(() => null) : null,
    chain: "base",
  });
}

// POST /api/attest  { op:"register" } | { op:"attest", target, decision, riskScore, reasons } (admin)
export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!ATTEST_ENABLED) return NextResponse.json({ error: "not_configured", detail: "Set ATTESTER_PRIVATE_KEY (funded Base wallet) to enable." }, { status: 400 });
  const body = await req.json().catch(() => ({}));

  try {
    if (body?.op === "register") {
      const r = await registerSchema();
      return NextResponse.json({ ...r, easscan: easscanTx(r.txHash), note: "Set EAS_SCHEMA_UID to the returned schemaUID in your env." });
    }
    if (body?.op === "attest") {
      if (!/^0x[a-fA-F0-9]{40}$/.test(body.target ?? "")) return NextResponse.json({ error: "invalid target" }, { status: 400 });
      const r = await attestVerdict({ target: body.target, decision: String(body.decision ?? "review"), riskScore: Number(body.riskScore ?? 0), reasons: Array.isArray(body.reasons) ? body.reasons : [] });
      return NextResponse.json({ ...r, basescan: easscanTx(r.txHash), easscan: r.uid ? easscanAttestation(r.uid) : null });
    }
    return NextResponse.json({ error: "invalid op" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: "onchain_failed", detail: String(e) }, { status: 502 });
  }
}
