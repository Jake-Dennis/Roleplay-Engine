import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { rowToJson } from "@/lib/row-to-json";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * PUT /api/timelines/{id}/layers/{layerId}
 * Update a timeline layer's name, description, start/end years, or metadata.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the timeline id and layer id
 * @returns NextResponse with { layer }
 * @throws 400 - If name is empty or exceeds length limits
 * @throws 401 - If authentication fails
 * @throws 404 - If layer not found
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string; layerId: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`timeline_write:${ip}`, "timeline_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: timelineId, layerId } = await params;
  requireJson(request);
  const body = await request.json();
const { name, description, startYear, endYear, metadata } = body;

const db = getDb();

// Verify ownership
const existing = db.prepare(
  "SELECT * FROM timeline_layers WHERE id = ? AND timeline_id = ? AND user_id = ?"
).get(layerId, timelineId, userId);
if (!existing) {
  return NextResponse.json({ error: "Layer not found" }, { status: 404 });
}

if (name !== undefined) {
  if (name.trim().length === 0) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  if (name.length > 200) return NextResponse.json({ error: "name must be 200 characters or less" }, { status: 400 });
}

db.prepare(
  `UPDATE timeline_layers SET
     name = COALESCE(?, name),
     description = COALESCE(?, description),
     start_year = COALESCE(?, start_year),
     end_year = COALESCE(?, end_year),
     metadata = COALESCE(?, metadata)
   WHERE id = ? AND user_id = ?`
).run(
  name?.trim() ?? null,
  description ?? null,
  startYear ?? null,
  endYear ?? null,
  metadata !== undefined ? JSON.stringify(metadata) : null,
  layerId,
  userId
);

const row = db.prepare("SELECT * FROM timeline_layers WHERE id = ?").get(layerId);
return NextResponse.json({ layer: rowToJson(row) }); });

/**
 * DELETE /api/timelines/{id}/layers/{layerId}
 * Delete a timeline layer.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the timeline id and layer id
 * @returns NextResponse with { success: true }
 * @throws 401 - If authentication fails
 * @throws 404 - If layer not found
 * @throws 429 - If rate limit exceeded
 */
export const DELETE = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string; layerId: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`timeline_write:${ip}`, "timeline_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: timelineId, layerId } = await params;

const db = getDb();

const existing = db.prepare(
  "SELECT id FROM timeline_layers WHERE id = ? AND timeline_id = ? AND user_id = ?"
).get(layerId, timelineId, userId);
if (!existing) {
  return NextResponse.json({ error: "Layer not found" }, { status: 404 });
}

db.prepare(
  "DELETE FROM timeline_layers WHERE id = ? AND user_id = ?"
).run(layerId, userId);

return NextResponse.json({ success: true }); });
