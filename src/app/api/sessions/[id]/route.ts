import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { ensureParticipantColumns } from "@/lib/session-columns";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  ensureParticipantColumns(db);

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

  // Get messages (A1: include has_siblings for branch indicator)
  const messages = db.prepare(`
    SELECT m.*, COALESCE(sp.character_name, u.username) as sender_name,
      (SELECT COUNT(*) > 0 FROM messages m2
       WHERE m2.parent_message_id = m.parent_message_id
       AND m2.id != m.id AND m2.is_deleted = 0) as has_siblings
    FROM messages m
    LEFT JOIN users u ON m.sender_id = u.id
    LEFT JOIN session_participants sp ON m.session_id = sp.session_id AND m.sender_id = sp.user_id
    WHERE m.session_id = ? AND m.is_deleted = 0
    ORDER BY m.rowid ASC
  `).all(id);

  // Get scene state (L4: no side effects — return null if missing)
  const sceneState = db.prepare(
    "SELECT * FROM scene_states WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1"
  ).get(id) || null;

  // Get participants
  const participants = db.prepare(`
    SELECT u.id, u.username, sp.role, sp.character_name, sp.joined_at
    FROM session_participants sp
    JOIN users u ON sp.user_id = u.id
    WHERE sp.session_id = ?
    ORDER BY sp.joined_at ASC
  `).all(id);

  // Get turn config
  let turnConfig: { turnMode: string; turnOrder: string[]; currentTurn: string | null } = {
    turnMode: "freeform",
    turnOrder: [],
    currentTurn: null,
  };
  try {
    const turnMode = db.prepare(
      "SELECT value FROM session_config WHERE session_id = ? AND key = 'turn_mode'"
    ).get(id) as { value: string } | undefined;
    const turnOrder = db.prepare(
      "SELECT value FROM session_config WHERE session_id = ? AND key = 'turn_order'"
    ).get(id) as { value: string } | undefined;
    const currentTurn = db.prepare(
      "SELECT value FROM session_config WHERE session_id = ? AND key = 'current_turn'"
    ).get(id) as { value: string } | undefined;
    turnConfig = {
      turnMode: turnMode?.value || "freeform",
      turnOrder: turnOrder ? JSON.parse(turnOrder.value) : [],
      currentTurn: currentTurn?.value || null,
    };
  } catch (err) { console.warn("[sessions] turn config parse failed:", err); }

  return NextResponse.json({
    session,
    messages,
    sceneState,
    participants,
    turnConfig,
    isOwner: (session as any).owner_id === decoded.sub,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
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

  const decoded = await verifyToken(token);
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
