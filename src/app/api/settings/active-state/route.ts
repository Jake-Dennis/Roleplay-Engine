import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { withAuth } from '@/lib/with-auth';
import { getDb } from "@/lib/db";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * PUT /api/settings/active-state
 * Update the user's active state (last active group, session, universe).
 * Only touch fields that are provided in the body.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { success: true }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`active_state:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
const { groupId, sessionId, universeId } = body;

const db = getDb();
ensureGroupSupport(db);

// Build dynamic update — only touch fields that were provided
const updates: string[] = [];
const values: (string | null)[] = [];

if ("groupId" in body) {
  updates.push("last_active_group_id = ?");
  values.push(groupId || null);
}
if ("sessionId" in body) {
  updates.push("last_active_session_id = ?");
  values.push(sessionId || null);
}
if ("universeId" in body) {
  updates.push("last_active_universe_id = ?");
  values.push(universeId || null);
}

if (updates.length === 0) {
  return NextResponse.json({ success: true });
}

values.push(userId);
db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);

return NextResponse.json({ success: true }); });
