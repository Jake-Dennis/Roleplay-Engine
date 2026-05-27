import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/sessions/[id]/messages/[messageId]/edits
 *
 * Retrieves the edit history for a specific message. Returns all edits
 * sorted by most recent first, enriched with usernames of who made each edit.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing session id and message id
 * @returns NextResponse with { edits: Edit[] } where each edit includes id, userId, username, oldContent, newContent, editedAt
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session or message is not found
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string; messageId: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_read:${ip}`, "session_read");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: sessionId, messageId } = await params;
const db = getDb();

// Verify session access
const session = db.prepare(`
  SELECT id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (
    SELECT session_id FROM session_participants WHERE user_id = ?
  ))
`).get(sessionId, userId, userId);

if (!session) {
  return NextResponse.json({ error: "Session not found" }, { status: 404 });
}

// Verify message belongs to session
const message = db.prepare(
  "SELECT id FROM messages WHERE id = ? AND session_id = ?"
).get(messageId, sessionId);

if (!message) {
  return NextResponse.json({ error: "Message not found" }, { status: 404 });
}

// Get edit history
const edits = db.prepare(
  "SELECT id, user_id, old_content, new_content, edited_at FROM message_edits WHERE message_id = ? ORDER BY edited_at DESC"
).all(messageId) as {
  id: string;
  user_id: string;
  old_content: string;
  new_content: string;
  edited_at: string;
}[];

// Enrich with usernames
const enrichedEdits = edits.map((edit) => {
  const user = db.prepare(
    "SELECT username FROM users WHERE id = ?"
  ).get(edit.user_id) as { username: string } | undefined;
  return {
    id: edit.id,
    userId: edit.user_id,
    username: user?.username || "Unknown",
    oldContent: edit.old_content,
    newContent: edit.new_content,
    editedAt: edit.edited_at,
  };
});

return NextResponse.json({ edits: enrichedEdits }); });
