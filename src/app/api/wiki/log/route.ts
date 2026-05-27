import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
// @deprecated: logger.ts is deprecated — use history.ts (SQLite wiki_versions) instead
import { getRecentLogs } from "@/lib/wiki/logger";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import { serverError } from '@/lib/error-response';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/wiki/log
 *
 * Returns recent activity log entries for wiki operations within a universe.
 *
 * @param request - The incoming Next.js request object (supports ?universe_id and ?count query params)
 * @returns NextResponse with { logs }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If retrieving logs fails
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_read:${ip}`, "wiki_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const universeId = request.nextUrl.searchParams.get("universe_id") || "";
  const wikiRoot = getWikiRoot(userId, universeId || undefined);
  const count = parseInt(request.nextUrl.searchParams.get("count") || "5", 10);

  try {
    const logs = getRecentLogs(wikiRoot, count);
    return NextResponse.json({ logs });
  } catch (err: unknown) {
    return serverError(err);
  }
}
