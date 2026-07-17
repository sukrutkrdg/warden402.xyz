import { NextResponse } from "next/server";
import { readStats, readHeartbeat } from "../../lib/store";

export const dynamic = "force-dynamic";

// GET /api/track-record → live trust stats + cron health (last scout/recheck run).
export async function GET() {
  const [stats, scout, recheck] = await Promise.all([readStats(), readHeartbeat("scout"), readHeartbeat("recheck")]);
  return NextResponse.json({ ...stats, crons: { scout, recheck } });
}
