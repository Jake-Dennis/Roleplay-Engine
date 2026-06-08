/**
 * Bulk Move — Move multiple wiki pages in one batch.
 *
 * All files are moved first (with frontmatter updates), then wikilinks
 * are rewritten in a single scan for efficiency (O(n+m) instead of O(n*m)).
 *
 * This differs from calling `moveWikiPage` repeatedly, which does a full
 * link-scan per page. The batch approach avoids redundant passes when moving
 * many pages at once.
 */

import fs from "fs";
import path from "path";
import { logger } from "@/lib/logger";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { readWikiPage, writeWikiPage, deleteWikiPage } from "./file-io";
import { rewriteLinksForPageMove } from "./wikilinks";
import { getTypeRegistry } from "./type-registry";
import type { TypeRegistry } from "./type-registry";
import { subtypeFromFolder } from "./subtype-folders";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BulkMoveItem {
  /** Relative path of the source page (e.g. "entities/characters/gandalf.md"). */
  oldPath: string;
  /** Relative path of the destination (e.g. "characters/gandalf.md"). */
  newPath: string;
  /**
   * Optional explicit subtype to set in frontmatter.
   * If omitted, the subtype is derived from the destination folder via the
   * type registry (only applicable for 2-level folders).
   */
  newSubtype?: string;
}

export interface BulkMoveResult {
  /** Relative paths of pages that were successfully moved. */
  moved: string[];
  /** Pages that could not be moved, with reasons. */
  failed: Array<{ path: string; reason: string }>;
  /** Number of pages whose wikilinks were updated during the batch rewrite. */
  linksUpdated: number;
}

/** Internal: information needed for the batch link-rewriting pass. */
interface MovedPageInfo {
  oldFolder: string;
  newFolder: string;
  pageTitle: string;
  filename: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a plural folder name to its likely singular `type` value.
 *
 * For multi-level paths (e.g. "entities/characters"), only the last path
 * segment is singularized.
 *
 * This is a copy of the private helper in move-page.ts, kept here to avoid
 * coupling the bulk-move module to move-page's internal implementation.
 */
function singularizeFolder(folder: string): string {
  const map: Record<string, string> = {
    entities: "entity",
    concepts: "concept",
    sources: "source",
    synthesis: "synthesis",
    characters: "character",
    locations: "location",
    items: "item",
    events: "event",
    timelines: "timeline",
    factions: "faction",
    species: "species",
  };
  const parts = folder.replace(/\\/g, "/").split("/");
  const last = parts[parts.length - 1];
  const singular = map[last] || last.replace(/s$/, "");
  parts[parts.length - 1] = singular;
  return parts.join("/");
}

/**
 * Recursively collect all `.md` files under `wikiRoot`.
 * Skips hidden directories and known system dirs.
 */
function collectWikiFiles(wikiRoot: string): string[] {
  const files: string[] = [];
  const SKIP_DIRS = new Set(["_review", "_archive", "conflicts", "node_modules"]);

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  walk(wikiRoot);
  return files;
}

/**
 * Apply url-rewrite to all collected wiki files for every moved page.
 *
 * For each file:
 *   1. Read the page (content + frontmatter)
 *   2. For each moved page, call `rewriteLinksForPageMove` on the content
 *   3. If content changed, write back
 *
 * @returns The number of files that were modified.
 */
function batchRewriteLinks(
  allFiles: string[],
  movedPages: MovedPageInfo[],
): number {
  let totalUpdated = 0;

  for (const filePath of allFiles) {
    let page;
    try {
      page = readWikiPage(filePath);
    } catch {
      // Skip unreadable or missing files
      continue;
    }

    let content = page.content;
    const original = content;

    for (const moved of movedPages) {
      content = rewriteLinksForPageMove(
        content,
        moved.oldFolder,
        moved.newFolder,
        moved.pageTitle,
        moved.filename,
      );
    }

    if (content !== original) {
      writeWikiPage(filePath, content, page.frontmatter);
      totalUpdated++;
    }
  }

  return totalUpdated;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Move multiple wiki pages in a single batch.
 *
 * **Phase 1 — File Moves:** Each source page is read, its frontmatter is
 * updated if the folder changes, the destination directory is created, the
 * file is written to the new location, and the old file is deleted.
 *
 * **Phase 2 — Batch Link Rewrite:** Every `.md` file in the wiki is scanned
 * once and all moved-page wikilinks are rewritten in a single pass.
 *
 * @param moves      Array of moves to perform.
 * @param wikiRoot   Absolute path to the wiki root directory.
 * @param options    Optional settings (dry-run mode).
 * @returns          A `BulkMoveResult` with moved/failed paths and link counts.
 */
export function bulkMovePages(
  moves: BulkMoveItem[],
  wikiRoot: string,
  options?: { dryRun?: boolean },
): BulkMoveResult {
  const result: BulkMoveResult = { moved: [], failed: [], linksUpdated: 0 };
  const movedPages: MovedPageInfo[] = [];

  for (const move of moves) {
    try {
      const oldRelPath = move.oldPath.replace(/\\/g, "/");
      const newRelPath = move.newPath.replace(/\\/g, "/");

      const oldFullPath = path.join(wikiRoot, oldRelPath);
      const newFullPath = path.join(wikiRoot, newRelPath);

      // --- Security: path traversal protection ---
      if (!isPathWithinRoot(oldFullPath, wikiRoot)) {
        result.failed.push({ path: move.oldPath, reason: "Path traversal detected" });
        continue;
      }
      if (!isPathWithinRoot(newFullPath, wikiRoot)) {
        result.failed.push({ path: move.newPath, reason: "Path traversal detected" });
        continue;
      }

      // --- Pre-condition checks ---
      if (!fs.existsSync(oldFullPath)) {
        result.failed.push({ path: move.oldPath, reason: "Source file not found" });
        continue;
      }

      if (fs.existsSync(newFullPath)) {
        result.failed.push({ path: move.newPath, reason: "Destination already exists" });
        continue;
      }

      if (path.resolve(oldFullPath) === path.resolve(newFullPath)) {
        // Source and destination are the same → no-op
        result.moved.push(move.oldPath);
        continue;
      }

      const oldFolder = path.dirname(oldRelPath);
      const newFolder = path.dirname(newRelPath);

      // Read source page (also validates frontmatter presence)
      const page = readWikiPage(oldFullPath);
      const filename = path.basename(oldRelPath, ".md");
      const pageTitle = (page.frontmatter.title || filename).toString();

      if (options?.dryRun) {
        // In dry-run mode, just record what would happen
        result.moved.push(move.oldPath);
        movedPages.push({ oldFolder, newFolder, pageTitle, filename });
        continue;
      }

      // --- Phase 1: Execute file move ---

      // Update type/subtype in frontmatter if folder changed
      if (oldFolder !== newFolder) {
        const registry = getTypeRegistry(wikiRoot);
        const folderParts = newFolder.split("/");

        if (folderParts.length >= 2) {
          // 2-level folder: extract type from first segment, subtype from
          // registry (or explicit `newSubtype`)
          const topFolder = folderParts[0];
          const typeFromFolder = singularizeFolder(topFolder);
          if (typeFromFolder && page.frontmatter.type !== typeFromFolder) {
            page.frontmatter.type = typeFromFolder;
          }
          const subtype = move.newSubtype ?? subtypeFromFolder(newFolder, registry);
          const fm = page.frontmatter as Record<string, unknown>;
          if (subtype) {
            fm.subtype = subtype;
          } else {
            delete fm.subtype;
          }
        } else {
          // Flat folder: singularize the full folder name for the type
          const newType = singularizeFolder(newFolder);
          if (newType && page.frontmatter.type !== newType) {
            page.frontmatter.type = newType;
          }
          // Clear subtype since we're not in a 2-level subtype folder
          delete page.frontmatter.subtype;
        }
      }

      // Ensure destination directory exists
      const newDir = path.dirname(newFullPath);
      if (!fs.existsSync(newDir)) {
        fs.mkdirSync(newDir, { recursive: true });
      }

      // Write to new location (this also updates the `updated` timestamp)
      writeWikiPage(newFullPath, page.content, page.frontmatter);

      // Delete the old file
      deleteWikiPage(oldFullPath);

      result.moved.push(move.oldPath);
      movedPages.push({ oldFolder, newFolder, pageTitle, filename });

      logger.info(`[wiki] Bulk-moved ${oldRelPath} → ${newRelPath}`);
    } catch (err: any) {
      result.failed.push({ path: move.oldPath, reason: err.message || String(err) });
    }
  }

  // --- Phase 2: Batch link rewriting pass ---
  if (movedPages.length > 0) {
    try {
      const allFiles = collectWikiFiles(wikiRoot);
      result.linksUpdated = batchRewriteLinks(allFiles, movedPages);
    } catch (err: any) {
      logger.error("[wiki] Error during batch link rewriting", err);
    }
  }

  return result;
}
