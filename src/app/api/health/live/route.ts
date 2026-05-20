import { NextResponse } from "next/server";

/**
 * Liveness probe — always returns 200 if the process is running.
 * No dependency checks. Used by orchestrators to detect hung processes.
 */
export async function GET() {
  return NextResponse.json({
    status: "alive",
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
}
