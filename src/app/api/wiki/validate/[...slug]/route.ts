import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { validatePage } from "@/lib/wiki/validation";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import path from "path";
import fs from "fs";
import { notFoundError, badRequestError } from '@/lib/error-response';
import { logger } from '@/lib/logger';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * PUT /api/wiki/validate/[...slug]
 *
 * Validates (approves) a wiki page, transitioning it from "draft" to "reviewed" status.
 * Reviewed pages are considered human-approved and can later be locked.
 *
 * @param request - The incoming Next.js request object (supports ?universe_id query param)
 * @param params - Route parameters containing the slug path segments
 * @returns NextResponse with { success: true, status: "reviewed" }
 * @throws 400 - If the slug path is invalid, or the page is not in draft state
 * @throws 401 - If authentication fails
 * @throws 404 - If the wiki page does not exist
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If the validate operation fails
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const universeId = request.nextUrl.searchParams.get("universe_id") || "";
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_write:${ip}`, "wiki_write");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const { slug } = await params;
  const joined = slug.join("/");
  const relativePath = joined.endsWith(".md") ? joined : `${joined}.md`;
  const wikiRoot = getWikiRoot(userId, universeId || undefined);
  const fullPath = path.join(wikiRoot, relativePath);

  // Security: prevent path traversal
  if (!isPathWithinRoot(fullPath, wikiRoot)) {
    return badRequestError("Invalid path");
  }

  if (!fs.existsSync(fullPath)) {
    return notFoundError("Wiki page");
  }

  try {
    const result = await validatePage(fullPath);
    if (!result) {
      return badRequestError("Page is not in draft state");
    }
    return NextResponse.json({ success: true, status: "reviewed" });
  } catch (err: unknown) {
    logger.error("Failed to validate wiki page", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
