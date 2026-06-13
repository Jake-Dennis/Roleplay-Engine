import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { withAuth } from '@/lib/with-auth';
import { CONTENT_LIMITS } from '@/lib/config';
import { validateLength } from '@/lib/validation';
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from '@/lib/rate-limiter';

/**
 * Lists NPCs, optionally filtered by universe.
 *
 * @param request - The incoming Next.js request object (query param: `universe_id` optional)
 * @returns NextResponse with `{ npcs }` — array of camelCase NPC objects
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const db = getDb();
ensureGroupSupport(db);

const { searchParams } = new URL(request.url);
const universeId = searchParams.get('universe_id');

let npcs;
if (universeId) {
  npcs = db.prepare(
    "SELECT * FROM npcs WHERE user_id = ? AND universe_id = ? ORDER BY created_at DESC"
  ).all(userId, universeId);
} else {
  npcs = db.prepare(
    "SELECT * FROM npcs WHERE user_id = ? ORDER BY created_at DESC"
  ).all(userId);
}

return NextResponse.json({ npcs: camelizeKeys(npcs) }); });

/**
 * Creates a new NPC.
 *
 * @param request - The incoming Next.js request object with JSON body: `{ name, description?, personalityTraits?, behaviorPatterns?, voiceId?, isCanon?, universeId }`
 * @returns NextResponse with `{ npc }` (201) — the created NPC in camelCase
 * @throws 400 - If name or universeId is missing, or validation fails
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded (per-persona-npc rate limit)
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

cleanupExpiredEntries();
const limit = checkRateLimit(`persona_npc:${userId}`, "persona_npc");
if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);

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
const descError = validateLength(description || "", CONTENT_LIMITS.MEDIUM, "Description");
if (descError) return NextResponse.json({ error: descError }, { status: 400 });

if (!universeId) {
  return NextResponse.json({ error: "Universe ID is required" }, { status: 400 });
}

const id = crypto.randomUUID();
const isCanonValue = isCanon ? 1 : 0;

db.prepare(
  `INSERT INTO npcs (id, user_id, universe_id, name, description, personality_traits, behavior_patterns, voice_id, is_canon)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(id, userId, universeId, name, description || null, personalityTraits || null, behaviorPatterns || null, voiceId || null, isCanonValue);

// Register in entity registry
const entityId = `npc:${id}`;
try {
  db.prepare(
    "INSERT OR IGNORE INTO entity_registry (id, entity_type, display_name, user_id, universe_id) VALUES (?, 'npc', ?, ?, ?)"
  ).run(entityId, name, userId, universeId || null);
  db.prepare(
    "INSERT OR IGNORE INTO entity_aliases (id, entity_id, alias, source) VALUES (?, ?, ?, 'user_defined')"
  ).run(crypto.randomUUID(), entityId, name);
  db.prepare("UPDATE npcs SET entity_id = ? WHERE id = ?").run(entityId, id);
} catch { /* non-fatal */ }

const npc = db.prepare("SELECT * FROM npcs WHERE id = ?").get(id);

return NextResponse.json({ npc: camelizeKeys(npc) }, { status: 201 }); });
