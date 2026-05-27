import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { readWikiPage } from "@/lib/wiki/file-io";
import { checkPageSize, suggestSplit } from "@/lib/wiki/page-split";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import path from "path";
import fs from "fs";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/wiki/split-suggestions/[...slug]
 *
 * Analyzes a wiki page and returns suggestions for splitting it into multiple
 * smaller pages if the content exceeds a reasonable size threshold.
 *
 * @param request - The incoming Next.js request object (supports ?universe_id query param)
 * @param params - Route parameters containing the slug path segments
 * @returns NextResponse with { pageSize, splitSuggestion }
 * @throws 400 - If the slug path is invalid or traverses outside the wiki root
 * @throws 401 - If authentication fails
 * @throws 404 - If the wiki page does not exist
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ slug: string[] }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`wiki_read:${ip}`, "wiki_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const universeId = request.nextUrl.searchParams.get("universe_id") || "";
  const { slug } = await params;
  const joined = slug.join("/");
  const relativePath = joined.endsWith(".md") ? joined : `${joined}.md`;
  const wikiRoot = getWikiRoot(userId, universeId || undefined);
const fullPath = path.join(wikiRoot, relativePath);

if (!isPathWithinRoot(fullPath, wikiRoot)) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
if (!fs.existsSync(fullPath)) return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });

const page = readWikiPage(fullPath);
const pageSize = checkPageSize(page.content);
const splitSuggestion = suggestSplit(fullPath, page.content);

return NextResponse.json({ pageSize, splitSuggestion }); });
