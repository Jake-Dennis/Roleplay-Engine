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
}
