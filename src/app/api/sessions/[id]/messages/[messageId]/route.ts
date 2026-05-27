import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { withAuth } from '@/lib/with-auth';
import { validateLength } from '@/lib/validation';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';
import { queueJob } from '@/lib/job-processor';

/**
 * PUT /api/sessions/[id]/messages/[messageId]
 *
 * Edits a message's content. Creates a branched copy of the message via
 * soft-delete + insert pattern. Optionally deletes all subsequent messages
 * (regenerate=true, the default) to allow re-generation downstream.
 * Records edit history in the message_edits table and emits SSE events.
 *
 * @param request - The incoming Next.js request object containing JSON body with content and optional regenerate boolean
 * @param params - Route parameters containing session id and message id
 * @returns NextResponse with { message, newMessage, regenerated, editedContent }
 * @throws 400 - If content is missing or exceeds 100000 characters
 * @throws 401 - If authentication fails or token is missing
 * @throws 403 - If user does not have access to the session
 * @throws 404 - If message is not found
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string; messageId: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_write:${ip}`, "session_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: sessionId, messageId } = await params;
const db = getDb();

  requireJson(request);
  const body = await request.json();
const { content, regenerate = true } = body;

if (!content) {
  return NextResponse.json({ error: "Content is required" }, { status: 400 });
}

const contentError = validateLength(content, 100000, "Content");
if (contentError) return NextResponse.json({ error: contentError }, { status: 400 });

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

// Verify message belongs to session and user owns it (or is session owner)
const message = db.prepare(
  "SELECT * FROM messages WHERE id = ? AND session_id = ? AND is_deleted = 0"
).get(messageId, sessionId) as Record<string, unknown> | undefined;

if (!message) {
  return NextResponse.json({ error: "Message not found" }, { status: 404 });
}

// Capture old content for edit history
const oldContent = message.content as string;

// A1: Create a new version with parent_message_id for conversation branching
// Soft-delete the original, insert new message pointing to it
const newMessageId = crypto.randomUUID();
db.prepare(
  "UPDATE messages SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?"
).run(messageId);

db.prepare(
  "INSERT INTO messages (id, session_id, sender_id, content, timestamp, parent_message_id) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)"
).run(newMessageId, sessionId, message.sender_id as string, content, messageId);

// Record edit history
db.prepare(
  `CREATE TABLE IF NOT EXISTS message_edits (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    old_content TEXT NOT NULL,
    new_content TEXT NOT NULL,
    edited_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
).run();

const editId = crypto.randomUUID();
db.prepare(
  "INSERT INTO message_edits (id, message_id, user_id, old_content, new_content) VALUES (?, ?, ?, ?, ?)"
).run(editId, messageId, userId, oldContent, content);

// H4: Fetch the newly created message for the response
const newMessage = db.prepare(`
  SELECT m.*, u.username as sender_name
  FROM messages m
  LEFT JOIN users u ON m.sender_id = u.id
  WHERE m.id = ?
`).get(newMessageId);

if (regenerate) {
  // Delete all messages after the original (use rowid for precise ordering)
  const subsequentMessages = db.prepare(
    "SELECT id, content FROM messages WHERE session_id = ? AND rowid > (SELECT rowid FROM messages WHERE id = ?) AND is_deleted = 0"
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
  }

  // B1: No job queued here — client calls triggerGeneration() which uses
  // the direct streaming path (/api/generate/[id]) with full context retrieval.
  // The job queue path has no context and would produce a duplicate response.
}

// Emit update event
eventBus.emit(`${SessionEvents.MESSAGE_UPDATED}:${sessionId}`, {
  messageId: newMessageId,
  sessionId,
  regenerate,
  content,
});

return NextResponse.json({
  message: { id: newMessageId, content },
  newMessage,
  regenerated: regenerate,
  editedContent: content,
}); });

/**
 * DELETE /api/sessions/[id]/messages/[messageId]
 *
 * Soft-deletes a message and all subsequent messages in the session.
 * Cleans up associated summaries, embeddings, TTS cache, and cancels
 * pending jobs. Queues re-extraction jobs so derived state (scene,
 * relationships) is rebuilt without the deleted messages.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing session id and message id
 * @returns NextResponse with { success: true, deletedCount }
 * @throws 401 - If authentication fails or token is missing
 * @throws 403 - If user does not have access to the session
 * @throws 404 - If message is not found
 * @throws 429 - If rate limit exceeded
 */
export const DELETE = withErrorHandler(async (request: NextRequest,
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

const message = db.prepare(
  "SELECT * FROM messages WHERE id = ? AND session_id = ? AND is_deleted = 0"
).get(messageId, sessionId) as { id: string; timestamp: string } | undefined;

if (!message) {
  return NextResponse.json({ error: "Message not found" }, { status: 404 });
}

// Delete this message and all after it (use rowid for precise ordering, not timestamp)
const subsequentMessages = db.prepare(
  "SELECT id, content FROM messages WHERE session_id = ? AND rowid >= (SELECT rowid FROM messages WHERE id = ?) AND is_deleted = 0"
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

  // Clean up message summaries
  db.prepare(
    `DELETE FROM message_summaries WHERE source_message_id IN (${placeholders})`
  ).run(...ids);

  // Clean up embeddings (vectors first to avoid FK issues, then index)
  db.prepare(
    `DELETE FROM embedding_vectors WHERE embedding_id IN (SELECT id FROM embedding_index WHERE entity_type = 'message' AND entity_id IN (${placeholders}))`
  ).run(...ids);
  db.prepare(
    `DELETE FROM embedding_index WHERE entity_type = 'message' AND entity_id IN (${placeholders})`
  ).run(...ids);

  // Cancel pending jobs referencing deleted messages
  for (const mid of ids) {
    db.prepare(
      `UPDATE job_queue SET status = 'cancelled', error = 'Source message deleted', processed_at = CURRENT_TIMESTAMP WHERE status = 'queued' AND payload LIKE ?`
    ).run(`%${mid}%`);
  }

  // Clean up TTS cache entries for deleted messages
  const deletedContents = subsequentMessages.map((m) => m.content);
  for (const content of deletedContents) {
    db.prepare(
      "DELETE FROM tts_cache WHERE user_id = ? AND text_content = ?"
    ).run(userId, content);
  }

  // Emit delete events
  for (const mid of ids) {
    eventBus.emit(`${SessionEvents.MESSAGE_DELETED}:${sessionId}`, {
      messageId: mid,
      sessionId,
    });
  }

  // Queue re-extraction jobs so derived state is rebuilt without deleted messages
  const session = db.prepare("SELECT universe_id FROM sessions WHERE id = ?").get(sessionId) as { universe_id: string | null } | undefined;
  const universeId = session?.universe_id || undefined;
  queueJob(userId, "scene_state_extract", {
    sessionId,
    userId,
    universeId,
  }, "low", universeId);
  queueJob(userId, "analyze_relationships", {
    sessionId,
    userId,
  }, "low", universeId);
}

return NextResponse.json({ success: true, deletedCount: subsequentMessages.length }); });
