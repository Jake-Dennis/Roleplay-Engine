import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { withAuth } from '@/lib/with-auth';
import { safeParseWarn } from "@/lib/safe-json";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';
import { eventBus, SessionEvents } from "@/lib/event-bus";

/**
 * Resolve a list of NPC name strings to entity_registry IDs.
 * Falls back to the name itself if no matching entity is found.
 */
function resolveNpcNamesToIds(db: ReturnType<typeof getDb>, userId: string, names: string[]): string[] {
  const ids: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const found = db.prepare(
      "SELECT id FROM entity_registry WHERE display_name = ? AND user_id = ? AND entity_type = 'npc' LIMIT 1"
    ).get(trimmed, userId) as { id: string } | undefined;
    ids.push(found?.id || trimmed);
  }
  return ids;
}

/**
 * GET /api/sessions/[id]/scene
 *
 * Retrieves the current scene state for a session, including location,
 * goal, emotional tone, active NPCs, active narrative threads, and
 * scene summary.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { sceneState: { id, location, goal, tone, activeNpcs, activeThreads, sceneSummary, updatedAt } | null }
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_read:${ip}`, "session_read");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: sessionId } = await params;
const db = getDb();

// Verify session access
const session = db.prepare(
  "SELECT id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (SELECT session_id FROM session_participants WHERE user_id = ?))"
).get(sessionId, userId, userId);

if (!session) {
  return NextResponse.json({ error: "Session not found" }, { status: 404 });
}

const sceneState = db.prepare(
  "SELECT * FROM scene_states WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1"
).get(sessionId) as Record<string, unknown> | undefined;

if (!sceneState) {
  return NextResponse.json({ sceneState: null });
}

// Parse JSON fields
return NextResponse.json({
  sceneState: {
    id: sceneState.id,
    location: sceneState.active_location_id,
    goal: sceneState.current_goal,
    tone: sceneState.emotional_tone,
    activeNpcs: safeParseWarn<string[]>(sceneState.active_npcs as string | null | undefined, "scene active_npcs", []) ?? [],
    activeNpcIds: safeParseWarn<string[]>(sceneState.active_npc_ids as string | null | undefined, "scene active_npc_ids", []) ?? [],
    activeThreads: safeParseWarn<string[]>(sceneState.active_threads as string | null | undefined, "scene active_threads", []) ?? [],
    sceneSummary: sceneState.scene_summary,
    updatedAt: sceneState.updated_at,
  },
}); });

/**
 * PUT /api/sessions/[id]/scene
 *
 * Updates the scene state for a session. Only the session owner can
 * update the scene. Emits a scene:updated SSE event on success.
 *
 * @param request - The incoming Next.js request object containing JSON body with optional location, goal, tone, activeNpcs, activeThreads, sceneSummary
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { success: true }
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found or user is not the owner
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_write:${ip}`, "session_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: sessionId } = await params;
const db = getDb();

// Verify session access
const session = db.prepare(
  "SELECT id FROM sessions WHERE id = ? AND owner_id = ?"
).get(sessionId, userId);

if (!session) {
  return NextResponse.json({ error: "Session not found" }, { status: 404 });
}

  requireJson(request);
  const body = await request.json();
const { location, goal, tone, activeNpcs, activeThreads, sceneSummary, activeNpcIds } = body;

// Resolve NPC names to entity IDs if activeNpcs provided but activeNpcIds not
const resolvedNpcIds = activeNpcIds ?? (activeNpcs ? resolveNpcNamesToIds(db, userId, activeNpcs) : null);

// Check if scene state already exists
const existing = db.prepare(
  "SELECT id FROM scene_states WHERE session_id = ?"
).get(sessionId);

if (existing) {
  db.prepare(
    `UPDATE scene_states
     SET active_location_id = COALESCE(?, active_location_id),
         current_goal = COALESCE(?, current_goal),
         emotional_tone = COALESCE(?, emotional_tone),
         active_npcs = COALESCE(?, active_npcs),
         active_npc_ids = COALESCE(?, active_npc_ids),
         active_threads = COALESCE(?, active_threads),
         scene_summary = COALESCE(?, scene_summary),
         updated_at = CURRENT_TIMESTAMP
     WHERE session_id = ?`
  ).run(
    location || null,
    goal || null,
    tone || null,
    activeNpcs ? JSON.stringify(activeNpcs) : null,
    resolvedNpcIds ? JSON.stringify(resolvedNpcIds) : null,
    activeThreads ? JSON.stringify(activeThreads) : null,
    sceneSummary || null,
    sessionId
  );
} else {
  db.prepare(
    `INSERT INTO scene_states (id, session_id, active_location_id, current_goal, emotional_tone, active_npcs, active_npc_ids, active_threads, scene_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    sessionId,
    location || null,
    goal || null,
    tone || null,
    activeNpcs ? JSON.stringify(activeNpcs) : null,
    resolvedNpcIds ? JSON.stringify(resolvedNpcIds) : null,
    activeThreads ? JSON.stringify(activeThreads) : null,
    sceneSummary || null
  );
}

eventBus.emit(`${SessionEvents.SCENE_UPDATED}:${sessionId}`, { sessionId });

return NextResponse.json({ success: true }); });
