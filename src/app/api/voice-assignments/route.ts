import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { getAuthToken } from '@/lib/auth-token';
import { safeParse } from '@/lib/safe-json';

/**
 * GET /api/voice-assignments
 * Query: ?entityType=npc&entityId=xxx  → single entity assignment
 * Query: ?entityType=voice_profile     → all voice profiles for user
 * Returns the voice assignment for an entity, or null
 */
export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  const db = getDb();

  // List all voice profiles
  if (entityType === "voice_profile") {
    const rows = db.prepare(
      `SELECT id, entity_id, voice_name
       FROM voice_assignments
       WHERE user_id = ? AND entity_type = 'voice_profile'
       ORDER BY created_at DESC`
    ).all(decoded.sub) as {
      id: string;
      entity_id: string;
      voice_name: string;
    }[];

    const profiles = rows.map((row) => {
      const data = safeParse<{ name: string; slots: Array<{ voiceId: string; weight: number }> }>(row.voice_name);
      if (!data) return null;
      return {
        id: row.entity_id,
        name: data.name,
        slots: data.slots,
      };
    }).filter(Boolean);

    return NextResponse.json({ profiles });
  }

  // Single entity assignment (existing behavior)
  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
  }

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

  return NextResponse.json({ assignment: camelizeKeys(assignment) });
}

/**
 * PUT /api/voice-assignments
 * Create or update a voice assignment
 */
export async function PUT(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  requireJson(request);
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
 * POST /api/voice-assignments
 * Create a new voice profile
 */
export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  requireJson(request);
  const body = await request.json();
  const { id, name, slots } = body;

  if (!id || !name || !slots || !Array.isArray(slots)) {
    return NextResponse.json(
      { error: "id, name, and slots are required" },
      { status: 400 }
    );
  }

  const db = getDb();

  db.prepare(
    `INSERT INTO voice_assignments (id, user_id, entity_type, entity_id, voice_name, voice_speed, volume)
     VALUES (?, ?, 'voice_profile', ?, ?, 0, 0)`
  ).run(crypto.randomUUID(), decoded.sub, id, JSON.stringify({ name, slots }));

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/voice-assignments
 * Query: ?entityType=npc&entityId=xxx        → delete entity assignment
 * Query: ?profileId=xxx                       → delete voice profile
 */
export async function DELETE(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profileId");

  // Delete voice profile
  if (profileId) {
    const db = getDb();
    db.prepare(
      "DELETE FROM voice_assignments WHERE user_id = ? AND entity_type = 'voice_profile' AND entity_id = ?"
    ).run(decoded.sub, profileId);

    return NextResponse.json({ success: true });
  }

  // Delete entity assignment (existing behavior)
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
