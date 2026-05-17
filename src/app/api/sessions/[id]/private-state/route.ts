import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

// Add private_state column to session_participants if not exists
function ensureColumn(db: any) {
  try {
    db.exec("ALTER TABLE session_participants ADD COLUMN private_state TEXT");
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

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId } = await params;
  const db = getDb();
  ensureColumn(db);

  const participant = db.prepare(
    "SELECT private_state FROM session_participants WHERE session_id = ? AND user_id = ?"
  ).get(sessionId, decoded.sub) as { private_state: string | null } | undefined;

  if (!participant) {
    // Check if user is the owner (owners don't have session_participants row)
    const isOwner = db.prepare(
      "SELECT id FROM sessions WHERE id = ? AND owner_id = ?"
    ).get(sessionId, decoded.sub);
    if (isOwner) {
      return NextResponse.json({ privateState: {} });
    }
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  let state: any = {};
  try {
    state = participant.private_state ? JSON.parse(participant.private_state) : {};
  } catch {}

  return NextResponse.json({ privateState: state });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId } = await params;
  const body = await request.json();
  const { state } = body;

  const db = getDb();
  ensureColumn(db);

  const result = db.prepare(
    "UPDATE session_participants SET private_state = ? WHERE session_id = ? AND user_id = ?"
  ).run(JSON.stringify(state || {}), sessionId, decoded.sub);

  if (result.changes === 0) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
