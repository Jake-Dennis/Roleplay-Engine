import fs from "fs";
import path from "path";
import { WikiPage } from "@/lib/wiki/file-io";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Parsed entry from wiki index.md.
 */
export interface WikiIndexEntry {
  title: string;
  summary: string;
  status: string;
  section: string; // entity, concept, source, synthesis
  /** Raw line from index.md (used by query.ts for relevance scoring). */
  rawLine?: string;
}

// ---------------------------------------------------------------------------
// Index Parsing
// ---------------------------------------------------------------------------

/**
 * Parse wiki index.md into structured entries grouped by section.
 *
 * Expected format:
 *   ## Entities
 *   - [[Title]] — summary (status: reviewed)
 */
export function parseWikiIndex(indexPath: string): WikiIndexEntry[] {
  if (!fs.existsSync(indexPath)) return [];

  const content = fs.readFileSync(indexPath, "utf-8");
  const entries: WikiIndexEntry[] = [];
  let currentSection = "";

  for (const line of content.split("\n")) {
    // Detect section headers: ## Entities, ## Concepts, etc.
    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].toLowerCase();
      continue;
    }

    // Detect index entries: - [[Title]] — summary (status: draft)
    const entryMatch = line.match(/^-\s+\[\[([^\]]+)\]\]\s*[—-]\s*(.+)$/);
    if (entryMatch) {
      const title = entryMatch[1].trim();
      const rest = entryMatch[2].trim();

      // Extract status from end: (status: reviewed)
      const statusMatch = rest.match(/\(status:\s*(\w+)\)\s*$/);
      const status = statusMatch ? statusMatch[1] : "draft";
      const summary = statusMatch
        ? rest.replace(/\(status:\s*\w+\)\s*$/, "").trim()
        : rest;

      entries.push({
        title,
        summary,
        status,
        section: currentSection,
        rawLine: line,
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Relevance Scoring
// ---------------------------------------------------------------------------

/**
 * Score a wiki index entry's relevance to a query using keyword overlap.
 * Returns 0-1 score.
 *
 * @param entry - The index entry to score
 * @param query - The search query
 * @param universeId - Optional universe ID for scoring bonus
 */
export function scoreWikiEntry(
  entry: WikiIndexEntry,
  query: string,
  universeId?: string
): number {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (queryTerms.length === 0) return 0;

  const searchable = `${entry.title} ${entry.summary} ${entry.section}`.toLowerCase();
  let matches = 0;

  for (const term of queryTerms) {
    if (searchable.includes(term)) matches++;
  }

  // Base score: fraction of query terms matched
  let score = matches / queryTerms.length;

  // Bonus for title match (higher weight)
  if (entry.title.toLowerCase().includes(queryTerms[0])) {
    score += 0.3;
  }

  // Bonus for reviewed/locked status (prefer curated content)
  if (entry.status === "locked") score += 0.15;
  else if (entry.status === "reviewed") score += 0.1;

  // Bonus for universe-scoped sections (entity/concept)
  if (universeId && (entry.section === "entity" || entry.section === "concept")) {
    score += 0.05;
  }

  return Math.min(score, 1.0);
}

// ---------------------------------------------------------------------------
// Page Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve an index entry title to an actual wiki page path.
 * Searches all wiki pages for a matching title (case-insensitive).
 *
 * Resolution order:
 * 1. Exact title match + same universe
 * 2. Exact title match (any universe)
 * 3. Filename match (without .md)
 */
export function resolveWikiPagePath(
  title: string,
  pages: WikiPage[],
  universeId: string
): string | null {
  const normalizedTitle = title.toLowerCase().replace(/\s+/g, "-");

  // First pass: exact title match + same universe
  for (const page of pages) {
    const pageTitle = (page.frontmatter.title || "")
      .toLowerCase()
      .replace(/\s+/g, "-");
    const pageUniverse = page.frontmatter.universe?.toLowerCase();

    if (pageTitle === normalizedTitle && pageUniverse === universeId) {
      return page.path;
    }
  }

  // Second pass: exact title match (any universe)
  for (const page of pages) {
    const pageTitle = (page.frontmatter.title || "")
      .toLowerCase()
      .replace(/\s+/g, "-");
    if (pageTitle === normalizedTitle) return page.path;
  }

  // Third pass: filename match
  for (const page of pages) {
    const filename = path.basename(page.path, ".md").toLowerCase();
    if (filename === normalizedTitle) return page.path;
  }

  return null;
}
