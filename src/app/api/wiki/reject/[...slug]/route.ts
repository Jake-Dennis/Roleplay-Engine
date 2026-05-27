import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { requireJson } from "@/lib/error-response";
import { rejectPage } from "@/lib/wiki/validation";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import path from "path";
import fs from "fs";
import { logger } from '@/lib/logger';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * PUT /api/wiki/reject/[...slug]
 *
 * Rejects a wiki page that is in "draft" status, transitioning it to "rejected" status
 * with a provided reason. The page remains available but is flagged as rejected.
 *
 * @param request - The incoming Next.js request object with JSON body { reason: string }
 * @param params - Route parameters containing the slug path segments
 * @returns NextResponse with { success: true, status: "rejected" }
 * @throws 400 - If the slug path is invalid, reason is missing, or page is not in draft state
 * @throws 401 - If authentication fails
 * @throws 404 - If the wiki page does not exist
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If the reject operation fails
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

    requireJson(request);
    const body = await request.json();
  if (!body.reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  try {
    const result = await rejectPage(fullPath, body.reason);
    if (!result) {
      return NextResponse.json({ error: "Page is not in draft state" }, { status: 400 });
    }
    return NextResponse.json({ success: true, status: "rejected" });
  } catch (err: unknown) {
    logger.error("Failed to reject wiki page", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
