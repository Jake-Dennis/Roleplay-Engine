import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import type { DbDatabase } from "@/lib/types";
import { getAuthToken } from '@/lib/auth-token';
import { safeParseWarn } from "@/lib/safe-json";

// Ensure session_config table exists
function ensureTable(db: DbDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS session_config (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (session_id, key)
  )`);
}

const VALID_MODES = ["freeform", "ordered", "disabled", "free_for_all", "claim", "round_robin"];

// Normalize mode aliases
function normalizeMode(mode: string): string {
  switch (mode) {
    case "round_robin": return "ordered";
    case "free_for_all": return "freeform";
    default: return mode;
  }
}

function getTurnConfig(db: DbDatabase, sessionId: string) {
  const turnMode = db.prepare(
    "SELECT value FROM session_config WHERE session_id = ? AND key = 'turn_mode'"
  ).get(sessionId) as { value: string } | undefined;

  const turnOrder = db.prepare(
    "SELECT value FROM session_config WHERE session_id = ? AND key = 'turn_order'"
  ).get(sessionId) as { value: string } | undefined;

  const currentTurn = db.prepare(
    "SELECT value FROM session_config WHERE session_id = ? AND key = 'current_turn'"
  ).get(sessionId) as { value: string } | undefined;

  return {
    turnMode: turnMode?.value || "freeform",
    turnOrder: safeParseWarn<string[]>(turnOrder?.value, "turn order", []) ?? [],
    currentTurn: currentTurn?.value || null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId } = await params;
  const db = getDb();
  ensureTable(db);

  // Verify access
  const session = db.prepare(
    "SELECT id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (SELECT session_id FROM session_participants WHERE user_id = ?))"
  ).get(sessionId, decoded.sub, decoded.sub);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json(getTurnConfig(db, sessionId));
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId } = await params;
  const db = getDb();
  ensureTable(db);

  // Verify ownership
  const session = db.prepare(
    "SELECT id FROM sessions WHERE id = ? AND owner_id = ?"
  ).get(sessionId, decoded.sub);

  if (!session) {
    return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
  }

    requireJson(request);
    const body = await request.json();
  const { turnMode, turnOrder, currentTurn } = body;

  if (turnMode !== undefined) {
    const normalized = normalizeMode(turnMode);
    if (!VALID_MODES.includes(turnMode) && !VALID_MODES.includes(normalized)) {
      return NextResponse.json({ error: `Invalid turn mode. Valid: freeform, ordered, disabled, free_for_all, claim, round_robin` }, { status: 400 });
    }
    db.prepare(
      "INSERT OR REPLACE INTO session_config (session_id, key, value) VALUES (?, 'turn_mode', ?)"
    ).run(sessionId, normalized);
  }

  if (turnOrder !== undefined) {
    db.prepare(
      "INSERT OR REPLACE INTO session_config (session_id, key, value) VALUES (?, 'turn_order', ?)"
    ).run(sessionId, JSON.stringify(turnOrder));
  }

  if (currentTurn !== undefined) {
    db.prepare(
      "INSERT OR REPLACE INTO session_config (session_id, key, value) VALUES (?, 'current_turn', ?)"
    ).run(sessionId, currentTurn);
  }

  // Emit turn update event
  const config = getTurnConfig(db, sessionId);
  eventBus.emit(`${SessionEvents.TURN_UPDATED}:${sessionId}`, config);

  return NextResponse.json({ success: true, turnConfig: config });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId } = await params;
    requireJson(request);
    const body = await request.json();
  const { action } = body;

  const db = getDb();
  ensureTable(db);

  // Verify participant
  const participant = db.prepare(
    "SELECT sp.session_id, u.username FROM session_participants sp JOIN users u ON sp.user_id = u.id WHERE sp.session_id = ? AND sp.user_id = ?"
  ).get(sessionId, decoded.sub) as { session_id: string; username: string } | undefined;

  if (!participant) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  // Get current turn config
  const turnModeRow = db.prepare(
    "SELECT value FROM session_config WHERE session_id = ? AND key = 'turn_mode'"
  ).get(sessionId) as { value: string } | undefined;

  const turnOrderRow = db.prepare(
    "SELECT value FROM session_config WHERE session_id = ? AND key = 'turn_order'"
  ).get(sessionId) as { value: string } | undefined;

  const currentTurnRow = db.prepare(
    "SELECT value FROM session_config WHERE session_id = ? AND key = 'current_turn'"
  ).get(sessionId) as { value: string } | undefined;

  const turnMode = turnModeRow?.value || "freeform";

  if (action === "advance") {
    // Advance to next in order (works with ordered mode)
    const turnOrder: string[] = safeParseWarn<string[]>(turnOrderRow?.value, "turn order", []) ?? [];
    if (turnOrder.length === 0) {
      return NextResponse.json({ error: "No turn order configured" }, { status: 400 });
    }

    let currentIdx = currentTurnRow ? turnOrder.indexOf(currentTurnRow.value) : -1;
    let nextIdx = (currentIdx + 1) % turnOrder.length;
    const nextUserId = turnOrder[nextIdx];

    db.prepare(
      "INSERT OR REPLACE INTO session_config (session_id, key, value) VALUES (?, 'current_turn', ?)"
    ).run(sessionId, nextUserId);
  } else if (action === "claim") {
    // Claim the turn (sets current turn to the claiming user's username)
    db.prepare(
      "INSERT OR REPLACE INTO session_config (session_id, key, value) VALUES (?, 'current_turn', ?)"
    ).run(sessionId, participant.username);
  } else {
    return NextResponse.json({ error: "Invalid action. Use 'advance' or 'claim'." }, { status: 400 });
  }

  // Emit turn update event
  const config = getTurnConfig(db, sessionId);
  eventBus.emit(`${SessionEvents.TURN_UPDATED}:${sessionId}`, config);

  return NextResponse.json({ success: true, turnConfig: config });
}
