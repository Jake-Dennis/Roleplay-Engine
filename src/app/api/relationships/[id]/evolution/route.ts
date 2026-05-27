import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { withAuth } from '@/lib/with-auth';
import { getDb } from "@/lib/db";
import { parseEmotionalState } from "@/lib/emotion-utils";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { hasRelationshipAccess } from '@/lib/relationship-access';
import type { RelationshipEvolutionRow, RelationshipEvolutionEntry } from '@/lib/relationship-types';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * Gets the evolution history for a relationship.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing `{ id }` — the relationship UUID
 * @returns NextResponse with `{ history }` — array of evolution entries with parsed emotional states in camelCase
 * @throws 401 - If authentication fails
 * @throws 404 - If the relationship is not found or user lacks access
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`relationship_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
const db = getDb();
ensureGroupSupport(db);

// Verify relationship access
const rel = hasRelationshipAccess(db, id, userId);
if (!rel) return NextResponse.json({ error: "Relationship not found" }, { status: 404 });

// Get evolution history
const history = db.prepare(`
  SELECT id, emotional_state, relationship_stage, trigger_event, recorded_at
  FROM relationship_evolution
  WHERE relationship_id = ?
  ORDER BY recorded_at ASC
`).all(id);

// Parse emotional states
const parsedHistory: RelationshipEvolutionEntry[] = (history as RelationshipEvolutionRow[]).map((entry) => ({
  ...entry,
  emotional_state: parseEmotionalState(entry.emotional_state),
}));

return NextResponse.json({ history: camelizeKeys(parsedHistory) }); });

/**
 * Records a new evolution entry for a relationship.
 *
 * @param request - The incoming Next.js request object with JSON body: `{ emotionalState?, relationshipStage?, triggerEvent? }`
 * @param params - Route parameters containing `{ id }` — the relationship UUID
 * @returns NextResponse with `{ entry }` (201) — the created evolution entry in camelCase
 * @throws 400 - If request body is not valid JSON
 * @throws 401 - If authentication fails
 * @throws 404 - If the relationship is not found or user lacks access
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If the evolution entry could not be created
 */
export const POST = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`relationship_write:${ip}`, "relationship_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
const db = getDb();
ensureGroupSupport(db);

// Verify relationship access
const rel = hasRelationshipAccess(db, id, userId);
if (!rel) return NextResponse.json({ error: "Relationship not found" }, { status: 404 });

  requireJson(request);
  const body = await request.json();
const { emotionalState, relationshipStage, triggerEvent } = body;

const entryId = crypto.randomUUID();
db.prepare(`
  INSERT INTO relationship_evolution (id, relationship_id, user_id, emotional_state, relationship_stage, trigger_event)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(
  entryId,
  id,
  userId,
  emotionalState ? JSON.stringify(emotionalState) : null,
  relationshipStage || null,
  triggerEvent || null
);

const entry = db.prepare("SELECT * FROM relationship_evolution WHERE id = ?").get(entryId) as {
  id: string;
  relationship_id: string;
  user_id: string;
  emotional_state: string | null;
  relationship_stage: string | null;
  trigger_event: string | null;
  recorded_at: string;
} | undefined;

if (!entry) {
  return NextResponse.json({ error: "Failed to create evolution entry" }, { status: 500 });
}

return NextResponse.json({
  entry: camelizeKeys({
    ...entry,
    emotional_state: parseEmotionalState(entry.emotional_state),
  }),
}, { status: 201 }); });
