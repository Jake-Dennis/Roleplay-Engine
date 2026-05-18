import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { cancelSessionJobs } from "@/lib/job-processor";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId, messageId } = await params;
  const db = getDb();

  const body = await request.json();
  const { content, regenerate = true } = body;

  if (!content) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  // Verify message belongs to session and user owns it (or is session owner)
  const message = db.prepare(
    "SELECT * FROM messages WHERE id = ? AND session_id = ? AND is_deleted = 0"
  ).get(messageId, sessionId) as { id: string; timestamp: string } | undefined;

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Capture old content for edit history
  const oldContent = (message as any).content;

  // A1: Create a new version with parent_message_id for conversation branching
  // Soft-delete the original, insert new message pointing to it
  const newMessageId = crypto.randomUUID();
  db.prepare(
    "UPDATE messages SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(messageId);

  db.prepare(
    "INSERT INTO messages (id, session_id, sender_id, content, timestamp, parent_message_id) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)"
  ).run(newMessageId, sessionId, (message as any).sender_id, content, messageId);

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
  ).run(editId, messageId, decoded.sub, oldContent, content);

  // H4: Fetch the newly created message for the response
  let newMessage = db.prepare(`
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
        ).run(decoded.sub, msg.content);
      }
    }

    // Cancel any pending generate_response jobs for this session
    cancelSessionJobs(decoded.sub, sessionId);

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
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId, messageId } = await params;
  const db = getDb();

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

      // Clean up
    db.prepare(
      `DELETE FROM message_summaries WHERE source_message_id IN (${placeholders})`
    ).run(...ids);
    db.prepare(
      `DELETE FROM embedding_index WHERE entity_type = 'message' AND entity_id IN (${placeholders})`
    ).run(...ids);

    // Clean up TTS cache entries for deleted messages
    const deletedContents = subsequentMessages.map((m) => m.content);
    for (const content of deletedContents) {
      db.prepare(
        "DELETE FROM tts_cache WHERE user_id = ? AND text_content = ?"
      ).run(decoded.sub, content);
    }

    // Emit delete events
    for (const mid of ids) {
      eventBus.emit(`${SessionEvents.MESSAGE_DELETED}:${sessionId}`, {
        messageId: mid,
        sessionId,
      });
    }

    // Cancel any pending generate_response jobs for this session
    cancelSessionJobs(decoded.sub, sessionId);
  }

  return NextResponse.json({ success: true, deletedCount: subsequentMessages.length });
}
