/**
 * Wiki Page Curation
 *
 * Auto-tags, auto-categorizes, and auto-links wiki pages using the LLM.
 * Used by the wiki_curate_page job handler to process draft pages.
 */

import { readWikiPage, writeWikiPage, listWikiPages } from "./file-io";
import { getWikiRoot } from "./wiki-root";
import { generateText } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";
import { safeParseWarn } from "@/lib/safe-json";
import type { WikiFrontmatter } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CurateResult {
  tagsAdded: string[];
  wikilinksAdded: number;
  typeVerified: boolean;
  errors: string[];
}

interface CurateSuggestion {
  suggestedTags: string[];
  suggestedWikilinks: string[];
  typeCorrect: boolean;
  suggestedType: string;
  suggestedSubtype: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_TYPES = ["entity", "concept", "source", "synthesis"] as const;

const VALID_SUBTYPES = [
  "character", "location", "item", "faction", "organization", "creature",
  "theme", "rule", "mechanic", "lore", "event", "tradition",
] as const;

// ---------------------------------------------------------------------------
// Curation
// ---------------------------------------------------------------------------

/**
 * Curate a single wiki page: suggest tags, wikilinks, and verify type.
 *
 * Reads the page at `pagePath`, calls the LLM for suggestions, then applies
 * non-destructive updates (adds tags, adds wikilinks as an appendix, corrects
 * type/subtype if the suggestion is confident).
 *
 * @param userId - Owner of the wiki root
 * @param universeId - Universe scope (optional)
 * @param pagePath - Absolute path to the wiki page file
 * @returns CurateResult with stats
 */
export async function curatePage(
  userId: string,
  universeId: string | null,
  pagePath: string
): Promise<CurateResult> {
  const errors: string[] = [];
  const tagsAdded: string[] = [];
  let wikilinksAdded = 0;
  let typeVerified = false;

  try {
    // 1. Read the page
    const page = readWikiPage(pagePath);
    const { title, type, subtype } = page.frontmatter;

    // 2. Collect existing wiki page titles for link suggestions
    const wikiRoot = getWikiRoot(userId, universeId || undefined);
    const allPages = listWikiPages(wikiRoot);
    const existingTitles = allPages
      .filter((p) => p.path !== pagePath)
      .map((p) => p.frontmatter.title)
      .filter(Boolean);

    // 3. Call LLM for curation suggestions
    const prompt = PROMPTS.wikiCuratePage(
      title,
      type,
      subtype,
      page.content.slice(0, 3000), // Truncate to avoid context overflow
      existingTitles.join(", ")
    );

    const raw = await generateText(prompt, { userId }, 30000);

    // 4. Parse the LLM response
    const suggestion = safeParseWarn<CurateSuggestion>(raw, "wiki curate page");
    if (!suggestion) {
      errors.push("Failed to parse LLM curation response");
      return { tagsAdded: [], wikilinksAdded: 0, typeVerified: false, errors };
    }

    // 5. Apply tags (add new ones, avoid duplicates)
    const existingTags = new Set((page.frontmatter.tags || []).map((t: string) => t.toLowerCase()));
    const newTags: string[] = [];

    if (Array.isArray(suggestion.suggestedTags)) {
      for (const tag of suggestion.suggestedTags) {
        const normalized = tag.toLowerCase().trim();
        if (normalized && !existingTags.has(normalized)) {
          newTags.push(tag.trim());
          existingTags.add(normalized);
        }
      }
    }

    // 6. Build the new frontmatter
    const updatedFrontmatter: WikiFrontmatter = {
      ...page.frontmatter,
      tags: [...(page.frontmatter.tags || []), ...newTags],
    };

    // 7. Verify/correct type if the suggestion is confident
    if (
      typeof suggestion.typeCorrect === "boolean" &&
      !suggestion.typeCorrect &&
      VALID_TYPES.includes(suggestion.suggestedType as typeof VALID_TYPES[number])
    ) {
      updatedFrontmatter.type = suggestion.suggestedType;
      typeVerified = false; // Changed, not verified
    } else {
      typeVerified = true; // Type is correct
    }

    // 8. Update subtype if suggested and valid
    if (
      suggestion.suggestedSubtype &&
      VALID_SUBTYPES.includes(suggestion.suggestedSubtype as typeof VALID_SUBTYPES[number])
    ) {
      updatedFrontmatter.subtype = suggestion.suggestedSubtype as typeof VALID_SUBTYPES[number];
    }

    // 9. Build wikilinks appendix (links to other wiki pages)
    let updatedContent = page.content;
    if (Array.isArray(suggestion.suggestedWikilinks) && suggestion.suggestedWikilinks.length > 0) {
      // Only add links that reference actual existing pages
      const titleSet = new Set(existingTitles.map((t: string) => t.toLowerCase()));
      const validLinks = suggestion.suggestedWikilinks.filter((link: string) => {
        // Check if this title exists as a wiki page
        const normalized = link.toLowerCase().trim();
        return titleSet.has(normalized) || existingTitles.some(
          (t: string) => t.toLowerCase() === normalized
        );
      });

      if (validLinks.length > 0) {
        // Check which links are already in the content
        const contentLower = page.content.toLowerCase();
        const newLinks = validLinks.filter(
          (link: string) => !contentLower.includes(`[[${link}]]`) && !contentLower.includes(`[[${link.toLowerCase()}]]`)
        );

        if (newLinks.length > 0) {
          const linkSection = [
            "",
            "## Related",
            ...newLinks.map((link: string) => `- [[${link}]]`),
          ].join("\n");

          updatedContent = page.content + linkSection;
          wikilinksAdded = newLinks.length;
        }
      }
    }

    // 10. Write the updated page back
    writeWikiPage(pagePath, updatedContent, updatedFrontmatter);

    tagsAdded.push(...newTags);

    return {
      tagsAdded,
      wikilinksAdded,
      typeVerified,
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    return { tagsAdded: [], wikilinksAdded: 0, typeVerified: false, errors };
  }
}
