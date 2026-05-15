import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

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

  // Delete this message and all after it
  const subsequentMessages = db.prepare(
    "SELECT id FROM messages WHERE session_id = ? AND timestamp >= ? AND is_deleted = 0"
  ).all(sessionId, message.timestamp) as { id: string }[];

  if (subsequentMessages.length > 0) {
    const ids = subsequentMessages.map((m) => m.id);
    const placeholders = ids.map(() => "?").join(",");

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
  }

  return NextResponse.json({
    success: true,
    deletedCount: subsequentMessages.length,
    lastValidMessageId: message.id,
  });
}
