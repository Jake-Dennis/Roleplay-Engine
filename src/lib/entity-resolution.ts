/**
 * @deprecated This file is not currently imported by any source module.
 * Kept for reference. Will be removed in a future cleanup pass once
 * all consumers are verified.
 * @reason Entity-to-wiki-page resolution was intended for the entity
 * mention resolution pipeline in the generation flow but was never
 * called. The resolution of entity mentions to wiki pages is handled
 * elsewhere (or was never fully integrated).
 */

/**
 * Entity-to-Wiki-Page Resolution
 *
 * Resolves an entity name (from entity_mentions extraction) to the best-matching
 * wiki page using progressive fuzzy string matching against page titles and
 * filenames.
 *
 * Resolution strategy (tried in order, returns first match):
 *   1. Exact match (case-insensitive)        → confidence 1.0
 *   2. Substring match                       → confidence 0.7
 *   3. Levenshtein distance ≤ 3              → confidence 0.5 (decays with distance)
 *
 * Called by Task 25's entity resolution in the generation pipeline.
 *
 * @module entity-resolution
 */

import path from "path";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { listWikiPages } from "@/lib/wiki/file-io";
import type { WikiPage } from "@/lib/wiki/file-io";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolutionResult {
  /** Absolute path to the matched wiki page file. */
  pagePath: string;
  /** Display title from frontmatter (or filename if no frontmatter title). */
  title: string;
  /** Confidence score 0–1 (1.0 = exact match, 0.7 = substring, 0.5–0.3 = fuzzy). */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Levenshtein Distance Helper
// ---------------------------------------------------------------------------

/**
 * Compute the Levenshtein edit distance between two strings.
 *
 * Uses a space-optimized DP implementation (O(n) memory, O(n*m) time).
 * Handles Unicode strings correctly (JS counts by code point).
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  // Two-row DP to avoid O(n*m) memory
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,         // deletion
        curr[j - 1] + 1,     // insertion
        prev[j - 1] + cost   // substitution
      );
    }
    // Swap rows
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

// ---------------------------------------------------------------------------
// Candidate Building
// ---------------------------------------------------------------------------

/**
 * Internal candidate entry for matching.
 */
interface Candidate {
  /** Lowercased, trimmed title for comparison. */
  normalized: string;
  /** Absolute file path of the wiki page. */
  pagePath: string;
  /** Original-casing title from frontmatter (or filename). */
  originalTitle: string;
}

/**
 * Build a deduplicated candidate list from wiki pages.
 *
 * Each page contributes up to two candidates:
 *   1. Its frontmatter `title` (primary — author-assigned display name)
 *   2. Its filename without `.md` extension (fallback)
 *
 * Duplicates (same normalized string) are skipped to avoid double-matching.
 */
function buildCandidates(pages: WikiPage[]): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    // Primary: frontmatter title
    const title = page.frontmatter.title;
    if (title) {
      const key = title.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          normalized: key,
          pagePath: page.path,
          originalTitle: title,
        });
      }
    }

    // Fallback: filename without extension (e.g., "the_black_keep" from "the_black_keep.md")
    const filename = path.basename(page.path, ".md").toLowerCase().trim();
    if (!seen.has(filename)) {
      seen.add(filename);
      candidates.push({
        normalized: filename,
        pagePath: page.path,
        originalTitle: filename,
      });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve an entity name to the best-matching wiki page.
 *
 * Searches the user's wiki pages using progressive fuzzy matching:
 *
 * | Pass | Strategy                  | Confidence |
 * |------|---------------------------|------------|
 * | 1    | Exact (case-insensitive)  | 1.0        |
 * | 2    | Substring (either dir)    | 0.7        |
 * | 3    | Levenshtein distance ≤ 3  | 0.5–0.3    |
 *
 * If `universeId` is provided, the search is scoped to that universe's wiki
 * root directory (via `getWikiRoot`). Otherwise, all wiki pages for the user
 * are searched.
 *
 * @param userId      - The user whose wiki to search.
 * @param entityName  - The entity name to resolve (from entity_mentions extraction).
 * @param universeId  - Optional — scope search to a specific universe.
 * @returns A `ResolutionResult` with the matched page path, title, and confidence,
 *          or `null` if no match is found.
 */
export function resolveEntityToWikiPage(
  userId: string,
  entityName: string,
  universeId?: string
): ResolutionResult | null {
  // Guard: both userId and entityName are required
  if (!userId || !entityName) return null;

  // Scope the wiki root — getWikiRoot handles universe filtering at the
  // filesystem level and guards against path traversal
  const wikiRoot = getWikiRoot(userId, universeId);
  const pages = listWikiPages(wikiRoot);

  if (pages.length === 0) return null;

  const candidates = buildCandidates(pages);
  const normalizedEntity = entityName.toLowerCase().trim();

  // ------------------------------------------------------------------
  // Pass 1 — Exact match (case-insensitive)
  // ------------------------------------------------------------------
  for (const c of candidates) {
    if (c.normalized === normalizedEntity) {
      return {
        pagePath: c.pagePath,
        title: c.originalTitle,
        confidence: 1.0,
      };
    }
  }

  // ------------------------------------------------------------------
  // Pass 2 — Substring match (either direction)
  // ------------------------------------------------------------------
  for (const c of candidates) {
    const entityWithinTitle = c.normalized.includes(normalizedEntity);
    const titleWithinEntity = normalizedEntity.includes(c.normalized);

    if (entityWithinTitle || titleWithinEntity) {
      // Bonus for longer title matches (more specific = more confident)
      const specificityBonus = Math.min(c.normalized.length / 50, 0.15);
      return {
        pagePath: c.pagePath,
        title: c.originalTitle,
        confidence: Math.min(0.7 + specificityBonus, 0.95), // cap below 1.0
      };
    }
  }

  // ------------------------------------------------------------------
  // Pass 3 — Fuzzy match (Levenshtein distance ≤ 3)
  // ------------------------------------------------------------------
  let bestCandidate: Candidate | null = null;
  let bestDistance = Infinity;

  for (const c of candidates) {
    const dist = levenshteinDistance(c.normalized, normalizedEntity);
    if (dist <= 3 && dist < bestDistance) {
      bestDistance = dist;
      bestCandidate = c;
    }
  }

  if (bestCandidate) {
    // Decay confidence with edit distance:
    //   dist 1 → 0.50,  dist 2 → 0.40,  dist 3 → 0.30
    const confidence = Math.max(0.3, 0.5 - (bestDistance - 1) * 0.1);
    return {
      pagePath: bestCandidate.pagePath,
      title: bestCandidate.originalTitle,
      confidence,
    };
  }

  return null;
}
