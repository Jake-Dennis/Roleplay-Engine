import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { rowToJson } from "@/lib/row-to-json";
import type { DbParams } from "@/lib/types";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

const VALID_LAYER_TYPES = ["era", "faction", "active_characters"] as const;

/**
 * GET /api/timelines/{id}/layers
 * List layers for a timeline, with optional layerType filter.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the timeline id
 * @returns NextResponse with { layers }
 * @throws 401 - If authentication fails
 * @throws 404 - If timeline not found
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`timeline_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: timelineId } = await params;
const { searchParams } = new URL(request.url);
const layerType = searchParams.get("layerType");

const db = getDb();

// Verify timeline ownership
const timeline = db.prepare(
  "SELECT id FROM timelines WHERE id = ? AND user_id = ?"
).get(timelineId, userId) as { id: string } | undefined;
if (!timeline) {
  return NextResponse.json({ error: "Timeline not found" }, { status: 404 });
}

let query = "SELECT * FROM timeline_layers WHERE timeline_id = ? AND user_id = ?";
const queryParams: DbParams = [timelineId, userId];

if (layerType && VALID_LAYER_TYPES.includes(layerType as (typeof VALID_LAYER_TYPES)[number])) {
  query += " AND layer_type = ?";
  queryParams.push(layerType);
}

query += " ORDER BY created_at DESC";

const rows = db.prepare(query).all(...queryParams);
const layers = rows.map(rowToJson);

return NextResponse.json({ layers }); });

/**
 * POST /api/timelines/{id}/layers
 * Create a new layer on a timeline.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the timeline id
 * @returns NextResponse with { layer } (201)
 * @throws 400 - If layerType or name is missing or invalid
 * @throws 401 - If authentication fails
 * @throws 404 - If timeline not found
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`timeline_write:${ip}`, "timeline_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: timelineId } = await params;
  requireJson(request);
  const body = await request.json();
const { layerType, name, description, startYear, endYear, metadata } = body;

if (!layerType || !VALID_LAYER_TYPES.includes(layerType)) {
  return NextResponse.json(
    { error: `Invalid layer_type. Must be one of: ${VALID_LAYER_TYPES.join(", ")}` },
    { status: 400 }
  );
}
if (!name || name.trim().length === 0) {
  return NextResponse.json({ error: "name is required" }, { status: 400 });
}
if (name.length > 200) {
  return NextResponse.json({ error: "name must be 200 characters or less" }, { status: 400 });
}

const db = getDb();

// Verify timeline ownership
const timeline = db.prepare(
  "SELECT id, universe_id FROM timelines WHERE id = ? AND user_id = ?"
).get(timelineId, userId) as { id: string; universe_id: string | null } | undefined;
if (!timeline) {
  return NextResponse.json({ error: "Timeline not found" }, { status: 404 });
}

const id = crypto.randomUUID();

db.prepare(
  `INSERT INTO timeline_layers (id, user_id, timeline_id, universe_id, layer_type, name, description, start_year, end_year, metadata)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  id,
  userId,
  timelineId,
  timeline.universe_id || null,
  layerType,
  name.trim(),
  description || null,
  startYear || null,
  endYear || null,
  metadata ? JSON.stringify(metadata) : null
);

const row = db.prepare("SELECT * FROM timeline_layers WHERE id = ?").get(id);
return NextResponse.json({ layer: rowToJson(row) }, { status: 201 }); });
