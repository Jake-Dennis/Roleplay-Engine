import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { listWikiPages } from "@/lib/wiki/file-io";
import { buildLinkGraph, detectCollisions } from "@/lib/wiki/wikilinks";
import path from "path";
import fs from "fs";
import { getAuthToken } from '@/lib/auth-token';

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  if (!fs.existsSync(wikiRoot)) {
    return NextResponse.json({ nodes: [], edges: [], collisions: [] });
  }

  const pages = listWikiPages(wikiRoot);
  const graph = buildLinkGraph(pages);
  const nodes = Array.from(graph.nodes.entries()).map(([source, targets]) => ({ source, targets }));
  const collisions = detectCollisions(pages);

  return NextResponse.json({ nodes, edges: graph.edges, collisions });
}
