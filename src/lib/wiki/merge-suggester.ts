import { listWikiPages } from "./file-io";
import { parseWikilinks } from "./wikilinks";
import { readFileSync } from "fs";
import type { WikiPage } from "./types";

export interface MergeCandidate {
  pageA: string;
  pageB: string;
  confidence: number;
  reason: string;
  strategy: "A" | "B" | "C";
}

export interface MergeSearchOptions {
  strategy: "A" | "B" | "C";
  limit: number;
}

/**
 * Find pages that might be duplicates.
 *
 * Strategy A (cheap): Same title, different paths.
 * Strategy B (medium): High wikilink overlap (>= 80% Jaccard).
 * Strategy C (expensive): LLM analysis of top candidates.
 */
export function findMergeCandidates(
  wikiRoot: string,
  options?: Partial<MergeSearchOptions>,
): MergeCandidate[] {
  const opts: MergeSearchOptions = {
    strategy: options?.strategy || "A",
    limit: options?.limit || 20,
  };

  const pages = listWikiPages(wikiRoot, { includeDormant: true });
  const candidates: MergeCandidate[] = [];

  switch (opts.strategy) {
    case "A":
      return strategyA(pages, opts.limit);
    case "B":
      return strategyB(pages, opts.limit);
    case "C": {
      // Strategy C first runs B with a higher limit, then LLM-reranks
      const bCandidates = strategyB(pages, 50);
      return strategyC(bCandidates, opts.limit);
    }
  }
}

/**
 * Strategy A: Find pages with the exact same title.
 *
 * Groups pages by their lowercase title and returns pairs within each group.
 * Confidence is set to 0.95 since the same title is a very strong signal,
 * but not 1.0 (ambiguous titles could be intentional, e.g. two different
 * "Council" pages about different councils).
 */
function strategyA(pages: WikiPage[], limit: number): MergeCandidate[] {
  const byTitle = new Map<string, WikiPage[]>();
  for (const page of pages) {
    const key = page.frontmatter.title?.toLowerCase().trim();
    if (!key) continue;
    const list = byTitle.get(key) || [];
    list.push(page);
    byTitle.set(key, list);
  }

  const result: MergeCandidate[] = [];
  for (const [, sameTitle] of byTitle) {
    if (sameTitle.length < 2) continue;
    // Generate all pairs
    for (let i = 0; i < sameTitle.length && result.length < limit; i++) {
      for (let j = i + 1; j < sameTitle.length && result.length < limit; j++) {
        result.push({
          pageA: sameTitle[i].path,
          pageB: sameTitle[j].path,
          confidence: 0.95,
          reason: `Same title: "${sameTitle[i].frontmatter.title}"`,
          strategy: "A",
        });
      }
    }
  }
  return result.slice(0, limit);
}

/**
 * Strategy B: Find pages with high wikilink overlap.
 *
 * For each page, computes the set of wikilink targets (lowercase).
 * Then compares all pairs using Jaccard similarity:
 *   J(A, B) = |A ∩ B| / |A ∪ B|
 *
 * Pairs with Jaccard >= 0.8 are returned as merge candidates.
 */
function strategyB(pages: WikiPage[], limit: number): MergeCandidate[] {
  // For each page, compute its wikilink signature (sorted set of targets)
  const signatures = new Map<string, Set<string>>();
  for (const page of pages) {
    try {
      const content = readFileSync(page.path, "utf-8");
      const links = parseWikilinks(content);
      const targets = new Set(
        links.map((l) => l.name.toLowerCase().trim()).filter(Boolean),
      );
      signatures.set(page.path, targets);
    } catch {
      // Skip unreadable files
    }
  }

  // Compare all pairs using Jaccard similarity
  const entries = [...signatures.entries()];
  const result: MergeCandidate[] = [];

  for (let i = 0; i < entries.length && result.length < limit; i++) {
    const [pathA, sigA] = entries[i];
    if (sigA.size === 0) continue;

    for (let j = i + 1; j < entries.length && result.length < limit; j++) {
      const [pathB, sigB] = entries[j];
      if (sigB.size === 0) continue;

      // Jaccard = |intersection| / |union|
      const intersection = new Set([...sigA].filter((x) => sigB.has(x)));
      const union = new Set([...sigA, ...sigB]);
      const jaccard = intersection.size / union.size;

      if (jaccard >= 0.8) {
        result.push({
          pageA: pathA,
          pageB: pathB,
          confidence: Math.round(jaccard * 100) / 100,
          reason: `${Math.round(jaccard * 100)}% wikilink overlap (${intersection.size}/${union.size} shared links)`,
          strategy: "B",
        });
      }
    }
  }

  return result.slice(0, limit);
}

/**
 * Strategy C: LLM-assisted analysis of top candidates.
 *
 * Currently a stub that returns the top candidates from Strategy B.
 * When an LLM backend is available, this would pass each candidate pair
 * to the LLM with a prompt like:
 *
 * ```
 * Are these two wiki pages about the same topic? Answer only YES or NO.
 *
 * Page A: <title>
 * <first 300 chars of content>
 *
 * Page B: <title>
 * <first 300 chars of content>
 * ```
 *
 * Only pairs confirmed as duplicates by the LLM would be returned.
 */
function strategyC(
  preliminary: MergeCandidate[],
  limit: number,
): MergeCandidate[] {
  // For now, just return the top N from B results
  // LLM integration can be added later
  return preliminary.slice(0, limit);
}
