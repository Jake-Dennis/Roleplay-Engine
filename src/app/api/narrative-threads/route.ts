import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import { rowToJson } from "@/lib/row-to-json";
import type { DbParams, PaginatedRow } from "@/lib/types";
import { CONTENT_LIMITS } from '@/lib/config';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

const VALID_STATUSES = ["active", "paused", "resolved", "abandoned"];
const VALID_ESCALATION = ["low", "medium", "high", "critical"];
const VALID_ARC_TYPES = ["thread", "arc", "subplot", "main_plot"];

/**
 * GET /api/narrative-threads
 * List narrative threads with optional filters (sessionId, universe_id, status, arcType) and cursor pagination.
 * Supports single thread lookup by id query parameter.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { threads, nextCursor } or { thread } (single)
 * @throws 401 - If authentication fails
 * @throws 404 - If single thread id is provided but not found
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ("error" in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`narrative_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { searchParams } = new URL(request.url);
const id = searchParams.get("id");
const sessionId = searchParams.get("sessionId");
const universeId = searchParams.get("universe_id");
const status = searchParams.get("status");
const arcType = searchParams.get("arcType");
const limitParam = searchParams.get("limit");
const cursor = searchParams.get("cursor");
const limit = limitParam ? Math.min(parseInt(limitParam, 10), 500) : 100;

const db = getDb();

// Single thread lookup
if (id) {
  const row = db.prepare(
    "SELECT * FROM narrative_threads WHERE id = ? AND user_id = ?"
  ).get(id, userId);
  if (!row) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  return NextResponse.json({ thread: rowToJson(row) });
}

// List threads with filters
let query = "SELECT * FROM narrative_threads WHERE user_id = ?";
const params: DbParams = [userId];

if (universeId) {
  query += " AND universe_id = ?";
  params.push(universeId);
}
if (sessionId) {
  query += " AND session_id = ?";
  params.push(sessionId);
}
if (status) {
  query += " AND status = ?";
  params.push(status);
}
if (arcType) {
  query += " AND arc_type = ?";
  params.push(arcType);
}

// Cursor-based pagination
if (cursor) {
  const cursorThread = db.prepare(
    "SELECT updated_at FROM narrative_threads WHERE id = ? AND user_id = ?"
  ).get(cursor, userId) as { updated_at: string } | undefined;

  if (cursorThread) {
    query += " AND (updated_at, id) < (?, ?)";
    params.push(cursorThread.updated_at, cursor);
  }
}

query += " ORDER BY updated_at DESC, id DESC LIMIT ?";
params.push(limit + 1);

const rows = db.prepare(query).all(...params) as PaginatedRow[];

let nextCursor: string | null = null;
let resultThreads = rows;
if (rows.length > limit) {
  nextCursor = rows[limit].id;
  resultThreads = rows.slice(0, limit);
}

const threads = resultThreads.map(rowToJson);
return NextResponse.json({ threads, nextCursor }); });

/**
 * POST /api/narrative-threads
 * Create a new narrative thread.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { thread } (201)
 * @throws 400 - If title is missing, exceeds length limits, or invalid arc_type/escalation_level
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ("error" in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`narrative_write:${ip}`, "narrative_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
const { title, description, sessionId, arcType, escalationLevel, unresolvedItems, universe_id } = body;

if (!title || title.trim().length === 0) {
  return NextResponse.json({ error: "title is required" }, { status: 400 });
}
if (title.length > 200) {
  return NextResponse.json({ error: "title must be 200 characters or less" }, { status: 400 });
}
if (description && description.length > CONTENT_LIMITS.MEDIUM) {
  return NextResponse.json({ error: "description must be 5000 characters or less" }, { status: 400 });
}
if (arcType && !VALID_ARC_TYPES.includes(arcType)) {
  return NextResponse.json({ error: `Invalid arc_type. Must be one of: ${VALID_ARC_TYPES.join(", ")}` }, { status: 400 });
}
if (escalationLevel && !VALID_ESCALATION.includes(escalationLevel)) {
  return NextResponse.json({ error: `Invalid escalation_level. Must be one of: ${VALID_ESCALATION.join(", ")}` }, { status: 400 });
}

const db = getDb();
const id = crypto.randomUUID();
const now = new Date().toISOString();

db.prepare(
  `INSERT INTO narrative_threads (id, user_id, universe_id, session_id, title, description, arc_type, status, escalation_level, unresolved_items, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`
).run(
  id,
  userId,
  universe_id || null,
  sessionId || null,
  title.trim(),
  description || null,
  arcType || "thread",
  escalationLevel || "low",
  unresolvedItems ? JSON.stringify(unresolvedItems) : null,
  now,
  now
);

const row = db.prepare("SELECT * FROM narrative_threads WHERE id = ?").get(id);
return NextResponse.json({ thread: rowToJson(row) }, { status: 201 }); });

/**
 * PUT /api/narrative-threads
 * Update an existing narrative thread. Supports partial updates of title, description, status, arc_type, escalation_level, unresolved_items, and universe_id.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { thread }
 * @throws 400 - If id is missing or validation fails
 * @throws 401 - If authentication fails
 * @throws 404 - If thread not found
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ("error" in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`narrative_write:${ip}`, "narrative_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
const { id, title, description, status, arcType, escalationLevel, unresolvedItems, universe_id } = body;

if (!id) {
  return NextResponse.json({ error: "id is required" }, { status: 400 });
}

// Verify ownership
const db = getDb();
const existing = db.prepare(
  "SELECT * FROM narrative_threads WHERE id = ? AND user_id = ?"
).get(id, userId) as { status: string; resolved_at: string | null } | undefined;
if (!existing) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

if (title !== undefined) {
  if (title.trim().length === 0) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
  if (title.length > 200) return NextResponse.json({ error: "title must be 200 characters or less" }, { status: 400 });
}
if (description !== undefined && description.length > CONTENT_LIMITS.MEDIUM) {
  return NextResponse.json({ error: "description must be 5000 characters or less" }, { status: 400 });
}
if (status !== undefined && !VALID_STATUSES.includes(status)) {
  return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
}
if (arcType !== undefined && !VALID_ARC_TYPES.includes(arcType)) {
  return NextResponse.json({ error: `Invalid arc_type. Must be one of: ${VALID_ARC_TYPES.join(", ")}` }, { status: 400 });
}
if (escalationLevel !== undefined && !VALID_ESCALATION.includes(escalationLevel)) {
  return NextResponse.json({ error: `Invalid escalation_level. Must be one of: ${VALID_ESCALATION.join(", ")}` }, { status: 400 });
}

const now = new Date().toISOString();
const resolvedAt = status === "resolved" && existing.status !== "resolved" ? now : existing.resolved_at;

// Build dynamic update
const updates: string[] = [];
const values: unknown[] = [];

if (title !== undefined) { updates.push("title = ?"); values.push(title.trim()); }
if (description !== undefined) { updates.push("description = ?"); values.push(description); }
if (status !== undefined) { updates.push("status = ?"); values.push(status); }
if (arcType !== undefined) { updates.push("arc_type = ?"); values.push(arcType); }
if (escalationLevel !== undefined) { updates.push("escalation_level = ?"); values.push(escalationLevel); }
if (unresolvedItems !== undefined) { updates.push("unresolved_items = ?"); values.push(JSON.stringify(unresolvedItems)); }
if (universe_id !== undefined) { updates.push("universe_id = ?"); values.push(universe_id || null); }
updates.push("resolved_at = ?", "updated_at = ?");
values.push(resolvedAt, now, id, userId);

db.prepare(`UPDATE narrative_threads SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`).run(...values);

const row = db.prepare("SELECT * FROM narrative_threads WHERE id = ?").get(id);
return NextResponse.json({ thread: rowToJson(row) }); });

/**
 * DELETE /api/narrative-threads
 * Delete a narrative thread by id (query parameter).
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { success: true }
 * @throws 400 - If id query parameter is missing
 * @throws 401 - If authentication fails
 * @throws 404 - If thread not found
 * @throws 429 - If rate limit exceeded
 */
export const DELETE = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ("error" in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`narrative_write:${ip}`, "narrative_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { searchParams } = new URL(request.url);
const id = searchParams.get("id");

if (!id) {
  return NextResponse.json({ error: "id is required" }, { status: 400 });
}

const db = getDb();
const existing = db.prepare(
  "SELECT * FROM narrative_threads WHERE id = ? AND user_id = ?"
).get(id, userId);
if (!existing) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

db.prepare("DELETE FROM narrative_threads WHERE id = ? AND user_id = ?").run(id, userId);
return NextResponse.json({ success: true }); });
