import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { ensureParticipantColumns } from "@/lib/session-columns";
import { getAuthToken } from '@/lib/auth-token';
import { unauthorizedError, notFoundError } from '@/lib/error-response';
import { logger } from '@/lib/logger';
import { safeParseWarn } from "@/lib/safe-json";
import type { DbRow } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return unauthorizedError();

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
    return notFoundError("Session");
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

  // Get participants
  const participants = db.prepare(`
    SELECT u.id, u.username, sp.role, sp.character_name, sp.joined_at
    FROM session_participants sp
    JOIN users u ON sp.user_id = u.id
    WHERE sp.session_id = ?
    ORDER BY sp.joined_at ASC
  `).all(id);

  // Get scene state + turn config in single query (eliminates 4 separate queries)
  const combined = db.prepare(`
    SELECT
      ss.id as ss_id,
      ss.session_id as ss_session_id,
      ss.active_location_id,
      ss.current_goal,
      ss.emotional_tone,
      ss.active_npcs,
      ss.active_threads,
      ss.scene_summary,
      ss.updated_at as ss_updated_at,
      tm.value as turn_mode_value,
      tov.value as turn_order_value,
      ct.value as current_turn_value
    FROM (SELECT 1) AS dummy
    LEFT JOIN scene_states ss ON ss.session_id = ?
    LEFT JOIN session_config tm ON tm.session_id = ? AND tm.key = 'turn_mode'
    LEFT JOIN session_config tov ON tov.session_id = ? AND tov.key = 'turn_order'
    LEFT JOIN session_config ct ON ct.session_id = ? AND ct.key = 'current_turn'
    ORDER BY ss.updated_at DESC
    LIMIT 1
  `).get(id, id, id, id, id) as DbRow | undefined;

  const sceneState = combined && (combined as Record<string, unknown>).ss_id
    ? {
        id: (combined as Record<string, unknown>).ss_id,
        session_id: (combined as Record<string, unknown>).ss_session_id,
        active_location_id: (combined as Record<string, unknown>).active_location_id,
        current_goal: (combined as Record<string, unknown>).current_goal,
        emotional_tone: (combined as Record<string, unknown>).emotional_tone,
        active_npcs: (combined as Record<string, unknown>).active_npcs,
        active_threads: (combined as Record<string, unknown>).active_threads,
        scene_summary: (combined as Record<string, unknown>).scene_summary,
        updated_at: (combined as Record<string, unknown>).ss_updated_at,
      }
    : null;

  let turnConfig: { turnMode: string; turnOrder: string[]; currentTurn: string | null } = {
    turnMode: "freeform",
    turnOrder: [],
    currentTurn: null,
  };
  try {
    turnConfig = {
      turnMode: ((combined as Record<string, unknown>)?.turn_mode_value as string) || "freeform",
      turnOrder: safeParseWarn<string[]>((combined as Record<string, unknown>)?.turn_order_value as string, "turn order", []) ?? [],
      currentTurn: ((combined as Record<string, unknown>)?.current_turn_value as string) || null,
    };
  } catch (err) { logger.warn("[sessions] turn config parse failed:", err); }

  return NextResponse.json({
    session,
    messages,
    sceneState,
    participants,
    turnConfig,
    isOwner: (session as Record<string, unknown>).owner_id === decoded.sub,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return unauthorizedError();

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
  const token = getAuthToken(request);
  if (!token) return unauthorizedError();

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
