/**
 * Shared database migration utility for groups.
 * Ensures all group-related tables and columns exist.
 * Call this at the start of any API route that needs group support.
 */

import type { DbDatabase } from '@/lib/types';
import { logger } from '@/lib/logger';

function safeMigration(db: DbDatabase, sql: string, description: string): void {
  try {
    db.exec(sql);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('already exists') && !message.includes('duplicate')) {
      logger.warn(`[group-migrations] ${description}: ${message}`);
    }
  }
}

export function ensureGroupSupport(db: DbDatabase) {
  try {
    // Disable FK checks during migration
    db.exec("PRAGMA foreign_keys = OFF");

    // Create groups table
    db.exec(`CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create group_members table
    db.exec(`CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT REFERENCES groups(id),
      user_id TEXT REFERENCES users(id),
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, user_id)
    )`);

    // Add group_id to sessions if not exists
    safeMigration(db, "ALTER TABLE sessions ADD COLUMN group_id TEXT", "add group_id to sessions");

    // Add group_id to universes if not exists
    safeMigration(db, "ALTER TABLE universes ADD COLUMN group_id TEXT", "add group_id to universes");

    // Add type to sessions if not exists
    safeMigration(db, "ALTER TABLE sessions ADD COLUMN type TEXT DEFAULT 'solo'", "add type to sessions");

    // Add canon_layer to npcs if not exists
    safeMigration(db, "ALTER TABLE npcs ADD COLUMN canon_layer TEXT DEFAULT 'generated_lore'", "add canon_layer to npcs");

    // Add canon_layer to locations if not exists
    safeMigration(db, "ALTER TABLE locations ADD COLUMN canon_layer TEXT DEFAULT 'generated_lore'", "add canon_layer to locations");

    // Add active state columns to users if not exists
    safeMigration(db, "ALTER TABLE users ADD COLUMN last_active_group_id TEXT", "add last_active_group_id to users");
    safeMigration(db, "ALTER TABLE users ADD COLUMN last_active_session_id TEXT", "add last_active_session_id to users");
    safeMigration(db, "ALTER TABLE users ADD COLUMN last_active_universe_id TEXT", "add last_active_universe_id to users");

    // Create personas table (SillyTavern-style character cards)
    db.exec(`CREATE TABLE IF NOT EXISTS personas (
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

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Add persona_id to messages if not exists
    safeMigration(db, "ALTER TABLE messages ADD COLUMN persona_id TEXT", "add persona_id to messages");

    // Add SillyTavern-style fields to personas if not exists
    safeMigration(db, "ALTER TABLE personas ADD COLUMN personality TEXT", "add personality to personas");
    safeMigration(db, "ALTER TABLE personas ADD COLUMN scenario TEXT", "add scenario to personas");
    safeMigration(db, "ALTER TABLE personas ADD COLUMN first_mes TEXT", "add first_mes to personas");
    safeMigration(db, "ALTER TABLE personas ADD COLUMN mes_example TEXT", "add mes_example to personas");
    safeMigration(db, "ALTER TABLE personas ADD COLUMN creator_notes TEXT", "add creator_notes to personas");
    safeMigration(db, "ALTER TABLE personas ADD COLUMN system_prompt TEXT", "add system_prompt to personas");
    safeMigration(db, "ALTER TABLE personas ADD COLUMN post_history_instructions TEXT", "add post_history_instructions to personas");
    safeMigration(db, "ALTER TABLE personas ADD COLUMN tags TEXT", "add tags to personas");

    db.exec("PRAGMA foreign_keys = ON");
  } catch (err: unknown) {
    logger.error("ensureGroupSupport error:", err);
    try { db.exec("PRAGMA foreign_keys = ON"); } catch (err: unknown) {
      logger.warn("[group-migrations] Failed to re-enable foreign keys:", err);
    }
  }
}

export function isGroupMember(db: DbDatabase, groupId: string, userId: string): boolean {
  const member = db.prepare(
    "SELECT group_id FROM group_members WHERE group_id = ? AND user_id = ?"
  ).get(groupId, userId);
  return !!member;
}

export function isGroupOwner(db: DbDatabase, groupId: string, userId: string): boolean {
  const group = db.prepare(
    "SELECT id FROM groups WHERE id = ? AND owner_id = ?"
  ).get(groupId, userId);
  return !!group;
}
