import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from '@/lib/rate-limiter';

/**
 * GET /api/invitations
 * List all pending session invitations for the authenticated user.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { invitations }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

cleanupExpiredEntries();
const limit = checkRateLimit(`invitations:${userId}`, "invitations");
if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);

const db = getDb();

const invitations = db.prepare(`
  SELECT i.id, i.status, i.created_at,
    s.id as session_id, s.name as session_name,
    u.id as inviter_id, u.username as inviter_username
  FROM invitations i
  JOIN sessions s ON i.session_id = s.id
  JOIN users u ON i.inviter_id = u.id
  WHERE i.invitee_id = ? AND i.status = 'pending'
  ORDER BY i.created_at DESC
`).all(userId);

return NextResponse.json({ invitations: camelizeKeys(invitations) }); });
