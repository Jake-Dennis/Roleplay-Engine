import { withErrorHandler } from '@/lib/with-error-handler';
import { camelizeKeys } from '@/lib/response-utils';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getDb } from "@/lib/db";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/admin/contradictions
 * List contradiction flags for the authenticated user with optional status filtering and cursor pagination.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { contradictions, nextCursor }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`api:${ip}`, "api");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const cursor = searchParams.get("cursor");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

  const db = getDb();

  let conditions = "WHERE user_id = ?";
  const params: unknown[] = [userId];

  if (status && status !== "all") {
    conditions += " AND status = ?";
    params.push(status);
  }

  // Cursor pagination on id (by detected_at desc)
  if (cursor) {
    const cursorRow = db.prepare(
      "SELECT detected_at FROM contradiction_flags WHERE id = ? AND user_id = ?"
    ).get(cursor, userId) as { detected_at: string } | undefined;

    if (cursorRow) {
      conditions += " AND (detected_at, id) < (?, ?)";
      params.push(cursorRow.detected_at, cursor);
    }
  }

  const query = `SELECT * FROM contradiction_flags ${conditions} ORDER BY
    CASE status WHEN 'open' THEN 0 WHEN 'resolved' THEN 1 WHEN 'dismissed' THEN 2 END,
    detected_at DESC
    LIMIT ?`;
  params.push(limit + 1);

  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

  let nextCursor: string | null = null;
  let resultItems = rows;
  if (rows.length > limit) {
    nextCursor = rows[limit].id as string;
    resultItems = rows.slice(0, limit);
  }

  return NextResponse.json({
    contradictions: camelizeKeys(resultItems),
    nextCursor,
  });
});
