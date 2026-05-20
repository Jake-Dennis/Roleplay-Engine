import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { queueJob } from "@/lib/job-processor";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { unauthorizedError, notFoundError, forbiddenError, badRequestError, internalError } from "@/lib/error-response";
import { getAuthToken } from '@/lib/auth-token';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request);
    if (!token) return unauthorizedError();

    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const { id: sessionId } = await params;
    const { searchParams } = new URL(request.url);
    const db = getDb();

    // Verify session access
    const session = db.prepare(`
      SELECT * FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (
        SELECT session_id FROM session_participants WHERE user_id = ?
      ))
    `).get(sessionId, decoded.sub, decoded.sub);

    if (!session) {
      return notFoundError("Session");
    }

    // Cursor-based pagination
    const limitParam = searchParams.get("limit");
    const cursor = searchParams.get("cursor");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 500) : 100;

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

    const messages = db.prepare(query).all(...queryParams) as unknown[];

    let nextCursor: string | null = null;
    let resultMessages = messages;
    if ((messages as any[]).length > limit) {
      nextCursor = (messages as any[])[limit].id;
      resultMessages = (messages as any[]).slice(0, limit);
    }

    return NextResponse.json({ messages: resultMessages, nextCursor });
  } catch (err) {
    logger.error("GET /api/sessions/[id]/messages error:", err);
    return internalError();
  }
}

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
      SELECT * FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (
        SELECT session_id FROM session_participants WHERE user_id = ?
      ))
    `).get(sessionId, decoded.sub, decoded.sub) as { id: string; universe_id: string | null } | undefined;

    if (!session) {
      return notFoundError("Session");
    }

    // Check if user is an observer (cannot send messages)
    const participant = db.prepare(
      "SELECT role FROM session_participants WHERE session_id = ? AND user_id = ?"
    ).get(sessionId, decoded.sub) as { role: string } | undefined;

    if (participant?.role === "observer") {
      return forbiddenError();
    }

    const body = await request.json();
    const { content, personaId } = body;

    if (!content) {
      return badRequestError("Content is required");
    }

    // Verify persona belongs to user if provided
    if (personaId) {
      const persona = db.prepare(
        "SELECT id FROM personas WHERE id = ? AND user_id = ?"
      ).get(personaId, decoded.sub);
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
    ).run(messageId, sessionId, decoded.sub, content, lastMessage?.id || null, personaId || null);

    // Emit message created event for SSE
    eventBus.emit(`${SessionEvents.MESSAGE_CREATED}:${sessionId}`, {
      messageId,
      sessionId,
      senderId: decoded.sub,
      content,
    });

    // Queue background jobs for async processing
    queueJob(decoded.sub, "summarize_messages", {
      sessionId,
      messageId,
      content,
    }, "high", session.universe_id || undefined);

    queueJob(decoded.sub, "generate_embeddings", {
      sessionId,
      messageId,
      content,
      entityType: "message",
      entityId: messageId,
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

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    logger.error("POST /api/sessions/[id]/messages error:", err);
    return internalError();
  }
}
