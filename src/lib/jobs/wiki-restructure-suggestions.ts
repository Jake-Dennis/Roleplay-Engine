/**
 * Wiki Restructure Suggestions Job Handler
 *
 * Scans a wiki for structural issues such as:
 *  - Pages using subtypes not registered in the type registry
 *  - Pages in folders that don't match their subtype/type frontmatter
 *
 * Provides actionable suggestions that can be applied automatically or
 * reviewed by the user.
 */

import { listWikiPages } from "@/lib/wiki/file-io";
import { getTypeRegistry } from "@/lib/wiki/type-registry";
import { folderForPage } from "@/lib/wiki/subtype-folders";
import { relative, dirname, basename } from "path";
import type { JobPayload, JobResult } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RestructureSuggestion {
  /** Relative path of the page (e.g. "entities/characters/aldric.md"). */
  page: string;
  /** Human-readable description of the issue. */
  issue: string;
  /** Suggested action to resolve the issue. */
  suggestion: string;
  /** Confidence score 0-1 indicating how likely the suggestion is correct. */
  confidence: number;
  /** Category of fix required. */
  fixType: "move" | "update-frontmatter" | "merge";
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/**
 * Scan a wiki for pages with structural issues.
 *
 * Reads all wiki pages from disk via listWikiPages, resolves the type
 * registry, and checks each page for issues:
 *  1. Page references a subtype that is not in the registry.
 *  2. Page is in a folder that does not match its subtype/type frontmatter.
 *
 * @param wikiRoot - Absolute path to the wiki root directory.
 * @returns An array of RestructureSuggestion objects.
 */
export function suggestRestructure(wikiRoot: string): RestructureSuggestion[] {
  const suggestions: RestructureSuggestion[] = [];
  const registry = getTypeRegistry(wikiRoot);
  const pages = listWikiPages(wikiRoot, { includeDormant: true });

  for (const page of pages) {
    const fm = page.frontmatter;
    const relPath = relative(wikiRoot, page.path).replace(/\\/g, "/");
    const folder = dirname(relPath);

    // Issue 1: Subtype not in registry
    if (fm.subtype && registry.subtypeFolders && !registry.subtypeFolders[fm.subtype]) {
      suggestions.push({
        page: relPath,
        issue: `Subtype "${fm.subtype}" is not in the registry`,
        suggestion: `Add "${fm.subtype}" to .wiki-config.json or remove it from frontmatter`,
        confidence: 0.9,
        fixType: "update-frontmatter",
      });
      continue;
    }

    // Issue 2: Page in wrong folder for its subtype
    if (fm.subtype && registry.subtypeFolders?.[fm.subtype]) {
      const expectedFolder = folderForPage(fm, registry);
      if (expectedFolder && folder !== expectedFolder) {
        suggestions.push({
          page: relPath,
          issue: `Page should be in "${expectedFolder}" not "${folder}"`,
          suggestion: `Move to ${expectedFolder}/${basename(relPath)}`,
          confidence: 0.85,
          fixType: "move",
        });
        continue;
      }
    }

    // Issue 3: Page has type-derived folder mismatch (no subtype)
    if (!fm.subtype && fm.type && registry.types?.[fm.type]) {
      const expectedFolder = folderForPage(fm, registry);
      if (expectedFolder && folder !== expectedFolder) {
        suggestions.push({
          page: relPath,
          issue: `Page of type "${fm.type}" should be in "${expectedFolder}" not "${folder}"`,
          suggestion: `Move to ${expectedFolder}/${basename(relPath)}`,
          confidence: 0.7,
          fixType: "move",
        });
      }
    }
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Job Handler
// ---------------------------------------------------------------------------

/**
 * Handle a wiki_suggest_restructure job.
 *
 * Reads wikiRoot from payload, scans the wiki, and returns all structural
 * suggestions found. Follows the standard job handler convention:
 *  (jobId, payload) => Promise<JobResult>
 */
export async function handleWikiSuggestRestructure(
  jobId: string,
  payload: JobPayload,
): Promise<JobResult> {
  const wikiRoot = payload.wikiRoot as string | undefined;
  if (!wikiRoot) {
    throw new Error("Missing required payload field: wikiRoot");
  }

  const suggestions = suggestRestructure(wikiRoot);

  return {
    success: true,
    jobId,
    type: "wiki_suggest_restructure",
    data: {
      suggestions,
      count: suggestions.length,
    },
  };
}
