import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { queryWiki } from "@/lib/wiki/query";
import path from "path";
import { getAuthToken } from '@/lib/auth-token';
import { serverError, requireJson } from '@/lib/error-response';
import { validateLength } from '@/lib/validation';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

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

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");

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
