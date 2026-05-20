import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { queueJob } from "@/lib/job-processor";
import { unauthorizedError, notFoundError, badRequestError, internalError } from "@/lib/error-response";
import { getAuthToken } from '@/lib/auth-token';
import { logger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request);
    if (!token) return unauthorizedError();

    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const { id: sessionId } = await params;
    const db = getDb();

    // Verify session access
    const session = db.prepare(`
      SELECT id, universe_id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (
        SELECT session_id FROM session_participants WHERE user_id = ?
      ))
    `).get(sessionId, decoded.sub, decoded.sub) as { id: string; universe_id: string | null } | undefined;

    if (!session) {
      return notFoundError("Session");
    }

    const jobId = queueJob(
      decoded.sub,
      "generate_session_recap",
      { sessionId },
      "medium",
      session.universe_id || undefined
    );

    return NextResponse.json({ jobId }, { status: 201 });
  } catch (err) {
    logger.error("POST /api/sessions/[id]/recap error:", err);
    return internalError();
  }
}
