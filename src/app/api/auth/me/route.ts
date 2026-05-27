import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { getUserById } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/auth/me
 *
 * Returns the authenticated user's profile including id, username, createdAt,
 * and their active state (last active group, session, and universe IDs).
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { user: { id, username, createdAt }, activeState: { groupId, sessionId, universeId } }
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If user is not found in the database
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`auth_me:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const user = getUserById(userId);
if (!user) {
  return NextResponse.json({ error: "User not found" }, { status: 404 });
}

// Fetch active state from DB
const db = getDb();
ensureGroupSupport(db);
const activeState = db.prepare(
  "SELECT last_active_group_id, last_active_session_id, last_active_universe_id FROM users WHERE id = ?"
).get(userId) as {
  last_active_group_id: string | null;
  last_active_session_id: string | null;
  last_active_universe_id: string | null;
} | undefined;

return NextResponse.json({
  user: {
    id: user.id,
    username: user.username,
    createdAt: user.created_at,
  },
  activeState: {
    groupId: activeState?.last_active_group_id || null,
    sessionId: activeState?.last_active_session_id || null,
    universeId: activeState?.last_active_universe_id || null,
  },
}); });
