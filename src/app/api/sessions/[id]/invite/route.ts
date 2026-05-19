import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import type { DbDatabase } from "@/lib/types";

// Ensure invitations table exists
function ensureTable(db: DbDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    inviter_id TEXT NOT NULL REFERENCES users(id),
    invitee_id TEXT NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, invitee_id)
  )`);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId } = await params;
  const body = await request.json();
  const { username } = body;

  if (!username) {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }

  const db = getDb();
  ensureTable(db);

  // Verify session ownership
  const session = db.prepare(
    "SELECT id, owner_id FROM sessions WHERE id = ? AND owner_id = ?"
  ).get(sessionId, decoded.sub);

  if (!session) {
    return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
  }

  // Find user by username
  const targetUser = db.prepare(
    "SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)"
  ).get(username) as { id: string; username: string } | undefined;

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (targetUser.id === decoded.sub) {
    return NextResponse.json({ error: "Cannot invite yourself" }, { status: 400 });
  }

  // Check if already a participant
  const existing = db.prepare(
    "SELECT session_id FROM session_participants WHERE session_id = ? AND user_id = ?"
  ).get(sessionId, targetUser.id);

  if (existing) {
    return NextResponse.json({ error: "User is already a participant" }, { status: 409 });
  }

  // Check for existing pending invitation
  const existingInvite = db.prepare(
    "SELECT id, status FROM invitations WHERE session_id = ? AND invitee_id = ?"
  ).get(sessionId, targetUser.id) as { id: string; status: string } | undefined;

  if (existingInvite && existingInvite.status === "pending") {
    return NextResponse.json({ error: "Invitation already pending for this user" }, { status: 409 });
  }

  // Upsert invitation
  if (existingInvite) {
    db.prepare(
      "UPDATE invitations SET status = 'pending', created_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(existingInvite.id);
  } else {
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO invitations (id, session_id, inviter_id, invitee_id) VALUES (?, ?, ?, ?)"
    ).run(id, sessionId, decoded.sub, targetUser.id);
  }

  // Emit SSE event
  eventBus.emit(`${SessionEvents.PARTICIPANT_INVITED}:${sessionId}`, {
    sessionId,
    userId: targetUser.id,
    username: targetUser.username,
    inviterId: decoded.sub,
    action: "invited",
  });

  return NextResponse.json({
    success: true,
    invitee: { id: targetUser.id, username: targetUser.username },
  });
}

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
  ensureTable(db);

  // Verify access
  const session = db.prepare(
    "SELECT id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (SELECT session_id FROM session_participants WHERE user_id = ?))"
  ).get(sessionId, decoded.sub, decoded.sub);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Get pending invitations
  const invitations = db.prepare(`
    SELECT i.id, i.status, i.created_at,
      inviter.id as inviter_id, inviter.username as inviter_username,
      invitee.id as invitee_id, invitee.username as invitee_username
    FROM invitations i
    JOIN users inviter ON i.inviter_id = inviter.id
    JOIN users invitee ON i.invitee_id = invitee.id
    WHERE i.session_id = ? AND i.status = 'pending'
    ORDER BY i.created_at DESC
  `).all(sessionId);

  return NextResponse.json({ invitations });
}
