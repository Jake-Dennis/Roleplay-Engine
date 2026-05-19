import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { writeRelationshipFiles } from "@/lib/relationship-markdown";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";

function getUniverseOwnerId(db: any, universeId: string): string | null {
  const universe = db.prepare(
    `SELECT u.user_id, u.group_id, g.owner_id as group_owner_id
     FROM universes u
     LEFT JOIN groups g ON u.group_id = g.id
     WHERE u.id = ?`
  ).get(universeId);

  if (!universe) return null;
  if (universe.group_id) {
    return universe.group_owner_id;
  }
  return universe.user_id;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const universeId = searchParams.get("universe_id");
  const groupId = searchParams.get("group_id");

  const db = getDb();
  ensureGroupSupport(db);

  let relationships: any[];

  if (groupId) {
    if (!isGroupMember(db, groupId, decoded.sub)) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    relationships = db.prepare(
      `SELECT r.id, r.user_id, r.universe_id, r.source_entity, r.target_entity, r.emotional_state, r.shared_history, r.relationship_stage, r.decay_rates, r.updated_at
       FROM relationships r
       WHERE r.universe_id IN (SELECT id FROM universes WHERE group_id = ?)
       ORDER BY r.updated_at DESC`
    ).all(groupId);
  } else if (universeId) {
    relationships = db.prepare(
      `SELECT r.id, r.user_id, r.universe_id, r.source_entity, r.target_entity, r.emotional_state, r.shared_history, r.relationship_stage, r.decay_rates, r.updated_at
       FROM relationships r
       WHERE r.universe_id = ?
       AND (r.user_id = ? OR r.universe_id IN (
         SELECT u.id FROM universes u WHERE u.group_id IN (
           SELECT group_id FROM group_members WHERE user_id = ?
         )
       ))
       ORDER BY r.updated_at DESC`
    ).all(universeId, decoded.sub, decoded.sub);
  } else {
    relationships = db.prepare(
      `SELECT r.id, r.user_id, r.universe_id, r.source_entity, r.target_entity, r.emotional_state, r.shared_history, r.relationship_stage, r.decay_rates, r.updated_at
       FROM relationships r
       WHERE r.user_id = ?
       OR r.universe_id IN (
         SELECT u.id FROM universes u WHERE u.group_id IN (
           SELECT group_id FROM group_members WHERE user_id = ?
         )
       )
       ORDER BY r.updated_at DESC`
    ).all(decoded.sub, decoded.sub);
  }

  return NextResponse.json({ relationships });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { sourceEntity, targetEntity, emotionalState, sharedHistory, relationshipStage, decayRates, universe_id } = body;

  if (!sourceEntity || !targetEntity) {
    return NextResponse.json({ error: "sourceEntity and targetEntity are required" }, { status: 400 });
  }

  const db = getDb();
  ensureGroupSupport(db);
  const id = crypto.randomUUID();

  const fileOwnerId = universe_id ? getUniverseOwnerId(db, universe_id) : decoded.sub;

  db.prepare(
    "INSERT INTO relationships (id, user_id, universe_id, source_entity, target_entity, emotional_state, shared_history, relationship_stage, decay_rates) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id, decoded.sub, universe_id || null, sourceEntity, targetEntity,
    emotionalState ? JSON.stringify(emotionalState) : JSON.stringify({ trust: 0.5, suspicion: 0 }),
    sharedHistory ? JSON.stringify(sharedHistory) : null,
    relationshipStage || "acquaintance",
    decayRates ? JSON.stringify(decayRates) : JSON.stringify({ trust: "low", suspicion: "very_low", loyalty: "low", resentment: "very_low", attraction: "medium", respect: "low", fear: "medium" })
  );

  const relationship = db.prepare("SELECT * FROM relationships WHERE id = ?").get(id);

  // Write relationship markdown files (directory-per-relationship)
  try {
    writeRelationshipFiles(relationship as import("@/lib/relationship-markdown").RelationshipRecord);
  } catch {
    // Filesystem errors should not break API response
  }

  return NextResponse.json({ relationship }, { status: 201 });
}
