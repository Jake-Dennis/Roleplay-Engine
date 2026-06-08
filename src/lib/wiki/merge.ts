/**
 * Merge — Combine two wiki pages into one.
 *
 * Content from the merge page is appended to the keep page. Frontmatter is
 * merged (union of tags, max of created/updated). The merge page is marked
 * as dormant with `superseded_by` pointing to the keep page. All path-based
 * wikilinks pointing to the merge page are rewritten to point to the keep page.
 * Optionally creates a redirect stub in `_review/redirects/`.
 */

import fs from "fs";
import path from "path";
import { readWikiPage, writeWikiPage, listWikiPages } from "./file-io";
import type { WikiFrontmatter } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MergeResult {
  /** Relative path of the page that was merged in. */
  mergedFrom: string;
  /** Relative path of the page that was kept. */
  kept: string;
  /** Number of pages whose wikilinks were updated to point to the kept page. */
  linksUpdated: number;
  /** Whether a redirect stub was created in _review/redirects/. */
  redirectCreated: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pick the later (max) of two ISO date strings or Date values.
 * Returns undefined if both are null/undefined.
 */
function maxDate(a?: string | Date | null, b?: string | Date | null): string | undefined {
  const aTime = a ? new Date(a).getTime() : 0;
  const bTime = b ? new Date(b).getTime() : 0;
  if (aTime >= bTime && a) return a instanceof Date ? a.toISOString() : a;
  if (b) return b instanceof Date ? b.toISOString() : b;
  return undefined;
}

/**
 * Rewrite path-based wikilinks pointing to the merged page so they now point
 * to the kept page.
 *
 * This is distinct from `rewriteLinksForPageMove` because merge changes the
 * page identity (not just the folder). It handles both same-folder and
 * cross-folder merges by matching the full relative path (without `.md`) in
 * wikilink targets.
 *
 * Only path-based links (e.g. `[[entities/characters/gandalf-dup]]`) are
 * rewritten. Bare-name links (`[[Gandalf]]`) are left for the 3-pass resolver,
 * which naturally resolves to the kept page after the merge page is dormant.
 *
 * @returns Updated content, or the original content if no rewrites occurred.
 */
function rewriteWikilinksForMerge(
  content: string,
  mergeRelPath: string,
  keepRelPath: string,
): string {
  const mergeNoExt = mergeRelPath.replace(/\.md$/, "").replace(/\\/g, "/");
  const keepNoExt = keepRelPath.replace(/\.md$/, "").replace(/\\/g, "/");
  if (mergeNoExt === keepNoExt) return content;

  // Escape special regex characters in the merge path
  const escaped = mergeNoExt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match [[path]], [[path|alias]], ![[path]]
  const regex = new RegExp(`(!?)\\[\\[${escaped}(\\|[^\\]]*)?\\]\\]`, "g");

  return content.replace(regex, (_match, bang: string, alias: string | undefined) => {
    return `${bang}[[${keepNoExt}${alias || ""}]]`;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Merge two wiki pages.
 *
 * Content from `mergeRelPath` is appended to `keepRelPath`.
 * Frontmatter is merged: union of tags, max of created/updated timestamps.
 * The merge page is soft-deleted by setting `status: "dormant"` and adding
 * `superseded_by: keepRelPath` and `superseded_at: <now>`.
 *
 * All path-based wikilinks pointing to `mergeRelPath` are rewritten across
 * every page in the wiki (including the keep page) to point to `keepRelPath`.
 *
 * If `redirect: true`, a markdown redirect stub is created at
 * `_review/redirects/<mergeFilename>.md` with frontmatter linking to the
 * keep page.
 *
 * @param keepRelPath  - Relative path of the page to keep (e.g. "entities/characters/gandalf.md").
 * @param mergeRelPath - Relative path of the page to merge in (e.g. "entities/characters/gandalf-dup.md").
 * @param wikiRoot     - Absolute path to the wiki root directory.
 * @param options      - Optional settings.
 * @returns            A `MergeResult` with details of the merge.
 * @throws             If either path doesn't exist, or if both paths are the same.
 */
export function mergePages(
  keepRelPath: string,
  mergeRelPath: string,
  wikiRoot: string,
  options?: { redirect?: boolean },
): MergeResult {
  const keepAbs = path.join(wikiRoot, keepRelPath);
  const mergeAbs = path.join(wikiRoot, mergeRelPath);
  const redirect = options?.redirect ?? false;

  // Validate
  if (keepRelPath === mergeRelPath) {
    throw new Error("Cannot merge a page with itself");
  }

  // 1. Read both pages (throws if not found)
  const keepPage = readWikiPage(keepAbs);
  const mergePage = readWikiPage(mergeAbs);

  // 2. Merge content: append merge content after keep content
  const mergedContent =
    keepPage.content +
    `\n\n## Merged from ${mergePage.frontmatter.title}\n\n` +
    mergePage.content;

  // 3. Merge frontmatter: union tags, keep max timestamps
  const mergedTags = [
    ...new Set([
      ...(keepPage.frontmatter.tags || []),
      ...(mergePage.frontmatter.tags || []),
    ]),
  ];

  const mergedCreated = maxDate(keepPage.frontmatter.created, mergePage.frontmatter.created);
  const mergedUpdated = new Date().toISOString();

  // 4. Write the updated keep page with merged content
  const keepFrontmatter: WikiFrontmatter & Record<string, unknown> = {
    ...keepPage.frontmatter,
    ...(mergedTags.length > 0 ? { tags: mergedTags } : {}),
    created: mergedCreated,
    updated: mergedUpdated,
  };

  writeWikiPage(keepAbs, mergedContent, keepFrontmatter);

  // 5. Mark the merge page as superseded (soft delete / dormant)
  const now = new Date().toISOString();
  const mergeFrontmatter: WikiFrontmatter = {
    ...mergePage.frontmatter,
    superseded_by: keepRelPath,
    superseded_at: now,
    status: "dormant",
    updated: now,
  };

  writeWikiPage(mergeAbs, mergePage.content, mergeFrontmatter);

  // 6. Rewrite all wikilinks pointing to mergePath -> keepPath
  let linksUpdated = 0;

  const allPages = listWikiPages(wikiRoot, { includeDormant: true });
  for (const page of allPages) {
    if (path.resolve(page.path) === path.resolve(mergeAbs)) continue;

    try {
      const updated = rewriteWikilinksForMerge(page.content, mergeRelPath, keepRelPath);
      if (updated !== page.content) {
        writeWikiPage(page.path, updated, page.frontmatter);
        linksUpdated++;
      }
    } catch {
      // Skip pages that can't be read or written
    }
  }

  // 7. Optionally create a redirect stub in _review/redirects/
  let redirectCreated = false;
  if (redirect) {
    const mergeFileBase = path.basename(mergeRelPath, ".md");
    const redirectDir = path.join(wikiRoot, "_review", "redirects");
    fs.mkdirSync(redirectDir, { recursive: true });
    const redirectPath = path.join(redirectDir, `${mergeFileBase}.md`);

    const redirectContent = [
      "---",
      `title: ${mergePage.frontmatter.title}`,
      "type: concept",
      "status: draft",
      `superseded_by: ${keepRelPath}`,
      `superseded_at: ${now}`,
      "---",
      "",
      `This page was merged into [[${keepRelPath.replace(/\.md$/, "")}|${keepPage.frontmatter.title}]].`,
      "",
      `Originally at: \`${mergeRelPath}\``,
      "",
    ].join("\n");

    fs.writeFileSync(redirectPath, redirectContent, "utf-8");
    redirectCreated = true;
  }

  return {
    mergedFrom: mergeRelPath,
    kept: keepRelPath,
    linksUpdated,
    redirectCreated,
  };
}
