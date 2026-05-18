import matter from "gray-matter";
import fs from "fs";
import path from "path";

/**
 * Represents a wiki page with its frontmatter and body content.
 */
export interface WikiPage {
  path: string;
  content: string;
  frontmatter: Record<string, any>;
}

/**
 * Frontmatter fields for wiki markdown pages.
 * Follows WIKI_SCHEMA.md conventions.
 */
export interface WikiFrontmatter {
  title: string;
  type: "entity" | "concept" | "source" | "synthesis";
  status: "draft" | "reviewed" | "locked" | "rejected";
  universe?: string;
  tags?: string[];
  created?: string;
  updated?: string;
}

/**
 * The wiki folders scanned by listWikiPages.
 */
const SCAN_FOLDERS = ["entities", "concepts", "sources", "synthesis", "_review"];

// ---------------------------------------------------------------------------
// File Locking
// ---------------------------------------------------------------------------

/**
 * In-memory file lock map for single-process concurrency.
 * Sufficient for Next.js server-rendered pages where writes are sequential.
 */
const fileLocks = new Map<string, boolean>();

/**
 * Acquire a write lock on a file path.
 * Throws if the file is already locked.
 */
export function lockFile(filePath: string): void {
  if (fileLocks.get(filePath)) {
    throw new Error(`File already locked: ${filePath}`);
  }
  fileLocks.set(filePath, true);
}

/**
 * Release a write lock on a file path.
 */
export function unlockFile(filePath: string): void {
  fileLocks.delete(filePath);
}

/**
 * Check whether a file path is currently locked.
 */
export function isFileLocked(filePath: string): boolean {
  return fileLocks.get(filePath) ?? false;
}

// ---------------------------------------------------------------------------
// Filename Sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize a page title into a safe, lowercase kebab-case filename with `.md` extension.
 *
 * - Strips characters invalid on Windows/macOS/Linux
 * - Replaces whitespace with underscores
 * - Truncates to 100 characters
 * - Removes trailing dots and spaces
 * - Converts to lowercase kebab-case
 * - Falls back to a timestamp-based name if the result is empty
 */
export function sanitizeWikiFilename(name: string): string {
  // Remove invalid filename characters: < > : " / \ | ? * and control chars
  let safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "");
  // Replace whitespace with underscores
  safe = safe.replace(/\s+/g, "_");
  // Truncate to 100 chars
  safe = safe.substring(0, 100);
  // Remove trailing dots/spaces (Windows issue)
  safe = safe.replace(/[.\s]+$/, "");
  // Convert to lowercase kebab-case
  safe = safe.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
  // Fallback if empty after sanitization
  if (!safe) safe = `page_${Date.now()}`;
  return `${safe}.md`;
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

/**
 * Read a wiki page from disk.
 *
 * Parses YAML frontmatter via gray-matter and returns the structured page data.
 * Throws if the file does not exist.
 */
export function readWikiPage(filePath: string): WikiPage {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Wiki page not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  return { path: filePath, content, frontmatter: data };
}

/**
 * Write a wiki page to disk.
 *
 * - Validates required frontmatter fields: title, type, status
 * - Auto-sets updated timestamp (and created if missing)
 * - Locks the file to prevent concurrent writes
 *
 * Returns the absolute file path written.
 */
export function writeWikiPage(
  filePath: string,
  content: string,
  frontmatter: WikiFrontmatter
): string {
  // Check lock
  if (fileLocks.get(filePath)) {
    throw new Error(`File locked: ${filePath}`);
  }

  // Validate required frontmatter
  if (!frontmatter.title) {
    throw new Error("Frontmatter missing required field: title");
  }
  if (!frontmatter.type) {
    throw new Error("Frontmatter missing required field: type");
  }
  if (!frontmatter.status) {
    throw new Error("Frontmatter missing required field: status");
  }

  // Auto-set timestamps
  const now = new Date().toISOString();
  frontmatter.updated = now;
  if (!frontmatter.created) {
    frontmatter.created = now;
  }

  // Build markdown with YAML frontmatter via gray-matter
  const fmStr = matter.stringify(content, frontmatter);

  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, fmStr, "utf-8");
  return filePath;
}

/**
 * Delete a wiki page from disk.
 * Throws if the file is currently locked.
 * No-op if the file does not exist.
 */
export function deleteWikiPage(filePath: string): void {
  if (fileLocks.get(filePath)) {
    throw new Error(`File locked: ${filePath}`);
  }
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * List all wiki pages across all wiki folders.
 *
 * Scans the standard wiki subdirectories under `wikiRoot`:
 *   entities, concepts, sources, synthesis, _review
 *
 * Skips files that fail to parse (e.g., non-frontmatter markdown).
 */
export function listWikiPages(wikiRoot: string): WikiPage[] {
  const pages: WikiPage[] = [];

  for (const folder of SCAN_FOLDERS) {
    const dir = path.join(wikiRoot, folder);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        pages.push(readWikiPage(filePath));
      } catch {
        // Skip files that can't be parsed
      }
    }
  }

  return pages;
}
