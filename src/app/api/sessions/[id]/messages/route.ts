import crypto from "crypto";
import type { PaginatedRow } from '@/lib/types';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { queueJob } from "@/lib/job-processor";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { notFoundError, forbiddenError, badRequestError, serverError, requireJson } from "@/lib/error-response";
import { withAuth } from '@/lib/with-auth';
import { validateLength } from '@/lib/validation';
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from '@/lib/rate-limiter';

/**
 * GET /api/sessions/[id]/messages
 *
 * Retrieves paginated messages for a session using cursor-based pagination.
 * Returns messages in chronological order with sender info and optional
 * persona name/avatar.
 *
 * @param request - The incoming Next.js request object with optional query params: limit (default 100, max 500), cursor
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { messages: Message[], nextCursor: string | null }
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found
 * @throws 429 - If rate limit exceeded
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult.auth;

    const { id: sessionId } = await params;
    const { searchParams } = new URL(request.url);
    const db = getDb();

    // Verify session access
    const session = db.prepare(`
      SELECT * FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (
        SELECT session_id FROM session_participants WHERE user_id = ?
      ))
    `).get(sessionId, userId, userId);

    if (!session) {
      return notFoundError("Session");
    }

    // Cursor-based pagination
    const limitParam = searchParams.get("limit");
    const cursor = searchParams.get("cursor");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100000) : 100;

    let query = `
      SELECT m.*, u.username as sender_name, p.name as persona_name, p.avatar_url as persona_avatar
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      LEFT JOIN personas p ON m.persona_id = p.id
      WHERE m.session_id = ? AND m.is_deleted = 0
    `;
    const queryParams: unknown[] = [sessionId];

    if (cursor) {
      const cursorMsg = db.prepare(
        "SELECT timestamp FROM messages WHERE id = ? AND session_id = ?"
      ).get(cursor, sessionId) as { timestamp: string } | undefined;

      if (cursorMsg) {
        query += " AND (m.timestamp, m.id) > (?, ?)";
        queryParams.push(cursorMsg.timestamp, cursor);
      }
    }

    query += " ORDER BY m.timestamp ASC, m.id ASC LIMIT ?";
    queryParams.push(limit + 1);

    const messages = db.prepare(query).all(...queryParams) as PaginatedRow[];

    let nextCursor: string | null = null;
    let resultMessages = messages;
    if (messages.length > limit) {
      nextCursor = messages[limit].id;
      resultMessages = messages.slice(0, limit);
    }

    return NextResponse.json({ messages: camelizeKeys(resultMessages), nextCursor });
  } catch (err: unknown) {
    return serverError(err);
  }
}

/**
 * POST /api/sessions/[id]/messages
 *
 * Sends a new message in the session. Creates the message record, emits
 * an SSE event, and queues background jobs for summarization and embedding
 * generation. Observers cannot send messages.
 *
 * @param request - The incoming Next.js request object containing JSON body with content and optional personaId
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { message: Message } (201)
 * @throws 400 - If content is missing or exceeds 100000 characters
 * @throws 401 - If authentication fails or token is missing
 * @throws 403 - If user is an observer (read-only role)
 * @throws 404 - If session or persona is not found
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

    const { id: sessionId } = await params;
    const db = getDb();

    cleanupExpiredEntries();
    const limit = checkRateLimit(`message_send:${userId}`, "message_send");
    if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);

    // Verify session access
    const session = db.prepare(`
      SELECT * FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (
        SELECT session_id FROM session_participants WHERE user_id = ?
      ))
    `).get(sessionId, userId, userId) as { id: string; universe_id: string | null; name: string | null } | undefined;

    if (!session) {
      return notFoundError("Session");
    }

    // Check if user is an observer (cannot send messages)
    const participant = db.prepare(
      "SELECT role FROM session_participants WHERE session_id = ? AND user_id = ?"
    ).get(sessionId, userId) as { role: string } | undefined;

    if (participant?.role === "observer") {
      return forbiddenError();
    }

    requireJson(request);
    const body = await request.json();
    const { content, personaId } = body;

    if (!content) {
      return badRequestError("Content is required");
    }

    const contentError = validateLength(content, 100000, "Content");
    if (contentError) return badRequestError(contentError);

    // Verify persona belongs to user if provided
    if (personaId) {
      const persona = db.prepare(
        "SELECT id FROM entity_registry WHERE id = ? AND user_id = ?"
      ).get(personaId, userId);
      if (!persona) {
        return notFoundError("Persona");
      }
    }

    const messageId = crypto.randomUUID();

    // Find the last active message to set as parent
    const lastMessage = db.prepare(
      "SELECT id FROM messages WHERE session_id = ? AND is_deleted = 0 ORDER BY rowid DESC LIMIT 1"
    ).get(sessionId) as { id: string } | undefined;

    db.prepare(
      "INSERT INTO messages (id, session_id, sender_id, content, parent_message_id, persona_id) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(messageId, sessionId, userId, content, lastMessage?.id || null, personaId || null);

    // Auto-create timeline entry for session start on first message
    try {
      const msgCount = db.prepare(
        "SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND is_deleted = 0"
      ).get(sessionId) as { count: number } | undefined;
      if (msgCount && msgCount.count === 1) {
        const entryId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO timeline_entries (id, user_id, universe_id, session_id, thread_id, title, description, occurred_at, entry_type, importance)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'session_start', 'medium')
        `).run(entryId, userId, session.universe_id, sessionId, null, session.name || "Session started", null);
      }
    } catch {
      // Non-fatal — timeline entry creation should not block message sending
    }

    // Look up persona name if personaId was provided
    let personaName: string | null = null;
    if (personaId) {
      const persona = db.prepare("SELECT display_name as name FROM entity_registry WHERE id = ?").get(personaId) as { name: string } | undefined;
      personaName = persona?.name || null;
    }

    // Emit message created event for SSE
    eventBus.emit(`${SessionEvents.MESSAGE_CREATED}:${sessionId}`, {
      id: messageId,
      sessionId,
      senderId: userId,
      content,
      personaId: personaId || null,
      personaName,
    });

    // Queue background jobs for async processing
    // NOTE: These queue for the USER's message (just inserted above at messageId).
    // The companion route (generate/[id]/route.ts) separately queues the SAME job
    // types for the AI's response (aiMessageId). Both are needed — each message
    // type (user vs AI) gets its own summarization + embedding.
    queueJob(userId, "summarize_messages", {
      sessionId,
      messageId,
      content,
    }, "high", session.universe_id || undefined);

    queueJob(userId, "generate_embeddings", {
      sessionId,
      messageId,
      content,
      entityType: "message",
      entityId: messageId,
      userId,
    }, "high", session.universe_id || undefined);

    // Update session timestamp
    db.prepare("UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);

    const message = db.prepare(`
      SELECT m.*, u.username as sender_name, p.name as persona_name, p.avatar_url as persona_avatar
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      LEFT JOIN personas p ON m.persona_id = p.id
      WHERE m.id = ?
    `).get(messageId);

    return NextResponse.json({ message: camelizeKeys(message) }, { status: 201 });
  } catch (err: unknown) {
    return serverError(err);
  }
}
