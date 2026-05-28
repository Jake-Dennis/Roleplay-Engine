/**
 * @deprecated Use src/lib/wiki/history.ts (SQLite wiki_versions table) instead.
 * This file-based revision system is deprecated but kept for backward compatibility.
 * Will be removed in a future cleanup phase.
 * Migration path: history.recordVersion() → wiki_versions table
 */

import fs from "fs";
import path from "path";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";
import { safeParseWarn } from "@/lib/safe-json";
import type { WikiRevision, WikiFrontmatter } from "./types";
export type { WikiRevision } from "./types";

/**
 * Get the revisions directory for a given slug path.
 * Path: data/{userId}/wiki/{universeId}/.revisions/{slug}/
 */
function getRevisionsDir(
  wikiRoot: string,
  slug: string[]
): string {
  const slugPath = slug.join("/");
  const resolved = path.join(wikiRoot, ".revisions", slugPath);
  if (!isPathWithinRoot(resolved, wikiRoot)) {
    throw new Error("Invalid path");
  }
  return resolved;
}

/**
 * Save a revision snapshot before overwriting a wiki page.
 * Reads the existing page and stores it as a revision file.
 */
export function saveRevision(
  wikiRoot: string,
  slug: string[],
  content: string,
  frontmatter: WikiFrontmatter
): WikiRevision {
  const revisionsDir = getRevisionsDir(wikiRoot, slug);
  if (!fs.existsSync(revisionsDir)) {
    fs.mkdirSync(revisionsDir, { recursive: true });
  }

  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const lastModified = (frontmatter.updated as string) ?? timestamp;

  const revision: WikiRevision = {
    id,
    timestamp,
    content,
    frontmatter,
    lastModified,
  };

  const revisionPath = path.join(revisionsDir, `${timestamp}.json`);
  fs.writeFileSync(revisionPath, JSON.stringify(revision, null, 2), "utf-8");

  return revision;
}

/**
 * List all revisions for a given slug, sorted newest-first.
 */
export function listRevisions(
  wikiRoot: string,
  slug: string[]
): WikiRevision[] {
  const revisionsDir = getRevisionsDir(wikiRoot, slug);
  if (!fs.existsSync(revisionsDir)) return [];

  const files = fs.readdirSync(revisionsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  const revisions: WikiRevision[] = [];
  for (const file of files) {
    const parsed = safeParseWarn<WikiRevision>(
      fs.readFileSync(path.join(revisionsDir, file), "utf-8"),
      `revision file ${file}`,
    );
    if (parsed) revisions.push(parsed);
  }

  return revisions;
}

/**
 * Get a specific revision by its timestamp filename.
 */
export function getRevision(
  wikiRoot: string,
  slug: string[],
  revisionId: string
): WikiRevision | null {
  const revisionsDir = getRevisionsDir(wikiRoot, slug);
  const revisionPath = path.join(revisionsDir, `${revisionId}.json`);

  if (!isPathWithinRoot(revisionPath, wikiRoot)) return null;
  if (!fs.existsSync(revisionPath)) return null;

  return safeParseWarn<WikiRevision>(
    fs.readFileSync(revisionPath, "utf-8"),
    `revision file ${revisionId}`,
  );
}
