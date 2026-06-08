import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { withAuth } from '@/lib/with-auth';
import { eventBus, SessionEvents } from "@/lib/event-bus";
import type { DbDatabase } from "@/lib/types";
import { safeParseWarn } from "@/lib/safe-json";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

const VALID_MODES = ["freeform", "ordered", "disabled", "free_for_all", "claim", "round_robin"];

// Normalize mode aliases
function normalizeMode(mode: string): string {
  switch (mode) {
    case "round_robin": return "ordered";
    case "free_for_all": return "freeform";
    default: return mode;
  }
}

function getTurnConfig(db: DbDatabase, sessionId: string) {
  const rows = db.prepare(
    "SELECT key, value FROM session_config WHERE session_id = ? AND key IN ('turn_mode', 'turn_order', 'current_turn')"
  ).all(sessionId) as { key: string; value: string }[];

  const config = new Map<string, string>();
  for (const row of rows) {
    config.set(row.key, row.value);
  }

  return {
    turnMode: config.get('turn_mode') || "freeform",
    turnOrder: safeParseWarn<string[]>(config.get('turn_order'), "turn order", []) ?? [],
    currentTurn: config.get('current_turn') || null,
  };
}

/**
 * GET /api/sessions/[id]/turn
 *
 * Retrieves the current turn configuration for a session, including the
 * turn mode, ordered turn list, and which user has the current turn.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { turnMode: string, turnOrder: string[], currentTurn: string | null }
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

// Verify access
const session = db.prepare(
  "SELECT id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (SELECT session_id FROM session_participants WHERE user_id = ?))"
).get(sessionId, userId, userId);

if (!session) {
  return NextResponse.json({ error: "Session not found" }, { status: 404 });
}

return NextResponse.json(getTurnConfig(db, sessionId)); });

/**
 * PUT /api/sessions/[id]/turn
 *
 * Updates the turn configuration for a session. Only the session owner
 * can change turn mode, order, or current turn. Emits a turn:updated SSE event.
 *
 * @param request - The incoming Next.js request object containing JSON body with optional turnMode, turnOrder, currentTurn
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { success: true, turnConfig: { turnMode, turnOrder, currentTurn } }
 * @throws 400 - If turn mode is invalid
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

// Verify ownership
const session = db.prepare(
  "SELECT id FROM sessions WHERE id = ? AND owner_id = ?"
).get(sessionId, userId);

if (!session) {
  return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
}

  requireJson(request);
  const body = await request.json();
const { turnMode, turnOrder, currentTurn } = body;

if (turnMode !== undefined) {
  const normalized = normalizeMode(turnMode);
  if (!VALID_MODES.includes(turnMode) && !VALID_MODES.includes(normalized)) {
    return NextResponse.json({ error: `Invalid turn mode. Valid: freeform, ordered, disabled, free_for_all, claim, round_robin` }, { status: 400 });
  }
  db.prepare(
    "INSERT OR REPLACE INTO session_config (session_id, key, value) VALUES (?, 'turn_mode', ?)"
  ).run(sessionId, normalized);
}

if (turnOrder !== undefined) {
  db.prepare(
    "INSERT OR REPLACE INTO session_config (session_id, key, value) VALUES (?, 'turn_order', ?)"
  ).run(sessionId, JSON.stringify(turnOrder));
}

if (currentTurn !== undefined) {
  db.prepare(
    "INSERT OR REPLACE INTO session_config (session_id, key, value) VALUES (?, 'current_turn', ?)"
  ).run(sessionId, currentTurn);
}

// Emit turn update event
const config = getTurnConfig(db, sessionId);
eventBus.emit(`${SessionEvents.TURN_UPDATED}:${sessionId}`, config);

return NextResponse.json({ success: true, turnConfig: config }); });

/**
 * POST /api/sessions/[id]/turn
 *
 * Performs a turn action — either "advance" to the next participant in
 * the turn order, or "claim" to take the current turn. Only session
 * participants can perform turn actions. Emits a turn:updated SSE event.
 *
 * @param request - The incoming Next.js request object containing JSON body with action ("advance" | "claim")
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { success: true, turnConfig: { turnMode, turnOrder, currentTurn } }
 * @throws 400 - If action is invalid or no turn order configured for advance
 * @throws 401 - If authentication fails or token is missing
 * @throws 403 - If user is not a participant
 * @throws 404 - If session is not found
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_write:${ip}`, "session_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: sessionId } = await params;
  requireJson(request);
  const body = await request.json();
const { action } = body;

const db = getDb();

// Verify participant
const participant = db.prepare(
  "SELECT sp.session_id, u.username FROM session_participants sp JOIN users u ON sp.user_id = u.id WHERE sp.session_id = ? AND sp.user_id = ?"
).get(sessionId, userId) as { session_id: string; username: string } | undefined;

if (!participant) {
  return NextResponse.json({ error: "Not a participant" }, { status: 403 });
}

const turnOrderRow = db.prepare(
  "SELECT value FROM session_config WHERE session_id = ? AND key = 'turn_order'"
).get(sessionId) as { value: string } | undefined;

const currentTurnRow = db.prepare(
  "SELECT value FROM session_config WHERE session_id = ? AND key = 'current_turn'"
).get(sessionId) as { value: string } | undefined;

if (action === "advance") {
  // Advance to next in order (works with ordered mode)
  const turnOrder: string[] = safeParseWarn<string[]>(turnOrderRow?.value, "turn order", []) ?? [];
  if (turnOrder.length === 0) {
    return NextResponse.json({ error: "No turn order configured" }, { status: 400 });
  }

  const currentIdx = currentTurnRow ? turnOrder.indexOf(currentTurnRow.value) : -1;
  const nextIdx = (currentIdx + 1) % turnOrder.length;
  const nextUserId = turnOrder[nextIdx];

  db.prepare(
    "INSERT OR REPLACE INTO session_config (session_id, key, value) VALUES (?, 'current_turn', ?)"
  ).run(sessionId, nextUserId);
} else if (action === "claim") {
  // Claim the turn (sets current turn to the claiming user's username)
  db.prepare(
    "INSERT OR REPLACE INTO session_config (session_id, key, value) VALUES (?, 'current_turn', ?)"
  ).run(sessionId, participant.username);
} else {
  return NextResponse.json({ error: "Invalid action. Use 'advance' or 'claim'." }, { status: 400 });
}

// Emit turn update event
const config = getTurnConfig(db, sessionId);
eventBus.emit(`${SessionEvents.TURN_UPDATED}:${sessionId}`, config);

return NextResponse.json({ success: true, turnConfig: config }); });
