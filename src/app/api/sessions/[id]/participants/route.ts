import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureParticipantColumns } from "@/lib/session-columns";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/sessions/[id]/participants
 *
 * Retrieves all participants and the owner for a session. Includes
 * user id, username, role, character name, and join time.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { participants: Participant[], owner: { id, username, role } }
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_read:${ip}`, "session_read");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: sessionId } = await params;
const db = getDb();
ensureParticipantColumns(db);

// Verify access
const session = db.prepare(
  "SELECT id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (SELECT session_id FROM session_participants WHERE user_id = ?))"
).get(sessionId, userId, userId);

if (!session) {
  return NextResponse.json({ error: "Session not found" }, { status: 404 });
}

// Get all participants + owner
const participants = db.prepare(`
  SELECT u.id, u.username, sp.role, sp.character_name, sp.joined_at
  FROM session_participants sp
  JOIN users u ON sp.user_id = u.id
  WHERE sp.session_id = ?
  ORDER BY sp.joined_at ASC
`).all(sessionId);

// Get owner info
const owner = db.prepare(`
  SELECT u.id, u.username, 'owner' as role, NULL as character_name, s.created_at as joined_at
  FROM sessions s
  JOIN users u ON s.owner_id = u.id
  WHERE s.id = ?
`).get(sessionId);

return NextResponse.json({
  participants: participants || [],
  owner,
}); });
