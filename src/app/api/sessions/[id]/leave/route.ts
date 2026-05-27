import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * POST /api/sessions/[id]/leave
 *
 * Leaves a session. The owner cannot leave — they must transfer ownership
 * or delete the session. Emits a participant:left SSE event.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { success: true }
 * @throws 400 - If the user is the session owner (owner cannot leave)
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found or user is not a participant
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
const db = getDb();

// Can't leave if you're the owner
const session = db.prepare(
  "SELECT owner_id FROM sessions WHERE id = ?"
).get(sessionId) as { owner_id: string } | undefined;

if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
if (session.owner_id === userId) {
  return NextResponse.json({ error: "Owner cannot leave. Transfer ownership or delete the session." }, { status: 400 });
}

// Get user info before removing
const user = db.prepare("SELECT username FROM users WHERE id = ?").get(userId) as { username: string } | undefined;

// Remove participant
const result = db.prepare(
  "DELETE FROM session_participants WHERE session_id = ? AND user_id = ?"
).run(sessionId, userId);

if (result.changes === 0) {
  return NextResponse.json({ error: "Not a participant" }, { status: 404 });
}

// Emit SSE event
eventBus.emit(`${SessionEvents.PARTICIPANT_LEFT}:${sessionId}`, {
  sessionId,
  userId,
  username: user?.username || "unknown",
  action: "left",
});

return NextResponse.json({ success: true }); });
