import path from "path";
import fs from "fs";
import { writeWikiPage, readWikiPage, WikiFrontmatter } from "./file-io";
import { generateIndex } from "./index-generator";
import { appendLog, LogOperation } from "./logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of filing an answer into the wiki.
 */
export interface FileResult {
  /** Whether the filing operation succeeded. */
  success: boolean;
  /** Absolute path to the created synthesis page. */
  pagePath: string;
  /** Any errors encountered during filing. */
  errors: string[];
}

/**
 * Citation reference from a query result.
 */
export interface Citation {
  /** Absolute path to the source wiki page. */
  pagePath: string;
  /** Relevant section text from the source page. */
  relevantSection: string;
}

// ---------------------------------------------------------------------------
// Slugification
// ---------------------------------------------------------------------------

/**
 * Convert a query string into a safe, lowercase kebab-case slug.
 */
function slugify(query: string): string {
  return query
    .toLowerCase()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 100) || `query-${Date.now()}`;
}

/**
 * Extract the page title from a wiki page's frontmatter or filename.
 */
function getPageTitle(pagePath: string): string {
  try {
    const page = readWikiPage(pagePath);
    return (page.frontmatter.title as string) || path.basename(pagePath, ".md");
  } catch {
    return path.basename(pagePath, ".md");
  }
}

// ---------------------------------------------------------------------------
// Cross-Reference Management
// ---------------------------------------------------------------------------

/**
 * Append a cross-reference link to a source page pointing to the new synthesis page.
 *
 * Adds a "## See Also" section if one doesn't exist, or appends to the existing one.
 * Avoids duplicate entries.
 */
function addCrossReference(
  sourcePagePath: string,
  synthesisTitle: string,
  synthesisFilename: string
): string | null {
  try {
    const page = readWikiPage(sourcePagePath);
    const wikilink = `[[${synthesisTitle}]]`;
    const seeAlsoHeading = "## See Also";

    // Check if cross-reference already exists
    if (page.content.includes(wikilink)) {
      return null; // Already linked
    }

    let newContent = page.content;

    if (newContent.includes(seeAlsoHeading)) {
      // Append to existing "See Also" section
      newContent = newContent + `\n- ${wikilink}\n`;
    } else {
      // Create new "See Also" section at the end
      newContent = newContent.trimEnd() + `\n\n${seeAlsoHeading}\n\n- ${wikilink}\n`;
    }

    // Preserve original frontmatter fields
    const frontmatter: WikiFrontmatter = {
      title: (page.frontmatter.title as string) || path.basename(sourcePagePath, ".md"),
      type: (page.frontmatter.type as WikiFrontmatter["type"]) || "entity",
      status: (page.frontmatter.status as WikiFrontmatter["status"]) || "draft",
      universe: page.frontmatter.universe as string | undefined,
      tags: Array.isArray(page.frontmatter.tags) ? page.frontmatter.tags : [],
      created: page.frontmatter.created as string | undefined,
      updated: page.frontmatter.updated as string | undefined,
    };

    writeWikiPage(sourcePagePath, newContent, frontmatter);
    return sourcePagePath;
  } catch (error) {
    throw new Error(
      `Failed to add cross-reference to ${sourcePagePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * File a query answer back into the wiki as a synthesis page.
 *
 * This is an explicit operation — it does NOT auto-file every answer.
 * Call this after queryWiki returns a result and the user opts to save it.
 *
 * Flow:
 * 1. Validate inputs (answer text, citations)
 * 2. Create synthesis page in synthesis/ folder with slugified query filename
 * 3. Page content includes answer text + citations as wikilinks to source pages
 * 4. Regenerate wiki index
 * 5. Append to operation log
 * 6. Add cross-references from each cited source page to the new synthesis page
 *
 * @param query - The original user query (used for title and filename)
 * @param answer - The synthesized answer text from the LLM
 * @param citations - Source pages cited in the answer
 * @param wikiRoot - Path to the wiki root directory
 * @param universeId - Universe ID for frontmatter
 * @returns FileResult with success status, page path, and any errors
 */
export async function fileAnswer(
  query: string,
  answer: string,
  citations: Citation[],
  wikiRoot: string,
  universeId: string
): Promise<FileResult> {
  const errors: string[] = [];
  const slug = slugify(query);
  const synthesisDir = path.join(wikiRoot, "synthesis");
  const synthesisFilename = `${slug}.md`;
  const synthesisPath = path.join(synthesisDir, synthesisFilename);

  // -----------------------------------------------------------------------
  // Validate inputs
  // -----------------------------------------------------------------------
  if (!query.trim()) {
    return { success: false, pagePath: "", errors: ["Query is empty"] };
  }

  if (!answer.trim()) {
    return { success: false, pagePath: "", errors: ["Answer is empty"] };
  }

  if (citations.length === 0) {
    return { success: false, pagePath: "", errors: ["Cannot file answer without citations"] };
  }

  // -----------------------------------------------------------------------
  // Check for existing synthesis page (do not modify existing pages)
  // -----------------------------------------------------------------------
  if (fs.existsSync(synthesisPath)) {
    return {
      success: false,
      pagePath: synthesisPath,
      errors: [`Synthesis page already exists: ${synthesisFilename}. Use a different query or rename the existing page.`],
    };
  }

  // -----------------------------------------------------------------------
  // Build page content with answer + citations as wikilinks
  // -----------------------------------------------------------------------
  let content = `${answer.trim()}\n\n`;

  // Add citations section with wikilinks to source pages
  content += "## Citations\n\n";
  for (const citation of citations) {
    const title = getPageTitle(citation.pagePath);
    const relativePath = path.relative(wikiRoot, citation.pagePath);
    content += `- [[${title}]] — _${relativePath}_\n`;
  }

  // Add sources section with relevant excerpts
  content += "\n## Source Excerpts\n\n";
  for (const citation of citations) {
    const title = getPageTitle(citation.pagePath);
    content += `### ${title}\n\n`;
    content += `${citation.relevantSection}\n\n`;
  }

  // -----------------------------------------------------------------------
  // Write synthesis page
  // -----------------------------------------------------------------------
  try {
    const frontmatter: WikiFrontmatter = {
      title: query.trim(),
      type: "synthesis",
      status: "draft",
      universe: universeId,
      tags: ["synthesis", "auto-filed"],
    };

    writeWikiPage(synthesisPath, content, frontmatter);
  } catch (error) {
    errors.push(
      `Failed to write synthesis page: ${error instanceof Error ? error.message : String(error)}`
    );
    return { success: false, pagePath: synthesisPath, errors };
  }

  // -----------------------------------------------------------------------
  // Regenerate wiki index
  // -----------------------------------------------------------------------
  try {
    generateIndex(wikiRoot);
  } catch (error) {
    errors.push(
      `Failed to regenerate index: ${error instanceof Error ? error.message : String(error)}`
    );
    // Continue — page was written successfully
  }

  // -----------------------------------------------------------------------
  // Append to operation log
  // -----------------------------------------------------------------------
  try {
    appendLog(
      wikiRoot,
      "create" as LogOperation,
      `Synthesis: ${query.trim()}`,
      `Filed answer to ${synthesisFilename} with ${citations.length} citation(s)`
    );
  } catch (error) {
    errors.push(
      `Failed to append to log: ${error instanceof Error ? error.message : String(error)}`
    );
    // Continue — page was written successfully
  }

  // -----------------------------------------------------------------------
  // Add cross-references from source pages
  // -----------------------------------------------------------------------
  const synthesisTitle = query.trim();
  for (const citation of citations) {
    try {
      addCrossReference(citation.pagePath, synthesisTitle, synthesisFilename);
    } catch (error) {
      errors.push(
        `Failed to add cross-reference to ${path.basename(citation.pagePath)}: ${error instanceof Error ? error.message : String(error)}`
      );
      // Continue — other cross-references may still succeed
    }
  }

  // -----------------------------------------------------------------------
  // Return result
  // -----------------------------------------------------------------------
  return {
    success: errors.length === 0,
    pagePath: synthesisPath,
    errors,
  };
}
