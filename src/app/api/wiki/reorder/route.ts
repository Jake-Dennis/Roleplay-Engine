import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/with-error-handler";
import { withAuth } from "@/lib/with-auth";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { moveWikiPage } from "@/lib/wiki/move-page";
import { writeWikiConfig, getResolvedFolderOrder } from "@/lib/wiki/config";
import { readWikiPage, writeWikiPage, listWikiPages } from "@/lib/wiki/file-io";
import { badRequestError, requireJson } from "@/lib/error-response";
import { checkRateLimit, createRateLimitResponse, getClientIp } from "@/lib/rate-limiter";
import path from "path";
import fs from "fs";

interface MoveInput {
  oldPath: string;
  newPath: string;
  order?: number;
}

interface MoveResult {
  oldPath: string;
  newPath: string;
  order?: number;
  updatedLinkSources: string[];
}

/**
 * POST /api/wiki/reorder
 * Applies drag-and-drop reordering in the wiki:
 * - Reorders pages (updates their `order` frontmatter field)
 * - Moves pages between folders (renames files, updates type, rewrites wikilinks)
 * - Reorders folders (persists to .wiki-config.json)
 *
 * @param request - JSON body: { moves?: MoveInput[], folderOrder?: string[], universeId?: string }
 * @returns NextResponse with { moves: MoveResult[], folderOrder: string[] }
 * @throws 400 - If input is malformed
 * @throws 401 - If authentication fails
 * @throws 429 - If rate limit exceeded
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_write:${ip}`, "wiki_write");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  requireJson(request);
  const body = await request.json();
  const { moves, folderOrder, universeId } = body as {
    moves?: MoveInput[];
    folderOrder?: string[];
    universeId?: string;
  };

  if (moves !== undefined && !Array.isArray(moves)) {
    return badRequestError("moves must be an array");
  }
  if (folderOrder !== undefined && !Array.isArray(folderOrder)) {
    return badRequestError("folderOrder must be an array");
  }
  if (moves === undefined && folderOrder === undefined) {
    return badRequestError("moves or folderOrder is required");
  }

  const wikiRoot = getWikiRoot(userId, universeId);
  if (!fs.existsSync(wikiRoot)) {
    return badRequestError("Wiki root does not exist");
  }

  const results: MoveResult[] = [];

  // Apply moves
  if (moves) {
    for (const move of moves) {
      if (typeof move.oldPath !== "string" || typeof move.newPath !== "string") {
        return badRequestError("Each move must have oldPath and newPath strings");
      }
      const oldPath = move.oldPath.replace(/\\/g, "/");
      const newPath = move.newPath.replace(/\\/g, "/");

      // Sanitize: no path traversal
      if (oldPath.includes("..") || newPath.includes("..")) {
        return badRequestError("Invalid path");
      }
      if (!oldPath.endsWith(".md") || !newPath.endsWith(".md")) {
        return badRequestError("Paths must end with .md");
      }

      const oldFull = path.join(wikiRoot, oldPath);
      const newFull = path.join(wikiRoot, newPath);
      if (
        !oldFull.startsWith(path.resolve(wikiRoot)) ||
        !newFull.startsWith(path.resolve(wikiRoot))
      ) {
        return badRequestError("Path escapes wiki root");
      }

      if (oldPath !== newPath) {
        // File move + wikilink rewrite
        const result = moveWikiPage(oldPath, newPath, wikiRoot);
        results.push({
          oldPath: result.oldPath,
          newPath: result.newPath,
          order: move.order,
          updatedLinkSources: result.updatedLinkSources,
        });
      } else if (move.order !== undefined) {
        // Same path, just update order
        if (fs.existsSync(newFull)) {
          const page = readWikiPage(newFull);
          if (page.frontmatter.order !== move.order) {
            page.frontmatter.order = move.order;
            writeWikiPage(newFull, page.content, page.frontmatter);
          }
        }
        results.push({
          oldPath,
          newPath,
          order: move.order,
          updatedLinkSources: [],
        });
      }
    }
  }

  // Apply folder order
  if (folderOrder) {
    const validFolders = new Set(getResolvedFolderOrder(wikiRoot));
    for (const f of folderOrder) {
      if (typeof f !== "string" || !validFolders.has(f)) {
        return badRequestError(`Invalid folder in folderOrder: ${f}`);
      }
    }
    writeWikiConfig(wikiRoot, { folderOrder });
  }

  // Re-derive the resolved folder order
  const finalFolderOrder = getResolvedFolderOrder(wikiRoot);

  return NextResponse.json({
    moves: results,
    folderOrder: finalFolderOrder,
  });
});

/**
 * GET /api/wiki/reorder
 * Returns the current reorderable state (pages grouped by folder with their orders).
 * Used by the client to hydrate the file tree on initial load.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult.auth;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`wiki_read:${ip}`, "wiki_read");
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

  const universeId = request.nextUrl.searchParams.get("universe_id") || undefined;
  const wikiRoot = getWikiRoot(userId, universeId);
  if (!fs.existsSync(wikiRoot)) {
    return NextResponse.json({ pages: [], folderOrder: [] });
  }

  const pages = listWikiPages(wikiRoot);
  const folderOrder = getResolvedFolderOrder(wikiRoot);

  return NextResponse.json({
    pages: pages.map((p) => ({
      path: path.relative(wikiRoot, p.path).replace(/\\/g, "/"),
      folder: path.dirname(p.path).replace(/\\/g, "/").split(path.sep).pop() || "",
      order: p.frontmatter.order ?? null,
      title: p.frontmatter.title || "",
      type: p.frontmatter.type,
    })),
    folderOrder,
  });
});
