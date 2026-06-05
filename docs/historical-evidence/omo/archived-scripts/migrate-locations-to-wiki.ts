/**
 * Migration: Migrate locations from DB + markdown files to wiki pages
 *
 * Reads all locations from the database, converts them to wiki page format:
 *   data/{userId}/wiki/entities/{location-name}.md
 *
 * Frontmatter mapping:
 *   name         → title
 *   canon_tier   → status  (immutable_canon→locked, generated_lore→draft, soft_canon→reviewed)
 *   importance   → tags    (e.g. "importance:high")
 *   file_path    → tags    (e.g. "source:location-name")
 *   universe_id  → universe
 *
 * Preserves wikilinks from original markdown content in the body.
 * Regenerates index.md after migration.
 *
 * Usage:
 *   npx tsx scripts/migrate-locations-to-wiki.ts              # migrate all users
 *   npx tsx scripts/migrate-locations-to-wiki.ts --userId <id> # specific user
 *   npx tsx scripts/migrate-locations-to-wiki.ts --dry-run     # preview only
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { writeWikiPage, sanitizeWikiFilename, WikiFrontmatter } from "../src/lib/wiki/file-io";
import { generateIndex } from "../src/lib/wiki/index-generator";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "global.db");

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes("--dry-run");
const USER_ID_FILTER = args.includes("--userId")
  ? args[args.indexOf("--userId") + 1] || null
  : null;

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: npx tsx scripts/migrate-locations-to-wiki.ts [options]

Options:
  --dry-run         Preview locations that would be migrated (no files written)
  --userId <id>     Only migrate locations belonging to this user
  --help, -h        Show this help message
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map DB canon_tier to wiki page frontmatter status.
 *
 *   immutable_canon → locked   (source material, immutable)
 *   soft_canon      → reviewed (user-approved, expandable)
 *   generated_lore  → draft    (AI-generated, pending review)
 *   session_lore    → draft    (temporary narrative state)
 *   rumor           → draft    (unverified information)
 *   null/unknown    → draft    (fallback)
 */
function canonTierToStatus(
  canonTier: string | null
): WikiFrontmatter["status"] {
  switch (canonTier) {
    case "immutable_canon":
      return "locked";
    case "soft_canon":
      return "reviewed";
    case "generated_lore":
    case "session_lore":
    case "rumor":
    default:
      return "draft";
  }
}

/**
 * Build the wiki frontmatter object from a DB location row.
 */
function buildFrontmatter(location: any): WikiFrontmatter {
  const tags: string[] = [];

  // Map importance to tags so filtering works
  if (location.importance) {
    tags.push(`importance:${location.importance}`);
  }

  // Map file_path to source_ref tag
  if (location.file_path) {
    const ref = location.file_path.replace(/\.md$/i, "");
    tags.push(`source:${ref}`);
  }

  return {
    title: location.name || "Unknown Location",
    type: "entity",
    status: canonTierToStatus(location.canon_tier),
    universe: location.universe_id || undefined,
    tags: tags.length > 0 ? tags : undefined,
  };
}

/**
 * Read the body content from a location's markdown file, stripping any old
 * YAML frontmatter. Preserves wikilinks verbatim.
 *
 * Falls back to a basic body built from known_info / hidden_info when no
 * markdown file exists on disk.
 */
function getPageBody(location: any, userId: string): string {
  // Try to read the original location markdown file
  if (location.file_path) {
    const filePath = path.join(DATA_DIR, userId, "locations", location.file_path);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      // Strip YAML frontmatter (--- delimited block at the start)
      const match = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
      if (match) {
        const body = match[1].trim();
        if (body) return body;
      }
    }
  }

  // No file on disk — build body from DB fields
  const parts: string[] = [];

  if (location.known_info) {
    try {
      const known =
        typeof location.known_info === "string"
          ? JSON.parse(location.known_info)
          : location.known_info;
      if (typeof known === "string") {
        parts.push(known);
      } else if (Array.isArray(known)) {
        parts.push(known.join("\n\n"));
      } else if (typeof known === "object" && known !== null) {
        parts.push(
          Object.entries(known)
            .map(([k, v]) => `**${k}:** ${v}`)
            .join("\n\n")
        );
      }
    } catch {
      parts.push(String(location.known_info));
    }
  }

  if (location.hidden_info) {
    try {
      const hidden =
        typeof location.hidden_info === "string"
          ? JSON.parse(location.hidden_info)
          : location.hidden_info;
      const hiddenStr =
        typeof hidden === "string" ? hidden : JSON.stringify(hidden, null, 2);
      parts.push(
        `> **Hidden Information:**\n> ${hiddenStr.replace(/\n/g, "\n> ")}`
      );
    } catch {
      parts.push(`> **Hidden Information:**\n> ${String(location.hidden_info)}`);
    }
  }

  return parts.length > 0
    ? parts.join("\n\n")
    : `# ${location.name}\n\nLocation record migrated from lore system.`;
}

/**
 * Print a single location migration entry (used in both dry-run and live mode).
 */
function logMigration(
  location: any,
  userId: string,
  filename: string
): void {
  const fm = buildFrontmatter(location);
  const wikiRelative = path.join(userId, "wiki", "entities", filename);

  console.log(`  ${IS_DRY_RUN ? "·" : "+"} ${location.name}`);
  console.log(`    path:    ${wikiRelative}`);
  console.log(`    status:  ${fm.status}`);
  console.log(`    tags:    ${fm.tags?.join(", ") || "(none)"}`);
  if (fm.universe) console.log(`    universe: ${fm.universe}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log("═══════════════════════════════════════════════");
  console.log("  Location → Wiki Page Migration");
  console.log("═══════════════════════════════════════════════\n");

  console.log(`  Mode:     ${IS_DRY_RUN ? "DRY-RUN (no files written)" : "LIVE"}`);
  if (USER_ID_FILTER) console.log(`  User:     ${USER_ID_FILTER}`);
  console.log(`  Data dir: ${DATA_DIR}\n`);

  // --- Validate DB ---
  if (!fs.existsSync(DB_PATH)) {
    console.error(
      `ERROR: Database not found at ${DB_PATH}\n` +
        "Make sure the application has been initialized and contains data."
    );
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // --- Gather users ---
  const users = db
    .prepare("SELECT id, username FROM users ORDER BY username")
    .all() as { id: string; username: string }[];

  if (users.length === 0) {
    console.log("No users found in database. Nothing to do.\n");
    db.close();
    return;
  }

  console.log(`  Users found: ${users.length}\n`);

  // --- Stats ---
  let totalDbLocations = 0;
  let pagesCreated = 0;
  let pagesSkipped = 0;
  let wikiMissing = 0;
  const errors: string[] = [];

  // --- Process each user ---
  for (const user of users) {
    if (USER_ID_FILTER && user.id !== USER_ID_FILTER) continue;

    const wikiRoot = path.join(DATA_DIR, user.id, "wiki");
    const entitiesDir = path.join(wikiRoot, "entities");

    // Check wiki directory exists
    if (!fs.existsSync(wikiRoot)) {
      console.log(`  [SKIP] ${user.username} — no wiki directory (run init-wiki.ts first)`);
      wikiMissing++;
      continue;
    }

    // Ensure entities directory exists
    if (!fs.existsSync(entitiesDir)) {
      fs.mkdirSync(entitiesDir, { recursive: true });
    }

    // Fetch locations for this user
    const locations = db
      .prepare(
        "SELECT id, user_id, universe_id, name, file_path, importance, canon_tier, parent_location_id, known_info, hidden_info, created_at FROM locations WHERE user_id = ? ORDER BY name"
      )
      .all(user.id) as any[];

    if (locations.length === 0) {
      console.log(`  ${user.username}: no locations to migrate`);
      continue;
    }

    console.log(`  ── ${user.username} (${user.id}) ──`);
    totalDbLocations += locations.length;

    for (const location of locations) {
      const filename = sanitizeWikiFilename(location.name);
      const pagePath = path.join(entitiesDir, filename);

      // Skip if wiki page already exists
      if (fs.existsSync(pagePath)) {
        console.log(`  ~ ${location.name} → page exists (${filename})`);
        pagesSkipped++;
        continue;
      }

      // Build frontmatter and content
      const frontmatter = buildFrontmatter(location);
      const body = getPageBody(location, user.id);

      logMigration(location, user.id, filename);

      // Write the wiki page (unless dry-run)
      if (!IS_DRY_RUN) {
        try {
          writeWikiPage(pagePath, body, frontmatter);
          pagesCreated++;
        } catch (err: any) {
          errors.push(`${location.name} (${user.id}): ${err.message}`);
          console.log(`    ERROR: ${err.message}`);
        }
      } else {
        pagesCreated++; // count in dry-run for summary accuracy
      }
    }
    console.log("");
  }

  // --- Regenerate wiki index ---
  if (!IS_DRY_RUN && pagesCreated > 0) {
    console.log("  Regenerating wiki index files...\n");

    for (const user of users) {
      if (USER_ID_FILTER && user.id !== USER_ID_FILTER) continue;
      const wikiRoot = path.join(DATA_DIR, user.id, "wiki");
      if (!fs.existsSync(wikiRoot)) continue;

      try {
        generateIndex(wikiRoot);
        console.log(`  ✓ Index regenerated for ${user.username}`);
      } catch (err: any) {
        console.error(`  ✗ Failed to regenerate index for ${user.username}: ${err.message}`);
      }
    }
    console.log("");
  }

  db.close();

  // --- Summary ---
  console.log("── Summary ──────────────────────────────────");
  console.log(`  Locations in DB:     ${totalDbLocations}`);
  console.log(`  Wiki pages created:  ${pagesCreated}`);
  console.log(`  Wiki pages skipped:  ${pagesSkipped} (already exist)`);
  console.log(`  Users w/o wiki:      ${wikiMissing}`);

  if (errors.length > 0) {
    console.log(`  Errors:              ${errors.length}`);
    for (const err of errors) {
      console.log(`    • ${err}`);
    }
  }

  if (IS_DRY_RUN) {
    console.log("\n  Dry-run complete. Run without --dry-run to write files.");
  } else {
    console.log("\n  Migration complete.");
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

main();
