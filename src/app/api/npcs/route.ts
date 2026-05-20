import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { getAuthToken } from '@/lib/auth-token';
import { validateLength } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const db = getDb();
  ensureGroupSupport(db);

  const { searchParams } = new URL(request.url);
  const universeId = searchParams.get('universe_id');

  let npcs;
  if (universeId) {
    npcs = db.prepare(
      "SELECT * FROM npcs WHERE user_id = ? AND universe_id = ? ORDER BY created_at DESC"
    ).all(decoded.sub, universeId);
  } else {
    npcs = db.prepare(
      "SELECT * FROM npcs WHERE user_id = ? ORDER BY created_at DESC"
    ).all(decoded.sub);
  }

  return NextResponse.json({ npcs: camelizeKeys(npcs) });
}

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const db = getDb();
  ensureGroupSupport(db);

  requireJson(request);
  const body = await request.json();
  const { name, description, personalityTraits, behaviorPatterns, voiceId, isCanon, universeId } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const nameError = validateLength(name, 200, "Name");
  if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
  const descError = validateLength(description || "", 5000, "Description");
  if (descError) return NextResponse.json({ error: descError }, { status: 400 });

  if (!universeId) {
    return NextResponse.json({ error: "Universe ID is required" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const isCanonValue = isCanon ? 1 : 0;

  db.prepare(
    `INSERT INTO npcs (id, user_id, universe_id, name, description, personality_traits, behavior_patterns, voice_id, is_canon)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, decoded.sub, universeId, name, description || null, personalityTraits || null, behaviorPatterns || null, voiceId || null, isCanonValue);

  const npc = db.prepare("SELECT * FROM npcs WHERE id = ?").get(id);

  return NextResponse.json({ npc: camelizeKeys(npc) }, { status: 201 });
}
