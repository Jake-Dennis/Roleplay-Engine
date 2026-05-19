/**
 * Migration: Migrate events from DB to wiki pages
 *
 * Reads all events from the database, converts them to wiki page format:
 *   data/{userId}/wiki/entities/{event-title}.md
 *
 * Frontmatter mapping:
 *   title         → title
 *   event_type    → tags    (e.g. "event_type:battle")
 *   location_id   → wikilink to location page (in body content)
 *   participants  → wikilinks to participant pages (in body content)
 *   occurred_at   → date tag (e.g. "date:2024-01-15")
 *   canon_layer   → status  (immutable_canon→locked, soft_canon→reviewed, generated_lore→draft, session_lore→draft, rumor→draft)
 *   importance    → tags    (e.g. "importance:high")
 *   universe_id   → universe
 *
 * Body content includes outcome and consequences.
 * Regenerates index.md after migration.
 *
 * Usage:
 *   npx tsx scripts/migrate-events-to-wiki.ts              # migrate all users
 *   npx tsx scripts/migrate-events-to-wiki.ts --userId <id> # specific user
 *   npx tsx scripts/migrate-events-to-wiki.ts --dry-run     # preview only
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
Usage: npx tsx scripts/migrate-events-to-wiki.ts [options]

Options:
  --dry-run         Preview events that would be migrated (no files written)
  --userId <id>     Only migrate events belonging to this user
  --help, -h        Show this help message
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map DB canon_layer to wiki page frontmatter status.
 *
 *   immutable_canon → locked   (source material, immutable)
 *   soft_canon      → reviewed (user-approved, expandable)
 *   generated_lore  → draft    (AI-generated, pending review)
 *   session_lore    → draft    (temporary narrative state)
 *   rumor           → draft    (unverified information)
 *   null/unknown    → draft    (fallback)
 */
function canonLayerToStatus(
  canonLayer: string | null
): WikiFrontmatter["status"] {
  switch (canonLayer) {
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
 * Parse participants stored as JSON text array into a string array.
 */
function parseParticipants(raw: string | null): string[] {
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
 * Format occurred_at as a date tag string (e.g. "date:2024-01-15").
 * Returns null if the date cannot be parsed.
 */
function formatDateTag(occurredAt: string | null): string | null {
  if (!occurredAt) return null;
  try {
    const d = new Date(occurredAt);
    if (isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `date:${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

/**
 * Build the wiki frontmatter object from a DB event row.
 */
function buildFrontmatter(event: any): WikiFrontmatter {
  const tags: string[] = [];

  // Map event_type to tags so filtering works
  if (event.event_type) {
    tags.push(`event_type:${event.event_type}`);
  }

  // Map importance to tags so filtering works
  if (event.importance) {
    tags.push(`importance:${event.importance}`);
  }

  // Map occurred_at to date tag
  const dateTag = formatDateTag(event.occurred_at);
  if (dateTag) {
    tags.push(dateTag);
  }

  return {
    title: event.title || "Unknown Event",
    type: "entity",
    status: canonLayerToStatus(event.canon_layer),
    universe: event.universe_id || undefined,
    tags: tags.length > 0 ? tags : undefined,
  };
}

/**
 * Build the body content for an event wiki page from DB fields.
 */
function getPageBody(event: any, db: Database.Database): string {
  const parts: string[] = [];

  // Add Outcome section
  if (event.outcome) {
    parts.push(`## Outcome\n\n${event.outcome}`);
  }

  // Add Consequences section
  if (event.consequences) {
    parts.push(`## Consequences\n\n${event.consequences}`);
  }

  // Add Participants wikilinks
  const participantNames = parseParticipants(event.participants);
  if (participantNames.length > 0) {
    const links = participantNames.map((name) => `[[${name}]]`).join(", ");
    parts.push(`**Participants:** ${links}`);
  }

  // Add Location wikilink
  if (event.location_id) {
    const locationName = resolveLocationName(db, event.location_id);
    if (locationName) {
      parts.push(`**Location:** [[${locationName}]]`);
    }
  }

  // Fallback if nothing produced content
  if (parts.length === 0) {
    return `# ${event.title}\n\nEvent record migrated from lore system.`;
  }

  return parts.join("\n\n");
}

/**
 * Print a single event migration entry (used in both dry-run and live mode).
 */
function logMigration(
  event: any,
  userId: string,
  filename: string,
  locationName?: string | null
): void {
  const fm = buildFrontmatter(event);
  const wikiRelative = path.join(userId, "wiki", "entities", filename);
  const participantNames = parseParticipants(event.participants);

  console.log(`  ${IS_DRY_RUN ? "·" : "+"} ${event.title}`);
  console.log(`    path:    ${wikiRelative}`);
  console.log(`    status:  ${fm.status}`);
  console.log(`    tags:    ${fm.tags?.join(", ") || "(none)"}`);
  if (fm.universe) console.log(`    universe: ${fm.universe}`);
  if (locationName) console.log(`    location: [[${locationName}]]`);
  if (participantNames.length > 0) {
    console.log(`    participants: ${participantNames.map((n) => `[[${n}]]`).join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log("═══════════════════════════════════════════════");
  console.log("  Event → Wiki Page Migration");
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
  let totalDbEvents = 0;
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

    // Fetch events for this user
    const events = db
      .prepare(
        "SELECT id, user_id, universe_id, title, event_type, location_id, participants, outcome, consequences, importance, canon_layer, occurred_at, created_at FROM events WHERE user_id = ? ORDER BY title"
      )
      .all(user.id) as any[];

    if (events.length === 0) {
      console.log(`  ${user.username}: no events to migrate`);
      continue;
    }

    console.log(`  ── ${user.username} (${user.id}) ──`);
    totalDbEvents += events.length;

    for (const event of events) {
      const filename = sanitizeWikiFilename(event.title);
      const pagePath = path.join(entitiesDir, filename);

      // Skip if wiki page already exists
      if (fs.existsSync(pagePath)) {
        console.log(`  ~ ${event.title} → page exists (${filename})`);
        pagesSkipped++;
        continue;
      }

      // Resolve location wikilink
      const locationName = resolveLocationName(db, event.location_id);

      // Build frontmatter and content
      const frontmatter = buildFrontmatter(event);
      const body = getPageBody(event, db);

      logMigration(event, user.id, filename, locationName);

      // Write the wiki page (unless dry-run)
      if (!IS_DRY_RUN) {
        try {
          writeWikiPage(pagePath, body, frontmatter);
          pagesCreated++;
        } catch (err: any) {
          errors.push(`${event.title} (${user.id}): ${err.message}`);
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
  console.log(`  Events in DB:        ${totalDbEvents}`);
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
