/**
 * Entity Registry — shared logic for entity registration, resolution, and lookup.
 *
 * Provides a clean API over entity_registry + entity_aliases tables,
 * used by the CRUD API routes and potentially by other subsystems.
 *
 * @module entity-registry
 */

import type { Database } from "better-sqlite3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityRow {
  id: string;
  entity_type: string;
  display_name: string;
  description: string | null;
  user_id: string;
  universe_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Entity {
  id: string;
  entityType: string;
  displayName: string;
  description: string | null;
  userId: string;
  universeId: string | null;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EntityFilters {
  type?: string;
  universeId?: string;
  search?: string;
  ids?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VALID_ENTITY_TYPES = ["persona", "npc", "user", "location", "event", "faction", "item"] as const;

export type EntityType = (typeof VALID_ENTITY_TYPES)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a string is a recognised entity type.
 * Returns an error message or null if valid.
 */
export function validateEntityType(type: string): string | null {
  if (!VALID_ENTITY_TYPES.includes(type as EntityType)) {
    return `Invalid entity type "${type}". Must be one of: ${VALID_ENTITY_TYPES.join(", ")}`;
  }
  return null;
}

/**
 * Generate a prefixed entity ID in the form `{type}:{uuid}`.
 */
export function generateEntityId(type: string): string {
  const err = validateEntityType(type);
  if (err) throw new Error(err);
  return `${type}:${crypto.randomUUID()}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all aliases for a given entity, returned as a plain string array.
 */
function getAliasesForEntity(db: Database, entityId: string): string[] {
  const rows = db
    .prepare(
      "SELECT alias FROM entity_aliases WHERE entity_id = ? ORDER BY created_at"
    )
    .all(entityId) as { alias: string }[];
  return rows.map((r) => r.alias);
}

/**
 * Convert a raw DB row + aliases into the public Entity shape.
 */
function rowToEntity(db: Database, row: EntityRow): Entity {
  return {
    id: row.id,
    entityType: row.entity_type,
    displayName: row.display_name,
    description: row.description ?? null,
    userId: row.user_id,
    universeId: row.universe_id ?? null,
    aliases: getAliasesForEntity(db, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check for alias conflicts before inserting.
 *
 * Returns the first alias that already exists, or null if all are available.
 */
export function findAliasConflict(
  db: Database,
  aliases: string[]
): string | null {
  for (const alias of aliases) {
    const trimmed = alias.trim();
    if (!trimmed) continue;
    const existing = db
      .prepare("SELECT alias FROM entity_aliases WHERE LOWER(alias) = LOWER(?)")
      .get(trimmed) as { alias: string } | undefined;
    if (existing) return existing.alias;
  }
  return null;
}

/**
 * Register a new entity and its aliases in a single transaction.
 *
 * Assumes alias conflicts have been checked upstream via `findAliasConflict`.
 * Returns the fully populated Entity (with aliases).
 */
export function registerEntity(
  db: Database,
  userId: string,
  entityType: string,
  displayName: string,
  universeId?: string | null,
  aliases?: string[]
): Entity {
  const id = generateEntityId(entityType);
  const trimmedName = displayName.trim();

  const insertEntity = db.prepare(
    `INSERT INTO entity_registry (id, entity_type, display_name, user_id, universe_id)
     VALUES (?, ?, ?, ?, ?)`
  );

  const insertAlias = db.prepare(
    `INSERT INTO entity_aliases (id, entity_id, alias, source)
     VALUES (?, ?, ?, 'user_defined')`
  );

  const transaction = db.transaction(() => {
    insertEntity.run(id, entityType, trimmedName, userId, universeId ?? null);

    if (aliases && aliases.length > 0) {
      for (const alias of aliases) {
        const trimmed = alias.trim();
        if (trimmed) {
          insertAlias.run(crypto.randomUUID(), id, trimmed);
        }
      }
    }
  });

  transaction();

  // Re-fetch to get a complete picture (DB defaults populated)
  return getEntity(db, id)!;
}

/**
 * Fetch a single entity by ID, including its aliases.
 * Returns null if not found.
 */
export function getEntity(db: Database, id: string): Entity | null {
  const row = db
    .prepare("SELECT * FROM entity_registry WHERE id = ?")
    .get(id) as EntityRow | undefined;

  if (!row) return null;
  return rowToEntity(db, row);
}

/**
 * Resolve a display name or alias to an Entity.
 *
 * Resolution order:
 *   1. Alias match scoped to universe (if universeId provided)
 *   2. Display name match scoped to universe (if universeId provided)
 *   3. Unscoped alias match
 *   4. Unscoped display name match
 *
 * Returns the Entity or null if nothing matches.
 */
export function resolveEntity(
  db: Database,
  name: string,
  universeId?: string
): Entity | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  let result: { entity_id: string } | undefined;

  // 1. Universe-scoped alias lookup
  if (universeId) {
    result = db
      .prepare(
        `SELECT ea.entity_id FROM entity_aliases ea
         JOIN entity_registry er ON er.id = ea.entity_id
         WHERE LOWER(ea.alias) = LOWER(?) AND er.universe_id = ?
         LIMIT 1`
      )
      .get(trimmed, universeId) as { entity_id: string } | undefined;
  }

  // 2. Universe-scoped display name lookup
  if (!result && universeId) {
    result = db
      .prepare(
        `SELECT id as entity_id FROM entity_registry
         WHERE LOWER(display_name) = LOWER(?) AND universe_id = ?
         LIMIT 1`
      )
      .get(trimmed, universeId) as { entity_id: string } | undefined;
  }

  // 3. Unscoped alias lookup
  if (!result) {
    result = db
      .prepare(
        `SELECT entity_id FROM entity_aliases WHERE LOWER(alias) = LOWER(?) LIMIT 1`
      )
      .get(trimmed) as { entity_id: string } | undefined;
  }

  // 4. Unscoped display name lookup
  if (!result) {
    result = db
      .prepare(
        `SELECT id as entity_id FROM entity_registry WHERE LOWER(display_name) = LOWER(?) LIMIT 1`
      )
      .get(trimmed) as { entity_id: string } | undefined;
  }

  if (!result) return null;
  return getEntity(db, result.entity_id);
}

/**
 * Add a single alias to an existing entity.
 *
 * Throws if the alias already exists (UNIQUE constraint on entity_aliases.alias).
 */
export function addAlias(
  db: Database,
  entityId: string,
  alias: string,
  source: string = "user_defined"
): void {
  const trimmed = alias.trim();
  if (!trimmed) {
    throw new Error("Alias cannot be empty");
  }

  db.prepare(
    "INSERT INTO entity_aliases (id, entity_id, alias, source) VALUES (?, ?, ?, ?)"
  ).run(crypto.randomUUID(), entityId, trimmed, source);
}

/**
 * List entities for a user, with optional filtering.
 *
 * Supported filters:
 *  - type:       filter by entity_type
 *  - universeId: filter by universe_id
 *  - search:     search by display_name or alias (case-insensitive LIKE)
 *  - ids:        exact-match on a list of entity IDs
 */
export function listEntities(
  db: Database,
  userId: string,
  filters?: EntityFilters
): Entity[] {
  const conditions: string[] = ["user_id = ?"];
  const params: unknown[] = [userId];

  if (filters?.type) {
    conditions.push("entity_type = ?");
    params.push(filters.type);
  }

  if (filters?.universeId) {
    conditions.push("universe_id = ?");
    params.push(filters.universeId);
  }

  if (filters?.search) {
    const pattern = `%${filters.search.toLowerCase()}%`;
    conditions.push(
      "(LOWER(display_name) LIKE ? OR id IN (SELECT entity_id FROM entity_aliases WHERE LOWER(alias) LIKE ?))"
    );
    params.push(pattern, pattern);
  }

  if (filters?.ids && filters.ids.length > 0) {
    const placeholders = filters.ids.map(() => "?").join(",");
    conditions.push(`id IN (${placeholders})`);
    params.push(...filters.ids);
  }

  const sql = `SELECT * FROM entity_registry WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`;
  const rows = db.prepare(sql).all(...params) as EntityRow[];
  return rows.map((row) => rowToEntity(db, row));
}
