import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { readWikiPage } from "@/lib/wiki/file-io";
// @deprecated: revisions.ts is deprecated — use history.ts (SQLite wiki_versions) instead
import { listRevisions, saveRevision, getRevision } from "@/lib/wiki/revisions";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import path from "path";
import fs from "fs";
import { logger } from '@/lib/logger';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/wiki-revisions?slug=path/to/page
 *
 * Retrieves revision history for a wiki page. If an ?id query param is provided,
 * returns a specific revision; otherwise returns the full revision list.
 *
 * @param request - The incoming Next.js request object (requires ?slug, optional ?id and ?universe_id)
 * @returns NextResponse with { revisions } or { revision }
 * @throws 400 - If slug query parameter is missing or path is invalid
 * @throws 401 - If authentication fails
 * @throws 404 - If the wiki page or specific revision is not found
 * @throws 429 - If rate limit exceeded
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_read:${ip}`, "wiki_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const searchParams = request.nextUrl.searchParams;
  const slugParam = searchParams.get("slug");
  const revisionId = searchParams.get("id");
  const universeId = request.nextUrl.searchParams.get("universe_id") || "";
  const wikiRoot = getWikiRoot(userId, universeId || undefined);

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

/**
 * POST /api/wiki-revisions?slug=path/to/page
 *
 * Saves a new revision snapshot of a wiki page's current content and frontmatter
 * to the file-based revisions system (deprecated in favor of history.ts).
 *
 * @param request - The incoming Next.js request object (requires ?slug query param)
 * @returns NextResponse with { success: true, revision }
 * @throws 400 - If slug query parameter is missing or path is invalid
 * @throws 401 - If authentication fails
 * @throws 404 - If the wiki page does not exist
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If saving the revision fails
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_write:${ip}`, "wiki_write");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  let wikiRoot: string;
  try {
    const body = await request.json();
    wikiRoot = getWikiRoot(userId, body.universeId);
  } catch {
    wikiRoot = getWikiRoot(userId);
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
