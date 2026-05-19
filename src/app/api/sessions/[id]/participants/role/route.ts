import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { eventBus, SessionEvents } from "@/lib/event-bus";

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

  // Verify ownership
  const session = db.prepare(
    "SELECT id FROM sessions WHERE id = ? AND owner_id = ?"
  ).get(sessionId, decoded.sub);

  if (!session) {
    return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
  }

  const body = await request.json();
  const { participant_id, role } = body;

  if (!participant_id || !role) {
    return NextResponse.json({ error: "participant_id and role are required" }, { status: 400 });
  }

  if (!["participant", "observer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role. Use 'participant' or 'observer'" }, { status: 400 });
  }

  const result = db.prepare(
    "UPDATE session_participants SET role = ? WHERE session_id = ? AND id = ?"
  ).run(role, sessionId, participant_id);

  if (result.changes === 0) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  // Get username for event
  const user = db.prepare(
    "SELECT username FROM users WHERE id = (SELECT user_id FROM session_participants WHERE id = ?)"
  ).get(participant_id) as { username: string } | undefined;

  // Emit SSE event
  eventBus.emit(`${SessionEvents.PARTICIPANT_INVITED}:${sessionId}`, {
    sessionId,
    participantId: participant_id,
    username: user?.username || "unknown",
    role,
    action: "role_changed",
  });

  return NextResponse.json({ success: true, role });
}
