import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { withAuth } from '@/lib/with-auth';
import { getDb } from "@/lib/db";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * Gets the TTS voice assignment for a specific entity.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing `{ entityType, entityId }`
 * @returns NextResponse with `{ assignment }` — the voice assignment or null
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ entityType: string; entityId: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`api:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { entityType, entityId } = await params;
const db = getDb();

const assignment = db.prepare(
  "SELECT * FROM voice_assignments WHERE user_id = ? AND entity_type = ? AND entity_id = ?"
).get(userId, entityType, entityId);

return NextResponse.json({ assignment: assignment ? camelizeKeys(assignment) : null }); });

/**
 * Creates or updates a TTS voice assignment for an entity (upsert).
 *
 * @param request - The incoming Next.js request object with JSON body: `{ voiceName, speed?, volume? }`
 * @param params - Route parameters containing `{ entityType, entityId }`
 * @returns NextResponse with `{ assignment, success: true }`
 * @throws 400 - If voiceName is missing
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ entityType: string; entityId: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`api:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

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
  userId,
  entityType,
  entityId,
  voiceName,
  speed,
  volume
);

const assignment = db.prepare(
  "SELECT * FROM voice_assignments WHERE user_id = ? AND entity_type = ? AND entity_id = ?"
).get(userId, entityType, entityId);

return NextResponse.json({ assignment: camelizeKeys(assignment), success: true }); });

/**
 * Deletes a TTS voice assignment for an entity.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing `{ entityType, entityId }`
 * @returns NextResponse with `{ success: true }`
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const DELETE = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ entityType: string; entityId: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`api:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { entityType, entityId } = await params;
const db = getDb();

db.prepare(
  "DELETE FROM voice_assignments WHERE user_id = ? AND entity_type = ? AND entity_id = ?"
).run(userId, entityType, entityId);

return NextResponse.json({ success: true }); });
