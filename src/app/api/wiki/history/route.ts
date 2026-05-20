import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { getPageVersions, restoreVersion, recordVersion, createSnapshotFile, getNextVersionNumber } from "@/lib/wiki/history";
import { readWikiPage } from "@/lib/wiki/file-io";
import { saveRevision } from "@/lib/wiki/revisions";
import { generateIndex } from "@/lib/wiki/index-generator";
import path from "path";
import fs from "fs";
import { getAuthToken } from "@/lib/auth-token";
import { unauthorizedError, notFoundError, badRequestError, requireJson, serverError } from "@/lib/error-response";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";

/**
 * GET /api/wiki/history?slug=entities/my-page
 *
 * Returns the version history for a wiki page.
 */
export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return unauthorizedError();
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const slugParam = request.nextUrl.searchParams.get("slug");
  if (!slugParam) {
    return badRequestError("Missing 'slug' query parameter");
  }

  const slug = slugParam.split("/");
  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");
  const pagePath = slug.join("/");

  try {
    const versions = getPageVersions(pagePath, decoded.sub);
    return NextResponse.json({ versions });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * POST /api/wiki/history
 *
 * Body: { action: "restore", versionId: string, slug: string[] }
 *   - Restores a specific version and returns the restored content.
 *
 * Body: { action: "record", slug: string[], changeSummary: string }
 *   - Records the current page state as a new version.
 */
export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return unauthorizedError();
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  requireJson(request);
  const body = await request.json();
  const { action } = body;

  const wikiRoot = path.join(APP_CONFIG.dataDir, decoded.sub, "wiki");

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
    } catch (error) {
      return serverError(error);
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
      // Read current page content
      const page = readWikiPage(fullPath);
      const rawContent = fs.readFileSync(fullPath, "utf-8");

      // Create snapshot file
      const snapshotPath = createSnapshotFile(wikiRoot, slug, rawContent);

      // Record version in DB
      const versionNumber = getNextVersionNumber(relativePath, decoded.sub);
      recordVersion(relativePath, decoded.sub, versionNumber, changeSummary || "", snapshotPath);

      return NextResponse.json({ success: true, versionNumber });
    } catch (error) {
      return serverError(error);
    }
  }

  return badRequestError("Unknown action. Use 'restore' or 'record'.");
}
