import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/voice-assignments
 * Query: ?entityType=npc&entityId=xxx
 * Returns the voice assignment for an entity, or null
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
  }

  const db = getDb();

  const assignment = db.prepare(
    `SELECT id, entity_type, entity_id, voice_name, voice_speed, volume
     FROM voice_assignments
     WHERE user_id = ? AND entity_type = ? AND entity_id = ?`
  ).get(decoded.sub, entityType, entityId) as {
    id: string;
    entity_type: string;
    entity_id: string;
    voice_name: string;
    voice_speed: number;
    volume: number;
  } | undefined;

  if (!assignment) {
    return NextResponse.json({ assignment: null });
  }

  return NextResponse.json({ assignment });
}

/**
 * PUT /api/voice-assignments
 * Create or update a voice assignment
 */
export async function PUT(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { entityType, entityId, voiceName, voiceSpeed = 1.0, volume = 0.8 } = body;

  if (!entityType || !entityId || !voiceName) {
    return NextResponse.json(
      { error: "entityType, entityId, and voiceName are required" },
      { status: 400 }
    );
  }

  const db = getDb();

  // Upsert
  const existing = db.prepare(
    "SELECT id FROM voice_assignments WHERE user_id = ? AND entity_type = ? AND entity_id = ?"
  ).get(decoded.sub, entityType, entityId);

  if (existing) {
    db.prepare(
      `UPDATE voice_assignments
       SET voice_name = ?, voice_speed = ?, volume = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND entity_type = ? AND entity_id = ?`
    ).run(voiceName, voiceSpeed, volume, decoded.sub, entityType, entityId);
  } else {
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO voice_assignments (id, user_id, entity_type, entity_id, voice_name, voice_speed, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, decoded.sub, entityType, entityId, voiceName, voiceSpeed, volume);
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/voice-assignments
 * Query: ?entityType=npc&entityId=xxx
 */
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
  }

  const db = getDb();

  db.prepare(
    "DELETE FROM voice_assignments WHERE user_id = ? AND entity_type = ? AND entity_id = ?"
  ).run(decoded.sub, entityType, entityId);

  return NextResponse.json({ success: true });
}
