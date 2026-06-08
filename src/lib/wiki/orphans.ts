import { listWikiPages, WikiPage } from "./file-io";
import { buildLinkGraph } from "./wikilinks";
import path from "path";

/**
 * Find orphan pages: pages with no inbound AND no outbound wikilinks.
 * Returns relative paths from wikiRoot.
 *
 * A page is an orphan only when BOTH conditions hold:
 * - No other page links TO it (no inbound)
 * - It links TO no other page (no outbound)
 *
 * Pages with `status: "dormant"` are excluded from orphan detection
 * (they are intentionally inactive, not orphaned), but their wikilinks
 * are still counted toward other pages' inbound/outbound analysis.
 */
export function findOrphans(wikiRoot: string): string[] {
  // Include dormant pages for complete link graph analysis so their
  // links are counted toward other pages' orphan status.
  const allPages = listWikiPages(wikiRoot, { includeDormant: true });
  const linkGraph = buildLinkGraph(allPages);

  // Build set of all targets (inbound links)
  const inboundTargets = new Set<string>();
  for (const [, targets] of linkGraph.nodes) {
    for (const target of targets) {
      inboundTargets.add(target);
    }
  }

  const orphans: string[] = [];
  for (const page of allPages) {
    // Skip dormant pages — they are intentionally inactive
    if (page.frontmatter.status === "dormant") continue;

    const pagePath = page.path;
    const outbound = linkGraph.nodes.get(pagePath) || [];
    const hasOutbound = outbound.length > 0;
    const hasInbound = inboundTargets.has(pagePath);

    // Orphan: no inbound AND no outbound
    if (!hasInbound && !hasOutbound) {
      orphans.push(path.relative(wikiRoot, pagePath));
    }
  }

  return orphans;
}

/**
 * Given a list of orphan paths and all wiki pages, suggest related pages
 * to link to based on shared tags/topics.
 *
 * Returns a Map where each orphan path maps to an array of suggested page paths
 * that share tags with the orphan page.
 */
export function getOrphanSuggestions(
  orphans: string[],
  pages: WikiPage[],
): Map<string, string[]> {
  const suggestions = new Map<string, string[]>();

  // Build tag index: tag -> absolute page paths
  const tagIndex = new Map<string, string[]>();
  for (const page of pages) {
    const tags = page.frontmatter.tags;
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        if (!tagIndex.has(tag)) tagIndex.set(tag, []);
        tagIndex.get(tag)!.push(page.path);
      }
    }
  }

  for (const orphan of orphans) {
    const orphanPage = pages.find(
      (p) => p.path.endsWith(orphan) || p.path === orphan,
    );
    if (!orphanPage) continue;

    const orphanTags: string[] = Array.isArray(orphanPage.frontmatter.tags)
      ? orphanPage.frontmatter.tags
      : [];
    const related = new Set<string>();

    for (const tag of orphanTags) {
      const taggedPages = tagIndex.get(tag) || [];
      for (const taggedPath of taggedPages) {
        if (taggedPath !== orphanPage.path) {
          related.add(taggedPath);
        }
      }
    }

    if (related.size > 0) {
      suggestions.set(orphan, Array.from(related));
    }
  }

  return suggestions;
}
