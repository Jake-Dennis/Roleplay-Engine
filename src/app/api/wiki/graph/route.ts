import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { listWikiPages } from "@/lib/wiki/file-io";
import { buildLinkGraph, detectCollisions } from "@/lib/wiki/wikilinks";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import fs from "fs";
import { getAuthToken } from '@/lib/auth-token';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export const GET = withErrorHandler(async (request: NextRequest) => { const token = getAuthToken(request);
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`wiki_read:${ip}`, "wiki_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const universeId = request.nextUrl.searchParams.get("universe_id") || "";
  const wikiRoot = getWikiRoot(decoded.sub, universeId || undefined);
if (!fs.existsSync(wikiRoot)) {
  return NextResponse.json({ nodes: [], edges: [], collisions: [] });
}

const pages = listWikiPages(wikiRoot);
const graph = buildLinkGraph(pages);
const nodes = Array.from(graph.nodes.entries()).map(([source, targets]) => ({ source, targets }));
const collisions = detectCollisions(pages);

return NextResponse.json({ nodes, edges: graph.edges, collisions }); });
