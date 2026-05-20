import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function main() {
  ensureDir(DATA_DIR);

  const dbPath = path.join(DATA_DIR, "global.db");
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  console.log("Creating database schema...");

  db.exec(`
    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      last_idle_t INTEGER DEFAULT 0,
      settings TEXT DEFAULT '{}',
      password_changed_at DATETIME
    );

    -- Sessions
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      universe_id TEXT,
      timeline_id TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    );

    -- Session participants
    CREATE TABLE IF NOT EXISTS session_participants (
      session_id TEXT REFERENCES sessions(id),
      user_id TEXT REFERENCES users(id),
      role TEXT DEFAULT 'participant',
      character_name TEXT,
      private_state TEXT,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, user_id)
    );

    -- Session config (turn mode, turn order, current turn)
    CREATE TABLE IF NOT EXISTS session_config (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      key TEXT NOT NULL,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, key)
    );

    -- Universes
    CREATE TABLE IF NOT EXISTS universes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      canon_mode TEXT DEFAULT 'strict',
      lore_source TEXT,
      tone TEXT,
      boundaries TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Timelines
    CREATE TABLE IF NOT EXISTS timelines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      era TEXT,
      year INTEGER,
      restrictions TEXT,
      active_factions TEXT
    );

    -- Timeline layers (eras, factions, active characters)
    CREATE TABLE IF NOT EXISTS timeline_layers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      timeline_id TEXT REFERENCES timelines(id),
      universe_id TEXT REFERENCES universes(id),
      layer_type TEXT NOT NULL, -- 'era', 'faction', 'active_characters'
      name TEXT NOT NULL,
      description TEXT,
      start_year INTEGER,
      end_year INTEGER,
      metadata TEXT, -- JSON for faction details, character lists, etc.
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Scene states
    CREATE TABLE IF NOT EXISTS scene_states (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      active_location_id TEXT,
      current_goal TEXT,
      emotional_tone TEXT,
      active_npcs TEXT,
      active_threads TEXT,
      scene_summary TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Relationships
    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      source_entity TEXT NOT NULL,
      target_entity TEXT NOT NULL,
      emotional_state TEXT,
      shared_history TEXT,
      relationship_stage TEXT,
      decay_rates TEXT,
      updated_at DATETIME
    );

    -- NPCs
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
    );

    -- Messages
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      sender_id TEXT REFERENCES users(id),
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      location_context TEXT,
      emotional_tone TEXT,
      parent_message_id TEXT REFERENCES messages(id),
      is_deleted INTEGER DEFAULT 0,
      deleted_at DATETIME
    );

    -- Full-text search for messages (FTS5)
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, session_id, sender_id);

    CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages
    BEGIN
      INSERT INTO messages_fts(rowid, content, session_id, sender_id)
      VALUES (new.rowid, new.content, new.session_id, new.sender_id);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages
    BEGIN
      UPDATE messages_fts SET content = new.content, session_id = new.session_id, sender_id = new.sender_id
      WHERE rowid = new.rowid;
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages
    BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
    END;

    -- Message summaries
    CREATE TABLE IF NOT EXISTS message_summaries (
      id TEXT PRIMARY KEY,
      source_message_id TEXT REFERENCES messages(id),
      summary TEXT,
      emotional_tone TEXT,
      relationship_effects TEXT,
      lore_extracted TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Narrative threads
    CREATE TABLE IF NOT EXISTS narrative_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      session_id TEXT REFERENCES sessions(id),
      title TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      escalation_level TEXT DEFAULT 'low',
      unresolved_items TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Job queue
    CREATE TABLE IF NOT EXISTS job_queue (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      type TEXT NOT NULL,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'queued',
      payload TEXT,
      progress REAL DEFAULT 0,
      progress_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME,
      error TEXT,
      result TEXT
    );

    -- Embedding index
    CREATE TABLE IF NOT EXISTS embedding_index (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      text_content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Backlinks
    CREATE TABLE IF NOT EXISTS backlinks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      link_type TEXT,
      context_snippet TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_type, source_id, target_type, target_id)
    );

    -- Wiki versions
    CREATE TABLE IF NOT EXISTS wiki_versions (
      id TEXT PRIMARY KEY,
      page_path TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      version_number INTEGER NOT NULL,
      change_summary TEXT,
      file_snapshot_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_wiki_versions_page ON wiki_versions(page_path, user_id);

    -- Lore validations
    CREATE TABLE IF NOT EXISTS entity_validations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      state TEXT DEFAULT 'generated_unverified',
      generated_by TEXT,
      validation_notes TEXT,
      validated_by TEXT,
      validated_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Voice assignments
    CREATE TABLE IF NOT EXISTS voice_assignments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      voice_name TEXT NOT NULL,
      voice_speed REAL DEFAULT 1.0,
      volume REAL DEFAULT 0.8,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      UNIQUE(user_id, entity_type, entity_id)
    );

    -- TTS cache
    CREATE TABLE IF NOT EXISTS tts_cache (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      text_hash TEXT NOT NULL,
      voice_name TEXT NOT NULL,
      text_content TEXT,
      audio_format TEXT DEFAULT 'mp3',
      audio_path TEXT,
      duration_ms INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used DATETIME,
      use_count INTEGER DEFAULT 1
    );

    -- Token denylist (revoked JWTs)
    CREATE TABLE IF NOT EXISTS token_denylist (
      token_id TEXT PRIMARY KEY,
      expires_at DATETIME NOT NULL
    );

    -- Index for denylist cleanup
    CREATE INDEX IF NOT EXISTS idx_denylist_expires ON token_denylist(expires_at);

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_deleted ON messages(session_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions(owner_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_universe ON sessions(universe_id);
    CREATE INDEX IF NOT EXISTS idx_participants_user ON session_participants(user_id);
    CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status, priority);
    CREATE INDEX IF NOT EXISTS idx_job_queue_universe ON job_queue(universe_id);
    CREATE INDEX IF NOT EXISTS idx_embedding_user_type ON embedding_index(user_id, entity_type);
    CREATE INDEX IF NOT EXISTS idx_embedding_universe ON embedding_index(universe_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_user ON relationships(user_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_universe ON relationships(universe_id);
    CREATE INDEX IF NOT EXISTS idx_npcs_user ON npcs(user_id);
    CREATE INDEX IF NOT EXISTS idx_npcs_universe ON npcs(universe_id);
    CREATE INDEX IF NOT EXISTS idx_voice_assignments_entity ON voice_assignments(user_id, entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_tts_cache_hash ON tts_cache(user_id, text_hash);
    CREATE INDEX IF NOT EXISTS idx_narrative_threads_universe ON narrative_threads(universe_id);
    CREATE INDEX IF NOT EXISTS idx_entity_validations_universe ON entity_validations(universe_id);
    CREATE INDEX IF NOT EXISTS idx_backlinks_universe ON backlinks(universe_id);
    CREATE INDEX IF NOT EXISTS idx_timelines_universe ON timelines(universe_id);
    CREATE INDEX IF NOT EXISTS idx_session_config_lookup ON session_config(session_id, key);
  `);

  // Create sqlite-vec virtual tables for vector search
  // These are created separately since they require the vec extension
  try {
    db.exec(`
      -- Vector search tables (sqlite-vec)
      -- bge-m3 produces 1024-dimensional embeddings
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_messages USING vec0(
        embedding float[1024],
        metadata TEXT
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS vec_npcs USING vec0(
        embedding float[1024],
        metadata TEXT
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
        embedding float[1024],
        metadata TEXT
      );
    `);
    console.log("sqlite-vec virtual tables created");
  } catch (e) {
    console.log("sqlite-vec not available, skipping vector tables:", (e as Error).message);
  }

  console.log("Database schema created successfully at:", dbPath);
  db.close();
}

main();
