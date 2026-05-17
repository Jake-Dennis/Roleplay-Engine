import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const db = getDb();
  const sessions = db.prepare(`
    SELECT s.*, u.username as owner_name
    FROM sessions s
    JOIN users u ON s.owner_id = u.id
    WHERE s.owner_id = ? OR s.id IN (
      SELECT session_id FROM session_participants WHERE user_id = ?
    )
    ORDER BY s.updated_at DESC
  `).all(decoded.sub, decoded.sub);

  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { name, universe_id, timeline_id, type = "solo" } = body;

  if (!name) {
    return NextResponse.json({ error: "Session name is required" }, { status: 400 });
  }

  if (!["solo", "group"].includes(type)) {
    return NextResponse.json({ error: "type must be 'solo' or 'group'" }, { status: 400 });
  }

  const db = getDb();
  const id = crypto.randomUUID();

  // Add type column if not exists
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN type TEXT DEFAULT 'solo'");
  } catch {}

  db.prepare(
    "INSERT INTO sessions (id, owner_id, name, universe_id, timeline_id, status, type) VALUES (?, ?, ?, ?, ?, 'active', ?)"
  ).run(id, decoded.sub, name, universe_id || null, timeline_id || null, type);

  // Auto-add owner as participant
  db.prepare(
    "INSERT OR IGNORE INTO session_participants (session_id, user_id, role) VALUES (?, ?, 'player')"
  ).run(id, decoded.sub);

  // Auto-create scene state for new session
  db.prepare(
    "INSERT INTO scene_states (id, session_id, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
  ).run(crypto.randomUUID(), id);

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);

  return NextResponse.json({ session }, { status: 201 });
}
