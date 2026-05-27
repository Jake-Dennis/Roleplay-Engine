import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { generateIndex } from "@/lib/wiki/index-generator";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import fs from "fs";
import path from "path";
import { serverError } from '@/lib/error-response';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/wiki/index
 *
 * Returns the auto-generated wiki index (a markdown file listing all wiki pages).
 * Generates the index on demand if it does not already exist.
 *
 * @param request - The incoming Next.js request object (supports ?universe_id query param)
 * @returns NextResponse with { index: string }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If reading or generating the index fails
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_read:${ip}`, "wiki_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const universeId = request.nextUrl.searchParams.get("universe_id") || "";
  const wikiRoot = getWikiRoot(userId, universeId || undefined);
  const indexPath = path.join(wikiRoot, "index.md");

  try {
    if (!fs.existsSync(indexPath)) {
      generateIndex(wikiRoot);
    }
    const index = fs.readFileSync(indexPath, "utf-8");
    return NextResponse.json({ index });
  } catch (err: unknown) {
    return serverError(err);
  }
}
