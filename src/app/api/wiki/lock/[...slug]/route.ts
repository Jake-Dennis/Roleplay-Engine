import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { lockPage } from "@/lib/wiki/validation";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import path from "path";
import fs from "fs";
import { getAuthToken } from '@/lib/auth-token';
import { logger } from '@/lib/logger';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const universeId = request.nextUrl.searchParams.get("universe_id") || "";
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_write:${ip}`, "wiki_write");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const { slug } = await params;
  const joined = slug.join("/");
  const relativePath = joined.endsWith(".md") ? joined : `${joined}.md`;
  const wikiRoot = getWikiRoot(decoded.sub, universeId || undefined);
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
