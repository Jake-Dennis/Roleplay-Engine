/**
 * Centralized type definitions for the wiki subsystem.
 *
 * All wiki data structures are defined here to eliminate Record<string, any>
 * and provide consistent typing across the subsystem.
 */

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

/**
 * Frontmatter fields for wiki markdown pages.
 * Follows WIKI_SCHEMA.md conventions.
 *
 * The index signature allows additional fields beyond the known schema,
 * enabling compatibility with components that expect Record<string, unknown>.
 */
export interface WikiFrontmatter {
  title: string;
  type: "entity" | "concept" | "source" | "synthesis";
  status: "draft" | "reviewed" | "locked" | "rejected";
  universe?: string;
  tags?: string[];
  created?: string | Date;
  updated?: string | Date;
  /** Reason for rejection (set when status is "rejected"). */
  rejection_reason?: string;
  /** ISO timestamp when the page was rejected. */
  rejected_at?: string;
  /** ID of the persona this page was auto-created from. */
  persona_id?: string;
  /** Source identifier for auto-generated pages (e.g. "persona", "universe"). */
  source?: string;
  /**
   * Sub-type classification for finer-grained browsing.
   *
   * Entity sub-types: character, location, item, faction, organization, creature
   * Concept sub-types: theme, rule, mechanic, lore, event, tradition
   */
  subtype?:
    | "character" | "location" | "item" | "faction" | "organization" | "creature"
    | "theme" | "rule" | "mechanic" | "lore" | "event" | "tradition";
  /** Additional frontmatter fields beyond the known schema. */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/**
 * Represents a wiki page with its frontmatter and body content.
 */
export interface WikiPage {
  path: string;
  content: string;
  frontmatter: WikiFrontmatter;
}

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

/**
 * A snapshot revision of a wiki page, stored as JSON.
 */
export interface WikiRevision {
  id: string;
  timestamp: string;
  content: string;
  frontmatter: WikiFrontmatter;
  lastModified: string;
}

// ---------------------------------------------------------------------------
// Query
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

// ---------------------------------------------------------------------------
// Wikilinks
// ---------------------------------------------------------------------------

/**
 * A parsed wikilink from markdown content.
 */
export interface Wikilink {
  name: string;
  alias?: string;
  isEmbed: boolean;
  context: string;
}

/**
 * Graph of wiki page connections.
 */
export interface LinkGraph {
  nodes: Map<string, string[]>; // pagePath -> [targetPagePaths]
  edges: Array<{ source: string; target: string; linkType: string }>;
  collisions: Array<{ name: string; pages: string[] }>; // duplicate titles across universes
}

/**
 * Information about a page title collision across universes.
 */
export interface CollisionInfo {
  name: string;
  pages: string[];
}

// ---------------------------------------------------------------------------
// Write Options & Errors
// ---------------------------------------------------------------------------

/**
 * Options for writeWikiPage conflict detection.
 */
export interface WriteWikiPageOptions {
  /**
   * If provided, compare with existing file's `updated` field.
   * A mismatch indicates a concurrent edit conflict.
   */
  expectedLastModified?: string;
  /**
   * How to handle conflicts.
   * - "fail" (default): throw ConflictError
   * - "save-diff": save a diff file to _review/conflicts/ and continue
   */
  onConflict?: "fail" | "save-diff";
}

/**
 * Error thrown when a concurrent edit conflict is detected.
 */
export class ConflictError extends Error {
  public readonly filePath: string;
  public readonly existingLastModified: string;
  public readonly expectedLastModified: string;
  public readonly diff: string;

  constructor(
    filePath: string,
    existingLastModified: string,
    expectedLastModified: string,
    diff: string
  ) {
    super(
      `Concurrent edit conflict on "${filePath}": ` +
        `expected updated=${expectedLastModified}, ` +
        `but file has updated=${existingLastModified}`
    );
    this.name = "ConflictError";
    this.filePath = filePath;
    this.existingLastModified = existingLastModified;
    this.expectedLastModified = expectedLastModified;
    this.diff = diff;
  }
}
