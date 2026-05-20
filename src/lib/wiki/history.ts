import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { APP_CONFIG } from "@/lib/config";
import { isPathWithinRoot } from "@/lib/wiki/path-guard";

/**
 * Record a new version snapshot in the wiki_versions table.
 *
 * The caller is responsible for writing the snapshot file before calling this.
 * The file_snapshot_path should be an absolute path to the snapshot file.
 */
export function recordVersion(
  pagePath: string,
  userId: string,
  versionNumber: number,
  changeSummary: string,
  fileSnapshotPath: string
): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO wiki_versions (id, page_path, user_id, version_number, change_summary, file_snapshot_path) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), pagePath, userId, versionNumber, changeSummary, fileSnapshotPath);
}

/**
 * Get all versions for a page, newest-first.
 */
export function getPageVersions(pagePath: string, userId: string): Array<{
  id: string;
  page_path: string;
  user_id: string;
  version_number: number;
  change_summary: string | null;
  file_snapshot_path: string;
  created_at: string;
}> {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM wiki_versions WHERE page_path = ? AND user_id = ? ORDER BY version_number DESC"
  ).all(pagePath, userId) as Array<{
    id: string;
    page_path: string;
    user_id: string;
    version_number: number;
    change_summary: string | null;
    file_snapshot_path: string;
    created_at: string;
  }>;
}

/**
 * Get the next version number for a page (max + 1, or 1 if none exist).
 */
export function getNextVersionNumber(pagePath: string, userId: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT MAX(version_number) as max_ver FROM wiki_versions WHERE page_path = ? AND user_id = ?"
  ).get(pagePath, userId) as { max_ver: number | null };
  return (row?.max_ver ?? 0) + 1;
}

/**
 * Restore a version by reading its snapshot file and writing it to the page file.
 *
 * Returns the new file content that was written.
 */
export function restoreVersion(
  versionId: string,
  wikiRoot: string,
  slug: string[]
): string {
  const db = getDb();
  const version = db.prepare(
    "SELECT * FROM wiki_versions WHERE id = ?"
  ).get(versionId) as { file_snapshot_path: string } | undefined;

  if (!version) {
    throw new Error("Version not found");
  }

  // Security: ensure snapshot path is within wiki root
  if (!isPathWithinRoot(version.file_snapshot_path, wikiRoot)) {
    throw new Error("Invalid snapshot path");
  }

  if (!fs.existsSync(version.file_snapshot_path)) {
    throw new Error("Snapshot file not found");
  }

  const snapshot = fs.readFileSync(version.file_snapshot_path, "utf-8");
  const filePath = path.join(wikiRoot, ...slug) + ".md";

  // Security: ensure target path is within wiki root
  if (!isPathWithinRoot(filePath, wikiRoot)) {
    throw new Error("Invalid target path");
  }

  fs.writeFileSync(filePath, snapshot, "utf-8");
  return snapshot;
}

/**
 * Create a snapshot file for the current page content before recording a version.
 *
 * Returns the absolute path to the snapshot file.
 */
export function createSnapshotFile(
  wikiRoot: string,
  slug: string[],
  content: string
): string {
  const snapshotsDir = path.join(wikiRoot, ".snapshots");
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }

  const slugPath = slug.join("_");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotPath = path.join(snapshotsDir, `${slugPath}_${timestamp}.md`);

  fs.writeFileSync(snapshotPath, content, "utf-8");
  return snapshotPath;
}
