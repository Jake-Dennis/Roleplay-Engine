import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { getAuthToken } from '@/lib/auth-token';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId } = await params;
  const userId = decoded.sub;
  const db = getDb();

  // Verify ownership (only owner can change persona)
  const session = db.prepare(
    "SELECT id FROM sessions WHERE id = ? AND owner_id = ?"
  ).get(sessionId, userId);

  if (!session) {
    return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
  }

  requireJson(request);
  const body = await request.json();

  const personaId: string | null = body.persona_id;

  // If persona_id is provided (not null), validate it belongs to the user
  if (personaId !== null && personaId !== undefined) {
    const persona = db.prepare(
      "SELECT id FROM personas WHERE id = ? AND user_id = ?"
    ).get(personaId, userId);

    if (!persona) {
      return NextResponse.json({ error: "Persona not found or does not belong to user" }, { status: 400 });
    }
  }

  // Update session
  db.prepare(
    "UPDATE sessions SET persona_id = ? WHERE id = ?"
  ).run(personaId === undefined ? null : personaId, sessionId);

  // Fetch updated session
  const updated = db.prepare(
    "SELECT id, persona_id FROM sessions WHERE id = ?"
  ).get(sessionId) as { id: string; persona_id: string | null };

  return NextResponse.json({ success: true, session: { persona_id: updated.persona_id } });
}
