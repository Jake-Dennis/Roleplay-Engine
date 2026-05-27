import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { processIdleTier } from "@/lib/idle-processing";
import { withAuth } from '@/lib/with-auth';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * POST /api/idle/heartbeat
 * Called by the client when idle tier changes. Triggers server-side enrichment jobs
 * for the appropriate tier (1-4) and records the last activity timestamp.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { success: true, tier }
 * @throws 400 - If tier is invalid (not 1-4)
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`jobs_trigger:${ip}`, "jobs_trigger");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
const { tier, page, universeId } = body;

if (!tier || tier < 1 || tier > 4) {
  return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
}

const db = getDb();

// Update user's last activity timestamp
db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").run(userId);

// Check if this tier has already been processed (prevent duplicate jobs)
const userRow = db.prepare(
  "SELECT last_idle_t FROM users WHERE id = ?"
).get(userId) as { last_idle_t: number | null } | undefined;

const lastProcessedTier = userRow?.last_idle_t || 0;

if (tier > lastProcessedTier) {
  // Process idle tier jobs with universe context
  await processIdleTier(userId, tier, page || "/", universeId || null);

  // Update the highest tier processed
  db.prepare("UPDATE users SET last_idle_t = ? WHERE id = ?").run(tier, userId);
}

return NextResponse.json({ success: true, tier }); });
