import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId } = await params;
  const db = getDb();

  // Verify session access
  const session = db.prepare(
    "SELECT id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (SELECT session_id FROM session_participants WHERE user_id = ?))"
  ).get(sessionId, decoded.sub, decoded.sub);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const sceneState = db.prepare(
    "SELECT * FROM scene_states WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1"
  ).get(sessionId) as Record<string, any> | undefined;

  if (!sceneState) {
    return NextResponse.json({ sceneState: null });
  }

  // Parse JSON fields
  return NextResponse.json({
    sceneState: {
      id: sceneState.id,
      location: sceneState.active_location_id,
      goal: sceneState.current_goal,
      tone: sceneState.emotional_tone,
      activeNpcs: sceneState.active_npcs ? JSON.parse(sceneState.active_npcs) : [],
      activeThreads: sceneState.active_threads ? JSON.parse(sceneState.active_threads) : [],
      sceneSummary: sceneState.scene_summary,
      updatedAt: sceneState.updated_at,
    },
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

  const { id: sessionId } = await params;
  const db = getDb();

  // Verify session access
  const session = db.prepare(
    "SELECT id FROM sessions WHERE id = ? AND owner_id = ?"
  ).get(sessionId, decoded.sub);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const body = await request.json();
  const { location, goal, tone, activeNpcs, activeThreads, sceneSummary } = body;

  // Check if scene state already exists
  const existing = db.prepare(
    "SELECT id FROM scene_states WHERE session_id = ?"
  ).get(sessionId);

  if (existing) {
    db.prepare(
      `UPDATE scene_states
       SET active_location_id = COALESCE(?, active_location_id),
           current_goal = COALESCE(?, current_goal),
           emotional_tone = COALESCE(?, emotional_tone),
           active_npcs = COALESCE(?, active_npcs),
           active_threads = COALESCE(?, active_threads),
           scene_summary = COALESCE(?, scene_summary),
           updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ?`
    ).run(
      location || null,
      goal || null,
      tone || null,
      activeNpcs ? JSON.stringify(activeNpcs) : null,
      activeThreads ? JSON.stringify(activeThreads) : null,
      sceneSummary || null,
      sessionId
    );
  } else {
    db.prepare(
      `INSERT INTO scene_states (id, session_id, active_location_id, current_goal, emotional_tone, active_npcs, active_threads, scene_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      sessionId,
      location || null,
      goal || null,
      tone || null,
      activeNpcs ? JSON.stringify(activeNpcs) : null,
      activeThreads ? JSON.stringify(activeThreads) : null,
      sceneSummary || null
    );
  }

  return NextResponse.json({ success: true });
}
