import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const session = db.prepare(`
    SELECT s.*, u.username as owner_name
    FROM sessions s
    JOIN users u ON s.owner_id = u.id
    WHERE s.id = ? AND (s.owner_id = ? OR s.id IN (
      SELECT session_id FROM session_participants WHERE user_id = ?
    ))
  `).get(id, decoded.sub, decoded.sub);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Get messages
  const messages = db.prepare(`
    SELECT m.*, u.username as sender_name
    FROM messages m
    LEFT JOIN users u ON m.sender_id = u.id
    WHERE m.session_id = ? AND m.is_deleted = 0
    ORDER BY m.timestamp ASC
  `).all(id);

  // Get scene state
  const sceneState = db.prepare(
    "SELECT * FROM scene_states WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1"
  ).get(id);

  return NextResponse.json({ session, messages, sceneState });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  // Verify ownership
  const session = db.prepare(
    "SELECT * FROM sessions WHERE id = ? AND owner_id = ?"
  ).get(id, decoded.sub);

  if (!session) {
    return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
  }

  const body = await request.json();
  const { name, status } = body;

  db.prepare(
    "UPDATE sessions SET name = COALESCE(?, name), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(name || null, status || null, id);

  const updated = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);

  return NextResponse.json({ session: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const session = db.prepare(
    "SELECT * FROM sessions WHERE id = ? AND owner_id = ?"
  ).get(id, decoded.sub);

  if (!session) {
    return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
  }

  // Delete messages, participants, scene state, then session
  db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM session_participants WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM scene_states WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);

  return NextResponse.json({ success: true });
}
