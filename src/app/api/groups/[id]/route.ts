import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withAuth } from '@/lib/with-auth';
import { badRequestError, requireJson } from "@/lib/error-response";
import { ensureGroupSupport, isGroupMember, isGroupOwner } from "@/lib/group-migrations";
import { CONTENT_LIMITS } from '@/lib/config';
import { validateLength } from '@/lib/validation';
import { isValidUUID } from '@/lib/validation/uuid-validator';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/groups/{id}
 * Get group details, members, sessions, and universes for a group the user is a member of.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the group id
 * @returns NextResponse with { group, members, sessions, universes }
 * @throws 400 - If ID format is invalid
 * @throws 401 - If authentication fails
 * @throws 403 - If user is not a member of the group
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`group_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
const db = getDb();
ensureGroupSupport(db);

if (!isGroupMember(db, id, userId)) {
  return NextResponse.json({ error: "Not a member" }, { status: 403 });
}

const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(id);
const members = db.prepare(`
  SELECT gm.*, u.username
  FROM group_members gm
  JOIN users u ON gm.user_id = u.id
  WHERE gm.group_id = ?
`).all(id);

const sessions = db.prepare(
  "SELECT * FROM sessions WHERE group_id = ? ORDER BY updated_at DESC"
).all(id);

const universes = db.prepare(
  "SELECT * FROM universes WHERE group_id = ? ORDER BY created_at DESC"
).all(id);

return NextResponse.json({
  group: camelizeKeys(group),
  members: camelizeKeys(members),
  sessions: camelizeKeys(sessions),
  universes: camelizeKeys(universes),
}); });

/**
 * PUT /api/groups/{id}
 * Update a group's name and/or description. Only the owner can update.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the group id
 * @returns NextResponse with { group: Group }
 * @throws 400 - If ID format is invalid or no fields to update
 * @throws 401 - If authentication fails
 * @throws 403 - If user is not the group owner
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`group_write:${ip}`, "group_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
const db = getDb();
ensureGroupSupport(db);

if (!isGroupOwner(db, id, userId)) {
  return NextResponse.json({ error: "Not owner" }, { status: 403 });
}

requireJson(request);
const body = await request.json();
const { name, description } = body;

if (name !== undefined) {
  const nameError = validateLength(name, 200, "Name");
  if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
}
if (description !== undefined) {
  const descError = validateLength(description, CONTENT_LIMITS.MEDIUM, "Description");
  if (descError) return NextResponse.json({ error: descError }, { status: 400 });
}

const updates: string[] = [];
const values: unknown[] = [];

if (name !== undefined) { updates.push("name = ?"); values.push(name.trim()); }
if (description !== undefined) { updates.push("description = ?"); values.push(description || null); }

if (updates.length === 0) {
  return badRequestError("No fields to update");
}

values.push(id);
db.prepare(`UPDATE groups SET ${updates.join(", ")} WHERE id = ?`).run(...values);

const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(id);
return NextResponse.json({ group: camelizeKeys(group) }); });

/**
 * DELETE /api/groups/{id}
 * Delete a group and remove all its members. Only the owner can delete.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the group id
 * @returns NextResponse with { success: true }
 * @throws 400 - If ID format is invalid
 * @throws 401 - If authentication fails
 * @throws 403 - If user is not the group owner
 * @throws 429 - If rate limit exceeded
 */
export const DELETE = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`group_write:${ip}`, "group_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
const db = getDb();
ensureGroupSupport(db);

if (!isGroupOwner(db, id, userId)) {
  return NextResponse.json({ error: "Not owner" }, { status: 403 });
}

db.prepare("DELETE FROM group_members WHERE group_id = ?").run(id);
db.prepare("DELETE FROM groups WHERE id = ?").run(id);

return NextResponse.json({ success: true }); });
