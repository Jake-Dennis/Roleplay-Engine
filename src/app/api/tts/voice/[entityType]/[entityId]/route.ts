import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getAuthToken } from '@/lib/auth-token';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { entityType, entityId } = await params;
  const db = getDb();

  const assignment = db.prepare(
    "SELECT * FROM voice_assignments WHERE user_id = ? AND entity_type = ? AND entity_id = ?"
  ).get(decoded.sub, entityType, entityId);

  return NextResponse.json({ assignment: assignment ? camelizeKeys(assignment) : null });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { entityType, entityId } = await params;
    requireJson(request);
    const body = await request.json();
  const { voiceName, speed = 1.0, volume = 0.8 } = body;

  if (!voiceName) {
    return NextResponse.json({ error: "voiceName is required" }, { status: 400 });
  }

  const db = getDb();

  db.prepare(
    `INSERT INTO voice_assignments (id, user_id, entity_type, entity_id, voice_name, voice_speed, volume, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET
       voice_name = excluded.voice_name,
       voice_speed = excluded.voice_speed,
       volume = excluded.volume,
       updated_at = CURRENT_TIMESTAMP`
  ).run(
    crypto.randomUUID(),
    decoded.sub,
    entityType,
    entityId,
    voiceName,
    speed,
    volume
  );

  const assignment = db.prepare(
    "SELECT * FROM voice_assignments WHERE user_id = ? AND entity_type = ? AND entity_id = ?"
  ).get(decoded.sub, entityType, entityId);

  return NextResponse.json({ assignment: camelizeKeys(assignment), success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { entityType, entityId } = await params;
  const db = getDb();

  db.prepare(
    "DELETE FROM voice_assignments WHERE user_id = ? AND entity_type = ? AND entity_id = ?"
  ).run(decoded.sub, entityType, entityId);

  return NextResponse.json({ success: true });
}
