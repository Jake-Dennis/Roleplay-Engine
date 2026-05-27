import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { withAuth } from '@/lib/with-auth';
import { safeParse } from '@/lib/safe-json';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/voice-assignments
 * Get voice assignment for an entity by entityType and entityId, or list all voice profiles.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { assignment } or { profiles } or { assignment: null }
 * @throws 400 - If entityType or entityId are missing (non-profile mode)
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`api:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

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
  ).all(userId) as {
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
).get(userId, entityType, entityId) as {
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

return NextResponse.json({ assignment: camelizeKeys(assignment) }); });

/**
 * PUT /api/voice-assignments
 * Create or update a voice assignment for an entity (NPC, etc.).
 * Uses upsert: creates if not exists, updates if it does.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { success: true }
 * @throws 400 - If entityType, entityId, or voiceName are missing
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`api:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

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
).get(userId, entityType, entityId);

if (existing) {
  db.prepare(
    `UPDATE voice_assignments
     SET voice_name = ?, voice_speed = ?, volume = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND entity_type = ? AND entity_id = ?`
  ).run(voiceName, voiceSpeed, volume, userId, entityType, entityId);
} else {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO voice_assignments (id, user_id, entity_type, entity_id, voice_name, voice_speed, volume)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, entityType, entityId, voiceName, voiceSpeed, volume);
}

return NextResponse.json({ success: true }); });

/**
 * POST /api/voice-assignments
 * Create a new voice profile with named slots.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { success: true }
 * @throws 400 - If id, name, or slots are missing or slots is not an array
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`api:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

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
).run(crypto.randomUUID(), userId, id, JSON.stringify({ name, slots }));

return NextResponse.json({ success: true }); });

/**
 * DELETE /api/voice-assignments
 * Delete a voice assignment by entityType and entityId, or delete a voice profile by profileId.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { success: true }
 * @throws 400 - If entityType/entityId are missing (when not deleting by profileId)
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const DELETE = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`api:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { searchParams } = new URL(request.url);
const profileId = searchParams.get("profileId");

// Delete voice profile
if (profileId) {
  const db = getDb();
  db.prepare(
    "DELETE FROM voice_assignments WHERE user_id = ? AND entity_type = 'voice_profile' AND entity_id = ?"
  ).run(userId, profileId);

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
).run(userId, entityType, entityId);

return NextResponse.json({ success: true }); });
