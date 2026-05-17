import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { eventBus, SessionEvents } from "@/lib/event-bus";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId, messageId } = await params;
  const db = getDb();

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
      ).run(decoded.sub, msg.content);
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
  });
}
