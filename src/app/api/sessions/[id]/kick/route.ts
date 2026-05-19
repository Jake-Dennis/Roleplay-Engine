import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { eventBus, SessionEvents } from "@/lib/event-bus";

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
  const { userId } = body;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const db = getDb();

  // Verify ownership
  const session = db.prepare(
    "SELECT id, owner_id FROM sessions WHERE id = ? AND owner_id = ?"
  ).get(sessionId, decoded.sub);

  if (!session) {
    return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
  }

  if (userId === decoded.sub) {
    return NextResponse.json({ error: "Cannot kick yourself. Transfer ownership or delete." }, { status: 400 });
  }

  // Get kicked user info before removing
  const kickedUser = db.prepare(
    "SELECT id, username FROM users WHERE id = ?"
  ).get(userId) as { id: string; username: string } | undefined;

  // Remove participant
  const result = db.prepare(
    "DELETE FROM session_participants WHERE session_id = ? AND user_id = ?"
  ).run(sessionId, userId);

  if (result.changes === 0) {
    return NextResponse.json({ error: "User is not a participant" }, { status: 404 });
  }

  // Emit SSE event
  eventBus.emit(`${SessionEvents.PARTICIPANT_KICKED}:${sessionId}`, {
    sessionId,
    userId,
    username: kickedUser?.username || "unknown",
    action: "kicked",
  });

  return NextResponse.json({ success: true });
}
