import { withErrorHandler } from '@/lib/with-error-handler';
import { NextResponse } from "next/server";

/**
 * GET /api/health/live
 * Liveness probe — always returns 200 if the process is running.
 * No dependency checks. Used by orchestrators to detect hung processes.
 * Does NOT require authentication.
 *
 * @returns NextResponse with { status, timestamp, uptime }
 */
export const GET = withErrorHandler(async () => { return NextResponse.json({
  status: "alive",
  timestamp: Date.now(),
  uptime: process.uptime(),
}); });
