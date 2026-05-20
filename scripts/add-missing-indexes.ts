/**
 * Add missing database indexes for common query patterns.
 *
 * Idempotent: uses CREATE INDEX IF NOT EXISTS — safe to run multiple times.
 * Gracefully skips indexes on tables that don't exist (e.g. deprecated tables).
 *
 * Usage:
 *   npx tsx scripts/add-missing-indexes.ts
 *
 * Indexes added:
 *   1. messages(sender_id)
 *   2. messages(parent_message_id)
 *   3. sessions(group_id)
 *   4. universes(user_id)
 *   5. timelines(user_id)
 *   6. narrative_memories(user_id, session_id) — composite (skipped if table missing)
 *   7. job_queue(user_id, status) — composite
 *   8. relationships(user_id, universe_id, source_entity, target_entity) — composite
 *
 * Note: narrative_memories(user_id, universe_id) was requested but the
 * narrative_memories table does not have a universe_id column.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "global.db");

const INDEXES = [
  // messages: filter by sender, thread replies
  "CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)",
  "CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_message_id)",

  // sessions: group-scoped queries
  "CREATE INDEX IF NOT EXISTS idx_sessions_group ON sessions(group_id)",

  // universes: user-owned universes
  "CREATE INDEX IF NOT EXISTS idx_universes_user ON universes(user_id)",

  // timelines: user-owned timelines
  "CREATE INDEX IF NOT EXISTS idx_timelines_user ON timelines(user_id)",

  // narrative_memories: per-user per-session lookups
  "CREATE INDEX IF NOT EXISTS idx_narrative_memories_user_session ON narrative_memories(user_id, session_id)",

  // job_queue: user-specific status filtering
  "CREATE INDEX IF NOT EXISTS idx_job_queue_user_status ON job_queue(user_id, status)",

  // relationships: full composite for entity-level queries within a universe
  "CREATE INDEX IF NOT EXISTS idx_relationships_full ON relationships(user_id, universe_id, source_entity, target_entity)",
];

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName) as { name: string } | undefined;
  return !!row;
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`);
    console.error("Run init-db.ts first to create the database.");
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  console.log("Adding missing indexes...\n");

  let created = 0;
  let skipped = 0;

  for (const sql of INDEXES) {
    const match = sql.match(/ON (\w+)/);
    const tableName = match ? match[1] : null;
    const indexMatch = sql.match(/idx_\w+/);
    const indexName = indexMatch ? indexMatch[0] : "unknown";

    // Skip if target table doesn't exist (deprecated or not yet created)
    if (tableName && !tableExists(db, tableName)) {
      console.log(`  ⊘ ${indexName} — table "${tableName}" does not exist, skipping`);
      skipped++;
      continue;
    }

    try {
      db.exec(sql);
      console.log(`  ✓ ${indexName}`);
      created++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${indexName}: ${message}`);
    }
  }

  console.log(`\nDone. ${created} index(es) created, ${skipped} skipped.`);
  db.close();
}

main();
