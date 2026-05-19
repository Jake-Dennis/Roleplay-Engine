/**
 * Migration: Migrate NPCs from DB to wiki pages
 *
 * Reads all NPCs from the database, converts them to wiki page format:
 *   data/{userId}/wiki/entities/{npc-name}.md
 *
 * Frontmatter mapping:
 *   name         → title
 *   canon_tier   → status  (immutable_canon→locked, generated_lore→draft, soft_canon→reviewed)
 *   location_id  → wikilink to location page (in body content)
 *   importance   → tags    (e.g. "importance:high")
 *   file_path    → tags    (e.g. "source:npc-name")
 *   tags         → tags    (parsed from JSON, merged)
 *   universe_id  → universe
 *
 * Preserves wikilinks from original markdown content in the body.
 * Regenerates index.md after migration.
 *
 * Usage:
 *   npx tsx scripts/migrate-npcs-to-wiki.ts              # migrate all users
 *   npx tsx scripts/migrate-npcs-to-wiki.ts --userId <id> # specific user
 *   npx tsx scripts/migrate-npcs-to-wiki.ts --dry-run     # preview only
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
Usage: npx tsx scripts/migrate-npcs-to-wiki.ts [options]

Options:
  --dry-run         Preview NPCs that would be migrated (no files written)
  --userId <id>     Only migrate NPCs belonging to this user
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
 * Parse NPC tags stored as JSON text array into a string array.
 */
function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean);
    }
    return [String(parsed)];
  } catch {
    // If not valid JSON, treat as comma-separated
    return raw.split(",").map((t) => t.trim()).filter(Boolean);
  }
}

/**
 * Look up location name by location_id for wikilink resolution.
 * Returns the location name or null if not found.
 */
function resolveLocationName(db: Database.Database, locationId: string | null): string | null {
  if (!locationId) return null;
  const location = db.prepare("SELECT name FROM locations WHERE id = ?").get(locationId) as { name: string } | undefined;
  return location?.name || null;
}

/**
 * Build the wiki frontmatter object from a DB npc row.
 */
function buildFrontmatter(npc: any): WikiFrontmatter {
  const tags: string[] = [];

  // Map importance to tags so filtering works
  if (npc.importance) {
    tags.push(`importance:${npc.importance}`);
  }

  // Map file_path to source_ref tag
  if (npc.file_path) {
    const ref = npc.file_path.replace(/\.md$/i, "");
    tags.push(`source:${ref}`);
  }

  // Parse and merge DB tags (stored as JSON array)
  const dbTags = parseTags(npc.tags);
  for (const tag of dbTags) {
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }

  return {
    title: npc.name || "Unknown NPC",
    type: "entity",
    status: canonTierToStatus(npc.canon_tier),
    universe: npc.universe_id || undefined,
    tags: tags.length > 0 ? tags : undefined,
  };
}

/**
 * Read the body content from an NPC's markdown file, stripping any old
 * YAML frontmatter. Preserves wikilinks verbatim.
 *
 * Falls back to a basic body built from DB fields when no markdown file
 * exists on disk.
 */
function getPageBody(npc: any, userId: string, db: Database.Database): string {
  const parts: string[] = [];

  // Try to read the original NPC markdown file
  if (npc.file_path) {
    const filePath = path.join(DATA_DIR, userId, "npcs", npc.file_path);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      // Strip YAML frontmatter (--- delimited block at the start)
      const match = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
      if (match) {
        const body = match[1].trim();
        if (body) parts.push(body);
      }
    }
  }

  // Add location wikilink if location_id is set
  if (npc.location_id) {
    const locationName = resolveLocationName(db, npc.location_id);
    if (locationName) {
      parts.push(`**Location:** [[${locationName}]]`);
    }
  }

  // Fallback if nothing else produced content
  if (parts.length === 0) {
    return `# ${npc.name}\n\nNPC record migrated from lore system.`;
  }

  return parts.join("\n\n");
}

/**
 * Print a single NPC migration entry (used in both dry-run and live mode).
 */
function logMigration(
  npc: any,
  userId: string,
  filename: string,
  locationName?: string | null
): void {
  const fm = buildFrontmatter(npc);
  const wikiRelative = path.join(userId, "wiki", "entities", filename);

  console.log(`  ${IS_DRY_RUN ? "·" : "+"} ${npc.name}`);
  console.log(`    path:    ${wikiRelative}`);
  console.log(`    status:  ${fm.status}`);
  console.log(`    tags:    ${fm.tags?.join(", ") || "(none)"}`);
  if (fm.universe) console.log(`    universe: ${fm.universe}`);
  if (locationName) console.log(`    location: [[${locationName}]]`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log("═══════════════════════════════════════════════");
  console.log("  NPC → Wiki Page Migration");
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
  let totalDbNpcs = 0;
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

    // Fetch NPCs for this user
    const npcs = db
      .prepare(
        "SELECT id, user_id, universe_id, name, file_path, canon_tier, location_id, importance, tags, created_at FROM npcs WHERE user_id = ? ORDER BY name"
      )
      .all(user.id) as any[];

    if (npcs.length === 0) {
      console.log(`  ${user.username}: no NPCs to migrate`);
      continue;
    }

    console.log(`  ── ${user.username} (${user.id}) ──`);
    totalDbNpcs += npcs.length;

    for (const npc of npcs) {
      const filename = sanitizeWikiFilename(npc.name);
      const pagePath = path.join(entitiesDir, filename);

      // Skip if wiki page already exists
      if (fs.existsSync(pagePath)) {
        console.log(`  ~ ${npc.name} → page exists (${filename})`);
        pagesSkipped++;
        continue;
      }

      // Resolve location wikilink
      const locationName = resolveLocationName(db, npc.location_id);

      // Build frontmatter and content
      const frontmatter = buildFrontmatter(npc);
      const body = getPageBody(npc, user.id, db);

      logMigration(npc, user.id, filename, locationName);

      // Write the wiki page (unless dry-run)
      if (!IS_DRY_RUN) {
        try {
          writeWikiPage(pagePath, body, frontmatter);
          pagesCreated++;
        } catch (err: any) {
          errors.push(`${npc.name} (${user.id}): ${err.message}`);
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
  console.log(`  NPCs in DB:          ${totalDbNpcs}`);
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
