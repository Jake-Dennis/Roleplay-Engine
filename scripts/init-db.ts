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
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      settings TEXT DEFAULT '{}'
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
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, user_id)
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

    -- Locations
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      importance TEXT DEFAULT 'medium',
      parent_location_id TEXT REFERENCES locations(id),
      known_info TEXT,
      hidden_info TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- NPCs
    CREATE TABLE IF NOT EXISTS npcs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      canon_status TEXT DEFAULT 'generated',
      location_id TEXT REFERENCES locations(id),
      importance TEXT DEFAULT 'medium',
      tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Relationships
    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      source_entity TEXT NOT NULL,
      target_entity TEXT NOT NULL,
      emotional_state TEXT,
      shared_history TEXT,
      relationship_stage TEXT,
      decay_rates TEXT,
      updated_at DATETIME
    );

    -- Narrative memories
    CREATE TABLE IF NOT EXISTS narrative_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      session_id TEXT REFERENCES sessions(id),
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      importance TEXT,
      related_entities TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      session_id TEXT REFERENCES sessions(id),
      title TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      escalation_level TEXT DEFAULT 'low',
      unresolved_items TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Events
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      session_id TEXT REFERENCES sessions(id),
      title TEXT NOT NULL,
      event_type TEXT NOT NULL,
      location_id TEXT REFERENCES locations(id),
      participants TEXT,
      outcome TEXT,
      consequences TEXT,
      importance TEXT,
      occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Job queue
    CREATE TABLE IF NOT EXISTS job_queue (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'queued',
      payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME,
      error TEXT
    );

    -- Embedding index
    CREATE TABLE IF NOT EXISTS embedding_index (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      text_content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Backlinks
    CREATE TABLE IF NOT EXISTS backlinks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      link_type TEXT,
      context_snippet TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_type, source_id, target_type, target_id)
    );

    -- Lore validations
    CREATE TABLE IF NOT EXISTS lore_validations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
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

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_deleted ON messages(session_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions(owner_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_participants_user ON session_participants(user_id);
    CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status, priority);
    CREATE INDEX IF NOT EXISTS idx_embedding_user_type ON embedding_index(user_id, entity_type);
    CREATE INDEX IF NOT EXISTS idx_relationships_user ON relationships(user_id);
    CREATE INDEX IF NOT EXISTS idx_narrative_memories_user ON narrative_memories(user_id, session_id);
    CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, session_id);
    CREATE INDEX IF NOT EXISTS idx_voice_assignments_entity ON voice_assignments(user_id, entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_tts_cache_hash ON tts_cache(user_id, text_hash);
  `);

  console.log("Database schema created successfully at:", dbPath);
  db.close();
}

main();
