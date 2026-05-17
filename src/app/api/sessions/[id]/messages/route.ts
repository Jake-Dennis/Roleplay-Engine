import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
// import { indexMessageForSearch } from "@/lib/semantic-intent-fallback";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const { id: sessionId } = await params;
    const db = getDb();

    // Verify session access
    const session = db.prepare(`
      SELECT * FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (
        SELECT session_id FROM session_participants WHERE user_id = ?
      ))
    `).get(sessionId, decoded.sub, decoded.sub);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const messages = db.prepare(`
      SELECT m.*, u.username as sender_name
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.session_id = ? AND m.is_deleted = 0
      ORDER BY m.timestamp ASC
    `).all(sessionId);

    return NextResponse.json({ messages });
  } catch (err) {
    console.error("GET /api/sessions/[id]/messages error:", err);
    return NextResponse.json({ error: "Internal server error", details: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const { id: sessionId } = await params;
    const db = getDb();

    // Verify session access
    const session = db.prepare(`
      SELECT * FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (
        SELECT session_id FROM session_participants WHERE user_id = ?
      ))
    `).get(sessionId, decoded.sub, decoded.sub);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Check if user is an observer (cannot send messages)
    const participant = db.prepare(
      "SELECT role FROM session_participants WHERE session_id = ? AND user_id = ?"
    ).get(sessionId, decoded.sub) as { role: string } | undefined;

    if (participant?.role === "observer") {
      return NextResponse.json({ error: "Observers cannot send messages" }, { status: 403 });
    }

    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const messageId = crypto.randomUUID();

    // Find the last active message to set as parent
    const lastMessage = db.prepare(
      "SELECT id FROM messages WHERE session_id = ? AND is_deleted = 0 ORDER BY rowid DESC LIMIT 1"
    ).get(sessionId) as { id: string } | undefined;

    db.prepare(
      "INSERT INTO messages (id, session_id, sender_id, content, parent_message_id) VALUES (?, ?, ?, ?, ?)"
    ).run(messageId, sessionId, decoded.sub, content, lastMessage?.id || null);

    // Update session timestamp
    db.prepare("UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);

    const message = db.prepare(`
      SELECT m.*, u.username as sender_name
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `).get(messageId);

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error("POST /api/sessions/[id]/messages error:", err);
    return NextResponse.json({ error: "Internal server error", details: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
