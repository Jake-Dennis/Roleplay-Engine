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
  const { name, universe_id, timeline_id } = body;

  if (!name) {
    return NextResponse.json({ error: "Session name is required" }, { status: 400 });
  }

  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(
    "INSERT INTO sessions (id, owner_id, name, universe_id, timeline_id, status) VALUES (?, ?, ?, ?, ?, 'active')"
  ).run(id, decoded.sub, name, universe_id || null, timeline_id || null);

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);

  return NextResponse.json({ session }, { status: 201 });
}
