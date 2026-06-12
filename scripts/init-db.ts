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
      persona_id TEXT REFERENCES personas(id) ON DELETE SET NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      narrative_tension REAL DEFAULT 0.3,
      pacing REAL DEFAULT 0.3,
      narrative_phase TEXT DEFAULT 'setup',
      active_goals TEXT,
      active_conflicts TEXT
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
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, key)
    );

    -- Universes
    CREATE TABLE IF NOT EXISTS universes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      canon_mode TEXT DEFAULT 'strict',
      lore_source TEXT,
      tone TEXT,
      time_period TEXT,
      boundaries TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Timelines
    CREATE TABLE IF NOT EXISTS timelines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id) ON DELETE CASCADE,
      era TEXT,
      year INTEGER,
      restrictions TEXT,
      active_factions TEXT
    );

    -- Timeline layers (eras, factions, active characters)
    CREATE TABLE IF NOT EXISTS timeline_layers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      timeline_id TEXT REFERENCES timelines(id) ON DELETE CASCADE,
      universe_id TEXT REFERENCES universes(id) ON DELETE CASCADE,
      layer_type TEXT NOT NULL, -- 'era', 'faction', 'active_characters'
      name TEXT NOT NULL,
      description TEXT,
      start_year INTEGER,
      end_year INTEGER,
      metadata TEXT, -- JSON for faction details, character lists, etc.
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Timeline entries — entries on the timeline (auto-populated from sessions, events, threads, phases)
    CREATE TABLE IF NOT EXISTS timeline_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      thread_id TEXT REFERENCES narrative_threads(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      occurred_at TEXT NOT NULL,
      era TEXT,
      entry_type TEXT DEFAULT 'event',
      importance TEXT DEFAULT 'medium',
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_timeline_entries_session ON timeline_entries(session_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_entries_user ON timeline_entries(user_id);

    -- Scene states
    CREATE TABLE IF NOT EXISTS scene_states (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      active_location_id TEXT,
      current_goal TEXT,
      emotional_tone TEXT,
      current_intent TEXT,
      active_npcs TEXT,
      active_threads TEXT,
      scene_summary TEXT,
      scene_type TEXT,
      scene_tension REAL DEFAULT 0.5,
      conflict_type TEXT,
      stakes TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Relationships
    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      source_entity_id TEXT REFERENCES entity_registry(id),
      target_entity_id TEXT REFERENCES entity_registry(id),
      source_entity TEXT NOT NULL,
      target_entity TEXT NOT NULL,
      emotional_state TEXT,
      shared_history TEXT,
      relationship_stage TEXT,
      decay_rates TEXT,
      updated_at DATETIME
    );

    -- Relationship evolution history
    CREATE TABLE IF NOT EXISTS relationship_evolution (
      id TEXT PRIMARY KEY,
      relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      emotional_state TEXT,
      relationship_stage TEXT,
      trigger_event TEXT,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Narrative anchors (Task 27)
    CREATE TABLE IF NOT EXISTS narrative_anchors (
      id TEXT PRIMARY KEY,
      relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      anchor_type TEXT NOT NULL,
      description TEXT,
      emotional_impact TEXT,
      irreversible INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Entity mentions tracking
    CREATE TABLE IF NOT EXISTS entity_mentions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      entity_name TEXT NOT NULL,
      entity_id TEXT REFERENCES entity_registry(id),
      source_table TEXT NOT NULL,
      source_id TEXT NOT NULL,
      frequency INTEGER DEFAULT 1,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, entity_name, source_table, source_id)
    );

    -- Entity registry — universal ID tracking for personas, NPCs, users, locations, events
    CREATE TABLE IF NOT EXISTS entity_registry (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('persona', 'npc', 'user', 'location', 'event')),
      display_name TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Entity aliases — alternative names that resolve to the same entity (e.g., "Strider" → Aragorn)
    CREATE TABLE IF NOT EXISTS entity_aliases (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL REFERENCES entity_registry(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      source TEXT DEFAULT 'user_defined' CHECK(source IN ('user_defined', 'llm_extracted', 'wiki_sync')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Contradiction flags (wiki linting — Task 23)
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
    );
    CREATE INDEX IF NOT EXISTS idx_contradiction_flags_user ON contradiction_flags(user_id);
    CREATE INDEX IF NOT EXISTS idx_contradiction_flags_status ON contradiction_flags(status);
    CREATE INDEX IF NOT EXISTS idx_contradiction_flags_entity ON contradiction_flags(entity_name);

    -- NPCs
    CREATE TABLE IF NOT EXISTS npcs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id) ON DELETE CASCADE,
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

    -- Locations (queried by embeddings, backlinks, contradictions)
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      known_info TEXT,
      hidden_info TEXT,
      tags TEXT,
      is_canon BOOLEAN DEFAULT 0,
      canon_layer TEXT DEFAULT 'generated_lore',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Events (queried by contradictions, backlinks, semantic analysis)
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id) ON DELETE CASCADE,
      title TEXT,
      event_type TEXT,
      description TEXT,
      participants TEXT,          -- JSON array of participant IDs
      location_id TEXT,
      occurred_at TEXT,           -- Can be vague: "age 12" or "Tuesday"
      outcome TEXT,
      consequences TEXT,
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
      deleted_at DATETIME,
      persona_id TEXT,
      speaking_as TEXT
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
      message_id TEXT,                   -- polymorphic access (message-summarizer.ts)
      summary_type TEXT,                 -- 'semantic' | 'emotional' | 'relationship_impact' | 'lore_extracted'
      content TEXT,                      -- summary content for each type (polymorphic)
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
      description TEXT,
      arc_type TEXT DEFAULT 'thread',
      status TEXT DEFAULT 'active',
      escalation_level TEXT DEFAULT 'low',
      name TEXT,
      summary TEXT,
      key_entities TEXT,
      unresolved_items TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      resolved_at DATETIME
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
      result TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 999
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

    -- Embedding vectors (for vector search, 1:1 with embedding_index)
    CREATE TABLE IF NOT EXISTS embedding_vectors (
      embedding_id TEXT PRIMARY KEY REFERENCES embedding_index(id),
      vector_data TEXT NOT NULL
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

    -- Narrative memories
    CREATE TABLE IF NOT EXISTS narrative_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      universe_id TEXT REFERENCES universes(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      importance TEXT,
      related_entities TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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
    CREATE INDEX IF NOT EXISTS idx_relationship_evolution_rel ON relationship_evolution(relationship_id);
    CREATE INDEX IF NOT EXISTS idx_narrative_anchors_rel ON narrative_anchors(relationship_id);
    CREATE INDEX IF NOT EXISTS idx_narrative_anchors_user ON narrative_anchors(user_id);
    CREATE INDEX IF NOT EXISTS idx_entity_mentions_user ON entity_mentions(user_id);
    CREATE INDEX IF NOT EXISTS idx_entity_mentions_name ON entity_mentions(entity_name);
    CREATE INDEX IF NOT EXISTS idx_entity_registry_user ON entity_registry(user_id);
    CREATE INDEX IF NOT EXISTS idx_entity_registry_universe ON entity_registry(universe_id);
    CREATE INDEX IF NOT EXISTS idx_entity_registry_type ON entity_registry(entity_type);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_aliases_alias ON entity_aliases(alias);
    CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
    CREATE INDEX IF NOT EXISTS idx_events_universe ON events(universe_id);
    CREATE INDEX IF NOT EXISTS idx_npcs_user ON npcs(user_id);
    CREATE INDEX IF NOT EXISTS idx_npcs_universe ON npcs(universe_id);
    CREATE INDEX IF NOT EXISTS idx_voice_assignments_entity ON voice_assignments(user_id, entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_tts_cache_hash ON tts_cache(user_id, text_hash);
    CREATE INDEX IF NOT EXISTS idx_narrative_threads_universe ON narrative_threads(universe_id);
    CREATE INDEX IF NOT EXISTS idx_entity_validations_universe ON entity_validations(universe_id);
    CREATE INDEX IF NOT EXISTS idx_backlinks_universe ON backlinks(universe_id);
    CREATE INDEX IF NOT EXISTS idx_timelines_universe ON timelines(universe_id);
    CREATE INDEX IF NOT EXISTS idx_session_config_lookup ON session_config(session_id, key);

    -- Additional query optimization indexes
    CREATE INDEX IF NOT EXISTS idx_scene_states_session ON scene_states(session_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_narrative_memories_lookup ON narrative_memories(user_id, session_id, universe_id);
    CREATE INDEX IF NOT EXISTS idx_narrative_anchors_user_universe ON narrative_anchors(user_id, universe_id);
    CREATE INDEX IF NOT EXISTS idx_entity_mentions_user_freq ON entity_mentions(user_id, frequency DESC);

    -- Server-wide configuration (overrides env var defaults)
    CREATE TABLE IF NOT EXISTS server_config (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      ollama_host TEXT,
      ollama_port INTEGER,
      ollama_model TEXT,
      ollama_embedding_model TEXT,
      tts_host TEXT,
      tts_port INTEGER,
      tts_default_voice TEXT,
      tts_default_speed REAL,
      tts_default_volume REAL,
      tts_default_format TEXT,
      tts_auto_play INTEGER,
      tts_skip_long INTEGER,
      tts_long_threshold INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Insert default singleton row (values are NULL = use config.ts env-var fallbacks)
    INSERT OR IGNORE INTO server_config (id) VALUES ('singleton');

    -- Decision points
    CREATE TABLE IF NOT EXISTS decision_points (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      prompt TEXT NOT NULL,
      choices_made TEXT,
      narrative_context TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_decision_points_session ON decision_points(session_id);
    CREATE INDEX IF NOT EXISTS idx_decision_points_user ON decision_points(user_id);

    -- Composite indexes for query optimization
    CREATE INDEX IF NOT EXISTS idx_messages_session_deleted_ts ON messages(session_id, is_deleted, timestamp);
    CREATE INDEX IF NOT EXISTS idx_memories_user_created_importance ON narrative_memories(user_id, created_at, importance);
    CREATE INDEX IF NOT EXISTS idx_jobs_user_status_type ON job_queue(user_id, status, type, priority);
  `);

  // Run migrations for existing databases that may be missing columns added later
  try { db.exec("ALTER TABLE messages ADD COLUMN persona_id TEXT"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE messages ADD COLUMN speaking_as TEXT"); } catch { /* already exists */ }

  // Vector storage uses the embedding_index + embedding_vectors tables
  // (created above). No vec0 virtual tables needed — brute-force cosine
  // similarity over JSON vectors is sufficient for local roleplay scale.
  console.log("Vector storage: embedding_index + embedding_vectors");

  console.log("Database schema created successfully at:", dbPath);
  db.close();
}

main();

