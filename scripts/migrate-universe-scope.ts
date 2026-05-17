/**
 * Migration: Scope all lore/entities to universes
 *
 * Adds universe_id columns to all entity tables so that lore, characters,
 * relationships, events, threads, validations, jobs, backlinks, etc.
 * are scoped to a specific universe.
 *
 * Existing data is assigned to the user's first universe (by created_at).
 * If a user has no universes, universe_id remains NULL (global/fallback).
 */

import Database from "better-sqlite3";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const dbPath = path.join(DATA_DIR, "global.db");

function main() {
  console.log("Running migration: scope entities to universes...");

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Helper: add column if not exists
  function addColumn(table: string, column: string, definition: string) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`  Added ${column} to ${table}`);
    } catch (e: any) {
      if (e.message.includes("duplicate column")) {
        console.log(`  ${column} already exists in ${table}, skipping`);
      } else {
        throw e;
      }
    }
  }

  // 1. Add universe_id columns
  addColumn("locations", "universe_id", "TEXT REFERENCES universes(id)");
  addColumn("npcs", "universe_id", "TEXT REFERENCES universes(id)");
  addColumn("relationships", "universe_id", "TEXT REFERENCES universes(id)");
  addColumn("events", "universe_id", "TEXT REFERENCES universes(id)");
  addColumn("narrative_threads", "universe_id", "TEXT REFERENCES universes(id)");
  addColumn("lore_validations", "universe_id", "TEXT REFERENCES universes(id)");
  addColumn("job_queue", "universe_id", "TEXT REFERENCES universes(id)");
  addColumn("backlinks", "universe_id", "TEXT REFERENCES universes(id)");
  addColumn("embedding_index", "universe_id", "TEXT REFERENCES universes(id)");
  addColumn("narrative_memories", "universe_id", "TEXT REFERENCES universes(id)");

  // 2. Migrate existing data: assign to user's first universe
  const users = db.prepare("SELECT id FROM users").all() as { id: string }[];

  for (const user of users) {
    // Find user's first universe
    const firstUniverse = db.prepare(
      "SELECT id FROM universes WHERE user_id = ? ORDER BY created_at ASC LIMIT 1"
    ).get(user.id) as { id: string } | undefined;

    if (!firstUniverse) {
      console.log(`  User ${user.id} has no universes, leaving entities as global`);
      continue;
    }

    const uid = firstUniverse.id;

    // Assign existing entities to the first universe
    const tables = [
      "locations", "npcs", "relationships", "events",
      "narrative_threads", "lore_validations", "job_queue",
      "backlinks", "embedding_index", "narrative_memories"
    ];

    for (const table of tables) {
      const result = db.prepare(
        `UPDATE ${table} SET universe_id = ? WHERE user_id = ? AND universe_id IS NULL`
      ).run(uid, user.id);
      if (result.changes > 0) {
        console.log(`  Assigned ${result.changes} ${table} to universe ${uid}`);
      }
    }
  }

  // 3. Create indexes for universe-scoped queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_locations_universe ON locations(universe_id);
    CREATE INDEX IF NOT EXISTS idx_npcs_universe ON npcs(universe_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_universe ON relationships(universe_id);
    CREATE INDEX IF NOT EXISTS idx_events_universe ON events(universe_id);
    CREATE INDEX IF NOT EXISTS idx_narrative_threads_universe ON narrative_threads(universe_id);
    CREATE INDEX IF NOT EXISTS idx_lore_validations_universe ON lore_validations(universe_id);
    CREATE INDEX IF NOT EXISTS idx_job_queue_universe ON job_queue(universe_id);
    CREATE INDEX IF NOT EXISTS idx_backlinks_universe ON backlinks(universe_id);
    CREATE INDEX IF NOT EXISTS idx_embedding_index_universe ON embedding_index(universe_id);
    CREATE INDEX IF NOT EXISTS idx_narrative_memories_universe ON narrative_memories(universe_id);
  `);
  console.log("  Created universe indexes");

  db.close();
  console.log("Migration complete.");
}

main();
