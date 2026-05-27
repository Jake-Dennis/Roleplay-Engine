import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/personas/active
 * Get the currently active persona for the authenticated user, or null if none is set.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { persona: Persona | null }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`persona_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const db = getDb();
ensureGroupSupport(db);

const persona = db.prepare(
  "SELECT * FROM personas WHERE user_id = ? AND is_active = 1"
).get(userId);

return NextResponse.json({ persona: persona ? camelizeKeys(persona) : null }); });
