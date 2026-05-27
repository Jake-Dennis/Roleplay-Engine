import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureGroupSupport } from "@/lib/group-migrations";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * PUT /api/personas/{id}/activate
 * Set a persona as the active persona. Deactivates all other personas for the user.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the persona id
 * @returns NextResponse with { persona }
 * @throws 401 - If authentication fails
 * @throws 404 - If persona not found
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`persona_write:${ip}`, "persona_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id } = await params;
const db = getDb();
ensureGroupSupport(db);

// Verify ownership
const existing = db.prepare(
  "SELECT * FROM personas WHERE id = ? AND user_id = ?"
).get(id, userId);

if (!existing) {
  return NextResponse.json({ error: "Persona not found" }, { status: 404 });
}

// Deactivate all personas, then activate this one
db.prepare("UPDATE personas SET is_active = 0 WHERE user_id = ?").run(userId);
db.prepare("UPDATE personas SET is_active = 1 WHERE id = ?").run(id);

const persona = db.prepare("SELECT * FROM personas WHERE id = ?").get(id);

return NextResponse.json({ persona }); });
