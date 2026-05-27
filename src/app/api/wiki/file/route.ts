import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { fileAnswer } from "@/lib/wiki/filing";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import { serverError, requireJson } from '@/lib/error-response';
import { validateLength } from '@/lib/validation';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * POST /api/wiki/file
 *
 * Files an LLM-generated answer into the wiki by creating or updating pages based on
 * the provided query, answer text, and citations. Used to persist query results as wiki content.
 *
 * @param request - The incoming Next.js request object with JSON body { query, answer, citations, universeId }
 * @returns NextResponse with the filing result object
 * @throws 400 - If required fields (query, answer, citations, universeId) are missing or invalid
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If the filing operation fails
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_write:${ip}`, "wiki_write");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

    requireJson(request);
    const body = await request.json();
  const { query, answer, citations, universeId } = body;

  if (!query || !answer || !Array.isArray(citations) || !universeId) {
    return NextResponse.json(
      { error: "query, answer, citations (array), and universeId are required" },
      { status: 400 }
    );
  }

  const queryError = validateLength(query, 1000, "Query");
  if (queryError) return NextResponse.json({ error: queryError }, { status: 400 });
  const answerError = validateLength(answer, 100000, "Answer");
  if (answerError) return NextResponse.json({ error: answerError }, { status: 400 });

  const wikiRoot = getWikiRoot(userId, universeId);

  try {
    const result = await fileAnswer(query, answer, citations, wikiRoot, universeId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return serverError(err);
  }
}
