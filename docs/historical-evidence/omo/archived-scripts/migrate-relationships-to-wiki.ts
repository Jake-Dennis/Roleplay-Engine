/**
 * Migration: Migrate relationships from DB to wiki pages
 *
 * Reads all relationships from the database, converts them to wiki page format:
 *   data/{userId}/wiki/entities/{source}-{target}-relationship.md
 *
 * Frontmatter mapping:
 *   source_entity      → wikilink (in body)
 *   target_entity      → wikilink (in body)
 *   emotional_state    → tags    (e.g. "emotional_state:positive")
 *   relationship_stage → tags    (e.g. "stage:close_friends")
 *   decay_rates        → tags    (parsed from JSON, merged)
 *   universe_id        → universe
 *   type               → "entity"
 *
 * All relationships are set to status: "draft" (no canon_layer field).
 * Regenerates index.md after migration.
 *
 * Usage:
 *   npx tsx scripts/migrate-relationships-to-wiki.ts              # migrate all users
 *   npx tsx scripts/migrate-relationships-to-wiki.ts --userId <id> # specific user
 *   npx tsx scripts/migrate-relationships-to-wiki.ts --dry-run     # preview only
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
Usage: npx tsx scripts/migrate-relationships-to-wiki.ts [options]

Options:
  --dry-run         Preview relationships that would be migrated (no files written)
  --userId <id>     Only migrate relationships belonging to this user
  --help, -h        Show this help message
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse decay_rates JSON into a list of tag strings.
 * Each key-value pair becomes a tag like "decay_rate:{key}:{value}".
 */
function parseDecayRates(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return Object.entries(parsed).map(
        ([key, value]) => `decay_rate:${key}:${value}`
      );
    }
    return [`decay_rates:${String(parsed)}`];
  } catch {
    // If not valid JSON, treat as a string tag
    return [`decay_rates:${raw}`];
  }
}

/**
 * Build the wiki frontmatter object from a DB relationship row.
 */
function buildFrontmatter(rel: any): WikiFrontmatter {
  const tags: string[] = [];

  // Map emotional_state to tags
  if (rel.emotional_state) {
    tags.push(`emotional_state:${rel.emotional_state}`);
  }

  // Map relationship_stage to tags
  if (rel.relationship_stage) {
    tags.push(`stage:${rel.relationship_stage}`);
  }

  // Parse decay_rates JSON into tags
  const decayTags = parseDecayRates(rel.decay_rates);
  for (const tag of decayTags) {
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }

  return {
    title: `${rel.source_entity} ↔ ${rel.target_entity} Relationship`,
    type: "entity",
    status: "draft",
    universe: rel.universe_id || undefined,
    tags: tags.length > 0 ? tags : undefined,
  };
}

/**
 * Build the body content for a relationship wiki page.
 * Source and target entities are rendered as wikilinks.
 */
function getPageBody(rel: any): string {
  const parts: string[] = [];

  // Relationship header with wikilinks
  parts.push(
    `## Relationship: [[${rel.source_entity}]] ↔ [[${rel.target_entity}]]`
  );

  // Shared history section
  if (rel.shared_history) {
    parts.push(`## Shared History\n\n${rel.shared_history}`);
  } else {
    parts.push("## Shared History\n\n*(No shared history recorded)*");
  }

  // Key-value metadata
  const metaParts: string[] = [];
  if (rel.emotional_state) {
    metaParts.push(`**Emotional State:** ${rel.emotional_state}`);
  }
  if (rel.relationship_stage) {
    metaParts.push(`**Stage:** ${rel.relationship_stage}`);
  }

  if (metaParts.length > 0) {
    parts.push(metaParts.join("\n"));
  }

  return parts.join("\n\n");
}

/**
 * Print a single relationship migration entry (used in both dry-run and live mode).
 */
function logMigration(
  rel: any,
  userId: string,
  filename: string
): void {
  const fm = buildFrontmatter(rel);
  const wikiRelative = path.join(userId, "wiki", "entities", filename);

  console.log(
    `  ${IS_DRY_RUN ? "·" : "+"} ${rel.source_entity} ↔ ${rel.target_entity}`
  );
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
  console.log("  Relationship → Wiki Page Migration");
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
  let totalDbRelationships = 0;
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

    // Fetch relationships for this user
    const relationships = db
      .prepare(
        "SELECT id, user_id, universe_id, source_entity, target_entity, emotional_state, shared_history, relationship_stage, decay_rates, updated_at FROM relationships WHERE user_id = ? ORDER BY source_entity, target_entity"
      )
      .all(user.id) as any[];

    if (relationships.length === 0) {
      console.log(`  ${user.username}: no relationships to migrate`);
      continue;
    }

    console.log(`  ── ${user.username} (${user.id}) ──`);
    totalDbRelationships += relationships.length;

    for (const rel of relationships) {
      const filenameBase = `${rel.source_entity}-${rel.target_entity}-relationship`;
      const filename = sanitizeWikiFilename(filenameBase);
      const pagePath = path.join(entitiesDir, filename);

      // Skip if wiki page already exists
      if (fs.existsSync(pagePath)) {
        console.log(`  ~ ${rel.source_entity} ↔ ${rel.target_entity} → page exists (${filename})`);
        pagesSkipped++;
        continue;
      }

      // Build frontmatter and content
      const frontmatter = buildFrontmatter(rel);
      const body = getPageBody(rel);

      logMigration(rel, user.id, filename);

      // Write the wiki page (unless dry-run)
      if (!IS_DRY_RUN) {
        try {
          writeWikiPage(pagePath, body, frontmatter);
          pagesCreated++;
        } catch (err: any) {
          errors.push(`${rel.source_entity} ↔ ${rel.target_entity} (${user.id}): ${err.message}`);
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
  console.log(`  Relationships in DB:  ${totalDbRelationships}`);
  console.log(`  Wiki pages created:   ${pagesCreated}`);
  console.log(`  Wiki pages skipped:   ${pagesSkipped} (already exist)`);
  console.log(`  Users w/o wiki:       ${wikiMissing}`);

  if (errors.length > 0) {
    console.log(`  Errors:               ${errors.length}`);
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
