import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { vectorSearch, getSearchStats } from "@/lib/vector-search";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/search
 * Perform a vector search across entities or retrieve search stats.
 * If query (q) is omitted, returns stats instead of results.
 *
 * @param request - The incoming Next.js request object
 * @returns NextResponse with { results, query } or { stats }
 * @throws 400 - If minScore is outside the 0-1 range
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`search:${ip}`, "search");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  const entityType = url.searchParams.get("type") || undefined;
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);
  const minScore = parseFloat(url.searchParams.get("minScore") || "0.5");

  if (!query) {
    // Return stats
    const stats = getSearchStats(userId);
    return NextResponse.json({ stats });
  }

  // Cap limit to reasonable maximum
  const safeLimit = Math.min(limit, 100);

  // Validate minScore range
  if (isNaN(minScore) || minScore < 0 || minScore > 1) {
    return NextResponse.json({ error: "minScore must be between 0 and 1" }, { status: 400 });
  }

  try {
    const results = await vectorSearch(userId, query, {
      limit: safeLimit,
      entityType,
      minScore,
    });
    return NextResponse.json({ results, query });
  } catch {
    // Return empty results if embedding generation fails (e.g., Ollama unavailable)
    return NextResponse.json({ results: [], query, warning: "Embedding service unavailable" });
  }
}
