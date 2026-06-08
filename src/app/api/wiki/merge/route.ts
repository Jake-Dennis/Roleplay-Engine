import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/with-error-handler";
import { withAuth } from "@/lib/with-auth";
import { badRequestError, requireJson } from "@/lib/error-response";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { mergePages } from "@/lib/wiki/merge";
import fs from "fs";
import path from "path";

/**
 * POST /api/wiki/merge
 *
 * Merge two wiki pages. Content from `mergePath` is appended to `keepPath`,
 * frontmatter is merged (union of tags, max timestamps), and all wikilinks
 * pointing to the merge page are rewritten to point to the keep page.
 *
 * The merge page is soft-deleted (status → "dormant", superseded_by set).
 * Optionally creates a redirect stub in `_review/redirects/`.
 *
 * Request body:
 * ```json
 * {
 *   "keepPath": "entities/characters/gandalf.md",
 *   "mergePath": "entities/characters/gandalf-dup.md",
 *   "redirect": false
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "mergedFrom": "entities/characters/gandalf-dup.md",
 *   "kept": "entities/characters/gandalf.md",
 *   "linksUpdated": 3,
 *   "redirectCreated": false
 * }
 * ```
 *
 * @throws 400 - If input is malformed, paths don't end in .md, or paths are invalid
 * @throws 401 - If authentication fails
 * @throws 415 - If Content-Type is not application/json
 * @throws 400 - If wiki root doesn't exist or pages not found
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  requireJson(request);
  const body = await request.json();
  const { keepPath, mergePath, redirect } = body as {
    keepPath?: string;
    mergePath?: string;
    redirect?: boolean;
  };

  // Validate required fields
  if (!keepPath || !mergePath) {
    return badRequestError("keepPath and mergePath are required");
  }

  const normalizedKeep = keepPath.replace(/\\/g, "/");
  const normalizedMerge = mergePath.replace(/\\/g, "/");

  if (!normalizedKeep.endsWith(".md") || !normalizedMerge.endsWith(".md")) {
    return badRequestError("Paths must end with .md");
  }

  if (normalizedKeep.includes("..") || normalizedMerge.includes("..")) {
    return badRequestError("Invalid path: path traversal detected");
  }

  if (normalizedKeep === normalizedMerge) {
    return badRequestError("Cannot merge a page with itself");
  }

  // Resolve wiki root
  const wikiRoot = getWikiRoot(userId);
  if (!fs.existsSync(wikiRoot)) {
    return badRequestError("Wiki root does not exist");
  }

  // Safety: verify paths are within the wiki root
  const keepAbs = path.join(wikiRoot, normalizedKeep);
  const mergeAbs = path.join(wikiRoot, normalizedMerge);

  if (!isPathWithinRoot(keepAbs, wikiRoot) || !isPathWithinRoot(mergeAbs, wikiRoot)) {
    return badRequestError("Invalid path: path traversal detected");
  }

  try {
    const result = mergePages(normalizedKeep, normalizedMerge, wikiRoot, {
      redirect: redirect === true,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    return badRequestError(err instanceof Error ? err.message : String(err));
  }
});
