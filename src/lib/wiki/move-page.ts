import fs from "fs";
import path from "path";
import { logger } from "@/lib/logger";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import {
  readWikiPage,
  writeWikiPage,
  deleteWikiPage,
  listWikiPages,
} from "./file-io";
import { rewriteLinksForPageMove } from "./wikilinks";

export interface MoveWikiPageResult {
  /** Relative path of the page before the move (e.g. "entities/foo.md"). */
  oldPath: string;
  /** Relative path of the page after the move (e.g. "characters/foo.md"). */
  newPath: string;
  /** Relative paths of other pages whose wikilinks were rewritten as a side effect. */
  updatedLinkSources: string[];
}

/**
 * Convert a plural folder name to its likely singular `type` value.
 *
 * Examples:
 *   entities  → entity
 *   locations → location
 *   _review   → review
 *   factions  → faction
 *
 * If the input is already singular-looking (no trailing 's' or ends in 'ss'),
 * it is returned as-is.
 */
function singularizeFolder(folder: string): string {
  const lower = folder.toLowerCase();
  if (lower.endsWith("ies")) return lower.slice(0, -3) + "y";
  if (
    lower.endsWith("s") &&
    !lower.endsWith("ss") &&
    !lower.endsWith("us")
  ) {
    return lower.slice(0, -1);
  }
  return lower;
}

/**
 * Move a wiki page to a new location (possibly in a different folder).
 *
 * - Renames the file on disk.
 * - Updates the page's frontmatter `type` to match the new folder (when the
 *   folder changes).
 * - Rewrites path-based wikilinks in all other pages that point to the moved
 *   page (e.g. `[[entities/foo]]` → `[[characters/foo]]`). Bare-name and
 *   namespace links still resolve via the 3-pass resolver, so they are left
 *   alone.
 *
 * @param oldRelPath - Current relative path (e.g. "entities/foo.md")
 * @param newRelPath - Target relative path (e.g. "characters/foo.md")
 * @param wikiRoot - Absolute path to the wiki root directory
 * @returns Result with the old/new paths and list of pages that had links rewritten
 * @throws If the source doesn't exist, the destination already exists, or paths escape the wiki root
 */
export function moveWikiPage(
  oldRelPath: string,
  newRelPath: string,
  wikiRoot: string,
): MoveWikiPageResult {
  const oldFullPath = path.join(wikiRoot, oldRelPath);
  const newFullPath = path.join(wikiRoot, newRelPath);

  // Security: prevent path traversal
  if (!isPathWithinRoot(oldFullPath, wikiRoot)) {
    throw new Error("Invalid source path");
  }
  if (!isPathWithinRoot(newFullPath, wikiRoot)) {
    throw new Error("Invalid destination path");
  }

  if (!fs.existsSync(oldFullPath)) {
    throw new Error(`Source page not found: ${oldRelPath}`);
  }
  if (fs.existsSync(newFullPath) && path.resolve(oldFullPath) !== path.resolve(newFullPath)) {
    throw new Error(`Destination already exists: ${newRelPath}`);
  }

  // If source and destination are the same, no-op
  if (path.resolve(oldFullPath) === path.resolve(newFullPath)) {
    return { oldPath: oldRelPath, newPath: newRelPath, updatedLinkSources: [] };
  }

  const oldFolder = path.dirname(oldRelPath).replace(/\\/g, "/");
  const newFolder = path.dirname(newRelPath).replace(/\\/g, "/");
  const filename = path.basename(oldFullPath, ".md");

  // Read the source page
  const page = readWikiPage(oldFullPath);
  const pageTitle = (page.frontmatter.title || filename).toString();

  // Update type in frontmatter if folder changed
  if (oldFolder !== newFolder) {
    const newType = singularizeFolder(newFolder);
    if (newType && page.frontmatter.type !== newType) {
      page.frontmatter.type = newType;
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

  // Scan and rewrite wikilinks in all other pages (only if folder changed)
  const updatedLinkSources: string[] = [];
  if (oldFolder !== newFolder) {
    const allPages = listWikiPages(wikiRoot);
    for (const otherPage of allPages) {
      // Skip the moved page (now at newFullPath)
      if (path.resolve(otherPage.path) === path.resolve(newFullPath)) continue;

      const newContent = rewriteLinksForPageMove(
        otherPage.content,
        oldFolder,
        newFolder,
        pageTitle,
        filename,
      );
      if (newContent !== otherPage.content) {
        writeWikiPage(otherPage.path, newContent, otherPage.frontmatter);
        const rel = path.relative(wikiRoot, otherPage.path).replace(/\\/g, "/");
        updatedLinkSources.push(rel);
        logger.info(
          `[wiki] Rewrote wikilinks in "${rel}" after move ${oldRelPath} → ${newRelPath}`,
        );
      }
    }
  }

  logger.info(`[wiki] Moved page ${oldRelPath} → ${newRelPath}`);

  return {
    oldPath: oldRelPath,
    newPath: newRelPath,
    updatedLinkSources,
  };
}
