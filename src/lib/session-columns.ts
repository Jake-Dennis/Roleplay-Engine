/**
 * Session Columns Utility
 *
 * Ensures the character_name and entity_id columns exist in session_participants table.
 * Safe to call multiple times — catches "column already exists" errors.
 */

export function ensureParticipantColumns(db: { exec: (sql: string) => void }): void {
  try {
    db.exec("ALTER TABLE session_participants ADD COLUMN character_name TEXT");
  } catch {
    // Column already exists
  }
  try {
    db.exec("ALTER TABLE session_participants ADD COLUMN entity_id TEXT REFERENCES entity_registry(id)");
  } catch {
    // Column already exists
  }
}
