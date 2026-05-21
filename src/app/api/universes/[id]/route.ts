import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { DbDatabase } from "@/lib/types";
import { getAuthToken } from '@/lib/auth-token';
import { unauthorizedError, notFoundError, badRequestError, requireJson } from '@/lib/error-response';
import { parseBoundaries } from '@/lib/universe-utils';
import { validateLength } from '@/lib/validation';
import { isValidUUID } from '@/lib/validation/uuid-validator';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

function hasUniverseAccess(db: DbDatabase, universeId: string, userId: string): boolean {
  const universe = db.prepare(
    `SELECT u.id, u.user_id, u.session_id
     FROM universes u
     WHERE u.id = ?
     AND (u.user_id = ? OR u.session_id IN (
       SELECT session_id FROM session_participants WHERE user_id = ?
     ))`
  ).get(universeId, userId, userId);

  return !!universe;
}

export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) {
  return unauthorizedError();
}

const decoded = await verifyToken(token);
if (!decoded) {
  return NextResponse.json({ error: "Invalid token" }, { status: 401 });
}

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`universe_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

const db = getDb();

if (!hasUniverseAccess(db, id, decoded.sub)) {
  return notFoundError("Universe");
}

const universe = db
  .prepare(
    "SELECT id, user_id, session_id, name, canon_mode, lore_source, tone, boundaries, created_at FROM universes WHERE id = ?"
  )
  .get(id) as Record<string, unknown> | undefined;

if (!universe) {
  return notFoundError("Universe");
}

const parsed = { ...universe, boundaries: parseBoundaries(universe.boundaries as string | null) };

return NextResponse.json({ universe: camelizeKeys(parsed) }); });

export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) {
  return unauthorizedError();
}

const decoded = await verifyToken(token);
if (!decoded) {
  return NextResponse.json({ error: "Invalid token" }, { status: 401 });
}

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`universe_write:${ip}`, "universe_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  requireJson(request);
  const body = await request.json();

const db = getDb();

// Verify ownership (user-owned OR session owner)
const existing = db.prepare(
  `SELECT u.id, u.user_id, u.session_id, s.owner_id as session_owner_id
   FROM universes u
   LEFT JOIN sessions s ON u.session_id = s.id
   WHERE u.id = ?
   AND (u.user_id = ? OR s.owner_id = ?)`
).get(id, decoded.sub, decoded.sub);

if (!existing) {
  return notFoundError("Universe");
}

const { name, canon_mode, lore_source, tone, boundaries } = body;

if (name !== undefined && (!name || !name.trim())) {
  return badRequestError("Universe name cannot be empty");
}

if (name !== undefined) {
  const nameError = validateLength(name, 200, "Name");
  if (nameError) return badRequestError(nameError);
}

const validModes = ["strict", "loose", "custom"];
if (canon_mode !== undefined && !validModes.includes(canon_mode)) {
  return badRequestError(`Invalid canon_mode. Must be one of: ${validModes.join(", ")}`);
}

let boundariesJson: string | null = null;
if (boundaries !== undefined) {
  if (Array.isArray(boundaries)) {
    boundariesJson = boundaries.length > 0 ? JSON.stringify(boundaries) : null;
  } else if (typeof boundaries === "string") {
    const lines = boundaries.split("\n").map((s: string) => s.trim()).filter(Boolean);
    boundariesJson = lines.length > 0 ? JSON.stringify(lines) : null;
  }
}

const updates: string[] = [];
const values: unknown[] = [];

if (name !== undefined) { updates.push("name = ?"); values.push(name.trim()); }
if (canon_mode !== undefined) { updates.push("canon_mode = ?"); values.push(canon_mode); }
if (lore_source !== undefined) { updates.push("lore_source = ?"); values.push(lore_source || null); }
if (tone !== undefined) { updates.push("tone = ?"); values.push(tone || null); }
if (boundaries !== undefined) { updates.push("boundaries = ?"); values.push(boundariesJson); }

if (updates.length === 0) {
  return badRequestError("No fields to update");
}

values.push(id);
db.prepare(`UPDATE universes SET ${updates.join(", ")} WHERE id = ?`).run(...values);

const universe = db
  .prepare(
    "SELECT id, user_id, session_id, name, canon_mode, lore_source, tone, boundaries, created_at FROM universes WHERE id = ?"
  )
  .get(id) as Record<string, unknown> | undefined;

if (!universe) {
  return NextResponse.json({ error: "Failed to retrieve universe" }, { status: 500 });
}

const parsed = { ...universe, boundaries: parseBoundaries(universe.boundaries as string | null) };

return NextResponse.json({ universe: camelizeKeys(parsed) }); });

export const DELETE = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) {
  return unauthorizedError();
}

const decoded = await verifyToken(token);
if (!decoded) {
  return NextResponse.json({ error: "Invalid token" }, { status: 401 });
}

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`universe_write:${ip}`, "universe_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

const db = getDb();

// Verify ownership
const existing = db.prepare(
  `SELECT u.id, u.user_id, u.session_id, s.owner_id as session_owner_id
   FROM universes u
   LEFT JOIN sessions s ON u.session_id = s.id
   WHERE u.id = ?
   AND (u.user_id = ? OR s.owner_id = ?)`
).get(id, decoded.sub, decoded.sub);

if (!existing) {
  return notFoundError("Universe");
}

// Check for dependent sessions
const sessionCount = db.prepare("SELECT COUNT(*) as count FROM sessions WHERE universe_id = ?").get(id) as { count: number };
if (sessionCount.count > 0) {
  return NextResponse.json(
    { error: `Cannot delete universe: ${sessionCount.count} session(s) depend on it. Delete or reassign sessions first.` },
    { status: 409 }
  );
}

// Delete all dependent records (cascade)
db.prepare("DELETE FROM relationships WHERE universe_id = ?").run(id);
db.prepare("DELETE FROM narrative_threads WHERE universe_id = ?").run(id);
db.prepare("DELETE FROM entity_validations WHERE universe_id = ?").run(id);
db.prepare("DELETE FROM backlinks WHERE universe_id = ?").run(id);
db.prepare("DELETE FROM embedding_index WHERE universe_id = ?").run(id);
db.prepare("DELETE FROM job_queue WHERE universe_id = ?").run(id);

db.prepare("DELETE FROM universes WHERE id = ?").run(id);

return NextResponse.json({ success: true }); });
