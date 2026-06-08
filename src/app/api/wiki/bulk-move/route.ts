import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/with-error-handler";
import { withAuth } from "@/lib/with-auth";
import { badRequestError, requireJson } from "@/lib/error-response";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { bulkMovePages, type BulkMoveItem } from "@/lib/wiki/bulk-move";
import fs from "fs";

/**
 * POST /api/wiki/bulk-move
 *
 * Move multiple wiki pages in a single batch. All files are moved first,
 * then wikilinks are rewritten in a single scan for efficiency.
 *
 * By default this endpoint runs in **dry-run mode** (dryRun: true) so callers
 * can preview the result before committing. Set `dryRun: false` to execute.
 *
 * Request body:
 * ```json
 * {
 *   "moves": [
 *     { "oldPath": "entities/characters/gandalf.md", "newPath": "characters/gandalf.md" }
 *   ],
 *   "dryRun": true,
 *   "universeId": "optional-universe-scope"
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "moved": ["entities/characters/gandalf.md"],
 *   "failed": [],
 *   "linksUpdated": 5
 * }
 * ```
 *
 * @throws 400 - If input is malformed
 * @throws 401 - If authentication fails
 * @throws 415 - If Content-Type is not application/json
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  requireJson(request);
  const body = await request.json();
  const { moves, dryRun, universeId } = body as {
    moves?: BulkMoveItem[];
    dryRun?: boolean;
    universeId?: string;
  };

  // Validate moves array
  if (!Array.isArray(moves) || moves.length === 0) {
    return badRequestError("moves array is required and must be non-empty");
  }

  // Validate each move entry
  for (const move of moves) {
    if (typeof move.oldPath !== "string" || typeof move.newPath !== "string") {
      return badRequestError("Each move must have oldPath and newPath strings");
    }

    const normalizedOld = move.oldPath.replace(/\\/g, "/");
    const normalizedNew = move.newPath.replace(/\\/g, "/");

    if (!normalizedOld.endsWith(".md") || !normalizedNew.endsWith(".md")) {
      return badRequestError("Paths must end with .md");
    }

    if (normalizedOld.includes("..") || normalizedNew.includes("..")) {
      return badRequestError("Invalid path: path traversal detected");
    }
  }

  // Resolve wiki root
  const wikiRoot = getWikiRoot(userId, universeId);
  if (!fs.existsSync(wikiRoot)) {
    return badRequestError("Wiki root does not exist");
  }

  // Default to dry-run for safety
  const isDryRun = dryRun !== false;
  const result = bulkMovePages(moves, wikiRoot, { dryRun: isDryRun });

  return NextResponse.json(result);
});
