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
}
