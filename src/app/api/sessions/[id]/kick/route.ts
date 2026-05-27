import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * POST /api/sessions/[id]/kick
 *
 * Removes a participant from the session. Only the session owner can
 * kick users. The owner cannot kick themselves. Emits a participant:kicked
 * SSE event.
 *
 * @param request - The incoming Next.js request object containing JSON body with userId
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { success: true }
 * @throws 400 - If userId is missing or user tries to kick themselves
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found, user is not the owner, or target is not a participant
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_write:${ip}`, "session_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: sessionId } = await params;
  requireJson(request);
  const body = await request.json();
const { userId: targetUserId } = body;

if (!targetUserId) {
  return NextResponse.json({ error: "userId is required" }, { status: 400 });
}

const db = getDb();

// Verify ownership
const session = db.prepare(
  "SELECT id, owner_id FROM sessions WHERE id = ? AND owner_id = ?"
).get(sessionId, userId);

if (!session) {
  return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
}

if (body.userId === userId) {
  return NextResponse.json({ error: "Cannot kick yourself. Transfer ownership or delete." }, { status: 400 });
}

// Get kicked user info before removing
const kickedUser = db.prepare(
  "SELECT id, username FROM users WHERE id = ?"
).get(targetUserId) as { id: string; username: string } | undefined;

// Remove participant
const result = db.prepare(
  "DELETE FROM session_participants WHERE session_id = ? AND user_id = ?"
).run(sessionId, targetUserId);

if (result.changes === 0) {
  return NextResponse.json({ error: "User is not a participant" }, { status: 404 });
}

// Emit SSE event
eventBus.emit(`${SessionEvents.PARTICIPANT_KICKED}:${sessionId}`, {
  sessionId,
  targetUserId,
  username: kickedUser?.username || "unknown",
  action: "kicked",
});

return NextResponse.json({ success: true }); });
