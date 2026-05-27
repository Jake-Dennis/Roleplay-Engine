import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import type { DbDatabase } from "@/lib/types";
import { withAuth } from '@/lib/with-auth';
import { safeParseWarn } from "@/lib/safe-json";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

// Add private_state column to session_participants if not exists
function ensureColumn(db: DbDatabase) {
  try {
    db.exec("ALTER TABLE session_participants ADD COLUMN private_state TEXT");
  } catch {
    // Column already exists
  }
}

/**
 * GET /api/sessions/[id]/private-state
 *
 * Retrieves the authenticated user's private state for the session.
 * Private state is per-participant metadata stored as JSON, useful for
 * tracking user-specific session data. Owners without a participants
 * row receive an empty state.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { privateState: Record<string, unknown> }
 * @throws 401 - If authentication fails or token is missing
 * @throws 403 - If user is not a participant (and not the owner)
 * @throws 429 - If rate limit exceeded
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`session_read:${ip}`, "session_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const { id: sessionId } = await params;
  const db = getDb();
  ensureColumn(db);

  const participant = db.prepare(
    "SELECT private_state FROM session_participants WHERE session_id = ? AND user_id = ?"
  ).get(sessionId, userId) as { private_state: string | null } | undefined;

  if (!participant) {
    // Check if user is the owner (owners don't have session_participants row)
    const isOwner = db.prepare(
      "SELECT id FROM sessions WHERE id = ? AND owner_id = ?"
    ).get(sessionId, userId);
    if (isOwner) {
      return NextResponse.json({ privateState: {} });
    }
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  let state: Record<string, unknown> = {};
  if (participant.private_state) {
    const parsed = safeParseWarn<Record<string, unknown>>(participant.private_state, "private state");
    if (parsed) state = parsed;
  }

  return NextResponse.json({ privateState: state });
}

/**
 * PUT /api/sessions/[id]/private-state
 *
 * Updates the authenticated user's private state for the session.
 * Replaces the entire private state JSON object for this participant.
 *
 * @param request - The incoming Next.js request object containing JSON body with state (Record<string, unknown>)
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { success: true }
 * @throws 401 - If authentication fails or token is missing
 * @throws 403 - If user is not a participant
 * @throws 429 - If rate limit exceeded
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`session_write:${ip}`, "session_write");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const { id: sessionId } = await params;
    requireJson(request);
    const body = await request.json();
  const { state } = body;

  const db = getDb();
  ensureColumn(db);

  const result = db.prepare(
    "UPDATE session_participants SET private_state = ? WHERE session_id = ? AND user_id = ?"
  ).run(JSON.stringify(state || {}), sessionId, userId);

  if (result.changes === 0) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
