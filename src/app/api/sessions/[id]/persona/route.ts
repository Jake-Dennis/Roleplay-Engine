import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * PUT /api/sessions/[id]/persona
 *
 * Sets the active persona for a session. Only the session owner can
 * change the persona. Validates that the persona belongs to the user
 * if a persona_id is provided. Set persona_id to null to clear.
 *
 * @param request - The incoming Next.js request object containing JSON body with persona_id (string | null)
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { success: true, session: { persona_id } }
 * @throws 400 - If persona_id is provided but persona not found or doesn't belong to user
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

// Verify ownership (only owner can change persona)
const session = db.prepare(
  "SELECT id FROM sessions WHERE id = ? AND owner_id = ?"
).get(sessionId, userId);

if (!session) {
  return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
}

requireJson(request);
const body = await request.json();

const personaId: string | null = body.persona_id;

// If persona_id is provided (not null), validate it belongs to the user
if (personaId !== null && personaId !== undefined) {
  const persona = db.prepare(
    "SELECT id FROM personas WHERE id = ? AND user_id = ?"
  ).get(personaId, userId);

  if (!persona) {
    return NextResponse.json({ error: "Persona not found or does not belong to user" }, { status: 400 });
  }
}

// Update session
db.prepare(
  "UPDATE sessions SET persona_id = ? WHERE id = ?"
).run(personaId === undefined ? null : personaId, sessionId);

// Fetch updated session
const updated = db.prepare(
  "SELECT id, persona_id FROM sessions WHERE id = ?"
).get(sessionId) as { id: string; persona_id: string | null };

return NextResponse.json({ success: true, session: { persona_id: updated.persona_id } }); });
