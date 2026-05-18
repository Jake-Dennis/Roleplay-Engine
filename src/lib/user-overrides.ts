/**
 * User Override System
 *
 * Tracks and enforces user edits over AI-generated content.
 * When a user manually edits lore, NPC details, or event records,
 * those edits are recorded as overrides and take precedence over
 * any future AI-generated content for the same field.
 *
 * Database: user_overrides table
 * - id TEXT PRIMARY KEY
 * - user_id TEXT REFERENCES users(id)
 * - entity_type TEXT
 * - entity_id TEXT
 * - field TEXT
 * - old_value TEXT
 * - new_value TEXT
 * - created_at DATETIME DEFAULT CURRENT_TIMESTAMP
 */

import { getDb } from "@/lib/db";

export interface UserOverride {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  field: string;
  oldValue: string | null;
  newValue: string;
  createdAt: string;
}

export interface OverrideResult {
  success: boolean;
  overrideId: string | null;
}

/**
 * Set a user override for a specific entity field.
 * Records the old value and new value for audit trail.
 */
export async function setOverride(
  userId: string,
  entityType: string,
  entityId: string,
  field: string,
  newValue: string
): Promise<OverrideResult> {
  const db = getDb();

  // Get current value before override
  let oldValue: string | null = null;
  try {
    const tableMap: Record<string, string> = {
      location: "locations",
      npc: "npcs",
      event: "events",
      lore: "lore_entries",
      thread: "narrative_threads",
    };

    const table = tableMap[entityType.toLowerCase()];
    if (table) {
      const row = db.prepare(
        `SELECT ${field} FROM ${table} WHERE id = ? AND user_id = ?`
      ).get(entityId, userId) as Record<string, unknown> | undefined;

      if (row && field in row) {
        oldValue = row[field] as string | null;
      }
    }
  } catch {
    // Field may not exist in table
  }

  const overrideId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO user_overrides (id, user_id, entity_type, entity_id, field, old_value, new_value, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(overrideId, userId, entityType, entityId, field, oldValue, newValue);

  return { success: true, overrideId };
}

/**
 * Get all overrides for a specific entity.
 */
export function getOverrides(
  entityType: string,
  entityId: string
): UserOverride[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT id, user_id as userId, entity_type as entityType, entity_id as entityId,
           field, old_value as oldValue, new_value as newValue, created_at as createdAt
    FROM user_overrides
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at DESC
  `).all(entityType, entityId) as UserOverride[];

  return rows;
}

/**
 * Check if a field has a user override that should be respected.
 * Returns true if the user has manually edited this field.
 */
export function shouldRespectOverride(
  entityType: string,
  entityId: string,
  field: string
): boolean {
  const db = getDb();

  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM user_overrides
    WHERE entity_type = ? AND entity_id = ? AND field = ?
  `).get(entityType, entityId, field) as { count: number } | undefined;

  return (row?.count || 0) > 0;
}

/**
 * Get the override value for a specific field.
 * Returns the user's manually set value, or null if no override exists.
 */
export function getOverrideValue(
  entityType: string,
  entityId: string,
  field: string
): string | null {
  const db = getDb();

  const row = db.prepare(`
    SELECT new_value as newValue
    FROM user_overrides
    WHERE entity_type = ? AND entity_id = ? AND field = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(entityType, entityId, field) as { newValue: string } | undefined;

  return row?.newValue || null;
}

/**
 * Log a user override with full audit trail.
 * This is called when a user edits content that was previously AI-generated.
 */
export async function logOverride(
  userId: string,
  entityType: string,
  entityId: string,
  field: string,
  oldValue: string,
  newValue: string
): Promise<OverrideResult> {
  const overrideId = crypto.randomUUID();

  const db = getDb();
  db.prepare(`
    INSERT INTO user_overrides (id, user_id, entity_type, entity_id, field, old_value, new_value, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(overrideId, userId, entityType, entityId, field, oldValue, newValue);

  return { success: true, overrideId };
}

/**
 * Get override statistics for a user.
 */
export function getOverrideStats(userId: string): {
  totalOverrides: number;
  byEntityType: Record<string, number>;
  recentOverrides: number;
} {
  const db = getDb();

  const total = db.prepare(
    "SELECT COUNT(*) as count FROM user_overrides WHERE user_id = ?"
  ).get(userId) as { count: number } | undefined;

  const byType = db.prepare(`
    SELECT entity_type, COUNT(*) as count
    FROM user_overrides
    WHERE user_id = ?
    GROUP BY entity_type
  `).all(userId) as { entity_type: string; count: number }[];

  const recent = db.prepare(`
    SELECT COUNT(*) as count
    FROM user_overrides
    WHERE user_id = ? AND created_at > datetime('now', '-7 days')
  `).get(userId) as { count: number } | undefined;

  const byEntityType: Record<string, number> = {};
  for (const row of byType) {
    byEntityType[row.entity_type] = row.count;
  }

  return {
    totalOverrides: total?.count || 0,
    byEntityType,
    recentOverrides: recent?.count || 0,
  };
}

/**
 * Apply overrides to an entity's data before returning to the client.
 * Merges user overrides on top of the base entity data.
 */
export function applyOverrides<T extends Record<string, unknown>>(
  entityType: string,
  entityId: string,
  baseData: T
): T {
  const overrides = getOverrides(entityType, entityId);
  const result = { ...baseData };

  for (const override of overrides) {
    // Only apply the most recent override per field
    if (!(override.field in result) || result[override.field] === null) {
      result[override.field as keyof T] = override.newValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Delete all overrides for a specific entity.
 * Called when an entity is deleted.
 */
export function deleteEntityOverrides(entityType: string, entityId: string): number {
  const db = getDb();

  const result = db.prepare(
    "DELETE FROM user_overrides WHERE entity_type = ? AND entity_id = ?"
  ).run(entityType, entityId);

  return result.changes;
}
