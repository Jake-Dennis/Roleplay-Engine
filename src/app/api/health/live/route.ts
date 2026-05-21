import { withErrorHandler } from '@/lib/with-error-handler';
import { NextResponse } from "next/server";

/**
 * Liveness probe — always returns 200 if the process is running.
 * No dependency checks. Used by orchestrators to detect hung processes.
 */
export const GET = withErrorHandler(async () => { return NextResponse.json({
  status: "alive",
  timestamp: Date.now(),
  uptime: process.uptime(),
}); });
