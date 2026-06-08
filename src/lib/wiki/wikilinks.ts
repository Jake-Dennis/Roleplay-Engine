import type { WikiPage, Wikilink, LinkGraph } from "./types";
export type { Wikilink, LinkGraph, CollisionInfo } from "./types";
import path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of a wikilink resolution, including redirect metadata.
 * When a wikilink target has `superseded_by`, the resolver follows the
 * redirect one hop and reports the original name via `redirectedFrom`.
 */
export interface WikilinkResolution {
  /** Absolute path of the resolved (or redirected) page. */
  path: string;
  /** Title of the resolved (or redirected) page. */
  title: string;
  /**
   * If a redirect was followed (via `superseded_by`), this is the name
   * that was originally linked to. Absent if no redirect occurred.
   */
  redirectedFrom?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Follow a `superseded_by` redirect (one hop only).
 *
 * If `page` has `superseded_by` set, this finds the target page in `pages`
 * by matching the relative path. Returns the target page's absolute path if
 * found, otherwise returns the original `path`.
 *
 * Only follows ONE hop — chains (A → B → C) are not supported.
 */
function followSupersededRedirect(path: string, pages: WikiPage[]): string {
  const page = pages.find((p) => p.path === path);
  if (!page) return path;

  const supersededBy = page.frontmatter.superseded_by;
  if (!supersededBy) return path;

  const normalizedTarget = (supersededBy as string).replace(/\\/g, "/");
  const redirectPage = pages.find((p) => {
    const normalizedPath = p.path.replace(/\\/g, "/");
    return normalizedPath.endsWith("/" + normalizedTarget);
  });

  return redirectPage ? redirectPage.path : path;
}

/**
 * Core 3-pass wikilink resolution (without following superseded_by redirects).
 *
 * Pass 1: exact title match, prefer same/target universe
 * Pass 2: exact title match, any universe
 * Pass 3: filename match (without .md extension)
 */
function resolveWikilinkWithoutRedirect(
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
    const parts = name.split("::").map((s) => s.trim());
    targetUniverse = parts[0].toLowerCase();
    searchName = parts.slice(1).join("::").toLowerCase().replace(/\s+/g, "-");
    if (!targetUniverse) {
      targetUniverse = undefined;
    }
  }

  // Skip empty page names
  if (!searchName) return null;

  // Pass 1: exact match (prefer same/target universe)
  for (const page of pages) {
    const pageTitle = (page.frontmatter.title || "")
      .toLowerCase()
      .replace(/\s+/g, "-");
    const pageUniverse = page.frontmatter.universe?.toLowerCase();

    if (pageTitle === searchName) {
      if (targetUniverse && pageUniverse === targetUniverse) return page.path;
      if (
        !targetUniverse &&
        (!universeId || pageUniverse === universeId?.toLowerCase())
      )
        return page.path;
    }
  }

  // Pass 2: any exact match (fallback)
  for (const page of pages) {
    const pageTitle = (page.frontmatter.title || "")
      .toLowerCase()
      .replace(/\s+/g, "-");
    if (pageTitle === searchName) return page.path;
  }

  // Pass 3: partial match (filename without .md extension)
  for (const page of pages) {
    const filename = path.basename(page.path, ".md").toLowerCase();
    if (filename === searchName) return page.path;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Resolver exports
// ---------------------------------------------------------------------------

/**
 * Resolve a wikilink name to a page path.
 * Case-insensitive. Prefers same-universe matches.
 * If the resolved page has `superseded_by`, follows the redirect one hop.
 * Returns null if not found.
 */
export function resolveWikilink(
  name: string,
  pages: WikiPage[],
  universeId?: string,
): string | null {
  const resolved = resolveWikilinkWithoutRedirect(name, pages, universeId);
  if (!resolved) return null;
  return followSupersededRedirect(resolved, pages);
}

/**
 * Resolve a wikilink name with full redirect metadata.
 *
 * Unlike `resolveWikilink` (which returns just a path), this returns an
 * object with `path`, `title`, and optionally `redirectedFrom` when a
 * superseded_by redirect was followed.
 *
 * Returns null if the link cannot be resolved.
 */
export function resolveWikilinkWithRedirect(
  name: string,
  pages: WikiPage[],
  universeId?: string,
): WikilinkResolution | null {
  // First, find the direct target (without following redirects)
  const directPath = resolveWikilinkWithoutRedirect(name, pages, universeId);
  if (!directPath) return null;

  const directPage = pages.find((p) => p.path === directPath);
  if (!directPage) return null;

  // Check if this page has a superseded_by redirect
  const supersededBy = directPage.frontmatter.superseded_by;
  if (supersededBy) {
    const normalizedTarget = (supersededBy as string).replace(/\\/g, "/");
    const redirectPage = pages.find((p) => {
      const normalizedPath = p.path.replace(/\\/g, "/");
      return normalizedPath.endsWith("/" + normalizedTarget);
    });

    if (redirectPage) {
      return {
        path: redirectPage.path,
        title: redirectPage.frontmatter.title,
        redirectedFrom: directPage.frontmatter.title || name,
      };
    }
  }

  // No redirect — return direct resolution
  return {
    path: directPath,
    title: directPage.frontmatter.title,
  };
}

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
 * Detect page title collisions across universes.
 * Returns an array of entries where the same page title exists in multiple universes.
 *
 * Superseded pages (those with `superseded_by` pointing to another page in the
 * same collision group) are excluded from collision detection. This prevents
 * merged/dormant pages from causing false-positive collisions with their
 * replacements.
 */
export function detectCollisions(
  pages: WikiPage[],
): Array<{ name: string; pages: string[] }> {
  const titleMap = new Map<
    string,
    Array<{ path: string; universe: string; page: WikiPage }>
  >();

  for (const page of pages) {
    const title = (page.frontmatter.title || path.basename(page.path, ".md"))
      .toLowerCase()
      .replace(/\s+/g, "-");
    const universe = (page.frontmatter.universe || "").toLowerCase();

    if (!titleMap.has(title)) {
      titleMap.set(title, []);
    }
    titleMap.get(title)!.push({ path: page.path, universe, page });
  }

  const collisions: Array<{ name: string; pages: string[] }> = [];

  for (const [, entries] of titleMap) {
    if (entries.length < 2) continue;

    // Filter out entries whose page is superseded by another entry in the same
    // title group (e.g. a dormant page pointing to its active replacement).
    const activeEntries = entries.filter((entry) => {
      const supersededBy = entry.page.frontmatter.superseded_by;
      if (!supersededBy) return true;
      const normalizedTarget = (supersededBy as string).replace(/\\/g, "/");
      // This entry is superseded if another entry in the group matches the target
      return !entries.some((other) => {
        if (other.path === entry.path) return false;
        const normalizedPath = other.path.replace(/\\/g, "/");
        return normalizedPath.endsWith("/" + normalizedTarget);
      });
    });

    if (activeEntries.length < 2) continue;

    // Only flag as collision if entries span multiple distinct universes
    const universes = new Set(activeEntries.map((e) => e.universe));
    if (universes.size >= 2) {
      collisions.push({
        name: activeEntries[0].path, // use first page's path as identifier
        pages: activeEntries.map((e) => e.path),
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

/**
 * Rewrite wikilinks in content when a page is moved between folders.
 *
 * Only path-based links (`[[oldFolder/PageName]]`) are rewritten; namespace
 * links (`[[Universe::Page]]`) and bare-name links (`[[PageName]]`) are left
 * unchanged because they don't reference the folder. The rewrite only fires
 * when the page-name portion matches the moved page's title or filename
 * (case-insensitive) to avoid rewriting links to other pages in the same
 * folder.
 *
 * @returns Updated content, or the original content if no rewrites occurred.
 */
export function rewriteLinksForPageMove(
  content: string,
  oldFolder: string,
  newFolder: string,
  pageTitle: string,
  pageFilenameNoExt: string,
): string {
  if (oldFolder === newFolder) return content;
  if (!oldFolder || !newFolder) return content;

  const oldLower = oldFolder.toLowerCase();
  const titleLower = pageTitle.toLowerCase().trim();
  const filenameLower = pageFilenameNoExt.toLowerCase().trim();
  const pathPrefix = oldLower + "/";

  return content.replace(
    /(!?)\[\[([^\[\]]+?)(?:\|([^\[\]]+))?\]\]/g,
    (match, bang, target, alias) => {
      const targetLower = target.toLowerCase().trim();
      if (!targetLower.startsWith(pathPrefix)) return match;

      const rest = target.slice(oldFolder.length + 1);
      const restLower = rest.toLowerCase().trim();

      if (restLower !== titleLower && restLower !== filenameLower) {
        return match;
      }

      const newTarget = `${newFolder}/${rest}`;
      const aliasPart = alias !== undefined ? `|${alias}` : "";
      return `${bang}[[${newTarget}${aliasPart}]]`;
    },
  );
}
