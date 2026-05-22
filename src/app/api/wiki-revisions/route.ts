import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { readWikiPage } from "@/lib/wiki/file-io";
import { listRevisions, saveRevision, getRevision } from "@/lib/wiki/revisions";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import path from "path";
import fs from "fs";
import { getAuthToken } from '@/lib/auth-token';
import { logger } from '@/lib/logger';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_read:${ip}`, "wiki_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const searchParams = request.nextUrl.searchParams;
  const slugParam = searchParams.get("slug");
  const revisionId = searchParams.get("id");
  const universeId = request.nextUrl.searchParams.get("universe_id") || "";
  const wikiRoot = getWikiRoot(decoded.sub, universeId || undefined);

  if (!slugParam) {
    return NextResponse.json({ error: "slug query parameter is required" }, { status: 400 });
  }

  const slug = slugParam.split("/");
  const relativePath = slugParam.endsWith(".md") ? slugParam : `${slugParam}.md`;
  const fullPath = path.join(wikiRoot, relativePath);

  // Security: prevent path traversal
  if (!isPathWithinRoot(fullPath, wikiRoot)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
  }

  // If ?id= is provided, return a specific revision
  if (revisionId) {
    const revision = getRevision(wikiRoot, slug, revisionId);
    if (!revision) {
      return NextResponse.json({ error: "Revision not found" }, { status: 404 });
    }
    return NextResponse.json({ revision });
  }

  const revisions = listRevisions(wikiRoot, slug);
  return NextResponse.json({ revisions });
}

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_write:${ip}`, "wiki_write");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  let wikiRoot: string;
  try {
    const body = await request.json();
    wikiRoot = getWikiRoot(decoded.sub, body.universeId);
  } catch {
    wikiRoot = getWikiRoot(decoded.sub);
  }
  const searchParams = request.nextUrl.searchParams;
  const slugParam = searchParams.get("slug");

  if (!slugParam) {
    return NextResponse.json({ error: "slug query parameter is required" }, { status: 400 });
  }

  const slug = slugParam.split("/");
  const relativePath = slugParam.endsWith(".md") ? slugParam : `${slugParam}.md`;
  const fullPath = path.join(wikiRoot, relativePath);

  if (!isPathWithinRoot(fullPath, wikiRoot)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
  }

  try {
    const existing = readWikiPage(fullPath);
    const revision = saveRevision(wikiRoot, slug, existing.content, existing.frontmatter);
    return NextResponse.json({ success: true, revision });
  } catch (err: unknown) {
    logger.error("Failed to save wiki revision", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
