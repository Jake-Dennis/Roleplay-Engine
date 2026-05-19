import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

// Ensure character_name column exists in session_participants
function ensureParticipantColumns(db: any) {
  try {
    db.exec("ALTER TABLE session_participants ADD COLUMN character_name TEXT");
  } catch {
    // Column already exists
  }
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
  ensureParticipantColumns(db);

  // Verify access
  const session = db.prepare(
    "SELECT id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (SELECT session_id FROM session_participants WHERE user_id = ?))"
  ).get(sessionId, decoded.sub, decoded.sub);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Get all participants + owner
  const participants = db.prepare(`
    SELECT u.id, u.username, sp.role, sp.character_name, sp.joined_at
    FROM session_participants sp
    JOIN users u ON sp.user_id = u.id
    WHERE sp.session_id = ?
    ORDER BY sp.joined_at ASC
  `).all(sessionId);

  // Get owner info
  const owner = db.prepare(`
    SELECT u.id, u.username, 'owner' as role, NULL as character_name, s.created_at as joined_at
    FROM sessions s
    JOIN users u ON s.owner_id = u.id
    WHERE s.id = ?
  `).get(sessionId);

  return NextResponse.json({
    participants: participants || [],
    owner,
  });
}
