/**
 * Bulk Recategorize — Find wiki pages matching criteria and change their
 * frontmatter (type, subtype, tags, status) in bulk.
 *
 * Supports dry-run mode to preview changes before applying them.
 * When subtype or type changes cause a folder move, the move is handled
 * via `moveWikiPage` which also rewrites path-based wikilinks.
 */

import path from "path";
import { logger } from "@/lib/logger";
import { readWikiPage, writeWikiPage, listWikiPages } from "./file-io";
import { folderForPage } from "./subtype-folders";
import { getTypeRegistry } from "./type-registry";
import { moveWikiPage } from "./move-page";
import type { WikiFrontmatter } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Filter criteria to select which pages to recategorize. All criteria are ANDed. */
export interface RecategorizeFilter {
  type?: string;
  subtype?: string;
  tag?: string;
  status?: string;
  folder?: string;
}

/** The changes to apply to every matching page. */
export interface RecategorizeChanges {
  /** Replace the subtype entirely. */
  newSubtype?: string;
  /** Replace the type entirely. */
  newType?: string;
  /** Replace all tags with this array. */
  newTags?: string[];
  /** Replace the status entirely. */
  newStatus?: string;
  /** Tags to add to existing tags (deduplicated). */
  addTags?: string[];
  /** Tags to remove from existing tags. */
  removeTags?: string[];
}

/** Proposed changes for a single matched page. */
export interface RecategorizeItem {
  /** Absolute path of the page on disk. */
  path: string;
  /** The changes that would be made (populated for all matched pages). */
  proposed: {
    type?: string;
    subtype?: string;
    tags?: string[];
    status?: string;
    /** Non-null only when the page would move folders. */
    newFolder?: string;
  };
  /** Error message if this page could not be processed (dry-run or apply). */
  error?: string;
}

/** Result of a bulk recategorize operation. */
export interface BulkRecategorizeResult {
  /** One entry per matched page, with proposed or applied changes. */
  changes: RecategorizeItem[];
  /** String-form error messages from pages that failed. */
  errors: string[];
  /** Total number of pages that matched the filter. */
  totalAffected: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the new tags array given the existing tags and the change spec.
 *
 * Priority: newTags → (removeTags + addTags) → existing unchanged.
 */
function computeNewTags(
  existingTags: string[] | undefined,
  changes: RecategorizeChanges,
): string[] {
  if (changes.newTags) {
    return [...changes.newTags];
  }

  let tags = existingTags ? [...existingTags] : [];

  if (changes.removeTags && changes.removeTags.length > 0) {
    tags = tags.filter((t) => !changes.removeTags!.includes(t));
  }

  if (changes.addTags && changes.addTags.length > 0) {
    for (const tag of changes.addTags) {
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
  }

  return tags;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Check whether a page matches ALL supplied filter criteria.
 * Returns `true` when filter is empty (every page matches).
 */
function matchesFilter(pageFm: WikiFrontmatter, filter: RecategorizeFilter): boolean {
  if (filter.type && pageFm.type !== filter.type) return false;
  if (filter.subtype && pageFm.subtype !== filter.subtype) return false;
  if (filter.status && pageFm.status !== filter.status) return false;
  if (filter.tag) {
    const tags = pageFm.tags || [];
    if (!tags.includes(filter.tag)) return false;
  }

  // folder filter is handled externally since we need the file path
  return true;
}

/**
 * Check whether a page's file path starts with the given folder prefix.
 * The folder is relative to the wiki root (e.g. "entities/characters").
 */
function matchesFolder(pagePath: string, wikiRoot: string, folder: string): boolean {
  const relPath = path.relative(wikiRoot, pagePath).replace(/\\/g, "/");
  // Match if the relative path starts with the folder prefix (e.g. "entities/" or "entities/characters/")
  return relPath.startsWith(folder + "/") || relPath.startsWith(folder + "\\");
}

// ---------------------------------------------------------------------------
// Apply changes to a page
// ---------------------------------------------------------------------------

/**
 * Apply the given changes to a single page.
 *
 * If the folder changes (due to a new subtype/type), the file is moved via
 * `moveWikiPage` which rewrites path-based wikilinks. Tags and status are
 * then applied to the moved page.
 *
 * If the folder does not change, the frontmatter is updated in-place.
 */
function applyChangesToPage(
  fullPath: string,
  changes: RecategorizeChanges,
  wikiRoot: string,
): void {
  const relPath = path.relative(wikiRoot, fullPath).replace(/\\/g, "/");
  const oldDir = path.dirname(relPath);
  const filename = path.basename(relPath);

  // Read the current page from disk
  const page = readWikiPage(fullPath);
  const fm = page.frontmatter;

  // Compute new tags
  const newTags = computeNewTags(fm.tags, changes);

  // Determine folder before and after changes
  const needsSubtypeChange = changes.newSubtype !== undefined && fm.subtype !== changes.newSubtype;
  const needsTypeChange = changes.newType !== undefined && fm.type !== changes.newType;

  // Build a working frontmatter to compute the target folder
  const workingFm: Record<string, unknown> = { ...fm };
  if (changes.newSubtype) workingFm.subtype = changes.newSubtype;
  if (changes.newType) workingFm.type = changes.newType;

  const registry = getTypeRegistry(wikiRoot);
  const newFolder = folderForPage(workingFm, registry);
  const folderChanged = newFolder !== oldDir;

  if (folderChanged && (needsSubtypeChange || needsTypeChange)) {
    // -------------------------------------------------------
    // Case 1: Move to a new folder
    //   Use moveWikiPage so path-based wikilinks get rewritten.
    //   moveWikiPage determines type/subtype from the destination
    //   folder, which should match what we computed above.
    //   After the move, apply tags and status changes.
    // -------------------------------------------------------
    const newRelPath = path.join(newFolder, filename).replace(/\\/g, "/");
    moveWikiPage(relPath, newRelPath, wikiRoot, registry);

    // Read the moved page to apply tags/status
    const movedFullPath = path.join(wikiRoot, newRelPath);
    const movedPage = readWikiPage(movedFullPath);

    if (changes.newStatus) {
      movedPage.frontmatter.status = changes.newStatus as typeof movedPage.frontmatter.status;
    }
    // Tags: always write them because computeNewTags may have changed them
    movedPage.frontmatter.tags = newTags;

    writeWikiPage(movedFullPath, movedPage.content, movedPage.frontmatter);

    logger.info(
      `[wiki] Recategorized "${relPath}" → "${newRelPath}" ` +
        `(subtype: ${movedPage.frontmatter.subtype}, tags: [${newTags.join(", ")}])`,
    );
  } else {
    // -------------------------------------------------------
    // Case 2: Same folder — just update frontmatter in place
    // -------------------------------------------------------
    if (changes.newSubtype) {
      (fm as Record<string, unknown>).subtype = changes.newSubtype;
    }
    if (changes.newType) {
      fm.type = changes.newType;
    }
    if (changes.newStatus) {
      fm.status = changes.newStatus as typeof fm.status;
    }
    fm.tags = newTags;

    writeWikiPage(fullPath, page.content, page.frontmatter);

    logger.info(
      `[wiki] Recategorized "${relPath}" ` +
        `(subtype: ${fm.subtype}, tags: [${newTags.join(", ")}])`,
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find and optionally apply bulk recategorization changes.
 *
 * **Steps:**
 * 1. List all wiki pages (including dormant pages).
 * 2. Apply filter — match by type, subtype, tag, status, and/or folder
 *    (all criteria are ANDed; empty filter matches every page).
 * 3. Compute proposed changes for each matched page.
 * 4. If dry-run: return only proposed changes, do not touch files.
 * 5. If apply: modify frontmatter, move files when folder changes, collect errors.
 *
 * @param filter   Criteria to select pages (empty = all pages).
 * @param changes  The modifications to make on matching pages.
 * @param wikiRoot Absolute path to the wiki root directory.
 * @param options  `{ dryRun: false }` to execute changes (default is dry-run).
 */
export function bulkRecategorize(
  filter: RecategorizeFilter,
  changes: RecategorizeChanges,
  wikiRoot: string,
  options?: { dryRun?: boolean },
): BulkRecategorizeResult {
  const isDryRun = options?.dryRun !== false;
  const registry = getTypeRegistry(wikiRoot);

  // ---- Step 1: List all pages ----
  const allPages = listWikiPages(wikiRoot, { includeDormant: true });

  // ---- Step 2: Apply filter ----
  const matched = allPages.filter((page) => {
    if (!matchesFilter(page.frontmatter, filter)) return false;
    if (filter.folder && !matchesFolder(page.path, wikiRoot, filter.folder)) return false;
    return true;
  });

  const result: BulkRecategorizeResult = {
    changes: [],
    errors: [],
    totalAffected: matched.length,
  };

  // ---- Step 3: Process each matched page ----
  for (const page of matched) {
    const relPath = path.relative(wikiRoot, page.path).replace(/\\/g, "/");
    const oldDir = path.dirname(relPath);

    // Build working frontmatter to compute proposed changes
    const workingFm: Record<string, unknown> = { ...page.frontmatter };
    if (changes.newSubtype) workingFm.subtype = changes.newSubtype;
    if (changes.newType) workingFm.type = changes.newType;

    const newFolder = folderForPage(workingFm, registry);
    const newTags = computeNewTags(page.frontmatter.tags, changes);

    const item: RecategorizeItem = {
      path: page.path,
      proposed: {},
    };

    try {
      // Populate proposed changes
      if (changes.newSubtype) item.proposed.subtype = changes.newSubtype;
      if (changes.newType) item.proposed.type = changes.newType;
      if (changes.newStatus) item.proposed.status = changes.newStatus;
      // Include tags in proposed whenever any tag change was requested
      if (
        changes.newTags ||
        changes.addTags ||
        (changes.removeTags && changes.removeTags.length > 0)
      ) {
        item.proposed.tags = newTags;
      }
      if (newFolder !== oldDir) {
        item.proposed.newFolder = newFolder;
      }

      // ---- Step 4/5: Apply or skip ----
      if (!isDryRun) {
        applyChangesToPage(page.path, changes, wikiRoot);
      }

      result.changes.push(item);
    } catch (err: unknown) {
      item.error = err instanceof Error ? err.message : String(err);
      result.errors.push(`${relPath}: ${err instanceof Error ? err.message : String(err)}`);
      result.changes.push(item);
    }
  }

  return result;
}


