import fs from "fs";
import path from "path";
import FlexSearch from "flexsearch";
import { generateText } from "@/lib/ollama";
import { readWikiPage, listWikiPages, WikiPage } from "@/lib/wiki/file-io";
import { parseWikilinks } from "@/lib/wiki/wikilinks";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of a wiki query.
 */
export interface QueryResult {
  /** Synthesized answer text from the LLM. */
  answer: string;
  /** Source pages cited in the answer. */
  citations: Array<{ pagePath: string; relevantSection: string }>;
  /** Whether FlexSearch full-text fallback was used. */
  usedFallback: boolean;
}

/**
 * Parsed entry from index.md.
 */
interface IndexEntry {
  title: string;
  summary: string;
  status: string;
  section: string; // entity, concept, source, synthesis
  /** Raw line from index.md for relevance scoring. */
  rawLine: string;
}

// ---------------------------------------------------------------------------
// Index Parsing
// ---------------------------------------------------------------------------

/**
 * Parse index.md into structured entries grouped by section.
 *
 * Expected format:
 *   ## Entities
 *   - [[Title]] — summary (status: reviewed)
 */
function parseIndex(indexPath: string): IndexEntry[] {
  if (!fs.existsSync(indexPath)) return [];

  const content = fs.readFileSync(indexPath, "utf-8");
  const entries: IndexEntry[] = [];
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
 * Score an index entry's relevance to a query using keyword overlap.
 * Returns 0-1 score.
 */
function scoreEntry(entry: IndexEntry, query: string): number {
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

  return Math.min(score, 1.0);
}

// ---------------------------------------------------------------------------
// Page Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve an index entry title to an actual wiki page path.
 * Searches all wiki pages for a matching title (case-insensitive).
 */
function resolvePagePath(
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

// ---------------------------------------------------------------------------
// FlexSearch Fallback
// ---------------------------------------------------------------------------

/**
 * Build a FlexSearch index from all wiki pages and search for the query.
 * Returns matching page paths.
 */
function flexSearchFallback(
  pages: WikiPage[],
  query: string,
  universeId: string
): string[] {
  const index = new FlexSearch.Document({
    document: {
      id: "path",
      index: ["content", "title"],
      store: ["title", "type", "path", "universe"],
    },
    tokenize: "forward",
  });

  // Index all pages
  for (const page of pages) {
    index.add({
      path: page.path,
      content: page.content,
      title: page.frontmatter.title || "",
      type: page.frontmatter.type || "entity",
      universe: page.frontmatter.universe || "",
    });
  }

  // Search
  const searchResults = index.search(query, { limit: 10 });
  const hits = (Array.isArray(searchResults) ? searchResults : [])
    .flatMap((r: any) => r.result || []);

  // Filter by universeId
  const filtered = hits.filter((hitPath: string) => {
    const page = pages.find((p) => p.path === hitPath);
    if (!page) return false;
    const pageUniverse = page.frontmatter.universe;
    return !pageUniverse || pageUniverse === universeId;
  });

  return filtered.slice(0, 10) as string[];
}

// ---------------------------------------------------------------------------
// Extract Relevant Sections
// ---------------------------------------------------------------------------

/**
 * Extract the most relevant section(s) from a page's content for a given query.
 * Returns the section heading + content block.
 */
function extractRelevantSection(
  content: string,
  query: string,
  maxChars: number = 500
): string {
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

  // Split content by markdown headings
  const sections = content.split(/^(#{1,3}\s+.+)$/m);

  if (sections.length <= 1) {
    // No headings found — return first N chars
    return content.substring(0, maxChars);
  }

  // Score each section by query term overlap
  let bestSection = "";
  let bestScore = 0;

  for (let i = 1; i < sections.length; i += 2) {
    const heading = sections[i] || "";
    const body = sections[i + 1] || "";
    const sectionText = `${heading}\n${body}`.toLowerCase();

    let score = 0;
    for (const term of queryTerms) {
      if (sectionText.includes(term)) score++;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSection = `${heading}\n${body}`.substring(0, maxChars);
    }
  }

  // If no section matched, return the first section
  if (!bestSection && sections.length >= 3) {
    bestSection = `${sections[1]}\n${sections[2]}`.substring(0, maxChars);
  }

  return bestSection || content.substring(0, maxChars);
}

// ---------------------------------------------------------------------------
// LLM Synthesis
// ---------------------------------------------------------------------------

/**
 * Build the synthesis prompt for the LLM.
 */
function buildSynthesisPrompt(
  query: string,
  pages: Array<{ path: string; content: string; frontmatter: Record<string, any> }>
): string {
  const pageContexts = pages
    .map((p, i) => {
      const title = p.frontmatter.title || path.basename(p.path, ".md");
      const type = p.frontmatter.type || "unknown";
      const status = p.frontmatter.status || "draft";
      return `--- Page ${i + 1}: ${title} ---\nType: ${type} | Status: ${status}\nPath: ${p.path}\n\n${p.content}`;
    })
    .join("\n\n");

  return `You are a wiki knowledge assistant. Answer the user's query based ONLY on the provided wiki pages.

QUERY: ${query}

WIKI PAGES:
${pageContexts}

INSTRUCTIONS:
1. Synthesize a clear, comprehensive answer using ONLY information from the provided wiki pages.
2. If the pages don't contain relevant information, say "No relevant information found in the wiki for: ${query}"
3. Cite your sources by referencing the page title or path in parentheses, e.g., (see: Page Title).
4. Structure your answer with headings, bullet points, or paragraphs as appropriate.
5. Do NOT invent information not present in the wiki pages.
6. If pages conflict, note the discrepancy.

ANSWER:`;
}

/**
 * Parse the LLM response to extract citations from inline references.
 */
function extractCitationsFromResponse(
  response: string,
  pages: Array<{ path: string; content: string; frontmatter: Record<string, any> }>
): Array<{ pagePath: string; relevantSection: string }> {
  const citations: Array<{ pagePath: string; relevantSection: string }> = [];
  const seen = new Set<string>();

  // Look for citation patterns: (see: Title), (Title), [Title], etc.
  const citationPatterns = [
    /\(see:\s*([^)]+)\)/gi,
    /\[([^\]]+)\]/g,
    /\(([^)]+)\)/g,
  ];

  for (const pattern of citationPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const citedName = match[1].trim().toLowerCase();

      for (const page of pages) {
        const pageTitle = (page.frontmatter.title || "")
          .toLowerCase()
          .replace(/\s+/g, " ");
        const filename = path.basename(page.path, ".md").toLowerCase();

        if (
          !seen.has(page.path) &&
          (pageTitle.includes(citedName) ||
            citedName.includes(pageTitle) ||
            filename.includes(citedName) ||
            citedName.includes(filename))
        ) {
          const relevantSection = extractRelevantSection(page.content, citedName);
          citations.push({
            pagePath: page.path,
            relevantSection,
          });
          seen.add(page.path);
          break;
        }
      }
    }
  }

  // If no explicit citations found, cite all pages used
  if (citations.length === 0 && pages.length > 0) {
    for (const page of pages) {
      const relevantSection = extractRelevantSection(
        page.content,
        pages.length === 1 ? "" : page.frontmatter.title || ""
      );
      citations.push({
        pagePath: page.path,
        relevantSection,
      });
    }
  }

  return citations;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Query the wiki and synthesize an answer using LLM.
 *
 * Flow:
 * 1. Read index.md for first-pass filtering
 * 2. Score entries by relevance to query
 * 3. Read full content of top candidate pages
 * 4. If no candidates, use FlexSearch full-text fallback
 * 5. Send relevant pages to LLM for synthesis
 * 6. Return structured answer with citations
 *
 * @param query - The user's natural language query
 * @param wikiRoot - Path to the wiki root directory (e.g., data/{userId}/wiki)
 * @param universeId - Universe ID to filter pages by
 * @returns QueryResult with answer, citations, and fallback flag
 */
export async function queryWiki(
  query: string,
  wikiRoot: string,
  universeId: string
): Promise<QueryResult> {
  const emptyResult: QueryResult = {
    answer: `No relevant information found in the wiki for: "${query}"`,
    citations: [],
    usedFallback: false,
  };

  if (!query.trim()) return emptyResult;

  // -----------------------------------------------------------------------
  // Step 1: Read index.md for first-pass filtering
  // -----------------------------------------------------------------------
  const indexPath = path.join(wikiRoot, "index.md");
  const indexEntries = parseIndex(indexPath);

  if (indexEntries.length === 0) {
    // No index — fall back to full-text search
    return queryWikiFlexSearch(query, wikiRoot, universeId);
  }

  // -----------------------------------------------------------------------
  // Step 2: Score entries by relevance
  // -----------------------------------------------------------------------
  const scored = indexEntries
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, query),
    }))
    .filter((s) => s.score > 0.1)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // No relevant index entries — fall back to full-text search
    return queryWikiFlexSearch(query, wikiRoot, universeId);
  }

  // -----------------------------------------------------------------------
  // Step 3: Load all pages for resolution, then read full content
  // -----------------------------------------------------------------------
  const allPages = listWikiPages(wikiRoot);

  // Resolve top candidates to actual page paths
  const candidatePaths: string[] = [];
  for (const { entry } of scored.slice(0, 8)) {
    const resolved = resolvePagePath(entry.title, allPages, universeId);
    if (resolved && !candidatePaths.includes(resolved)) {
      candidatePaths.push(resolved);
    }
  }

  if (candidatePaths.length === 0) {
    // No pages resolved — fall back to full-text search
    return queryWikiFlexSearch(query, wikiRoot, universeId);
  }

  // -----------------------------------------------------------------------
  // Step 4: Read full content of candidate pages
  // -----------------------------------------------------------------------
  const candidatePages: Array<{
    path: string;
    content: string;
    frontmatter: Record<string, any>;
  }> = [];

  for (const pagePath of candidatePaths) {
    try {
      const page = readWikiPage(pagePath);
      candidatePages.push({
        path: page.path,
        content: page.content,
        frontmatter: page.frontmatter,
      });
    } catch {
      // Skip pages that can't be read
    }
  }

  if (candidatePages.length === 0) {
    return queryWikiFlexSearch(query, wikiRoot, universeId);
  }

  // -----------------------------------------------------------------------
  // Step 5: LLM synthesis
  // -----------------------------------------------------------------------
  return synthesizeAnswer(query, candidatePages, false);
}

/**
 * FlexSearch fallback: full-text search across all wiki pages.
 */
async function queryWikiFlexSearch(
  query: string,
  wikiRoot: string,
  universeId: string
): Promise<QueryResult> {
  const allPages = listWikiPages(wikiRoot);

  if (allPages.length === 0) {
    return {
      answer: `No relevant information found in the wiki for: "${query}"`,
      citations: [],
      usedFallback: true,
    };
  }

  const hitPaths = flexSearchFallback(allPages, query, universeId);

  if (hitPaths.length === 0) {
    return {
      answer: `No relevant information found in the wiki for: "${query}"`,
      citations: [],
      usedFallback: true,
    };
  }

  // Read full content of hit pages
  const hitPages: Array<{
    path: string;
    content: string;
    frontmatter: Record<string, any>;
  }> = [];

  for (const pagePath of hitPaths.slice(0, 5)) {
    try {
      const page = readWikiPage(pagePath);
      hitPages.push({
        path: page.path,
        content: page.content,
        frontmatter: page.frontmatter,
      });
    } catch {
      // Skip unreadable pages
    }
  }

  if (hitPages.length === 0) {
    return {
      answer: `No relevant information found in the wiki for: "${query}"`,
      citations: [],
      usedFallback: true,
    };
  }

  return synthesizeAnswer(query, hitPages, true);
}

/**
 * Send candidate pages to LLM for synthesis and return structured result.
 */
async function synthesizeAnswer(
  query: string,
  pages: Array<{ path: string; content: string; frontmatter: Record<string, any> }>,
  usedFallback: boolean
): Promise<QueryResult> {
  try {
    const prompt = buildSynthesisPrompt(query, pages);
    const response = await generateText(prompt, {
      temperature: 0.3,
      num_ctx: 16384,
    });

    const citations = extractCitationsFromResponse(response, pages);

    return {
      answer: response.trim(),
      citations,
      usedFallback,
    };
  } catch (error) {
    // LLM failed — return a fallback answer with page references
    const pageRefs = pages
      .map((p) => `- ${p.frontmatter.title || path.basename(p.path, ".md")} (${p.path})`)
      .join("\n");

    return {
      answer: `The LLM is currently unavailable. Relevant wiki pages found:\n\n${pageRefs}\n\nPlease review these pages manually for information about: "${query}"`,
      citations: pages.map((p) => ({
        pagePath: p.path,
        relevantSection: extractRelevantSection(p.content, query),
      })),
      usedFallback,
    };
  }
}
