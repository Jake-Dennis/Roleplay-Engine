import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { listWikiPages } from "@/lib/wiki/file-io";
import { buildLinkGraph, detectCollisions } from "@/lib/wiki/wikilinks";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import fs from "fs";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/wiki/graph
 *
 * Builds and returns the wikilink graph for a universe, including nodes, edges,
 * and any detected collisions (pages with the same or similar names).
 *
 * @param request - The incoming Next.js request object (supports ?universe_id query param)
 * @returns NextResponse with { nodes, edges, collisions }
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const GET = withErrorHandler(async (request: NextRequest) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`wiki_read:${ip}`, "wiki_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const universeId = request.nextUrl.searchParams.get("universe_id") || "";
  const wikiRoot = getWikiRoot(userId, universeId || undefined);
if (!fs.existsSync(wikiRoot)) {
  return NextResponse.json({ nodes: [], edges: [], collisions: [] });
}

const pages = listWikiPages(wikiRoot);
const graph = buildLinkGraph(pages);
const nodes = Array.from(graph.nodes.entries()).map(([source, targets]) => ({ source, targets }));
const collisions = detectCollisions(pages);

return NextResponse.json({ nodes, edges: graph.edges, collisions }); });
