import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { vectorSearch, getSearchStats } from "@/lib/vector-search";
import { getAuthToken } from '@/lib/auth-token';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

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
    const stats = getSearchStats(decoded.sub);
    return NextResponse.json({ stats });
  }

  // Cap limit to reasonable maximum
  const safeLimit = Math.min(limit, 100);

  // Validate minScore range
  if (isNaN(minScore) || minScore < 0 || minScore > 1) {
    return NextResponse.json({ error: "minScore must be between 0 and 1" }, { status: 400 });
  }

  try {
    const results = await vectorSearch(decoded.sub, query, {
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
