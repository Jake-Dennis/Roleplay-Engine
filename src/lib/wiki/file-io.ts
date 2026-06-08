import { TIME } from "@/lib/config";
import matter from "gray-matter";
import fs from "fs";
import path from "path";
import { logger } from "@/lib/logger";
import type { WikiFrontmatter, WikiPage, WriteWikiPageOptions } from "./types";
export type { WikiFrontmatter, WikiPage, WriteWikiPageOptions } from "./types";
export { ConflictError } from "./types";
import { ConflictError } from "./types";
import { getResolvedFolderOrder } from "./config";

/**
 * The wiki folders scanned by listWikiPages by default. Custom folders added
 * at runtime are also discovered automatically from the filesystem.
 */
const DEFAULT_SCAN_FOLDERS = ["entities", "concepts", "sources", "synthesis", "_review"];

// ---------------------------------------------------------------------------
// File Locking
// ---------------------------------------------------------------------------

/**
 * In-memory file lock map for single-process concurrency.
 * Sufficient for Next.js server-rendered pages where writes are sequential.
 */
const fileLocks = new Map<string, boolean>();

/**
 * Tracks when each lock was acquired, for stale lock cleanup.
 */
const lockTimestamps = new Map<string, number>();

/**
 * Throttle for cleanupStaleLocks — prevents running on every lockFile call.
 */
let lastCleanupTime = 0;
const CLEANUP_THROTTLE_MS = TIME.ONE_MINUTE; // 60 seconds

/**
 * Remove locks older than maxAgeMs to prevent unbounded Map growth
 * from abandoned locks (e.g., crashed requests).
 */
export function cleanupStaleLocks(maxAgeMs = 30_000): void {
  const now = Date.now();
  for (const [filePath, timestamp] of lockTimestamps.entries()) {
    if (now - timestamp > maxAgeMs) {
      fileLocks.delete(filePath);
      lockTimestamps.delete(filePath);
    }
  }
}

/**
 * Acquire a write lock on a file path.
 * Throws if the file is already locked.
 */
export function lockFile(filePath: string): void {
  // Throttled stale-lock cleanup
  const now = Date.now();
  if (now - lastCleanupTime > CLEANUP_THROTTLE_MS) {
    cleanupStaleLocks();
    lastCleanupTime = now;
  }

  if (fileLocks.get(filePath)) {
    throw new Error(`File already locked: ${filePath}`);
  }
  fileLocks.set(filePath, true);
  lockTimestamps.set(filePath, now);
}

/**
 * Release a write lock on a file path.
 */
export function unlockFile(filePath: string): void {
  fileLocks.delete(filePath);
  lockTimestamps.delete(filePath);
}

/**
 * Check whether a file path is currently locked.
 */
export function isFileLocked(filePath: string): boolean {
  return fileLocks.get(filePath) ?? false;
}

// ---------------------------------------------------------------------------
// Conflict Detection Helpers
// ---------------------------------------------------------------------------

/**
 * Read the `updated` (lastModified) timestamp from an existing wiki page.
 *
 * Returns the ISO timestamp string, or null if the file doesn't exist
 * or has no `updated` frontmatter field.
 */
export function getWikiPageLastModified(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data } = matter(raw);
    return (data.updated as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Simple line-by-line diff between two strings.
 *
 * Returns a unified-diff-style string with:
 *   - lines prefixed with `-` for removed lines
 *   - lines prefixed with `+` for added lines
 *   - lines prefixed with ` ` for unchanged context
 */
export function lineDiff(oldText: string, newText: string): string {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const maxLen = Math.max(oldLines.length, newLines.length);
  const lines: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) {
      lines.push(` ${oldLine}`);
    } else {
      if (oldLine !== undefined) lines.push(`-${oldLine}`);
      if (newLine !== undefined) lines.push(`+${newLine}`);
    }
  }

  return lines.join("\n");
}

/**
 * Save a conflict diff file to the `_review/conflicts/` directory.
 *
 * Filename format: `{ISO-timestamp}-{original-filename}.diff`
 */
function saveConflictDiff(
  filePath: string,
  diff: string
): string {
  const wikiRoot = findWikiRoot(filePath);
  const conflictsDir = path.join(wikiRoot, "_review", "conflicts");
  if (!fs.existsSync(conflictsDir)) {
    fs.mkdirSync(conflictsDir, { recursive: true });
  }

  const baseName = path.basename(filePath, ".md");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const diffFilename = `${timestamp}-${baseName}.diff`;
  const diffPath = path.join(conflictsDir, diffFilename);

  const header = [
    `# Concurrent Edit Conflict`,
    `# File: ${filePath}`,
    `# Generated: ${new Date().toISOString()}`,
    `#`,
    `# Legend:`,
    `#   - line removed`,
    `#   + line added`,
    `#   (space) unchanged context`,
    ``,
  ].join("\n");

  fs.writeFileSync(diffPath, header + diff, "utf-8");
  return diffPath;
}

/**
 * Walk up from a file path to find the wiki root (the folder containing
 * entities/, concepts/, sources/, etc.). Falls back to the file's directory.
 */
function findWikiRoot(filePath: string): string {
  let current = path.dirname(filePath);
  const maxDepth = 10;
  for (let i = 0; i < maxDepth; i++) {
    const hasWikiStructure = DEFAULT_SCAN_FOLDERS.some((f) =>
      fs.existsSync(path.join(current, f))
    );
    if (hasWikiStructure) return current;
    const parent = path.dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }
  // Fallback: use the immediate parent of the file
  return path.dirname(filePath);
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
  return { path: filePath, content, frontmatter: data as WikiFrontmatter };
}

/**
 * Write a wiki page to disk.
 *
 * - Validates required frontmatter fields: title, type, status
 * - Auto-sets updated timestamp (and created if missing)
 * - Locks the file to prevent concurrent writes
 * - Optionally detects concurrent edit conflicts via timestamp comparison
 *
 * @param filePath - Absolute path to write the file
 * @param content - Markdown body content
 * @param frontmatter - YAML frontmatter fields
 * @param options - Optional conflict detection settings
 *   - expectedLastModified: if provided, compare with existing file's `updated`
 *   - onConflict: "fail" (default) throws ConflictError, "save-diff" saves diff
 *
 * Returns the absolute file path written.
 */
export function writeWikiPage(
  filePath: string,
  content: string,
  frontmatter: WikiFrontmatter,
  options?: WriteWikiPageOptions
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

  // Conflict detection: compare expectedLastModified with existing file
  if (options?.expectedLastModified) {
    const existingLastModified = getWikiPageLastModified(filePath);
    if (existingLastModified !== null) {
      // Parse timestamps for comparison — a newer existing file means conflict
      const existingTime = new Date(existingLastModified).getTime();
      const expectedTime = new Date(options.expectedLastModified).getTime();

      if (existingTime > expectedTime) {
        // Conflict: file has been modified since the caller last read it
        const existingRaw = fs.readFileSync(filePath, "utf-8");
        const diff = lineDiff(existingRaw, "");

        const onConflict = options.onConflict ?? "fail";

        if (onConflict === "save-diff") {
          // Save the diff and proceed with the write
          const diffPath = saveConflictDiff(filePath, diff);
          // Log the conflict for observability
          logger.warn(
            `[wiki] Concurrent edit conflict on "${filePath}", ` +
              `diff saved to ${diffPath}`
          );
        } else {
          // "fail" — throw ConflictError with full diff
          throw new ConflictError(
            filePath,
            existingLastModified,
            options.expectedLastModified,
            diff
          );
        }
      }
    }
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
 * List all wiki pages, including pages in subtype subfolders (2-level deep).
 * Recursively scans directories, skipping hidden dirs and known system dirs.
 *
 * Pages are sorted by top-level folder order (from wiki config), then by
 * subtype folder path, then by `order` frontmatter field, then by title.
 */
export function listWikiPages(wikiRoot: string): WikiPage[] {
  const pages: WikiPage[] = [];

  if (!fs.existsSync(wikiRoot)) return pages;

  const folders = getResolvedFolderOrder(wikiRoot);

  for (const folder of folders) {
    const dir = path.join(wikiRoot, folder);
    if (!fs.existsSync(dir)) continue;

    collectPagesRecursive(dir, folder, pages);
  }

  // Sort by top-level folder order, then subtype folder path,
  // then by order field, then by title
  const folderIndex = new Map(folders.map((f, i) => [f, i] as const));
  pages.sort((a, b) => {
    // Compute relative directory paths, normalizing to forward slashes
    const aRel = path
      .relative(wikiRoot, path.dirname(a.path))
      .replace(/\\/g, "/");
    const bRel = path
      .relative(wikiRoot, path.dirname(b.path))
      .replace(/\\/g, "/");

    // Extract top-level folder
    const aTop = aRel.split("/")[0];
    const bTop = bRel.split("/")[0];
    const aIdx = folderIndex.get(aTop) ?? Number.POSITIVE_INFINITY;
    const bIdx = folderIndex.get(bTop) ?? Number.POSITIVE_INFINITY;
    if (aIdx !== bIdx) return aIdx - bIdx;

    // Sort by the full relative folder path
    if (aRel !== bRel) return aRel.localeCompare(bRel);

    // Then by order field
    const aOrder = a.frontmatter.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.frontmatter.order ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;

    // Then by title
    return (a.frontmatter.title || "").localeCompare(b.frontmatter.title || "");
  });

  return pages;
}

/**
 * Recursively collect wiki pages from a directory and its subdirectories.
 * Skips hidden dirs (starting with .), system dirs (_review, _archive, conflicts, node_modules),
 * and non-.md files.
 */
function collectPagesRecursive(
  dirPath: string,
  _relativePrefix: string,
  pages: WikiPage[],
): void {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    // Skip directories that can't be read (permission errors, etc.)
    return;
  }

  const SKIP_DIRS = new Set(["_review", "_archive", "conflicts", "node_modules"]);

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue; // hidden files/dirs

    const fullPath = path.join(dirPath, entry.name);
    const nextPrefix = `${_relativePrefix}/${entry.name}`;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectPagesRecursive(fullPath, nextPrefix, pages);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      try {
        const page = readWikiPage(fullPath);
        pages.push(page);
      } catch {
        // Skip files that can't be parsed
      }
    }
  }
}
