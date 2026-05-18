/**
 * Migration: Backlinks (validation only) + Lore Validations → Wiki Frontmatter
 *
 * BACKLINKS:
 *   Backlinks are NOT stored as separate wiki pages. Instead they are derived
 *   from wikilinks in existing wiki page content via buildLinkGraph().
 *   This script validates that backlinks can be rebuilt and reports stats.
 *
 * LORE VALIDATIONS:
 *   Reads lore_validations from the DB and updates the corresponding wiki page
 *   frontmatter status field based on the validation state:
 *
 *     generated_unverified → draft   (default, no change needed)
 *     under_review         → draft   (no change needed)
 *     validated            → reviewed (update frontmatter)
 *     rejected             → rejected or page deletion (--reject-action)
 *
 *   Entity type → wiki page mapping:
 *     location     → entities/{name}.md
 *     npc          → entities/{name}.md
 *     event        → entities/{title}.md
 *     relationship → entities/{source}-{target}-relationship.md
 *
 *   Old DB entries are NOT deleted or modified.
 *
 * Usage:
 *   npx tsx scripts/migrate-backlinks-validations.ts                # all users
 *   npx tsx scripts/migrate-backlinks-validations.ts --userId <id>  # specific user
 *   npx tsx scripts/migrate-backlinks-validations.ts --dry-run      # preview only
 *   npx tsx scripts/migrate-backlinks-validations.ts --reject-action delete
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import {
  readWikiPage,
  writeWikiPage,
  sanitizeWikiFilename,
  listWikiPages,
  WikiFrontmatter,
} from "../src/lib/wiki/file-io";
import { buildLinkGraph } from "../src/lib/wiki/wikilinks";
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
const REJECT_ACTION: "mark" | "delete" = args.includes("--reject-action")
  ? (args[args.indexOf("--reject-action") + 1] as "mark" | "delete") || "mark"
  : "mark";

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: npx tsx scripts/migrate-backlinks-validations.ts [options]

Options:
  --dry-run              Preview changes (no files written)
  --userId <id>          Only process a specific user
  --reject-action <act>  Action for rejected validations: "mark" (set status:rejected, default) or "delete" (remove page)
  --help, -h             Show this help message
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up the entity name from the appropriate DB table.
 * Returns the display name used to construct the wiki filename, or null if
 * the entity record does not exist.
 */
function resolveEntityName(
  db: Database.Database,
  entityType: string,
  entityId: string
): string | null {
  switch (entityType) {
    case "location": {
      const row = db
        .prepare("SELECT name FROM locations WHERE id = ?")
        .get(entityId) as { name: string } | undefined;
      return row?.name ?? null;
    }
    case "npc": {
      const row = db
        .prepare("SELECT name FROM npcs WHERE id = ?")
        .get(entityId) as { name: string } | undefined;
      return row?.name ?? null;
    }
    case "event": {
      const row = db
        .prepare("SELECT title FROM events WHERE id = ?")
        .get(entityId) as { title: string } | undefined;
      return row?.title ?? null;
    }
    case "relationship": {
      const row = db
        .prepare("SELECT source_entity, target_entity FROM relationships WHERE id = ?")
        .get(entityId) as { source_entity: string; target_entity: string } | undefined;
      if (!row) return null;
      return `${row.source_entity}-${row.target_entity}-relationship`;
    }
    default:
      return null;
  }
}

/**
 * Construct the expected wiki page path for a given entity type and display name.
 */
function getWikiPagePath(
  entitiesDir: string,
  entityType: string,
  displayName: string
): string {
  const filename = sanitizeWikiFilename(displayName);
  return path.join(entitiesDir, filename);
}

/**
 * Map a lore_validation state to a wiki frontmatter status.
 */
function validationStateToStatus(
  state: string
): WikiFrontmatter["status"] | null {
  switch (state) {
    case "generated_unverified":
    case "under_review":
      return null; // no change needed (already draft)
    case "validated":
      return "reviewed";
    case "rejected":
      return "rejected";
    default:
      return null; // unknown state, no change
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Backlinks (validation) + Lore Validations → Wiki Migration");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log(`  Mode:           ${IS_DRY_RUN ? "DRY-RUN (no files written)" : "LIVE"}`);
  console.log(`  Reject action:  ${REJECT_ACTION}`);
  if (USER_ID_FILTER) console.log(`  User:           ${USER_ID_FILTER}`);
  console.log(`  Data dir:       ${DATA_DIR}\n`);

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
  // Backlinks
  let totalOutgoingLinks = 0;
  let totalPagesWithLinks = 0;
  let totalOrphanPages = 0;
  // Validations
  let totalValidations = 0;
  let validationsApplied = 0;
  let validationsSkipped = 0;
  let validationsPageMissing = 0;
  let validationsEntityMissing = 0;
  let pagesDeleted = 0;
  // General
  let wikiMissing = 0;
  const errors: string[] = [];

  // --- Process each user ---
  for (const user of users) {
    if (USER_ID_FILTER && user.id !== USER_ID_FILTER) continue;

    const wikiRoot = path.join(DATA_DIR, user.id, "wiki");
    const entitiesDir = path.join(wikiRoot, "entities");

    // Check wiki directory exists
    if (!fs.existsSync(wikiRoot)) {
      console.log(
        `  [SKIP] ${user.username} — no wiki directory (run init-wiki.ts first)`
      );
      wikiMissing++;
      continue;
    }

    console.log(`  ── ${user.username} (${user.id}) ──`);

    // =====================================================================
    // SECTION 1: Backlinks — validate that the link graph can be rebuilt
    // =====================================================================
    console.log("");
    console.log("  [Backlinks]");

    const pages = listWikiPages(wikiRoot);

    if (pages.length === 0) {
      console.log("    No wiki pages found to build link graph.");
    } else {
      const linkGraph = buildLinkGraph(pages);

      // Compute outgoing links per page
      let userOutgoingLinks = 0;
      let userPagesWithLinks = 0;

      for (const [, targets] of linkGraph.nodes) {
        if (targets.length > 0) {
          userOutgoingLinks += targets.length;
          userPagesWithLinks++;
        }
      }

      // Compute backlinks (incoming links per page)
      const backlinkMap = new Map<string, string[]>();
      for (const page of pages) {
        backlinkMap.set(page.path, []);
      }
      for (const [sourcePath, targets] of linkGraph.nodes) {
        for (const targetPath of targets) {
          const existing = backlinkMap.get(targetPath) ?? [];
          existing.push(sourcePath);
          backlinkMap.set(targetPath, existing);
        }
      }

      // Pages with no incoming links = orphans
      const orphanPages: string[] = [];
      for (const page of pages) {
        const incoming = backlinkMap.get(page.path) ?? [];
        if (incoming.length === 0) {
          orphanPages.push(page.path);
        }
      }

      totalOutgoingLinks += userOutgoingLinks;
      totalPagesWithLinks += userPagesWithLinks;
      totalOrphanPages += orphanPages.length;

      console.log(`    Wiki pages found:             ${pages.length}`);
      console.log(`    Outgoing wikilinks:           ${userOutgoingLinks}`);
      console.log(`    Pages with outgoing links:    ${userPagesWithLinks}`);
      console.log(`    Orphan pages (no backlinks):  ${orphanPages.length}`);

      if (orphanPages.length > 0 && orphanPages.length <= 10) {
        for (const op of orphanPages) {
          const relPath = path.relative(wikiRoot, op);
          console.log(`      · ${relPath}`);
        }
      } else if (orphanPages.length > 10) {
        console.log(`      (list too long, use --userId to scope)`);
      }
    }

    // =====================================================================
    // SECTION 2: Lore Validations — map to wiki page frontmatter
    // =====================================================================
    console.log("");
    console.log("  [Lore Validations]");

    const validations = db
      .prepare(
        "SELECT id, user_id, universe_id, entity_type, entity_id, state, validation_notes, validated_by, validated_at, created_at FROM lore_validations WHERE user_id = ? ORDER BY entity_type, entity_id"
      )
      .all(user.id) as any[];

    if (validations.length === 0) {
      console.log("    No lore validations found.");
    } else {
      console.log(`    Validations in DB: ${validations.length}`);
      totalValidations += validations.length;

      for (const val of validations) {
        // Look up the entity name from the respective DB table
        const displayName = resolveEntityName(db, val.entity_type, val.entity_id);

        if (!displayName) {
          console.log(
            `    ~ [SKIP] ${val.entity_type}:${val.entity_id} → entity record not found in DB`
          );
          validationsEntityMissing++;
          continue;
        }

        // Map validation state to frontmatter status
        const targetStatus = validationStateToStatus(val.state);

        // generated_unverified and under_review → no change needed
        if (targetStatus === null) {
          console.log(
            `    · ${val.entity_type}:${val.entity_id} (${displayName}) → state "${val.state}" requires no frontmatter change`
          );
          validationsSkipped++;
          continue;
        }

        // Construct wiki page path
        const pagePath = getWikiPagePath(entitiesDir, val.entity_type, displayName);

        if (!fs.existsSync(pagePath)) {
          console.log(
            `    ~ [WARN] ${val.entity_type}:${val.entity_id} (${displayName}) → wiki page not found at ${path.relative(wikiRoot, pagePath)}`
          );
          validationsPageMissing++;
          continue;
        }

        // Read existing page
        let existingPage;
        try {
          existingPage = readWikiPage(pagePath);
        } catch (err: any) {
          errors.push(
            `Failed to read ${pagePath} (${val.entity_type}:${val.entity_id}): ${err.message}`
          );
          console.log(
            `    ERROR: Failed to read ${path.relative(wikiRoot, pagePath)}`
          );
          continue;
        }

        // Handle rejected pages
        if (val.state === "rejected" && REJECT_ACTION === "delete") {
          if (!IS_DRY_RUN) {
            try {
              fs.unlinkSync(pagePath);
              pagesDeleted++;
              console.log(
                `    ✗ ${val.entity_type}:${val.entity_id} (${displayName}) → page DELETED (rejected)`
              );
            } catch (err: any) {
              errors.push(
                `Failed to delete ${pagePath}: ${err.message}`
              );
              console.log(
                `    ERROR: Failed to delete ${path.relative(wikiRoot, pagePath)}`
              );
            }
          } else {
            pagesDeleted++;
            console.log(
              `    ✗ ${val.entity_type}:${val.entity_id} (${displayName}) → would DELETE page (rejected) [dry-run]`
            );
          }
          continue;
        }

        // Update frontmatter status
        const existingFm = existingPage.frontmatter as WikiFrontmatter;
        const currentStatus = existingFm.status;
        const newStatus = targetStatus as WikiFrontmatter["status"];

        if (currentStatus === newStatus) {
          console.log(
            `    · ${val.entity_type}:${val.entity_id} (${displayName}) → status already "${newStatus}", no change`
          );
          validationsSkipped++;
          continue;
        }

        // Log the change
        const statusChange = `${currentStatus || "none"} → ${newStatus}`;
        const wikiRelPath = path.relative(wikiRoot, pagePath);
        console.log(
          `  ${IS_DRY_RUN ? "·" : "+"} ${val.entity_type}:${val.entity_id} (${displayName})`
        );
        console.log(`    path:   ${wikiRelPath}`);
        console.log(`    status: ${statusChange}`);

        // Write updated frontmatter (unless dry-run)
        if (!IS_DRY_RUN) {
          try {
            const updatedFm: WikiFrontmatter = {
              ...existingFm,
              status: newStatus,
            };
            writeWikiPage(pagePath, existingPage.content, updatedFm);
            validationsApplied++;
          } catch (err: any) {
            errors.push(
              `${displayName} (${val.entity_type}:${val.entity_id}, ${user.id}): ${err.message}`
            );
            console.log(`    ERROR: ${err.message}`);
          }
        } else {
          validationsApplied++;
        }
      }
    }

    console.log("");
  }

  // --- Regenerate wiki index ---
  if (!IS_DRY_RUN && (validationsApplied > 0 || pagesDeleted > 0)) {
    console.log("  Regenerating wiki index files...\n");

    for (const user of users) {
      if (USER_ID_FILTER && user.id !== USER_ID_FILTER) continue;
      const wikiRoot = path.join(DATA_DIR, user.id, "wiki");
      if (!fs.existsSync(wikiRoot)) continue;

      try {
        generateIndex(wikiRoot);
        console.log(`  ✓ Index regenerated for ${user.username}`);
      } catch (err: any) {
        console.error(
          `  ✗ Failed to regenerate index for ${user.username}: ${err.message}`
        );
      }
    }
    console.log("");
  }

  db.close();

  // --- Summary ---
  console.log("── Summary ──────────────────────────────────");
  console.log("  Backlinks:");
  console.log(`    Wiki pages processed:   ${totalPagesWithLinks + (totalOrphanPages > 0 ? totalOrphanPages : 0)}`);
  console.log(`    Total outgoing links:   ${totalOutgoingLinks}`);
  console.log(`    Pages with backlinks:   ${totalPagesWithLinks}`);
  console.log(`    Orphan pages (none):    ${totalOrphanPages}`);
  console.log("  Lore Validations:");
  console.log(`    Total in DB:            ${totalValidations}`);
  console.log(`    Frontmatter updates:    ${validationsApplied}`);
  console.log(`    Skipped (no change):    ${validationsSkipped}`);
  console.log(`    Wiki page missing:      ${validationsPageMissing}`);
  console.log(`    Entity record missing:  ${validationsEntityMissing}`);
  console.log(`    Pages deleted:          ${pagesDeleted}${REJECT_ACTION !== "delete" ? " (reject-action is 'mark', not 'delete')" : ""}`);
  console.log(`  Users w/o wiki:           ${wikiMissing}`);

  if (errors.length > 0) {
    console.log(`  Errors:                   ${errors.length}`);
    for (const err of errors) {
      console.log(`    • ${err}`);
    }
  }

  if (IS_DRY_RUN) {
    console.log(
      "\n  Dry-run complete. Run without --dry-run to write files."
    );
  } else {
    console.log("\n  Migration complete.");
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

main();
