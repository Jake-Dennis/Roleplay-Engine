import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import type { DbDatabase } from "@/lib/types";
import { withAuth } from '@/lib/with-auth';
import { validateLength } from '@/lib/validation';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

// Ensure invitations table exists
function ensureTable(db: DbDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    inviter_id TEXT NOT NULL REFERENCES users(id),
    invitee_id TEXT NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, invitee_id)
  )`);
}

/**
 * POST /api/sessions/[id]/invite
 *
 * Invites a user by username to join a session. Only the session owner
 * can invite. Checks for existing participants and pending invitations
 * to avoid duplicates. Emits a participant:invited SSE event.
 *
 * @param request - The incoming Next.js request object containing JSON body with username
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { success: true, invitee: { id, username } }
 * @throws 400 - If username is missing, invalid, or user tries to invite themselves
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session or target user is not found
 * @throws 409 - If user is already a participant or invitation is already pending
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
const { username } = body;

if (!username) {
  return NextResponse.json({ error: "Username is required" }, { status: 400 });
}

const usernameError = validateLength(username, 50, "Username");
if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 });

const db = getDb();
ensureTable(db);

// Verify session ownership
const session = db.prepare(
  "SELECT id, owner_id FROM sessions WHERE id = ? AND owner_id = ?"
).get(sessionId, userId);

if (!session) {
  return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
}

// Find user by username
const targetUser = db.prepare(
  "SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)"
).get(username) as { id: string; username: string } | undefined;

if (!targetUser) {
  return NextResponse.json({ error: "User not found" }, { status: 404 });
}

if (targetUser.id === userId) {
  return NextResponse.json({ error: "Cannot invite yourself" }, { status: 400 });
}

// Check if already a participant
const existing = db.prepare(
  "SELECT session_id FROM session_participants WHERE session_id = ? AND user_id = ?"
).get(sessionId, targetUser.id);

if (existing) {
  return NextResponse.json({ error: "User is already a participant" }, { status: 409 });
}

// Check for existing pending invitation
const existingInvite = db.prepare(
  "SELECT id, status FROM invitations WHERE session_id = ? AND invitee_id = ?"
).get(sessionId, targetUser.id) as { id: string; status: string } | undefined;

if (existingInvite && existingInvite.status === "pending") {
  return NextResponse.json({ error: "Invitation already pending for this user" }, { status: 409 });
}

// Upsert invitation
if (existingInvite) {
  db.prepare(
    "UPDATE invitations SET status = 'pending', created_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(existingInvite.id);
} else {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO invitations (id, session_id, inviter_id, invitee_id) VALUES (?, ?, ?, ?)"
  ).run(id, sessionId, userId, targetUser.id);
}

// Emit SSE event
eventBus.emit(`${SessionEvents.PARTICIPANT_INVITED}:${sessionId}`, {
  sessionId,
  userId: targetUser.id,
  username: targetUser.username,
  inviterId: userId,
  action: "invited",
});

return NextResponse.json({
  success: true,
  invitee: { id: targetUser.id, username: targetUser.username },
}); });

/**
 * GET /api/sessions/[id]/invite
 *
 * Lists all pending invitations for a session. Includes inviter and
 * invitee details. Session owner and participants can view invitations.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { invitations: Invitation[] }
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
ensureTable(db);

// Verify access
const session = db.prepare(
  "SELECT id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (SELECT session_id FROM session_participants WHERE user_id = ?))"
).get(sessionId, userId, userId);

if (!session) {
  return NextResponse.json({ error: "Session not found" }, { status: 404 });
}

// Get pending invitations
const invitations = db.prepare(`
  SELECT i.id, i.status, i.created_at,
    inviter.id as inviter_id, inviter.username as inviter_username,
    invitee.id as invitee_id, invitee.username as invitee_username
  FROM invitations i
  JOIN users inviter ON i.inviter_id = inviter.id
  JOIN users invitee ON i.invitee_id = invitee.id
  WHERE i.session_id = ? AND i.status = 'pending'
  ORDER BY i.created_at DESC
`).all(sessionId);

return NextResponse.json({ invitations: camelizeKeys(invitations) }); });
