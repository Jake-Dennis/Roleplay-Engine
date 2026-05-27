import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { lintWiki } from "@/lib/wiki/lint";
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from "@/lib/rate-limiter";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import { serverError } from '@/lib/error-response';

/**
 * POST /api/wiki/lint
 *
 * Runs lint checks on the wiki for a given universe, detecting contradictions,
 * stale claims, orphan pages, missing pages, and providing improvement suggestions.
 *
 * @param request - The incoming Next.js request object with JSON body { universeId? }
 * @returns NextResponse with { contradictions, staleClaims, orphans, missingPages, suggestions }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If the lint process fails
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  cleanupExpiredEntries();
  const limit = checkRateLimit(`generate:${userId}`, "generate");
  if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);

  const body = await request.json().catch(() => ({}));
  const { universeId } = body;

  const wikiRoot = getWikiRoot(userId, universeId);

  try {
    const result = await lintWiki(wikiRoot, universeId);
    return NextResponse.json({
      contradictions: result.contradictions,
      staleClaims: result.staleClaims,
      orphans: result.orphans,
      missingPages: result.missingPages,
      suggestions: result.suggestions,
    });
  } catch (err: unknown) {
    return serverError(err);
  }
}
