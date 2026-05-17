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

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId } = await params;
  const db = getDb();

  // Can't leave if you're the owner
  const session = db.prepare(
    "SELECT owner_id FROM sessions WHERE id = ?"
  ).get(sessionId) as { owner_id: string } | undefined;

  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.owner_id === decoded.sub) {
    return NextResponse.json({ error: "Owner cannot leave. Transfer ownership or delete the session." }, { status: 400 });
  }

  // Get user info before removing
  const user = db.prepare("SELECT username FROM users WHERE id = ?").get(decoded.sub) as { username: string } | undefined;

  // Remove participant
  const result = db.prepare(
    "DELETE FROM session_participants WHERE session_id = ? AND user_id = ?"
  ).run(sessionId, decoded.sub);

  if (result.changes === 0) {
    return NextResponse.json({ error: "Not a participant" }, { status: 404 });
  }

  // Emit SSE event
  eventBus.emit(`${SessionEvents.PARTICIPANT_LEFT}:${sessionId}`, {
    sessionId,
    userId: decoded.sub,
    username: user?.username || "unknown",
    action: "left",
  });

  return NextResponse.json({ success: true });
}
