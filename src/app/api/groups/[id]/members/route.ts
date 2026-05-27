import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { withAuth } from '@/lib/with-auth';
import { ensureGroupSupport, isGroupOwner } from "@/lib/group-migrations";
import { validateLength } from "@/lib/validation";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * POST /api/groups/{id}/members
 * Add a member to a group by username or user_id. Only the group owner can add members.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the group id
 * @returns NextResponse with { success: true, userId }
 * @throws 400 - If username/user_id is missing or validation fails
 * @throws 401 - If authentication fails
 * @throws 403 - If user is not the group owner
 * @throws 404 - If username does not match any user
 * @throws 409 - If user is already a member
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`group_write:${ip}`, "group_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: groupId } = await params;
const db = getDb();
ensureGroupSupport(db);

if (!isGroupOwner(db, groupId, userId)) {
  return NextResponse.json({ error: "Not owner" }, { status: 403 });
}

  requireJson(request);
  const body = await request.json();
const { username, user_id } = body;

if (username !== undefined) {
  const usernameError = validateLength(username, 50, "Username");
  if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 });
}

let targetUserId: string;

if (user_id) {
  targetUserId = user_id;
} else if (username && username.trim()) {
  const user = db.prepare(
    "SELECT id FROM users WHERE username = ?"
  ).get(username.trim()) as { id: string } | undefined;

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  targetUserId = user.id;
} else {
  return NextResponse.json({ error: "Username or user_id is required" }, { status: 400 });
}

const existing = db.prepare(
  "SELECT group_id FROM group_members WHERE group_id = ? AND user_id = ?"
).get(groupId, targetUserId);

if (existing) {
  return NextResponse.json({ error: "User is already a member" }, { status: 409 });
}

db.prepare(
  "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')"
).run(groupId, targetUserId);

return NextResponse.json({ success: true, userId: targetUserId }); });

/**
 * DELETE /api/groups/{id}/members
 * Remove a member from a group by user_id. Only the group owner can remove members. Cannot remove the owner.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the group id
 * @returns NextResponse with { success: true }
 * @throws 400 - If user_id is missing or attempting to remove the owner
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

const { id: groupId } = await params;
const db = getDb();
ensureGroupSupport(db);

if (!isGroupOwner(db, groupId, userId)) {
  return NextResponse.json({ error: "Not owner" }, { status: 403 });
}

  requireJson(request);
  const body = await request.json();
const { user_id } = body;

if (!user_id) {
  return NextResponse.json({ error: "user_id is required" }, { status: 400 });
}

const group = db.prepare(
  "SELECT owner_id FROM groups WHERE id = ?"
).get(groupId) as { owner_id: string } | undefined;

if (group?.owner_id === user_id) {
  return NextResponse.json({ error: "Cannot remove owner" }, { status: 400 });
}

db.prepare(
  "DELETE FROM group_members WHERE group_id = ? AND user_id = ?"
).run(groupId, user_id);

return NextResponse.json({ success: true }); });
