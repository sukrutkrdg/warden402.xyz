import { NextResponse } from "next/server";
import { readStats } from "../../lib/store";

export const dynamic = "force-dynamic";

// GET /api/track-record → live trust stats from the ledger (persistent if KV set).
export async function GET() {
  return NextResponse.json(await readStats());
}
