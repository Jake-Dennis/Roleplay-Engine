import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId, messageId } = await params;
  const db = getDb();

  // Verify session access
  const session = db.prepare(`
    SELECT id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (
      SELECT session_id FROM session_participants WHERE user_id = ?
    ))
  `).get(sessionId, decoded.sub, decoded.sub);

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

  return NextResponse.json({ edits: enrichedEdits });
}
