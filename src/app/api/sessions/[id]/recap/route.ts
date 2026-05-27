import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withAuth } from '@/lib/with-auth';
import { queueJob } from "@/lib/job-processor";
import { notFoundError, serverError } from "@/lib/error-response";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * POST /api/sessions/[id]/recap
 *
 * Queues a background job to generate a session recap/summary. The
 * job processes the session's messages and produces a condensed
 * narrative summary.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { jobId } (201) — the job ID for tracking progress
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found
 * @throws 429 - If rate limit exceeded
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult.auth;

    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(`session_write:${ip}`, "session_write");
    if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

    const { id: sessionId } = await params;
    const db = getDb();

    // Verify session access
    const session = db.prepare(`
      SELECT id, universe_id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (
        SELECT session_id FROM session_participants WHERE user_id = ?
      ))
    `).get(sessionId, userId, userId) as { id: string; universe_id: string | null } | undefined;

    if (!session) {
      return notFoundError("Session");
    }

    const jobId = queueJob(
      userId,
      "generate_session_recap",
      { sessionId, userId },
      "medium",
      session.universe_id || undefined
    );

    return NextResponse.json({ jobId }, { status: 201 });
  } catch (err: unknown) {
    return serverError(err);
  }
}
