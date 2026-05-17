const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(process.cwd(), "data");

function ensureDir(dir) {
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
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      last_idle_t INTEGER DEFAULT 0,
      settings TEXT DEFAULT '{}'
    );

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

    CREATE TABLE IF NOT EXISTS session_participants (
      session_id TEXT REFERENCES sessions(id),
      user_id TEXT REFERENCES users(id),
      role TEXT DEFAULT 'participant',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      private_state TEXT DEFAULT '{}',
      PRIMARY KEY (session_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS session_config (
      session_id TEXT REFERENCES sessions(id),
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (session_id, key)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      universe_id TEXT,
      timeline_id TEXT,
      status TEXT DEFAULT 'active',
      type TEXT DEFAULT 'solo',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    );

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

    CREATE TABLE IF NOT EXISTS timelines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      era TEXT,
      year INTEGER,
      restrictions TEXT,
      active_factions TEXT
    );

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

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      importance TEXT DEFAULT 'medium',
      canon_tier TEXT DEFAULT 'generated_lore',
      parent_location_id TEXT REFERENCES locations(id),
      known_info TEXT,
      hidden_info TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS npcs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      canon_tier TEXT DEFAULT 'generated_lore',
      location_id TEXT REFERENCES locations(id),
      importance TEXT DEFAULT 'medium',
      tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS message_summaries (
      id TEXT PRIMARY KEY,
      source_message_id TEXT REFERENCES messages(id),
      summary TEXT,
      emotional_tone TEXT,
      relationship_effects TEXT,
      lore_extracted TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS narrative_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      session_id TEXT REFERENCES sessions(id),
      title TEXT NOT NULL,
      description TEXT,
      arc_type TEXT DEFAULT 'thread',
      status TEXT DEFAULT 'active',
      escalation_level TEXT DEFAULT 'low',
      unresolved_items TEXT,
      resolved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_narrative_threads_user ON narrative_threads(user_id);
    CREATE INDEX IF NOT EXISTS idx_narrative_threads_session ON narrative_threads(session_id);
    CREATE INDEX IF NOT EXISTS idx_narrative_threads_status ON narrative_threads(user_id, status);

    CREATE TABLE IF NOT EXISTS timeline_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      session_id TEXT REFERENCES sessions(id),
      thread_id TEXT REFERENCES narrative_threads(id),
      title TEXT NOT NULL,
      description TEXT,
      occurred_at DATETIME NOT NULL,
      era TEXT,
      entry_type TEXT DEFAULT 'event',
      importance TEXT DEFAULT 'medium',
      canon_tier TEXT DEFAULT 'session_lore',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_timeline_entries_user ON timeline_entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_entries_occurred ON timeline_entries(user_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_timeline_entries_thread ON timeline_entries(thread_id);

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
      canon_tier TEXT DEFAULT 'session_lore',
      occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS embedding_index (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      text_content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS lore_edits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_content TEXT,
      new_content TEXT,
      edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      edit_summary TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_lore_edits_entity ON lore_edits(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_lore_edits_user ON lore_edits(user_id);

    CREATE TABLE IF NOT EXISTS relationship_evolution (
      id TEXT PRIMARY KEY,
      relationship_id TEXT NOT NULL REFERENCES relationships(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      emotional_state TEXT,
      relationship_stage TEXT,
      trigger_event TEXT,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_relationship_evolution_rel ON relationship_evolution(relationship_id, recorded_at);

    CREATE TABLE IF NOT EXISTS embedding_vectors (
      embedding_id TEXT PRIMARY KEY REFERENCES embedding_index(id),
      vector_data TEXT NOT NULL
    );

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

  // Add columns that may be missing from older databases
  try { db.exec("ALTER TABLE users ADD COLUMN last_idle_t INTEGER DEFAULT 0"); } catch { /* column already exists */ }
  try { db.exec("ALTER TABLE narrative_threads ADD COLUMN description TEXT"); } catch { /* column already exists */ }
  try { db.exec("ALTER TABLE narrative_threads ADD COLUMN arc_type TEXT DEFAULT 'thread'"); } catch { /* column already exists */ }
  try { db.exec("ALTER TABLE narrative_threads ADD COLUMN resolved_at DATETIME"); } catch { /* column already exists */ }
  try { db.exec("ALTER TABLE narrative_threads ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch { /* column already exists */ }

  // Add indexes that may be missing
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_narrative_threads_user ON narrative_threads(user_id)"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_narrative_threads_session ON narrative_threads(session_id)"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_narrative_threads_status ON narrative_threads(user_id, status)"); } catch {}

  // Create timeline_entries table if it doesn't exist (for existing databases)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS timeline_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        session_id TEXT REFERENCES sessions(id),
        thread_id TEXT REFERENCES narrative_threads(id),
        title TEXT NOT NULL,
        description TEXT,
        occurred_at DATETIME NOT NULL,
        era TEXT,
        entry_type TEXT DEFAULT 'event',
        importance TEXT DEFAULT 'medium',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_timeline_entries_user ON timeline_entries(user_id)"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_timeline_entries_occurred ON timeline_entries(user_id, occurred_at)"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_timeline_entries_thread ON timeline_entries(thread_id)"); } catch {}

  // Create lore_edits table if it doesn't exist (for existing databases)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS lore_edits (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        old_content TEXT,
        new_content TEXT,
        edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        edit_summary TEXT
      )
    `);
  } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_lore_edits_entity ON lore_edits(entity_type, entity_id)"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_lore_edits_user ON lore_edits(user_id)"); } catch {}

  // Add canon_tier columns for 5-tier canon system (D1)
  try { db.exec("ALTER TABLE locations ADD COLUMN canon_tier TEXT DEFAULT 'generated_lore'"); } catch { /* column already exists */ }
  try { db.exec("ALTER TABLE npcs ADD COLUMN canon_tier TEXT DEFAULT 'generated_lore'"); } catch { /* column already exists */ }
  try { db.exec("ALTER TABLE events ADD COLUMN canon_tier TEXT DEFAULT 'session_lore'"); } catch { /* column already exists */ }
  try { db.exec("ALTER TABLE timeline_entries ADD COLUMN canon_tier TEXT DEFAULT 'session_lore'"); } catch { /* column already exists */ }

  // Migrate existing canon_status values to new 5-tier system
  try {
    db.exec(`
      UPDATE npcs SET canon_tier = CASE
        WHEN canon_status = 'canon' THEN 'immutable_canon'
        WHEN canon_status = 'immutable_canon' THEN 'immutable_canon'
        WHEN canon_status = 'soft_canon' THEN 'soft_canon'
        WHEN canon_status = 'generated' THEN 'generated_lore'
        WHEN canon_status = 'generated_lore' THEN 'generated_lore'
        WHEN canon_status = 'fanon' THEN 'session_lore'
        WHEN canon_status = 'draft' THEN 'session_lore'
        WHEN canon_status = 'deprecated' THEN 'rumor'
        ELSE 'generated_lore'
      END WHERE canon_tier IS NULL
    `);
  } catch {}

  db.close();
}

main();
