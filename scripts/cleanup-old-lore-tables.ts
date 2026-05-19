/**
 * Cleanup: Archive old lore files and drop deprecated DB tables
 *
 * After wiki migration is complete, this script:
 * 1. Verifies wiki pages exist for each user (safety check)
 * 2. Archives old lore markdown files to data/{userId}/lore-archive/
 * 3. Drops content tables that have been migrated to the wiki
 *
 * Content tables to drop:
 *   locations, npcs, events, relationships,
 *   narrative_memories, lore_validations, lore_edits,
 *   backlinks, embedding_index, embedding_vectors
 *
 * Operational tables preserved:
 *   users, sessions, job_queue, universes, scene_states, personas
 *   (and all other non-content tables)
 *
 * Usage:
 *   npx tsx scripts/cleanup-old-lore-tables.ts               # all users, with confirmation
 *   npx tsx scripts/cleanup-old-lore-tables.ts --userId <id>  # specific user
 *   npx tsx scripts/cleanup-old-lore-tables.ts --dry-run      # preview only
 *   npx tsx scripts/cleanup-old-lore-tables.ts --force        # skip confirmation prompt
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "global.db");

/**
 * Content tables that are safe to drop after wiki migration is verified.
 * These tables held lore data that has been migrated to wiki pages.
 */
const CONTENT_TABLES = [
  "locations",
  "npcs",
  "events",
  "relationships",
  "narrative_memories",
  "lore_validations",
  "lore_edits",
  "backlinks",
  "embedding_index",
  "embedding_vectors",
] as const;

/**
 * Lore subdirectories within a user's data folder that contain
 * old markdown files to be archived.
 */
const LORE_SUBDIRS = ["locations", "npcs", "events", "relationships"] as const;

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes("--dry-run");
const IS_FORCE = args.includes("--force");
const USER_ID_FILTER = args.includes("--userId")
  ? args[args.indexOf("--userId") + 1] || null
  : null;

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: npx tsx scripts/cleanup-old-lore-tables.ts [options]

Options:
  --dry-run         Preview what would be done (no files moved, no tables dropped)
  --userId <id>     Only process a specific user
  --force           Skip confirmation prompt
  --help, -h        Show this help message

What this script does:
  1. Verifies each user has wiki pages before proceeding
  2. Archives old lore markdown files → data/{userId}/lore-archive/
  3. Drops deprecated content tables from the database

Content tables DROPPED:
  locations, npcs, events, relationships,
  narrative_memories, lore_validations, lore_edits,
  backlinks, embedding_index, embedding_vectors

Operational tables KEPT:
  users, sessions, job_queue, universes, scene_states, personas
  (and all other non-content tables)
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timestamp(): string {
  return new Date().toISOString();
}

function log(msg: string): void {
  console.log(`[${timestamp()}] ${msg}`);
}

/**
 * Collect all lore markdown files from a user's lore subdirectories.
 * Returns a map of source path → relative path within the lore directory structure.
 */
function collectLoreFiles(
  userDir: string
): { absolutePath: string; subdir: string; filename: string }[] {
  const files: { absolutePath: string; subdir: string; filename: string }[] = [];

  for (const subdir of LORE_SUBDIRS) {
    const dirPath = path.join(userDir, subdir);
    if (!fs.existsSync(dirPath)) continue;

    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const absolutePath = path.join(dirPath, entry);
      // Skip directories and non-regular files
      if (!fs.statSync(absolutePath).isFile()) continue;
      files.push({ absolutePath, subdir, filename: entry });
    }
  }

  return files;
}

/**
 * Count wiki pages for a user in data/{userId}/wiki/.
 * Returns total count, or 0 if the wiki directory doesn't exist.
 */
function countWikiPages(userId: string): number {
  const wikiDir = path.join(DATA_DIR, userId, "wiki");
  if (!fs.existsSync(wikiDir)) return 0;

  let count = 0;
  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile() && entry.endsWith(".md")) {
          count++;
        }
      } catch {
        // skip entries we can't stat
      }
    }
  }
  walk(wikiDir);
  return count;
}

/**
 * Check if a table exists in the database.
 */
function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    )
    .get(tableName) as { name: string } | undefined;
  return !!row;
}

/**
 * Get the count of rows in a table.
 */
function getRowCount(db: Database.Database, tableName: string): number {
  try {
    const row = db
      .prepare(`SELECT COUNT(*) as cnt FROM "${tableName}"`)
      .get() as { cnt: number };
    return row.cnt;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Old Lore Cleanup — Archive & Drop Deprecated Tables");
  console.log("═══════════════════════════════════════════════════════════════\n");

  log(`Mode:       ${IS_DRY_RUN ? "DRY-RUN (no changes)" : "LIVE"}`);
  if (USER_ID_FILTER) log(`User:       ${USER_ID_FILTER}`);
  log(`Data dir:   ${DATA_DIR}`);
  log(`Database:   ${DB_PATH}`);
  console.log("");

  // --- Validate DB ---
  if (!fs.existsSync(DB_PATH)) {
    log(`ERROR: Database not found at ${DB_PATH}`);
    log("Make sure the application has been initialized and contains data.");
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF"); // temporarily disable FK checks for DROP TABLE

  // --- Gather users ---
  const users = db
    .prepare("SELECT id, username FROM users ORDER BY username")
    .all() as { id: string; username: string }[];

  if (users.length === 0) {
    log("No users found in database. Nothing to do.\n");
    db.close();
    return;
  }

  log(`Users found: ${users.length}\n`);

  // =========================================================================
  // PHASE 1: Verification — check wiki pages exist
  // =========================================================================
  console.log("── Phase 1: Wiki Verification ────────────────────────────────");

  let verifiedUsers = 0;
  let unverifiedUsers = 0;
  const wikiPageCounts = new Map<string, number>();

  for (const user of users) {
    if (USER_ID_FILTER && user.id !== USER_ID_FILTER) continue;

    const count = countWikiPages(user.id);
    wikiPageCounts.set(user.id, count);

    if (count === 0) {
      log(`✗ ${user.username} (${user.id}): NO wiki pages found — SKIPPING`);
      unverifiedUsers++;
    } else {
      log(`✓ ${user.username} (${user.id}): ${count} wiki page(s) found`);
      verifiedUsers++;
    }
  }

  console.log(`  Verified:   ${verifiedUsers}`);
  console.log(`  Skipped:    ${unverifiedUsers} (no wiki pages)`);
  console.log("");

  if (verifiedUsers === 0) {
    log("No users have wiki pages. Nothing to clean up.\n");
    db.close();
    return;
  }

  // =========================================================================
  // PHASE 2: Archive — move old lore files to lore-archive/
  // =========================================================================
  console.log("── Phase 2: Lore File Archiving ──────────────────────────────");

  let totalFilesArchived = 0;
  let totalFilesSkipped = 0;
  let totalBytesArchived = 0;
  let totalLoreDirsCleaned = 0;
  let totalLoreDirsRemaining = 0;

  for (const user of users) {
    if (USER_ID_FILTER && user.id !== USER_ID_FILTER) continue;
    if ((wikiPageCounts.get(user.id) ?? 0) === 0) continue;

    const userDir = path.join(DATA_DIR, user.id);
    const loreFiles = collectLoreFiles(userDir);

    if (loreFiles.length === 0) {
      log(`~ ${user.username}: no old lore files found`);
      continue;
    }

    const archiveRoot = path.join(userDir, "lore-archive");

    log(`${user.username}: ${loreFiles.length} lore file(s) to archive`);

    for (const file of loreFiles) {
      // Target: data/{userId}/lore-archive/{subdir}/{filename}
      const archiveSubdir = path.join(archiveRoot, file.subdir);
      const targetPath = path.join(archiveSubdir, file.filename);

      const stat = fs.statSync(file.absolutePath);
      totalBytesArchived += stat.size;

      if (IS_DRY_RUN) {
        log(`  · [DRY-RUN] Would move: ${file.subdir}/${file.filename} → lore-archive/${file.subdir}/${file.filename}`);
        totalFilesArchived++;
      } else {
        // Ensure archive subdirectory exists
        fs.mkdirSync(archiveSubdir, { recursive: true });

        // Move (copy + delete) to archive
        try {
          fs.copyFileSync(file.absolutePath, targetPath);
          fs.unlinkSync(file.absolutePath);
          log(`  + Archived: ${file.subdir}/${file.filename}`);
          totalFilesArchived++;
        } catch (err: any) {
          log(`  ERROR archiving ${file.subdir}/${file.filename}: ${err.message}`);
        }
      }
    }

    // Clean up empty subdirectories
    for (const subdir of LORE_SUBDIRS) {
      const dirPath = path.join(userDir, subdir);
      if (!fs.existsSync(dirPath)) continue;

      if (!IS_DRY_RUN) {
        const remaining = fs.readdirSync(dirPath);
        if (remaining.length === 0) {
          try {
            fs.rmdirSync(dirPath);
            log(`  - Removed empty directory: ${subdir}/`);
            totalLoreDirsCleaned++;
          } catch (err: any) {
            log(`  WARN: Could not remove ${subdir}/: ${err.message}`);
          }
        } else {
          totalLoreDirsRemaining++;
        }
      }
    }
  }

  console.log("");
  log(`Files archived:    ${totalFilesArchived}`);
  log(`Bytes archived:    ${totalBytesArchived}`);
  log(`Dirs cleaned:      ${totalLoreDirsCleaned}`);
  if (totalLoreDirsRemaining > 0) {
    log(`Dirs with content: ${totalLoreDirsRemaining} (not removed)`);
  }
  console.log("");

  // =========================================================================
  // PHASE 3: Drop — DROP TABLE for content tables
  // =========================================================================
  console.log("── Phase 3: Drop Deprecated Tables ───────────────────────────");

  // Pre-scan: what exists and has data
  const tableStates: { name: string; exists: boolean; rowCount: number }[] = [];
  for (const tableName of CONTENT_TABLES) {
    const exists = tableExists(db, tableName);
    const rowCount = exists ? getRowCount(db, tableName) : 0;
    tableStates.push({ name: tableName, exists, rowCount });
  }

  const existingTables = tableStates.filter((t) => t.exists);
  const tablesWithData = existingTables.filter((t) => t.rowCount > 0);

  log(`Content tables found:   ${existingTables.length} / ${CONTENT_TABLES.length}`);
  if (tablesWithData.length > 0) {
    log(`Tables with data:       ${tablesWithData.length}`);
  }

  for (const table of tableStates) {
    if (table.exists) {
      log(`  ${table.rowCount > 0 ? "●" : "○"} ${table.name} (${table.rowCount} row(s))`);
    }
  }

  if (existingTables.length === 0) {
    log("No content tables found — nothing to drop.\n");
  } else {
    console.log("");

    // User confirmation (unless --force)
    if (!IS_FORCE && !IS_DRY_RUN) {
      log("WARNING: This will DROP the following tables permanently:");
      for (const table of existingTables) {
        console.log(`  - ${table.name} (${table.rowCount} row(s))`);
      }
      console.log("");
      process.stdout.write("Are you sure? Type 'yes' to confirm: ");
      const buf = Buffer.alloc(64);
      const bytesRead = fs.readSync(0, buf, 0, 64, null); // fd 0 = stdin
      const input = buf.toString("utf-8", 0, bytesRead).trim().toLowerCase();
      if (input !== "yes") {
        log("Confirmation denied. Aborting.\n");
        db.close();
        process.exit(0);
      }
      console.log("");
    }

    // Drop tables
    let tablesDropped = 0;
    let tablesSkipped = 0;

    for (const table of tableStates) {
      if (!table.exists) {
        tablesSkipped++;
        continue;
      }

      if (IS_DRY_RUN) {
        log(`  · [DRY-RUN] Would DROP TABLE ${table.name}`);
        tablesDropped++;
      } else {
        try {
          db.exec(`DROP TABLE IF EXISTS "${table.name}"`);
          log(`  ✗ DROPPED TABLE ${table.name}`);
          tablesDropped++;
        } catch (err: any) {
          log(`  ERROR dropping ${table.name}: ${err.message}`);
        }
      }
    }

    console.log("");
    log(`Tables dropped:  ${tablesDropped}`);
    log(`Tables skipped:  ${tablesSkipped} (already removed)`);
    console.log("");
  }

  // =========================================================================
  // Verification: confirm tables are gone
  // =========================================================================
  if (!IS_DRY_RUN) {
    console.log("── Post-Cleanup Verification ────────────────────────────────");

    const remainingContentTables = CONTENT_TABLES.filter((t) => tableExists(db, t));
    if (remainingContentTables.length === 0) {
      log("✓ All deprecated content tables have been dropped.");
    } else {
      log(`⚠ ${remainingContentTables.length} table(s) still exist:`);
      for (const t of remainingContentTables) {
        log(`  - ${t}`);
      }
    }

    // Confirm operational tables still exist
    const operationalTables = [
      "users", "sessions", "job_queue", "universes", "scene_states", "personas",
    ];
    const missingOperational = operationalTables.filter((t) => !tableExists(db, t));
    if (missingOperational.length === 0) {
      log("✓ All operational tables remain intact.");
    } else {
      log(`ERROR: ${missingOperational.length} operational table(s) missing:`);
      for (const t of missingOperational) {
        log(`  - ${t}`);
      }
    }
    console.log("");
  }

  db.close();

  // --- Summary ---
  console.log("── Summary ──────────────────────────────────────────────────");
  console.log(`  Wiki verification:  ${verifiedUsers} user(s) verified, ${unverifiedUsers} skipped`);
  console.log(`  Lore files archived:${totalFilesArchived}`);
  console.log(`  Bytes archived:     ${totalBytesArchived}`);
  console.log(`  Tables dropped:     ${existingTables.length} / ${CONTENT_TABLES.length}`);

  if (IS_DRY_RUN) {
    console.log("\n  Dry-run complete. Run without --dry-run to execute changes.");
  } else {
    console.log("\n  Cleanup complete.");
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

main();
