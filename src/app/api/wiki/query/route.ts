import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { queryWiki } from "@/lib/wiki/query";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import { serverError, requireJson } from '@/lib/error-response';
import { validateLength } from '@/lib/validation';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * POST /api/wiki/query
 *
 * Queries the wiki using the LLM to synthesize an answer from wiki content.
 * Returns the generated answer, supporting citations, and a fallback indicator.
 *
 * @param request - The incoming Next.js request object with JSON body { query, universeId }
 * @returns NextResponse with { answer, citations, usedFallback }
 * @throws 400 - If query or universeId is missing, or query exceeds length limit
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If the LLM query fails
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_query:${ip}`, "wiki_query");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

    requireJson(request);
    const body = await request.json();
  const { query, universeId } = body;

  if (!query || !universeId) {
    return NextResponse.json(
      { error: "query and universeId are required" },
      { status: 400 }
    );
  }

  const queryError = validateLength(query, 1000, "Query");
  if (queryError) return NextResponse.json({ error: queryError }, { status: 400 });

  const wikiRoot = getWikiRoot(userId, universeId);

  try {
    const result = await queryWiki(query, wikiRoot, universeId);
    return NextResponse.json({
      answer: result.answer,
      citations: result.citations,
      usedFallback: result.usedFallback,
    });
  } catch (err: unknown) {
    return serverError(err);
  }
}
