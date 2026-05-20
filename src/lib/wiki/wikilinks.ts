import type { WikiPage, Wikilink, LinkGraph, CollisionInfo } from "./types";
export type { Wikilink, LinkGraph, CollisionInfo } from "./types";
import path from "path";

/**
 * Parse [[wikilinks]] from markdown content.
 * Handles: [[Page]], [[Page|alias]], ![[embed]]
 */
export function parseWikilinks(content: string): Wikilink[] {
  const links: Wikilink[] = [];
  // Match ![[embed]] and [[link]] and [[link|alias]]
  const regex = /(!?)\[\[([^\[\]]+?)(?:\|([^\[\]]+))?\]\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const isEmbed = match[1] === "!";
    const name = match[2].trim();
    const alias = match[3]?.trim();
    const start = Math.max(0, match.index - 40);
    const end = Math.min(content.length, match.index + match[0].length + 40);
    const context = content
      .slice(start, end)
      .replace(/\[\[|\]\]/g, "")
      .replace(/^!/, "");
    links.push({ name, alias, isEmbed, context });
  }
  return links;
}

/**
 * Resolve a wikilink name to a page path.
 * Case-insensitive. Prefers same-universe matches.
 * Returns null if not found.
 */
export function resolveWikilink(
  name: string,
  pages: WikiPage[],
  universeId?: string,
): string | null {
  // Normalize: trim, lowercase, convert whitespace to hyphens
  const normalizedName = name.trim().toLowerCase().replace(/\s+/g, "-");

  // Check for cross-universe format: Universe::Page or Universe :: Page
  let searchName = normalizedName;
  let targetUniverse: string | undefined;
  if (/::/.test(name)) {
    // Split on first :: with whitespace tolerance
    const parts = name.split("::").map((s) => s.trim());
    targetUniverse = parts[0].toLowerCase();
    searchName = parts.slice(1).join("::").toLowerCase().replace(/\s+/g, "-");
    // Skip empty universe prefix (treat as un-namespaced link)
    if (!targetUniverse) {
      targetUniverse = undefined;
    }
  }

  // Skip empty page names
  if (!searchName) return null;

  // First pass: exact match (prefer same/target universe)
  for (const page of pages) {
    const pageTitle = (page.frontmatter.title || "")
      .toLowerCase()
      .replace(/\s+/g, "-");
    const pageUniverse = page.frontmatter.universe?.toLowerCase();

    if (pageTitle === searchName) {
      if (targetUniverse && pageUniverse === targetUniverse) return page.path;
      if (!targetUniverse && (!universeId || pageUniverse === universeId?.toLowerCase()))
        return page.path;
    }
  }

  // Second pass: any exact match (fallback)
  for (const page of pages) {
    const pageTitle = (page.frontmatter.title || "")
      .toLowerCase()
      .replace(/\s+/g, "-");
    if (pageTitle === searchName) return page.path;
  }

  // Third pass: partial match (filename without .md extension)
  for (const page of pages) {
    const filename = path.basename(page.path, ".md").toLowerCase();
    if (filename === searchName) return page.path;
  }

  return null;
}

/**
 * Detect page title collisions across universes.
 * Returns an array of entries where the same page title exists in multiple universes.
 */
export function detectCollisions(
  pages: WikiPage[],
): Array<{ name: string; pages: string[] }> {
  const titleMap = new Map<
    string,
    Array<{ path: string; universe: string }>
  >();

  for (const page of pages) {
    const title = (page.frontmatter.title || path.basename(page.path, ".md"))
      .toLowerCase()
      .replace(/\s+/g, "-");
    const universe = (page.frontmatter.universe || "").toLowerCase();

    if (!titleMap.has(title)) {
      titleMap.set(title, []);
    }
    titleMap.get(title)!.push({ path: page.path, universe });
  }

  const collisions: Array<{ name: string; pages: string[] }> = [];

  for (const [name, entries] of titleMap) {
    if (entries.length < 2) continue;
    // Only flag as collision if entries span multiple distinct universes
    const universes = new Set(entries.map((e) => e.universe));
    if (universes.size >= 2) {
      collisions.push({
        name: entries[0].path, // use first page's path as identifier
        pages: entries.map((e) => e.path),
      });
    }
  }

  return collisions;
}

/**
 * Resolve a wikilink with full metadata about the resolution.
 * Returns whether the resolution crossed universes and whether the name collides.
 *
 * - Parses [[Universe::Page]] format
 * - Prefers same-universe matches when contextUniverse is provided
 * - Falls back to any-universe match
 */
export function resolveWithNamespace(
  name: string,
  pages: WikiPage[],
  contextUniverse?: string,
): { resolved: string | null; isCrossUniverse: boolean; collision: boolean } {
  const resolved = resolveWikilink(name, pages, contextUniverse);

  // Determine if this name has collisions across universes
  const normalizedName = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

  // Extract page name for collision check (strip universe prefix)
  const collisionCheckName = name.includes("::")
    ? name.split("::").slice(1).join("::").trim().toLowerCase().replace(/\s+/g, "-")
    : normalizedName;

  const matchingPages = pages.filter((page) => {
    const pageTitle = (page.frontmatter.title || "")
      .toLowerCase()
      .replace(/\s+/g, "-");
    return pageTitle === collisionCheckName;
  });
  const hasCollision =
    matchingPages.length > 1 &&
    new Set(matchingPages.map((p) => (p.frontmatter.universe || "").toLowerCase()))
      .size >= 2;

  // Determine if resolved page is in a different universe than context
  let isCrossUniverse = false;
  if (resolved && contextUniverse) {
    const resolvedPage = pages.find((p) => p.path === resolved);
    if (resolvedPage) {
      const resolvedUniverse = (
        resolvedPage.frontmatter.universe || ""
      ).toLowerCase();
      isCrossUniverse =
        resolvedUniverse !== "" &&
        resolvedUniverse !== contextUniverse.toLowerCase();
    }
  }

  return { resolved, isCrossUniverse, collision: hasCollision };
}

/**
 * Build a link graph from wiki pages.
 * Returns adjacency map: { sourcePath: [targetPaths] }
 */
export function buildLinkGraph(pages: WikiPage[]): LinkGraph {
  const nodes = new Map<string, string[]>();
  const edges: Array<{ source: string; target: string; linkType: string }> = [];
  const collisions = detectCollisions(pages);

  for (const page of pages) {
    const links = parseWikilinks(page.content);
    const targets: string[] = [];

    for (const link of links) {
      const resolved = resolveWikilink(
        link.name,
        pages,
        page.frontmatter.universe,
      );
      if (resolved) {
        targets.push(resolved);
        edges.push({
          source: page.path,
          target: resolved,
          linkType: link.isEmbed ? "embed" : "link",
        });
      }
    }

    nodes.set(page.path, targets);
  }

  return { nodes, edges, collisions };
}

/**
 * Validate wikilinks in a page.
 * Returns array of broken links (target doesn't exist).
 */
export function validateWikilinks(
  content: string,
  pages: WikiPage[],
  universeId?: string,
): Array<{ name: string; context: string }> {
  const links = parseWikilinks(content);
  const broken: Array<{ name: string; context: string }> = [];

  for (const link of links) {
    if (link.isEmbed) continue; // Skip embeds for now
    const resolved = resolveWikilink(link.name, pages, universeId);
    if (!resolved) {
      broken.push({ name: link.name, context: link.context });
    }
  }

  return broken;
}
