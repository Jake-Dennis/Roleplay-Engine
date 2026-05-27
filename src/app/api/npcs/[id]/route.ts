import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { withAuth } from '@/lib/with-auth';
import { CONTENT_LIMITS } from '@/lib/config';
import { validateLength } from '@/lib/validation';
import { isValidUUID } from '@/lib/validation/uuid-validator';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * Gets a single NPC by ID.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing `{ id }` — the NPC UUID
 * @returns NextResponse with `{ npc }` — the NPC in camelCase
 * @throws 400 - If the ID format is invalid
 * @throws 401 - If authentication fails
 * @throws 404 - If the NPC is not found
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`npc_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
const db = getDb();
ensureGroupSupport(db);

const npc = db.prepare(
  "SELECT * FROM npcs WHERE id = ? AND user_id = ?"
).get(id, userId);

if (!npc) {
  return NextResponse.json({ error: "NPC not found" }, { status: 404 });
}

return NextResponse.json({ npc: camelizeKeys(npc) }); });

/**
 * Updates an NPC's fields.
 *
 * @param request - The incoming Next.js request object with JSON body: `{ name?, description?, personalityTraits?, behaviorPatterns?, voiceId?, isCanon? }`
 * @param params - Route parameters containing `{ id }` — the NPC UUID
 * @returns NextResponse with `{ npc }` — the updated NPC in camelCase
 * @throws 400 - If the ID format is invalid, request body is not valid JSON, or validation fails
 * @throws 401 - If authentication fails
 * @throws 404 - If the NPC is not found
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`npc_write:${ip}`, "npc_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
const db = getDb();
ensureGroupSupport(db);

const existing = db.prepare(
  "SELECT * FROM npcs WHERE id = ? AND user_id = ?"
).get(id, userId);

if (!existing) {
  return NextResponse.json({ error: "NPC not found" }, { status: 404 });
}

requireJson(request);
const body = await request.json();
const { name, description, personalityTraits, behaviorPatterns, voiceId, isCanon } = body;

if (name !== undefined) {
  const nameError = validateLength(name, 200, "Name");
  if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
}
if (description !== undefined) {
  const descError = validateLength(description, CONTENT_LIMITS.MEDIUM, "Description");
  if (descError) return NextResponse.json({ error: descError }, { status: 400 });
}

db.prepare(
  `UPDATE npcs SET
    name = COALESCE(?, name),
    description = COALESCE(?, description),
    personality_traits = COALESCE(?, personality_traits),
    behavior_patterns = COALESCE(?, behavior_patterns),
    voice_id = COALESCE(?, voice_id),
    is_canon = COALESCE(?, is_canon)
   WHERE id = ?`
).run(
  name, description, personalityTraits, behaviorPatterns,
  voiceId, isCanon !== undefined ? (isCanon ? 1 : 0) : undefined, id
);

const npc = db.prepare("SELECT * FROM npcs WHERE id = ?").get(id);

return NextResponse.json({ npc: camelizeKeys(npc) }); });

/**
 * Deletes an NPC by ID.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing `{ id }` — the NPC UUID
 * @returns NextResponse with `{ success: true }`
 * @throws 400 - If the ID format is invalid
 * @throws 401 - If authentication fails
 * @throws 404 - If the NPC is not found
 * @throws 429 - If rate limit exceeded
 */
export const DELETE = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`npc_write:${ip}`, "npc_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
const db = getDb();
ensureGroupSupport(db);

const existing = db.prepare(
  "SELECT * FROM npcs WHERE id = ? AND user_id = ?"
).get(id, userId);

if (!existing) {
  return NextResponse.json({ error: "NPC not found" }, { status: 404 });
}

db.prepare("DELETE FROM npcs WHERE id = ?").run(id);

return NextResponse.json({ success: true }); });
