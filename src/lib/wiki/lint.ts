import path from "path";
import { listWikiPages, WikiPage } from "./file-io";
import {
  parseWikilinks,
  resolveWikilink,
  validateWikilinks,
} from "./wikilinks";
import { findOrphans } from "./orphans";
import { generateText } from "../ollama";
import { TIME } from "../config";

// ---------------------------------------------------------------------------
// Report Types
// ---------------------------------------------------------------------------

export interface Contradiction {
  pageA: string;
  pageB: string;
  claimA: string;
  claimB: string;
  entity: string;
}

export interface StaleClaim {
  pagePath: string;
  claim: string;
  reason: string;
}

export interface MissingPage {
  sourcePage: string;
  missingTarget: string;
}

export interface LintReport {
  contradictions: Contradiction[];
  staleClaims: StaleClaim[];
  orphans: string[];
  missingPages: MissingPage[];
  suggestions: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Relative path from wikiRoot for display purposes.
 */
function relativePath(wikiRoot: string, absolutePath: string): string {
  return path.relative(wikiRoot, absolutePath);
}

/**
 * Extract the entity/title from a page's frontmatter or filename.
 */
function pageEntity(page: WikiPage): string {
  return (
    page.frontmatter.title ||
    path.basename(page.path, ".md").replace(/[-_]/g, " ")
  );
}

/**
 * Group pages by their primary entity (title).
 * Returns a map: entityName -> [pages about that entity].
 */
function groupPagesByEntity(pages: WikiPage[]): Map<string, WikiPage[]> {
  const groups = new Map<string, WikiPage[]>();

  for (const page of pages) {
    const entity = pageEntity(page).toLowerCase();
    if (!groups.has(entity)) {
      groups.set(entity, []);
    }
    groups.get(entity)!.push(page);
  }

  return groups;
}

/**
 * Find pages that reference a given entity (by wikilink or title mention).
 */
function pagesReferencingEntity(
  pages: WikiPage[],
  entityName: string,
): WikiPage[] {
  const normalized = entityName.toLowerCase();
  const referencing: WikiPage[] = [];

  for (const page of pages) {
    const links = parseWikilinks(page.content);
    const mentions = links.some(
      (l) => l.name.toLowerCase().replace(/\s+/g, "-") === normalized,
    );
    const titleMention = pageEntity(page).toLowerCase() === normalized;
    if (mentions || titleMention) {
      referencing.push(page);
    }
  }

  return referencing;
}

/**
 * Detect stale claims based on page age and status patterns.
 */
function detectStaleClaims(
  pages: WikiPage[],
  wikiRoot: string,
): StaleClaim[] {
  const stale: StaleClaim[] = [];
  const now = Date.now();
  const thirtyDaysMs = TIME.THIRTY_DAYS;
  const ninetyDaysMs = TIME.NINETY_DAYS;

  // Compute the most recent update across all pages as a reference point
  let mostRecentUpdate = 0;
  for (const page of pages) {
    if (page.frontmatter.updated) {
      const ts = new Date(page.frontmatter.updated).getTime();
      if (ts > mostRecentUpdate) mostRecentUpdate = ts;
    }
  }

  for (const page of pages) {
    const relPath = relativePath(wikiRoot, page.path);
    const updated = page.frontmatter.updated
      ? new Date(page.frontmatter.updated).getTime()
      : 0;
    const status = page.frontmatter.status;

    // Draft pages older than 90 days without updates
    if (status === "draft" && updated > 0) {
      const age = mostRecentUpdate - updated;
      if (age > ninetyDaysMs) {
        stale.push({
          pagePath: relPath,
          claim: `Page has been in "draft" status for an extended period`,
          reason: `Last updated ${Math.round(age / (1000 * 60 * 60 * 24))} days ago; consider reviewing or archiving`,
        });
      }
    }

    // Pages not updated in 30+ days while wiki is active
    if (updated > 0 && mostRecentUpdate - updated > thirtyDaysMs) {
      // Check if the page has wikilinks to pages that no longer exist
      const links = parseWikilinks(page.content);
      const brokenLinks = links.filter(
        (l) => !l.isEmbed,
      );
      if (brokenLinks.length > 0) {
        stale.push({
          pagePath: relPath,
          claim: `Page contains ${brokenLinks.length} wikilink(s) that may need verification`,
          reason: `Page hasn't been updated in ${Math.round((mostRecentUpdate - updated) / (1000 * 60 * 60 * 24))} days; links may be stale`,
        });
      }
    }

    // Pages with no updated timestamp at all
    if (!page.frontmatter.updated && page.frontmatter.created) {
      const created = new Date(page.frontmatter.created).getTime();
      if (now - created > thirtyDaysMs) {
        stale.push({
          pagePath: relPath,
          claim: `Page has no "updated" timestamp`,
          reason: `Created ${Math.round((now - created) / (1000 * 60 * 60 * 24))} days ago but never marked as updated`,
        });
      }
    }
  }

  return stale;
}

/**
 * Detect contradictions between pages about the same entity using LLM.
 * Compares pairs of pages that reference the same entity.
 */
async function detectContradictions(
  pages: WikiPage[],
  wikiRoot: string,
  universeId?: string,
): Promise<Contradiction[]> {
  const contradictions: Contradiction[] = [];

  // Build entity groups: for each unique entity name, find all pages about it
  const entityGroups = groupPagesByEntity(pages);

  // Also find cross-referencing pages: pages that link to the same entity
  const allEntities = new Set<string>();
  for (const page of pages) {
    const links = parseWikilinks(page.content);
    for (const link of links) {
      allEntities.add(link.name.toLowerCase());
    }
  }

  // For each entity with multiple pages, compare them
  const entitiesToCheck = [...entityGroups.entries()].filter(
    ([, group]) => group.length >= 2,
  );

  for (const [entity, group] of entitiesToCheck) {
    // Compare each pair
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const pageA = group[i];
        const pageB = group[j];

        // Skip if same file
        if (pageA.path === pageB.path) continue;

        // Skip if different universes (when universeId is specified)
        if (universeId) {
          const uniA = (pageA.frontmatter.universe || "").toLowerCase();
          const uniB = (pageB.frontmatter.universe || "").toLowerCase();
          if (uniA && uniB && uniA !== uniB) continue;
        }

        const result = await comparePagesForContradiction(
          pageA,
          pageB,
          entity,
        );
        if (result) {
          contradictions.push({
            pageA: relativePath(wikiRoot, pageA.path),
            pageB: relativePath(wikiRoot, pageB.path),
            claimA: result.claimA,
            claimB: result.claimB,
            entity: result.entity,
          });
        }
      }
    }
  }

  // Also check pages that cross-reference the same entity but aren't grouped by title
  for (const entity of allEntities) {
    const referencingPages = pagesReferencingEntity(pages, entity);
    if (referencingPages.length < 2) continue;

    // Compare pairs of pages that reference this entity
    for (let i = 0; i < referencingPages.length; i++) {
      for (let j = i + 1; j < referencingPages.length; j++) {
        const pageA = referencingPages[i];
        const pageB = referencingPages[j];
        if (pageA.path === pageB.path) continue;

        // Skip if already checked via entity groups
        const entityA = pageEntity(pageA).toLowerCase();
        const entityB = pageEntity(pageB).toLowerCase();
        if (entityA === entityB) continue;

        // Skip if different universes
        if (universeId) {
          const uniA = (pageA.frontmatter.universe || "").toLowerCase();
          const uniB = (pageB.frontmatter.universe || "").toLowerCase();
          if (uniA && uniB && uniA !== uniB) continue;
        }

        const result = await comparePagesForContradiction(
          pageA,
          pageB,
          entity,
        );
        if (result) {
          contradictions.push({
            pageA: relativePath(wikiRoot, pageA.path),
            pageB: relativePath(wikiRoot, pageB.path),
            claimA: result.claimA,
            claimB: result.claimB,
            entity: result.entity,
          });
        }
      }
    }
  }

  return contradictions;
}

interface ContradictionResult {
  claimA: string;
  claimB: string;
  entity: string;
}

/**
 * Compare two pages for contradictions using LLM.
 */
async function comparePagesForContradiction(
  pageA: WikiPage,
  pageB: WikiPage,
  entityName: string,
): Promise<ContradictionResult | null> {
  const maxContentLength = 3000;
  const contentA = pageA.content.slice(0, maxContentLength);
  const contentB = pageB.content.slice(0, maxContentLength);

  const prompt = `Compare these two wiki pages about "${entityName}" for factual contradictions.

PAGE A: "${pageEntity(pageA)}"
${contentA}

PAGE B: "${pageEntity(pageB)}"
${contentB}

Do these pages contradict each other? Consider:
- Factual conflicts (alive vs dead, different dates, conflicting descriptions)
- Temporal conflicts (event order impossibilities)
- Location conflicts (entity in two places at once)
- Character trait conflicts (personality, abilities, relationships)
- Relationship conflicts (different relationships between entities)

If there are NO contradictions, respond with: NO_CONTRADICTION

If there ARE contradictions, respond with JSON only:
{
  "contradicts": true,
  "claimA": "the specific contradictory claim from page A",
  "claimB": "the conflicting claim from page B",
  "entity": "the entity these claims are about"
}`;

  try {
    const response = await generateText(prompt, {
      temperature: 0.1,
      num_ctx: 8192,
    });

    if (response.includes("NO_CONTRADICTION")) {
      return null;
    }

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.contradicts) {
      return {
        claimA: parsed.claimA || "Unknown claim from page A",
        claimB: parsed.claimB || "Unknown claim from page B",
        entity: parsed.entity || entityName,
      };
    }
  } catch {
    // LLM comparison failed — skip this pair
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main Lint Function
// ---------------------------------------------------------------------------

/**
 * Scan a wiki for health issues and return a structured report.
 *
 * Checks:
 * - Contradictions between pages about the same entity (LLM-powered)
 * - Stale claims (old drafts, missing timestamps, potentially outdated links)
 * - Orphan pages (no inbound AND no outbound wikilinks)
 * - Missing pages (wikilink targets that don't exist)
 * - Missing cross-references (suggestions for pages that should link to each other)
 *
 * @param wikiRoot - Absolute path to the wiki root directory
 * @param universeId - Optional universe filter; when provided, only pages with matching universe are checked
 * @returns Structured LintReport with all findings and suggestions
 */
export async function lintWiki(
  wikiRoot: string,
  universeId?: string,
): Promise<LintReport> {
  const report: LintReport = {
    contradictions: [],
    staleClaims: [],
    orphans: [],
    missingPages: [],
    suggestions: [],
  };

  // Load all pages
  const allPages = listWikiPages(wikiRoot);

  // Handle empty wiki gracefully
  if (allPages.length === 0) {
    report.suggestions.push("Wiki is empty — consider ingesting source material");
    return report;
  }

  // Filter by universeId when provided
  const pages = universeId
    ? allPages.filter(
        (p) =>
          (p.frontmatter.universe || "").toLowerCase() ===
          universeId.toLowerCase(),
      )
    : allPages;

  // If universe filter removes all pages, return empty report
  if (pages.length === 0) {
    report.suggestions.push(
      `No pages found for universe "${universeId}"`,
    );
    return report;
  }

  // -----------------------------------------------------------------------
  // 1. Missing Pages (broken wikilinks)
  // -----------------------------------------------------------------------
  const missingPageSet = new Set<string>();
  for (const page of pages) {
    const broken = validateWikilinks(page.content, pages, universeId);
    for (const link of broken) {
      const key = `${relativePath(wikiRoot, page.path)} -> ${link.name}`;
      if (!missingPageSet.has(key)) {
        missingPageSet.add(key);
        report.missingPages.push({
          sourcePage: relativePath(wikiRoot, page.path),
          missingTarget: link.name,
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // 2. Orphan Pages (no inbound AND no outbound wikilinks)
  // -----------------------------------------------------------------------
  report.orphans = findOrphans(wikiRoot);

  // -----------------------------------------------------------------------
  // 3. Stale Claims
  // -----------------------------------------------------------------------
  report.staleClaims = detectStaleClaims(pages, wikiRoot);

  // -----------------------------------------------------------------------
  // 4. Contradictions (LLM-powered)
  // -----------------------------------------------------------------------
  report.contradictions = await detectContradictions(pages, wikiRoot, universeId);

  // -----------------------------------------------------------------------
  // 5. Suggestions
  // -----------------------------------------------------------------------
  // Missing pages suggestions
  if (report.missingPages.length > 0) {
    const uniqueTargets = new Set(report.missingPages.map((m) => m.missingTarget));
    report.suggestions.push(
      `Create ${uniqueTargets.size} missing page(s): ${[...uniqueTargets].slice(0, 5).join(", ")}${uniqueTargets.size > 5 ? "..." : ""}`,
    );
  }

  // Orphan page suggestions
  if (report.orphans.length > 0) {
    report.suggestions.push(
      `${report.orphans.length} orphan page(s) found — add wikilinks to connect them to the knowledge graph`,
    );
  }

  // Contradiction suggestions
  if (report.contradictions.length > 0) {
    report.suggestions.push(
      `${report.contradictions.length} contradiction(s) detected — review and resolve conflicting claims`,
    );
  }

  // Stale claim suggestions
  if (report.staleClaims.length > 0) {
    report.suggestions.push(
      `${report.staleClaims.length} stale claim(s) found — review outdated or unverified content`,
    );
  }

  // Cross-reference suggestions: find pages about related entities that don't link to each other
  const crossRefSuggestions = findMissingCrossReferences(pages, wikiRoot);
  report.suggestions.push(...crossRefSuggestions);

  // General wiki health suggestions
  const draftCount = pages.filter(
    (p) => p.frontmatter.status === "draft",
  ).length;
  if (draftCount > pages.length * 0.5) {
    report.suggestions.push(
      `Over ${Math.round((draftCount / pages.length) * 100)}% of pages are in draft status — consider reviewing and promoting to "reviewed"`,
    );
  }

  const reviewedCount = pages.filter(
    (p) => p.frontmatter.status === "reviewed" || p.frontmatter.status === "locked",
  ).length;
  if (reviewedCount === 0 && pages.length > 0) {
    report.suggestions.push(
      "No pages have been reviewed or locked — establish a review workflow",
    );
  }

  return report;
}

/**
 * Find pages that should cross-reference each other but don't.
 * Looks for pages that share tags or reference the same entities.
 */
function findMissingCrossReferences(
  pages: WikiPage[],
  wikiRoot: string,
): string[] {
  const suggestions: string[] = [];

  // Group pages by tags
  const tagGroups = new Map<string, WikiPage[]>();
  for (const page of pages) {
    const tags = page.frontmatter.tags || [];
    for (const tag of tags) {
      const normalized = tag.toLowerCase();
      if (!tagGroups.has(normalized)) {
        tagGroups.set(normalized, []);
      }
      tagGroups.get(normalized)!.push(page);
    }
  }

  // For each tag group with 2+ pages, check if they cross-reference
  for (const [tag, group] of tagGroups) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const pageA = group[i];
        const pageB = group[j];

        // Check if pageA links to pageB
        const linksA = parseWikilinks(pageA.content);
        const linksToB = linksA.some(
          (l) =>
            l.name.toLowerCase().replace(/\s+/g, "-") ===
            pageEntity(pageB).toLowerCase().replace(/\s+/g, "-"),
        );

        // Check if pageB links to pageA
        const linksB = parseWikilinks(pageB.content);
        const linksToA = linksB.some(
          (l) =>
            l.name.toLowerCase().replace(/\s+/g, "-") ===
            pageEntity(pageA).toLowerCase().replace(/\s+/g, "-"),
        );

        if (!linksToA && !linksToB) {
          suggestions.push(
            `Consider adding cross-references between "${pageEntity(pageA)}" and "${pageEntity(pageB)}" (shared tag: "${tag}")`,
          );
        }
      }
    }
  }

  return suggestions.slice(0, 10); // Cap at 10 to avoid overwhelming reports
}
