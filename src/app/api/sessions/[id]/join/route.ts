import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { eventBus, SessionEvents } from "@/lib/event-bus";

// Ensure character_name column exists
function ensureColumn(db: any) {
  try {
    db.exec("ALTER TABLE session_participants ADD COLUMN character_name TEXT");
  } catch {
    // Column already exists
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId } = await params;
  const db = getDb();
  ensureColumn(db);

  // Check session exists
  const session = db.prepare(
    "SELECT id, owner_id FROM sessions WHERE id = ? AND status = 'active'"
  ).get(sessionId) as { id: string; owner_id: string } | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found or not active" }, { status: 404 });
  }

  // Check if already a participant
  const existing = db.prepare(
    "SELECT session_id FROM session_participants WHERE session_id = ? AND user_id = ?"
  ).get(sessionId, decoded.sub);

  if (existing) {
    return NextResponse.json({ error: "Already a participant" }, { status: 409 });
  }

  if (session.owner_id === decoded.sub) {
    return NextResponse.json({ error: "You are the owner" }, { status: 409 });
  }

  // Check for a valid invitation (if not the owner)
  const invite = db.prepare(
    "SELECT id, status FROM invitations WHERE session_id = ? AND invitee_id = ? AND status = 'pending'"
  ).get(sessionId, decoded.sub) as { id: string; status: string } | undefined;

  if (!invite) {
    return NextResponse.json({ error: "No invitation found for this session" }, { status: 403 });
  }

  // Parse optional character_name from body
  const body = await request.json().catch(() => ({}));
  const characterName = body.character_name?.trim() || null;

  // Check character name uniqueness if provided
  if (characterName) {
    const taken = db.prepare(
      "SELECT id FROM session_participants WHERE session_id = ? AND character_name = ?"
    ).get(sessionId, characterName);
    if (taken) {
      return NextResponse.json({ error: `Character name "${characterName}" is already taken` }, { status: 409 });
    }
  }

  // Add as participant
  db.prepare(
    "INSERT INTO session_participants (session_id, user_id, role, character_name) VALUES (?, ?, 'participant', ?)"
  ).run(sessionId, decoded.sub, characterName);

  // Get username for event
  const user = db.prepare("SELECT username FROM users WHERE id = ?").get(decoded.sub) as { username: string } | undefined;

  // Update invitation
  db.prepare(
    "UPDATE invitations SET status = 'accepted' WHERE id = ?"
  ).run(invite.id);

  // Emit SSE event
  eventBus.emit(`${SessionEvents.PARTICIPANT_JOINED}:${sessionId}`, {
    sessionId,
    userId: decoded.sub,
    username: user?.username || "unknown",
    characterName,
    action: "joined",
  });

  return NextResponse.json({ success: true, role: "participant", character_name: characterName });
}
