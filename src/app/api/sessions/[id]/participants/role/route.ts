import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * PUT /api/sessions/[id]/participants/role
 *
 * Changes a participant's role between "participant" and "observer".
 * Only the session owner can change roles. Emits a participant:role_changed SSE event.
 *
 * @param request - The incoming Next.js request object containing JSON body with participant_id and role ("participant" | "observer")
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { success: true, role }
 * @throws 400 - If participant_id or role is missing, or role is invalid
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found, user is not the owner, or participant not found
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_write:${ip}`, "session_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: sessionId } = await params;
const db = getDb();

// Verify ownership
const session = db.prepare(
  "SELECT id FROM sessions WHERE id = ? AND owner_id = ?"
).get(sessionId, userId);

if (!session) {
  return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
}

  requireJson(request);
  const body = await request.json();
const { participant_id, role } = body;

if (!participant_id || !role) {
  return NextResponse.json({ error: "participant_id and role are required" }, { status: 400 });
}

if (!["participant", "observer"].includes(role)) {
  return NextResponse.json({ error: "Invalid role. Use 'participant' or 'observer'" }, { status: 400 });
}

const result = db.prepare(
  "UPDATE session_participants SET role = ? WHERE session_id = ? AND id = ?"
).run(role, sessionId, participant_id);

if (result.changes === 0) {
  return NextResponse.json({ error: "Participant not found" }, { status: 404 });
}

// Get username for event
const user = db.prepare(
  "SELECT username FROM users WHERE id = (SELECT user_id FROM session_participants WHERE id = ?)"
).get(participant_id) as { username: string } | undefined;

// Emit SSE event
eventBus.emit(`${SessionEvents.PARTICIPANT_ROLE_CHANGED}:${sessionId}`, {
  sessionId,
  participantId: participant_id,
  username: user?.username || "unknown",
  role,
  action: "role_changed",
});

return NextResponse.json({ success: true, role }); });
