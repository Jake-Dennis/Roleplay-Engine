import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { lockPage } from "@/lib/wiki/validation";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import path from "path";
import fs from "fs";
import { logger } from '@/lib/logger';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * PUT /api/wiki/lock/[...slug]
 *
 * Locks a wiki page, transitioning it from "reviewed" to "locked" status.
 * Locked pages are immutable and cannot be edited.
 *
 * @param request - The incoming Next.js request object (supports ?universe_id query param)
 * @param params - Route parameters containing the slug path segments
 * @returns NextResponse with { success: true, status: "locked" }
 * @throws 400 - If the slug path is invalid, or the page is already locked
 * @throws 401 - If authentication fails
 * @throws 404 - If the wiki page does not exist
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If the lock operation fails
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
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
  }

  try {
    const result = await lockPage(fullPath);
    if (!result) {
      return NextResponse.json({ error: "Page is already locked" }, { status: 400 });
    }
    return NextResponse.json({ success: true, status: "locked" });
  } catch (err: unknown) {
    logger.error("Failed to lock wiki page", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
