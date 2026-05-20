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
}
