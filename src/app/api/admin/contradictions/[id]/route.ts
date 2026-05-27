import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';
import { notFoundError, badRequestError } from '@/lib/error-response';

/**
 * PATCH /api/admin/contradictions/{id}
 * Update a contradiction flag's status to resolved or dismissed, with an optional resolution note.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing the contradiction flag id
 * @returns NextResponse with { contradiction }
 * @throws 400 - If Content-Type is not application/json or status is invalid
 * @throws 401 - If authentication fails
 * @throws 404 - If contradiction not found
 * @throws 429 - If rate limit exceeded
 */
export const PATCH = withErrorHandler(async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const { id } = await params;
  const db = getDb();

  // Verify it exists and belongs to user
  const existing = db.prepare(
    "SELECT id FROM contradiction_flags WHERE id = ? AND user_id = ?"
  ).get(id, userId) as { id: string } | undefined;

  if (!existing) return notFoundError("Contradiction");

  const contentType = request.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return badRequestError("Content-Type must be application/json");
  }

  const body = await request.json();
  const { status, resolution } = body;

  if (!status || !["resolved", "dismissed"].includes(status)) {
    return badRequestError("Status must be 'resolved' or 'dismissed'");
  }

  db.prepare(`
    UPDATE contradiction_flags
    SET status = ?,
        resolved_at = CURRENT_TIMESTAMP,
        resolution = COALESCE(?, resolution)
    WHERE id = ? AND user_id = ?
  `).run(status, resolution || null, id, userId);

  const updated = db.prepare(
    "SELECT * FROM contradiction_flags WHERE id = ?"
  ).get(id) as Record<string, unknown>;

  return NextResponse.json({ contradiction: camelizeKeys(updated) });
});
