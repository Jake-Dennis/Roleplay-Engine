import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { ensureGroupSupport, isGroupMember } from "@/lib/group-migrations";
import type { DbResult } from "@/lib/types";
import { forbiddenError, badRequestError, requireJson } from "@/lib/error-response";
import { validateLength } from '@/lib/validation';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export const GET = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ("error" in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_read:${ip}`, "session_read");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const db = getDb();
ensureGroupSupport(db);

const url = new URL(request.url);
const groupId = url.searchParams.get("group_id");
const scope = url.searchParams.get("scope");

let sessions: DbResult[];

if (groupId) {
  if (!isGroupMember(db, groupId, userId)) {
    return forbiddenError();
  }
  sessions = db.prepare(`
    SELECT s.*, u.username as owner_name
    FROM sessions s
    JOIN users u ON s.owner_id = u.id
    WHERE s.group_id = ?
    ORDER BY s.updated_at DESC
  `).all(groupId) as DbResult[];
} else if (scope === "personal") {
  // Only personal sessions
  sessions = db.prepare(`
    SELECT s.*, u.username as owner_name
    FROM sessions s
    JOIN users u ON s.owner_id = u.id
    WHERE s.group_id IS NULL AND (s.owner_id = ? OR s.id IN (
      SELECT session_id FROM session_participants WHERE user_id = ?
    ))
    ORDER BY s.updated_at DESC
  `).all(userId, userId) as DbResult[];
} else {
  // Return ALL sessions the user has access to (personal + all groups)
  sessions = db.prepare(`
    SELECT s.*, u.username as owner_name
    FROM sessions s
    JOIN users u ON s.owner_id = u.id
    WHERE s.owner_id = ? OR s.id IN (
      SELECT session_id FROM session_participants WHERE user_id = ?
    )
    ORDER BY s.updated_at DESC
  `).all(userId, userId) as DbResult[];
}

return NextResponse.json({ sessions: camelizeKeys(sessions) }); });

export const POST = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ("error" in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_write:${ip}`, "session_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
const { name, universe_id, timeline_id, type = "solo", group_id } = body;

if (!name) {
  return badRequestError("Session name is required");
}

if (!universe_id) {
  return badRequestError("universe_id is required");
}

const nameError = validateLength(name, 200, "Name");
if (nameError) return badRequestError(nameError);

const db = getDb();
ensureGroupSupport(db);

if (group_id && !isGroupMember(db, group_id, userId)) {
  return forbiddenError();
}

const id = crypto.randomUUID();

db.prepare(
  "INSERT INTO sessions (id, owner_id, name, universe_id, timeline_id, status, type, group_id) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)"
).run(id, userId, name, universe_id || null, timeline_id || null, type, group_id || null);

db.prepare(
  "INSERT OR IGNORE INTO session_participants (session_id, user_id, role) VALUES (?, ?, 'player')"
).run(id, userId);

db.prepare(
  "INSERT INTO scene_states (id, session_id, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
).run(crypto.randomUUID(), id);

const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);

return NextResponse.json({ session: camelizeKeys(session) }, { status: 201 }); });
