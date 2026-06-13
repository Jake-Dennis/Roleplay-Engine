/**
 * Shared Test Helpers
 *
 * Provides in-memory database, test user, and test universe factories
 * for use across all test files.
 */

import Database from "better-sqlite3";
import crypto from "crypto";

/**
 * Create an in-memory SQLite database with core tables.
 * Tables are created with minimal schema sufficient for testing.
 */
export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS universes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      universe_id TEXT REFERENCES universes(id),
      status TEXT DEFAULT 'active',
      narrative_phase TEXT DEFAULT 'setup',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      sender_id TEXT,
      content TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      persona_id TEXT,
      speaking_as TEXT
    );

    CREATE TABLE IF NOT EXISTS npcs (
      id TEXT PRIMARY KEY,
      entity_id TEXT REFERENCES entity_registry(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      name TEXT NOT NULL,
      description TEXT,
      personality_traits TEXT,
      behavior_patterns TEXT,
      is_canon INTEGER DEFAULT 0,
      evolution_log TEXT
    );

    CREATE TABLE IF NOT EXISTS personas (
      id TEXT PRIMARY KEY,
      entity_id TEXT REFERENCES entity_registry(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      personality TEXT,
      writing_style TEXT,
      scenario TEXT,
      first_mes TEXT,
      mes_example TEXT,
      creator_notes TEXT,
      system_prompt TEXT,
      post_history_instructions TEXT,
      tags TEXT,
      tts_voice TEXT,
      avatar_url TEXT,
      llm_model TEXT,
      is_active INTEGER DEFAULT 0,
      universe_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entity_registry (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('persona', 'npc', 'user', 'location', 'event')),
      display_name TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entity_aliases (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL REFERENCES entity_registry(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      source TEXT DEFAULT 'user_defined' CHECK(source IN ('user_defined', 'llm_extracted', 'wiki_sync')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS narrative_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      session_id TEXT REFERENCES sessions(id),
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      summary TEXT,
      key_entities TEXT,
      entity_ids TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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
      relationship_stage TEXT DEFAULT 'acquaintance',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_queue (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      priority TEXT DEFAULT 'low',
      status TEXT DEFAULT 'queued',
      payload TEXT DEFAULT '{}',
      progress REAL DEFAULT 0,
      progress_message TEXT,
      max_retries INTEGER DEFAULT 999,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME,
      error TEXT,
      result TEXT
    );

    CREATE TABLE IF NOT EXISTS session_participants (
      session_id TEXT REFERENCES sessions(id),
      user_id TEXT REFERENCES users(id),
      role TEXT DEFAULT 'participant',
      character_name TEXT,
      entity_id TEXT REFERENCES entity_registry(id),
      private_state TEXT,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS scene_states (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      active_npcs TEXT,
      active_npc_ids TEXT,
      active_threads TEXT,
      scene_summary TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS timeline_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      thread_id TEXT REFERENCES narrative_threads(id),
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
  `);

  return db;
}

/**
 * Create a test user and return their id.
 */
export function createTestUser(db: Database.Database): string {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
  ).run(id, `testuser_${id.slice(0, 8)}`, "hash");
  return id;
}

/**
 * Create a test universe for a given user and return its id.
 */
export function createTestUniverse(db: Database.Database, userId: string): string {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO universes (id, user_id, name, description) VALUES (?, ?, ?, ?)"
  ).run(id, userId, "Test Universe", "A universe for testing");
  return id;
}

/**
 * Create a test session for a given user and universe.
 */
export function createTestSession(
  db: Database.Database,
  userId: string,
  universeId: string
): string {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO sessions (id, owner_id, name, universe_id, status) VALUES (?, ?, ?, ?, ?)"
  ).run(id, userId, "Test Session", universeId, "active");
  return id;
}
