import fs from "fs";
import path from "path";

export interface WikiRevision {
  id: string;
  timestamp: string;
  content: string;
  frontmatter: Record<string, any>;
  lastModified: string;
}

/**
 * Get the revisions directory for a given slug path.
 * Path: data/{userId}/wiki/{universeId}/.revisions/{slug}/
 */
function getRevisionsDir(
  wikiRoot: string,
  slug: string[]
): string {
  const slugPath = slug.join("/");
  return path.join(wikiRoot, ".revisions", slugPath);
}

/**
 * Save a revision snapshot before overwriting a wiki page.
 * Reads the existing page and stores it as a revision file.
 */
export function saveRevision(
  wikiRoot: string,
  slug: string[],
  content: string,
  frontmatter: Record<string, any>
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
    try {
      const raw = fs.readFileSync(path.join(revisionsDir, file), "utf-8");
      revisions.push(JSON.parse(raw) as WikiRevision);
    } catch {
      // Skip corrupted files
    }
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

  if (!fs.existsSync(revisionPath)) return null;

  try {
    const raw = fs.readFileSync(revisionPath, "utf-8");
    return JSON.parse(raw) as WikiRevision;
  } catch {
    return null;
  }
}
