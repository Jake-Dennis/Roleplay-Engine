/**
 * Page size limits and split-into-subpages logic for wiki pages.
 *
 * Provides:
 * - `checkPageSize()` — check a page's size against configurable limits
 * - `suggestSplit()` — analyze a page's H2 headings to suggest subpage structure
 *
 * Max page size defaults to 10,000 characters and can be overridden
 * via the `WIKI_MAX_PAGE_SIZE` environment variable.
 * A warning banner is shown at 80% of the limit.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Maximum characters allowed for a single wiki page before suggesting a split.
 * Override via NEXT_PUBLIC_WIKI_MAX_PAGE_SIZE or WIKI_MAX_PAGE_SIZE env var.
 */
function resolveMaxPageSize(): number {
  if (typeof process !== "undefined") {
    const envVal =
      process.env.NEXT_PUBLIC_WIKI_MAX_PAGE_SIZE ??
      process.env.WIKI_MAX_PAGE_SIZE;
    if (envVal) {
      const parsed = parseInt(envVal, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }
  return 10000;
}

/** Fraction of max size at which to show a warning (default 80%). */
export const WARNING_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageSizeInfo {
  /** Current content length in characters. */
  size: number;
  /** Maximum allowed characters before over-limit. */
  max: number;
  /** True when size > max. */
  overLimit: boolean;
  /** True when size >= max * WARNING_THRESHOLD but still within limit. */
  warning: boolean;
}

export interface SuggestedSubpage {
  /** Safe filename (e.g. "my_heading.md"). */
  filename: string;
  /** Human-readable title (the heading text). */
  title: string;
  /** The content that would go into this subpage. */
  content: string;
}

export interface SplitSuggestion {
  /** List of suggested subpages derived from H2 sections. */
  subpages: SuggestedSubpage[];
  /** The original full content of the page (preserved unchanged). */
  originalContent: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a heading into a safe wiki filename fragment.
 * Strips non-alphanumeric characters, replaces spaces with underscores,
 * lowercases, and truncates to 80 chars.
 */
function headingToFilename(heading: string, extension = ".md"): string {
  let safe = heading
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 80)
    .replace(/[.\s]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-");
  if (!safe) safe = `section_${Date.now()}`;
  return `${safe}${extension}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check a page's content size against the configured limit.
 *
 * @param content - The raw markdown body content (no frontmatter).
 * @returns A {@link PageSizeInfo} object with size, max, and status flags.
 */
export function checkPageSize(content: string): PageSizeInfo {
  const max = resolveMaxPageSize();
  const size = content.length;
  return {
    size,
    max,
    overLimit: size > max,
    warning: size >= max * WARNING_THRESHOLD && size <= max,
  };
}

/**
 * Analyze a page's content by H2 (`## `) headings and suggest a split into
 * subpages. Each H2 section becomes a candidate subpage, with a "preamble"
 * section for content before the first H2.
 *
 * Callers SHOULD NOT auto-split — present the suggestion to the user first.
 *
 * @param pagePath - The full path of the current page (used for context, not modified).
 * @param content  - The raw markdown body content (no frontmatter).
 * @returns A {@link SplitSuggestion} with subpage candidates and the original content.
 */
export function suggestSplit(
  pagePath: string,
  content: string,
): SplitSuggestion {
  const subpages: SuggestedSubpage[] = [];

  // Split content by H2 headings (## ...)
  // Regex matches lines starting with "## " (after optional leading whitespace).
  const sections = content.split(/^## /m);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section.trim()) continue;

    const lines = section.split("\n");
    const headingLine = lines[0]?.trim();

    if (i === 0) {
      // Preamble — content before the first H2
      if (section.trim()) {
        subpages.push({
          filename: headingToFilename("introduction"),
          title: "Introduction",
          content: section.trim(),
        });
      }
      continue;
    }

    // For subsequent sections, the first line is the heading text
    if (headingLine) {
      // Remove leading `#` from heading text if the regex didn't catch it cleanly
      const cleanTitle = headingLine.replace(/^#+\s*/, "").trim();
      const body = lines.slice(1).join("\n").trim();

      subpages.push({
        filename: headingToFilename(cleanTitle),
        title: cleanTitle,
        content: body,
      });
    }
  }

  return {
    subpages,
    originalContent: content,
  };
}
