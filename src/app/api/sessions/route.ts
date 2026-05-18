import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { getAuthToken } from "@/lib/auth-token";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const db = getDb();
  ensureGroupSupport(db);

  const url = new URL(request.url);
  const groupId = url.searchParams.get("group_id");
  const scope = url.searchParams.get("scope");

  let sessions: any[];

  if (groupId) {
    if (!isGroupMember(db, groupId, decoded.sub)) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    sessions = db.prepare(`
      SELECT s.*, u.username as owner_name
      FROM sessions s
      JOIN users u ON s.owner_id = u.id
      WHERE s.group_id = ?
      ORDER BY s.updated_at DESC
    `).all(groupId);
  } else if (scope === "personal") {
    // Only personal sessions
    sessions = db.prepare(`
      SELECT s.*, u.username as owner_name
      FROM sessions s
      JOIN users u ON s.owner_id = u.id
      WHERE s.group_id IS NULL AND (s.owner_id = ? OR s.id IN (
        SELECT session_id FROM session_participants WHERE user_id = ?
      ))
      ORDER BY s.updated_at DESC
    `).all(decoded.sub, decoded.sub);
  } else {
    // Return ALL sessions the user has access to (personal + all groups)
    sessions = db.prepare(`
      SELECT s.*, u.username as owner_name
      FROM sessions s
      JOIN users u ON s.owner_id = u.id
      WHERE s.owner_id = ? OR s.id IN (
        SELECT session_id FROM session_participants WHERE user_id = ?
      )
      ORDER BY s.updated_at DESC
    `).all(decoded.sub, decoded.sub);
  }

  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { name, universe_id, timeline_id, type = "solo", group_id } = body;

  if (!name) {
    return NextResponse.json({ error: "Session name is required" }, { status: 400 });
  }

  const db = getDb();
  ensureGroupSupport(db);

  if (group_id && !isGroupMember(db, group_id, decoded.sub)) {
    return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
  }

  const id = crypto.randomUUID();

  db.prepare(
    "INSERT INTO sessions (id, owner_id, name, universe_id, timeline_id, status, type, group_id) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)"
  ).run(id, decoded.sub, name, universe_id || null, timeline_id || null, type, group_id || null);

  db.prepare(
    "INSERT OR IGNORE INTO session_participants (session_id, user_id, role) VALUES (?, ?, 'player')"
  ).run(id, decoded.sub);

  db.prepare(
    "INSERT INTO scene_states (id, session_id, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
  ).run(crypto.randomUUID(), id);

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);

  return NextResponse.json({ session }, { status: 201 });
}
