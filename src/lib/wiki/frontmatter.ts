import matter from "gray-matter";

/**
 * Re-export the canonical wiki frontmatter type from `types.ts` so consumers
 * can import everything they need from this module without duplicating the
 * schema. `WikiFrontmatter` is the single source of truth for the frontmatter
 * shape across the wiki subsystem.
 */
export type { WikiFrontmatter } from "./types";
import type { WikiFrontmatter } from "./types";

/**
 * Default frontmatter used when a page has no frontmatter block.
 * Provides safe placeholder values for the three required fields.
 */
export const EMPTY_FRONTMATTER: WikiFrontmatter = {
  title: "Untitled",
  type: "concept",
  status: "draft",
};

const VALID_TYPES: ReadonlyArray<WikiFrontmatter["type"]> = [
  "entity",
  "concept",
  "source",
  "synthesis",
];

const VALID_STATUSES: ReadonlyArray<WikiFrontmatter["status"]> = [
  "draft",
  "reviewed",
  "locked",
  "rejected",
];

/**
 * Parse raw markdown into frontmatter and body.
 *
 * Uses `gray-matter` to split the YAML frontmatter block from the body. If
 * the input has no leading `---` block, returns a copy of
 * {@link EMPTY_FRONTMATTER} and the trimmed input as the body. A `tags`
 * field provided as a single string is coerced into a one-element array.
 *
 * @param raw - Raw markdown text, with or without a leading frontmatter block
 * @returns Object with parsed frontmatter and trimmed body content
 */
export function parseWikiFrontmatter(
  raw: string
): { frontmatter: WikiFrontmatter; body: string } {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: { ...EMPTY_FRONTMATTER }, body: trimmed };
  }

  const parsed = matter(raw);
  const data = parsed.data as WikiFrontmatter;

  if (typeof data.tags === "string") {
    data.tags = [data.tags];
  }

  return { frontmatter: data, body: parsed.content.trim() };
}

/**
 * Serialize body content and frontmatter into a raw markdown string.
 *
 * Uses `gray-matter.stringify` to assemble the `---\n...\n---\n<body>`
 * structure. The result is trimmed of leading and trailing whitespace.
 *
 * @param body - Markdown body content (no frontmatter)
 * @param frontmatter - Frontmatter fields to serialize as a YAML block
 * @returns Raw markdown string with frontmatter prepended to the body
 */
export function serializeWikiFrontmatter(
  body: string,
  frontmatter: WikiFrontmatter
): string {
  return matter.stringify(body, frontmatter).trim();
}

/**
 * Validate frontmatter against the wiki schema.
 *
 * Returns a list of human-readable error messages describing each problem.
 * An empty array means the frontmatter is valid.
 *
 * Checks performed:
 * - `title` is a non-empty string
 * - `type` is one of: entity, concept, source, synthesis
 * - `status` is one of: draft, reviewed, locked, rejected
 *
 * @param fm - Frontmatter to validate
 * @returns Array of error messages (empty if valid)
 */
export function validateWikiFrontmatter(fm: WikiFrontmatter): string[] {
  const errors: string[] = [];

  if (typeof fm.title !== "string" || fm.title.trim() === "") {
    errors.push("title is required and must be a non-empty string");
  }

  if (!VALID_TYPES.includes(fm.type)) {
    errors.push(
      `type is required and must be one of: ${VALID_TYPES.join(", ")}`
    );
  }

  if (!VALID_STATUSES.includes(fm.status)) {
    errors.push(
      `status is required and must be one of: ${VALID_STATUSES.join(", ")}`
    );
  }

  return errors;
}
