import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { withAuth } from '@/lib/with-auth';
import { getDb } from "@/lib/db";
import { validateLength } from '@/lib/validation';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/narrative-memories/{id}
 * Get a single narrative memory by id.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the memory id
 * @returns NextResponse with { memory }
 * @throws 401 - If authentication fails
 * @throws 404 - If memory not found
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`narrative_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);
const { id } = await params;
const db = getDb();
const memory = db.prepare("SELECT * FROM narrative_memories WHERE id = ? AND user_id = ?").get(id, userId);
if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
return NextResponse.json({ memory: camelizeKeys(memory) }); });

/**
 * PUT /api/narrative-memories/{id}
 * Update a narrative memory's content, type, importance, or related entities.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the memory id
 * @returns NextResponse with { success: true }
 * @throws 400 - If content exceeds length limits
 * @throws 401 - If authentication fails
 * @throws 404 - If memory not found
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`narrative_write:${ip}`, "narrative_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);
const { id } = await params;
  requireJson(request);
  const body = await request.json();
const db = getDb();
const existing = db.prepare("SELECT id FROM narrative_memories WHERE id = ? AND user_id = ?").get(id, userId);
if (!existing) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
const { content, type, importance, relatedEntities } = body;

if (content !== undefined) {
  const contentError = validateLength(content, 100000, "Content");
  if (contentError) return NextResponse.json({ error: contentError }, { status: 400 });
}
db.prepare(
  "UPDATE narrative_memories SET content = COALESCE(?, content), type = COALESCE(?, type), importance = COALESCE(?, importance), related_entities = COALESCE(?, related_entities) WHERE id = ?"
).run(content || null, type || null, importance ? JSON.stringify(importance) : null, relatedEntities ? JSON.stringify(relatedEntities) : null, id);
return NextResponse.json({ success: true }); });

/**
 * DELETE /api/narrative-memories/{id}
 * Delete a narrative memory by id.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the memory id
 * @returns NextResponse with { success: true }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const DELETE = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`narrative_write:${ip}`, "narrative_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);
const { id } = await params;
const db = getDb();
db.prepare("DELETE FROM narrative_memories WHERE id = ? AND user_id = ?").run(id, userId);
return NextResponse.json({ success: true }); });
