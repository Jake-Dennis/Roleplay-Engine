import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import { writeRelationshipFiles, type RelationshipRow } from "@/lib/relationship-markdown";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";
import type { DbResult } from "@/lib/types";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * Lists relationships with optional filtering by universe or group.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with `{ relationships }` — array of camelCase relationship objects
 * @throws 401 - If authentication fails
 * @throws 403 - If not a member of the requested group
 * @throws 429 - If rate limit exceeded
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`relationship_read:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const { searchParams } = new URL(request.url);
  const universeId = searchParams.get("universe_id");
  const groupId = searchParams.get("group_id");

  const db = getDb();
  ensureGroupSupport(db);

  let relationships: DbResult[];

  if (groupId) {
    if (!isGroupMember(db, groupId, userId)) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    relationships = db.prepare(
      `SELECT r.id, r.user_id, r.universe_id, r.source_entity, r.target_entity, r.emotional_state, r.shared_history, r.relationship_stage, r.decay_rates, r.updated_at
       FROM relationships r
       WHERE r.universe_id IN (SELECT id FROM universes WHERE group_id = ?)
       ORDER BY r.updated_at DESC`
    ).all(groupId) as DbResult[];
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
    ).all(universeId, userId, userId) as DbResult[];
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
    ).all(userId, userId) as DbResult[];
  }

  return NextResponse.json({ relationships: camelizeKeys(relationships) });
}

/**
 * Creates a new relationship between two entities.
 *
 * @param request - The incoming Next.js request object with JSON body: `{ sourceEntity, targetEntity, emotionalState?, sharedHistory?, relationshipStage?, decayRates?, universe_id? }`
 * @returns NextResponse with `{ relationship }` (201) — the created relationship in camelCase
 * @throws 400 - If sourceEntity or targetEntity is missing
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`relationship_write:${ip}`, "relationship_write");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

    requireJson(request);
    const body = await request.json();
  const { sourceEntity, targetEntity, emotionalState, sharedHistory, relationshipStage, decayRates, universe_id } = body;

  if (!sourceEntity || !targetEntity) {
    return NextResponse.json({ error: "sourceEntity and targetEntity are required" }, { status: 400 });
  }

  const db = getDb();
  ensureGroupSupport(db);
  const id = crypto.randomUUID();

  db.prepare(
    "INSERT INTO relationships (id, user_id, universe_id, source_entity, target_entity, emotional_state, shared_history, relationship_stage, decay_rates) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id, userId, universe_id || null, sourceEntity, targetEntity,
    emotionalState ? JSON.stringify(emotionalState) : JSON.stringify({ trust: 0.5, suspicion: 0 }),
    sharedHistory ? JSON.stringify(sharedHistory) : null,
    relationshipStage || "acquaintance",
    decayRates ? JSON.stringify(decayRates) : JSON.stringify({ trust: "low", suspicion: "very_low", loyalty: "low", resentment: "very_low", attraction: "medium", respect: "low", fear: "medium" })
  );

  const relationship = db.prepare("SELECT * FROM relationships WHERE id = ?").get(id);

  // Write relationship markdown files (directory-per-relationship)
  try {
    writeRelationshipFiles(relationship as RelationshipRow);
  } catch {
    // Filesystem errors should not break API response
  }

  return NextResponse.json({ relationship: camelizeKeys(relationship) }, { status: 201 });
}
