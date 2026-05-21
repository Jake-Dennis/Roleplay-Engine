import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { getAuthToken } from "@/lib/auth-token";
import { unauthorizedError, badRequestError, requireJson } from "@/lib/error-response";
import { ensureGroupSupport, isGroupMember, isGroupOwner } from "@/lib/group-migrations";
import { validateLength } from '@/lib/validation';
import { isValidUUID } from '@/lib/validation/uuid-validator';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return unauthorizedError();

const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`group_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
const db = getDb();
ensureGroupSupport(db);

if (!isGroupMember(db, id, decoded.sub)) {
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

export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return unauthorizedError();

const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`group_write:${ip}`, "group_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
const db = getDb();
ensureGroupSupport(db);

if (!isGroupOwner(db, id, decoded.sub)) {
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
  const descError = validateLength(description, 5000, "Description");
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

export const DELETE = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return unauthorizedError();

const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`group_write:${ip}`, "group_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
const db = getDb();
ensureGroupSupport(db);

if (!isGroupOwner(db, id, decoded.sub)) {
  return NextResponse.json({ error: "Not owner" }, { status: 403 });
}

db.prepare("DELETE FROM group_members WHERE group_id = ?").run(id);
db.prepare("DELETE FROM groups WHERE id = ?").run(id);

return NextResponse.json({ success: true }); });
