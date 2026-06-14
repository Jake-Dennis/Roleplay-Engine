import { getDb } from "./db";

/**
 * Run schema migrations for existing databases that were created before
 * the audit remediation added new columns/tables.
 *
 * Safe to call on every startup — uses IF NOT EXISTS / try-catch for idempotency.
 */
export function runSchemaMigrations(): void {
  const db = getDb();

  // Migration: Add password_changed_at to users table (Token Rotation - Task 30)
  try {
    db.prepare(
      "ALTER TABLE users ADD COLUMN password_changed_at DATETIME"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add token_denylist table (Token Revocation - Task 31)
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS token_denylist (
        token_id TEXT PRIMARY KEY,
        expires_at DATETIME NOT NULL
      )
    `).run();
  } catch {
    // Table already exists — safe to ignore
  }

  // Migration: Add index on token_denylist.expires_at for cleanup efficiency
  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_token_denylist_expires ON token_denylist(expires_at)"
    ).run();
  } catch {
    // Table already exists — safe to ignore
  }

  // Migration: Add events table for databases created before Phase 0 - Task 4
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        universe_id TEXT REFERENCES universes(id),
        title TEXT,
        event_type TEXT,
        description TEXT,
        participants TEXT,
        location_id TEXT,
        occurred_at TEXT,
        outcome TEXT,
        consequences TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch {
    // Table already exists — safe to ignore
  }

  // Migration: Add consequences column to events table if missing
  try {
    db.prepare(
      "ALTER TABLE events ADD COLUMN consequences TEXT"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add index on events.user_id for fast lookups
  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  // Migration: Add index on events.universe_id for fast lookups
  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_events_universe ON events(universe_id)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  // Migration: Add current_intent column to scene_states (Phase 0 - Task 1)
  try {
    db.prepare(
      "ALTER TABLE scene_states ADD COLUMN current_intent TEXT"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add polymorphic columns to message_summaries (Phase 0 - Task 2)
  try {
    db.prepare(
      "ALTER TABLE message_summaries ADD COLUMN message_id TEXT REFERENCES messages(id)"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }
  try {
    db.prepare(
      "ALTER TABLE message_summaries ADD COLUMN summary_type TEXT"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }
  try {
    db.prepare(
      "ALTER TABLE message_summaries ADD COLUMN content TEXT"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add description to narrative_threads (Phase 0 - Task 5)
  try {
    db.prepare("ALTER TABLE narrative_threads ADD COLUMN description TEXT").run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add arc_type to narrative_threads (Phase 0 - Task 5)
  try {
    db.prepare("ALTER TABLE narrative_threads ADD COLUMN arc_type TEXT DEFAULT 'thread'").run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add updated_at to narrative_threads (Phase 0 - Task 5)
  try {
    db.prepare("ALTER TABLE narrative_threads ADD COLUMN updated_at DATETIME").run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add resolved_at to narrative_threads (Phase 0 - Task 5)
  try {
    db.prepare("ALTER TABLE narrative_threads ADD COLUMN resolved_at DATETIME").run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add name to narrative_threads
  try {
    db.prepare("ALTER TABLE narrative_threads ADD COLUMN name TEXT").run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add summary to narrative_threads
  try {
    db.prepare("ALTER TABLE narrative_threads ADD COLUMN summary TEXT").run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add key_entities to narrative_threads
  try {
    db.prepare("ALTER TABLE narrative_threads ADD COLUMN key_entities TEXT").run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add unresolved_items to narrative_threads
  try {
    db.prepare("ALTER TABLE narrative_threads ADD COLUMN unresolved_items TEXT").run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add entity_mentions table (Task 21)
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS entity_mentions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        entity_name TEXT NOT NULL,
        source_table TEXT NOT NULL,
        source_id TEXT NOT NULL,
        frequency INTEGER DEFAULT 1,
        last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, entity_name, source_table, source_id)
      )
    `).run();
  } catch {
    // Table already exists — safe to ignore
  }

  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_entity_mentions_user ON entity_mentions(user_id)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_entity_mentions_name ON entity_mentions(entity_name)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  // Migration: Add contradiction_flags table (Task 23)
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS contradiction_flags (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        entity_name TEXT NOT NULL,
        page_a TEXT NOT NULL,
        page_b TEXT NOT NULL,
        claim_a TEXT NOT NULL,
        claim_b TEXT NOT NULL,
        contradiction_type TEXT DEFAULT 'unknown',
        severity TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'open',
        detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        resolution TEXT
      )
    `).run();
  } catch {
    // Table already exists — safe to ignore
  }

  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_contradiction_flags_user ON contradiction_flags(user_id)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_contradiction_flags_status ON contradiction_flags(status)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_contradiction_flags_entity ON contradiction_flags(entity_name)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  // Migration: Add relationship_evolution table (Task 26)
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS relationship_evolution (
        id TEXT PRIMARY KEY,
        relationship_id TEXT NOT NULL REFERENCES relationships(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        emotional_state TEXT,
        relationship_stage TEXT,
        trigger_event TEXT,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch {
    // Table already exists — safe to ignore
  }

  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_relationship_evolution_rel ON relationship_evolution(relationship_id)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  // Migration: Add narrative_anchors table (Task 27)
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS narrative_anchors (
        id TEXT PRIMARY KEY,
        relationship_id TEXT NOT NULL REFERENCES relationships(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        anchor_type TEXT NOT NULL,
        description TEXT,
        emotional_impact TEXT,
        irreversible INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch {
    // Table already exists — safe to ignore
  }

  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_narrative_anchors_rel ON narrative_anchors(relationship_id)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_narrative_anchors_user ON narrative_anchors(user_id)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  // Migration: Add scene_type to scene_states (Task 31)
  try {
    db.prepare(
      "ALTER TABLE scene_states ADD COLUMN scene_type TEXT"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add scene_tension to scene_states (Task 31)
  try {
    db.prepare(
      "ALTER TABLE scene_states ADD COLUMN scene_tension REAL DEFAULT 0.5"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add conflict_type to scene_states (Task 31)
  try {
    db.prepare(
      "ALTER TABLE scene_states ADD COLUMN conflict_type TEXT"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add stakes to scene_states (Task 31)
  try {
    db.prepare(
      "ALTER TABLE scene_states ADD COLUMN stakes TEXT"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add narrative_tension to sessions (Task 30)
  try {
    db.prepare(
      "ALTER TABLE sessions ADD COLUMN narrative_tension REAL DEFAULT 0.3"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add pacing to sessions (Task 30)
  try {
    db.prepare(
      "ALTER TABLE sessions ADD COLUMN pacing REAL DEFAULT 0.3"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add narrative_phase to sessions (Task 30)
  try {
    db.prepare(
      "ALTER TABLE sessions ADD COLUMN narrative_phase TEXT DEFAULT 'setup'"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add active_goals to sessions (Task 30)
  try {
    db.prepare(
      "ALTER TABLE sessions ADD COLUMN active_goals TEXT"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add active_conflicts to sessions (Task 30)
  try {
    db.prepare(
      "ALTER TABLE sessions ADD COLUMN active_conflicts TEXT"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add decision_points table (Task 34)
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS decision_points (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        prompt TEXT NOT NULL,
        choices_made TEXT,
        narrative_context TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch {
    // Table already exists — safe to ignore
  }

  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_decision_points_session ON decision_points(session_id)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_decision_points_user ON decision_points(user_id)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  // Migration: Add time_period column to universes table
  try {
    db.prepare(
      "ALTER TABLE universes ADD COLUMN time_period TEXT"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add scene_states session index for session-based queries
  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_scene_states_session ON scene_states(session_id, updated_at)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  // Migration: Add narrative_memories composite lookup index
  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_narrative_memories_lookup ON narrative_memories(user_id, session_id, universe_id)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  // Migration: Add narrative_anchors user+universe index
  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_narrative_anchors_user_universe ON narrative_anchors(user_id, universe_id)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  // Migration: Add entity_id column to entity_mentions (FK to entity_registry)
  try {
    db.prepare(
      "ALTER TABLE entity_mentions ADD COLUMN entity_id TEXT REFERENCES entity_registry(id)"
    ).run();
  } catch { /* already exists */ }

  // Migration: Add entity_mentions frequency index for trending analysis
  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_entity_mentions_user_freq ON entity_mentions(user_id, frequency DESC)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  // Migration: Add speaking_as to messages (Conversation Tracking)
  try {
    db.prepare(
      "ALTER TABLE messages ADD COLUMN speaking_as TEXT"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add persona_id to messages if missing (some dbs created before group-migrations ran)
  try {
    db.prepare(
      "ALTER TABLE messages ADD COLUMN persona_id TEXT"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Entity ID columns in relationships
  for (const col of ["source_entity_id", "target_entity_id"]) {
    try {
      db.prepare(`ALTER TABLE relationships ADD COLUMN ${col} TEXT REFERENCES entity_registry(id)`).run();
    } catch { /* already exists */ }
  }

  // Migration: Entity registry tables
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS entity_registry (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('persona', 'npc', 'user', 'location', 'event', 'faction', 'item')),
      display_name TEXT NOT NULL,
      description TEXT,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS entity_aliases (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL REFERENCES entity_registry(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      source TEXT DEFAULT 'user_defined' CHECK(source IN ('user_defined', 'llm_extracted', 'wiki_sync')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch { /* already exists */ }

  for (const idx of [
    "CREATE INDEX IF NOT EXISTS idx_entity_registry_user ON entity_registry(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_entity_registry_universe ON entity_registry(universe_id)",
    "CREATE INDEX IF NOT EXISTS idx_entity_registry_type ON entity_registry(entity_type)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_aliases_alias ON entity_aliases(alias)",
  ]) {
    try { db.exec(idx); } catch { /* already exists */ }
  }

  // Migration: Add description column to entity_registry
  try {
    db.exec("ALTER TABLE entity_registry ADD COLUMN description TEXT");
  } catch { /* already exists */ }

  // Migration: Update CHECK constraint to allow 'item' type
  // SQLite can't ALTER CHECK, so we recreate the table
  try {
    // Check if 'item' is already allowed
    const tblInfo = db.prepare("PRAGMA table_info(entity_registry)").all() as { name: string }[];
    const typeCol = tblInfo.find(c => c.name === 'entity_type');
    if (typeCol) {
      // Try inserting 'item' to see if the constraint rejects it
      try {
        db.prepare("INSERT INTO entity_registry (id, entity_type, display_name, user_id) VALUES (?, 'item', ?, ?)")
          .run('_check_item_constraint_', '_check_', '_check_');
        // If it succeeded, drop the test row — constraint already allows item
        db.prepare("DELETE FROM entity_registry WHERE id = '_check_item_constraint_'").run();
      } catch {
        // Constraint rejected 'item' — recreate table
        db.exec(`
          CREATE TABLE IF NOT EXISTS entity_registry_new (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('persona', 'npc', 'user', 'location', 'event', 'faction', 'item')),
            display_name TEXT NOT NULL,
            description TEXT,
            user_id TEXT NOT NULL REFERENCES users(id),
            universe_id TEXT REFERENCES universes(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
        db.exec(`INSERT INTO entity_registry_new SELECT * FROM entity_registry`);
        db.exec(`DROP TABLE entity_registry`);
        db.exec(`ALTER TABLE entity_registry_new RENAME TO entity_registry`);
        // Recreate indexes
        db.exec("CREATE INDEX IF NOT EXISTS idx_entity_registry_user ON entity_registry(user_id)");
        db.exec("CREATE INDEX IF NOT EXISTS idx_entity_registry_universe ON entity_registry(universe_id)");
        db.exec("CREATE INDEX IF NOT EXISTS idx_entity_registry_type ON entity_registry(entity_type)");
      }
    }
  } catch { /* non-fatal */ }
}
