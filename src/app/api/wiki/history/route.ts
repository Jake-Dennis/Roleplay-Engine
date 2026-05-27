import { NextRequest, NextResponse } from "next/server";
import { withAuth } from '@/lib/with-auth';
import { getWikiRoot } from '@/lib/wiki/wiki-root';
import { getPageVersions, restoreVersion, recordVersion, createSnapshotFile, getNextVersionNumber } from "@/lib/wiki/history";
import { readWikiPage } from "@/lib/wiki/file-io";
// @deprecated: revisions.ts is deprecated — use history.ts (SQLite wiki_versions) instead
import { saveRevision } from "@/lib/wiki/revisions";
import { generateIndex } from "@/lib/wiki/index-generator";
import path from "path";
import fs from "fs";
import { notFoundError, badRequestError, requireJson, serverError } from "@/lib/error-response";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

/**
 * GET /api/wiki/history?slug=entities/my-page
 *
 * Returns the version history for a wiki page from the SQLite wiki_versions table.
 *
 * @param request - The incoming Next.js request object (requires ?slug query param)
 * @returns NextResponse with { versions }
 * @throws 400 - If the slug query parameter is missing
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If retrieving versions fails
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_read:${ip}`, "wiki_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const slugParam = request.nextUrl.searchParams.get("slug");
  if (!slugParam) {
    return badRequestError("Missing 'slug' query parameter");
  }

  const slug = slugParam.split("/");
  const pagePath = slug.join("/");

  try {
    const versions = getPageVersions(pagePath, userId);
    return NextResponse.json({ versions });
  } catch (err: unknown) {
    return serverError(err);
  }
}

/**
 * POST /api/wiki/history
 *
 * Performs version history actions on a wiki page.
 *
 * With action "restore" (body: { versionId, slug }): restores a specific version,
 * saving the current state as a revision first, then regenerates the index.
 *
 * With action "record" (body: { slug, changeSummary? }): records the current page
 * state as a new version in the SQLite wiki_versions table with a snapshot file.
 *
 * @param request - The incoming Next.js request object with JSON body
 * @returns NextResponse with { success: true } or { success: true, versionNumber }
 * @throws 400 - If action is unknown, or required fields are missing
 * @throws 401 - If authentication fails
 * @throws 404 - If the wiki page does not exist
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If the history operation fails
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_write:${ip}`, "wiki_write");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
  const { action, universeId } = body;

  const wikiRoot = getWikiRoot(userId, universeId);

  if (action === "restore") {
    const { versionId, slug } = body;
    if (!versionId || !slug || !Array.isArray(slug)) {
      return badRequestError("versionId and slug (array) are required");
    }

    const relativePath = slug.join("/");
    const fullPath = path.join(wikiRoot, relativePath) + ".md";

    // Security: prevent path traversal
    if (!isPathWithinRoot(fullPath, wikiRoot)) {
      return badRequestError("Invalid path");
    }

    if (!fs.existsSync(fullPath)) {
      return notFoundError("Wiki page");
    }

    try {
      // Save current state as a revision before restoring (file-based backup)
      const existing = readWikiPage(fullPath);
      saveRevision(wikiRoot, slug, existing.content, existing.frontmatter);

      // Restore the version
      restoreVersion(versionId, wikiRoot, slug);

      // Regenerate index
      generateIndex(wikiRoot);

      return NextResponse.json({ success: true });
    } catch (err: unknown) {
      return serverError(err);
    }
  }

  if (action === "record") {
    const { slug, changeSummary } = body;
    if (!slug || !Array.isArray(slug)) {
      return badRequestError("slug (array) is required");
    }

    const relativePath = slug.join("/");
    const fullPath = path.join(wikiRoot, relativePath) + ".md";

    // Security: prevent path traversal
    if (!isPathWithinRoot(fullPath, wikiRoot)) {
      return badRequestError("Invalid path");
    }

    if (!fs.existsSync(fullPath)) {
      return notFoundError("Wiki page");
    }

    try {
      const rawContent = fs.readFileSync(fullPath, "utf-8");

      // Create snapshot file
      const snapshotPath = createSnapshotFile(wikiRoot, slug, rawContent);

      // Record version in DB
      const versionNumber = getNextVersionNumber(relativePath, userId);
      recordVersion(relativePath, userId, versionNumber, changeSummary || "", snapshotPath);

      return NextResponse.json({ success: true, versionNumber });
    } catch (err: unknown) {
      return serverError(err);
    }
  }

  return badRequestError("Unknown action. Use 'restore' or 'record'.");
}
