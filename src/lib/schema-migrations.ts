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
    // Index already exists — safe to ignore
  }

  // Migration: Add session_config table (Turn Config - Wave 4)
  // Used by GET /api/sessions/[id] for turn_mode, turn_order, current_turn
  // The turn route creates this inline, but the session GET route does not.
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS session_config (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        key TEXT NOT NULL,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, key)
      )
    `).run();
  } catch {
    // Table already exists — safe to ignore
  }

  // Migration: Add index on session_config(session_id, key) for fast lookups
  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_session_config_lookup ON session_config(session_id, key)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  // Migration: Add private_state column to session_participants (Wave 4 - Dual State Consolidation)
  try {
    db.prepare(
      "ALTER TABLE session_participants ADD COLUMN private_state TEXT"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add npcs table (NPCs - Wave 5)
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS npcs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        universe_id TEXT REFERENCES universes(id),
        name TEXT NOT NULL,
        description TEXT,
        personality_traits TEXT,
        behavior_patterns TEXT,
        voice_id TEXT,
        is_canon BOOLEAN DEFAULT 0,
        evolution_log TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      )
    `).run();
  } catch {
    // Table already exists — safe to ignore
  }

  // Migration: Add indexes for npcs table
  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_npcs_user ON npcs(user_id)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_npcs_universe ON npcs(universe_id)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  // Migration: Add wiki_versions table (Wiki Versioning)
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS wiki_versions (
        id TEXT PRIMARY KEY,
        page_path TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id),
        version_number INTEGER NOT NULL,
        change_summary TEXT,
        file_snapshot_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch {
    // Table already exists — safe to ignore
  }

  // Migration: Add FTS5 virtual table for message search with sync triggers
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, session_id, sender_id)
    `);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages
      BEGIN
        INSERT INTO messages_fts(rowid, content, session_id, sender_id)
        VALUES (new.rowid, new.content, new.session_id, new.sender_id);
      END
    `);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages
      BEGIN
        UPDATE messages_fts SET content = new.content, session_id = new.session_id, sender_id = new.sender_id
        WHERE rowid = new.rowid;
      END
    `);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages
      BEGIN
        DELETE FROM messages_fts WHERE rowid = old.rowid;
      END
    `);
    // Backfill existing messages into FTS5 index
    db.exec(`
      INSERT OR IGNORE INTO messages_fts(rowid, content, session_id, sender_id)
      SELECT rowid, content, session_id, sender_id FROM messages
    `);
  } catch {
    // FTS5 table or triggers already exist — safe to ignore
  }

  // Migration: Add result column to job_queue (Session Recap - Wave 3)
  try {
    db.prepare(
      "ALTER TABLE job_queue ADD COLUMN result TEXT"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: Add personas table (Personas - Wave 6)
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS personas (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        description TEXT,
        personality TEXT,
        scenario TEXT,
        first_mes TEXT,
        mes_example TEXT,
        creator_notes TEXT,
        system_prompt TEXT,
        post_history_instructions TEXT,
        tags TEXT,
        writing_style TEXT,
        avatar_url TEXT,
        llm_model TEXT,
        tts_voice TEXT,
        is_active INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch {
    // Table already exists — safe to ignore
  }

  // Migration: Add index on personas(user_id) for fast lookups
  try {
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_personas_user ON personas(user_id)"
    ).run();
  } catch {
    // Index already exists — safe to ignore
  }

  // Migration: Add persona_id column to sessions (Personas - Wave 6)
  try {
    db.prepare(
      "ALTER TABLE sessions ADD COLUMN persona_id TEXT REFERENCES personas(id) ON DELETE SET NULL"
    ).run();
  } catch {
    // Column already exists — safe to ignore
  }
}
