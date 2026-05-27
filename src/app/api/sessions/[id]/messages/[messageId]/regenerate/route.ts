import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * POST /api/sessions/[id]/messages/[messageId]/regenerate
 *
 * Regenerates a session from a specific message onward. Soft-deletes the
 * target message and all subsequent messages, then returns the last valid
 * user message data so the client can trigger a fresh generation. Cleans
 * up summaries, embeddings, and TTS cache for deleted messages.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing session id and message id to regenerate from
 * @returns NextResponse with { success, deletedCount, lastValidMessageId, lastUserMessageId, lastUserMessage, sessionName }
 * @throws 401 - If authentication fails or token is missing
 * @throws 403 - If user does not have access to the session
 * @throws 404 - If session or message is not found
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string; messageId: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_write:${ip}`, "session_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: sessionId, messageId } = await params;
const db = getDb();

// Verify session access
const sessionAccess = db.prepare(
  "SELECT 1 FROM session_participants WHERE session_id = ? AND user_id = ?"
).get(sessionId, userId);
const sessionOwner = db.prepare(
  "SELECT 1 FROM sessions WHERE id = ? AND owner_id = ?"
).get(sessionId, userId);
if (!sessionAccess && !sessionOwner) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// Verify message exists and belongs to session
const message = db.prepare(
  "SELECT * FROM messages WHERE id = ? AND session_id = ? AND is_deleted = 0"
).get(messageId, sessionId) as { id: string; timestamp: string } | undefined;

if (!message) {
  return NextResponse.json({ error: "Message not found" }, { status: 404 });
}

// Delete this message and all after it (use rowid for precise ordering, not timestamp)
const subsequentMessages = db.prepare(
  "SELECT id, content FROM messages WHERE session_id = ? AND rowid >= (SELECT rowid FROM messages WHERE id = ?) AND is_deleted = 0 ORDER BY rowid ASC"
).all(sessionId, messageId) as { id: string; content: string }[];

if (subsequentMessages.length > 0) {
  const ids = subsequentMessages.map((m) => m.id);
  const placeholders = ids.map(() => "?").join(",");

  // Clear parent_message_id references to avoid FK constraint violations
  db.prepare(
    `UPDATE messages SET parent_message_id = NULL WHERE parent_message_id IN (${placeholders})`
  ).run(...ids);

  db.prepare(
    `UPDATE messages SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`
  ).run(...ids);

  // Clean up summaries and embeddings
  db.prepare(
    `DELETE FROM message_summaries WHERE source_message_id IN (${placeholders})`
  ).run(...ids);
  db.prepare(
    `DELETE FROM embedding_index WHERE entity_type = 'message' AND entity_id IN (${placeholders})`
  ).run(...ids);

    // Clean up TTS cache entries for deleted messages
    for (const msg of subsequentMessages) {
      db.prepare(
        "DELETE FROM tts_cache WHERE user_id = ? AND text_content = ?"
      ).run(userId, msg.content);
    }

  // Emit delete events
  for (const mid of ids) {
    eventBus.emit(`${SessionEvents.MESSAGE_DELETED}:${sessionId}`, {
      messageId: mid,
      sessionId,
    });
  }
}

// Find the last user message before the regenerated message (to chain generation)
const lastUserMessage = db.prepare(
  "SELECT id, content FROM messages WHERE session_id = ? AND rowid < (SELECT rowid FROM messages WHERE id = ?) AND sender_id IS NOT NULL AND is_deleted = 0 ORDER BY rowid DESC LIMIT 1"
).get(sessionId, messageId) as { id: string; content: string } | undefined;

// B1: No job queued here — client calls triggerGeneration() which uses
// the direct streaming path (/api/generate/[id]) with full context retrieval.
// The job queue path has no context and would produce a duplicate response.

return NextResponse.json({
  success: true,
  deletedCount: subsequentMessages.length,
  lastValidMessageId: message.id,
  lastUserMessageId: lastUserMessage?.id || null,
  lastUserMessage: lastUserMessage?.content || null,
  sessionName: (
    db.prepare("SELECT name FROM sessions WHERE id = ?").get(sessionId) as { name: string }
  )?.name,
}); });
