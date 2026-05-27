import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import type { DbDatabase } from "@/lib/types";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

// Ensure character_name column exists
function ensureColumn(db: DbDatabase) {
  try {
    db.exec("ALTER TABLE session_participants ADD COLUMN character_name TEXT");
  } catch {
    // Column already exists
  }
}

/**
 * POST /api/sessions/[id]/join
 *
 * Joins a session as a participant. Requires a valid pending invitation.
 * Accepts an optional character name for roleplay identity. Updates the
 * invitation status to accepted and emits a participant:joined SSE event.
 *
 * @param request - The incoming Next.js request object containing optional JSON body with character_name
 * @param params - Route parameters containing the session id
 * @returns NextResponse with { success: true, role: "participant", characterName }
 * @throws 401 - If authentication fails or token is missing
 * @throws 403 - If no invitation found for this session
 * @throws 404 - If session is not found or not active
 * @throws 409 - If already a participant, is the owner, or character name is taken
 * @throws 429 - If rate limit exceeded
 */
export async function POST(
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
  const db = getDb();
  ensureColumn(db);

  // Check session exists
  const session = db.prepare(
    "SELECT id, owner_id FROM sessions WHERE id = ? AND status = 'active'"
  ).get(sessionId) as { id: string; owner_id: string } | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found or not active" }, { status: 404 });
  }

  // Check if already a participant
  const existing = db.prepare(
    "SELECT session_id FROM session_participants WHERE session_id = ? AND user_id = ?"
  ).get(sessionId, userId);

  if (existing) {
    return NextResponse.json({ error: "Already a participant" }, { status: 409 });
  }

  if (session.owner_id === userId) {
    return NextResponse.json({ error: "You are the owner" }, { status: 409 });
  }

  // Check for a valid invitation (if not the owner)
  const invite = db.prepare(
    "SELECT id, status FROM invitations WHERE session_id = ? AND invitee_id = ? AND status = 'pending'"
  ).get(sessionId, userId) as { id: string; status: string } | undefined;

  if (!invite) {
    return NextResponse.json({ error: "No invitation found for this session" }, { status: 403 });
  }

  // Parse optional character_name from body
  const body = await request.json().catch(() => ({}));
  const characterName = body.character_name?.trim() || null;

  // Check character name uniqueness if provided
  if (characterName) {
    const taken = db.prepare(
      "SELECT id FROM session_participants WHERE session_id = ? AND character_name = ?"
    ).get(sessionId, characterName);
    if (taken) {
      return NextResponse.json({ error: `Character name "${characterName}" is already taken` }, { status: 409 });
    }
  }

  // Add as participant
  db.prepare(
    "INSERT INTO session_participants (session_id, user_id, role, character_name) VALUES (?, ?, 'participant', ?)"
  ).run(sessionId, userId, characterName);

  // Get username for event
  const user = db.prepare("SELECT username FROM users WHERE id = ?").get(userId) as { username: string } | undefined;

  // Update invitation
  db.prepare(
    "UPDATE invitations SET status = 'accepted' WHERE id = ?"
  ).run(invite.id);

  // Emit SSE event
  eventBus.emit(`${SessionEvents.PARTICIPANT_JOINED}:${sessionId}`, {
    sessionId,
    userId,
    username: user?.username || "unknown",
    characterName,
    action: "joined",
  });

  return NextResponse.json({ success: true, role: "participant", characterName: characterName });
}
