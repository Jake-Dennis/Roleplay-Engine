import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { lintWiki } from "@/lib/wiki/lint";
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from "@/lib/rate-limiter";
import { getAuthToken } from '@/lib/auth-token';
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import { serverError } from '@/lib/error-response';

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  cleanupExpiredEntries();
  const limit = checkRateLimit(`generate:${decoded.sub}`, "generate");
  if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);

  const body = await request.json().catch(() => ({}));
  const { universeId } = body;

  const wikiRoot = getWikiRoot(decoded.sub, universeId);

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
