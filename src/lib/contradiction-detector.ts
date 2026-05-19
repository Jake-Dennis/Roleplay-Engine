/**
 * Rule-based + Semantic Contradiction Detection
 *
 * Checks lore entities against canon rules for contradictions:
 * - Alive/Dead conflicts
 * - Temporal impossibilities (event before timeline start)
 * - Location conflicts (entity in two places at once)
 * - Semantic contradictions (embedding similarity + LLM comparison)
 */

import { getDb } from "./db";
import { detectSemanticContradictions, SemanticContradiction } from "./semantic-contradiction";

export interface Contradiction {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  conflictingEntity: string;
}

export interface ContradictionRule {
  id: string;
  name: string;
  check: (entity: Record<string, any>, canon: Record<string, any>[]) => Contradiction | null;
}

/**
 * Rule: Alive/Dead Conflict
 * Checks if an entity marked as alive appears in a death event in canon.
 */
const aliveDeadRule: ContradictionRule = {
  id: "alive_dead",
  name: "Alive/Dead Conflict",
  check: (entity, canon) => {
    const entityName = (entity.name || entity.title || "").toLowerCase();
    if (!entityName) return null;

    // Check if entity is marked dead in canon events
    const isDeadInCanon = canon.some(
      (c) =>
        c.event_type === "death" &&
        (c.participants || "")
          .toLowerCase()
          .includes(entityName)
    );

    // Check if entity has a "dead" or "deceased" status
    const status = (entity.status || "").toLowerCase();
    const isAliveInLore = status !== "dead" && status !== "deceased";

    if (isDeadInCanon && isAliveInLore) {
      return {
        type: "alive_dead",
        severity: "critical" as const,
        description: `${entity.name || entity.title} appears in a death event but is not marked as dead`,
        conflictingEntity: entity.name || entity.title,
      };
    }

    return null;
  },
};

/**
 * Rule: Temporal Impossibility
 * Checks if an event occurred before the timeline start.
 */
const temporalRule: ContradictionRule = {
  id: "temporal_impossibility",
  name: "Temporal Impossibility",
  check: (entity, canon) => {
    if (!entity.occurred_at) return null;

    // Find timeline start from canon
    const timelineStart = canon.find(
      (c) => c.entry_type === "era_start" || c.type === "timeline_start"
    );

    if (timelineStart && timelineStart.occurred_at) {
      const entityDate = new Date(entity.occurred_at).getTime();
      const startDate = new Date(timelineStart.occurred_at).getTime();

      if (entityDate < startDate) {
        return {
          type: "temporal",
          severity: "high" as const,
          description: `Event "${entity.title || entity.name}" occurred before timeline start (${timelineStart.occurred_at})`,
          conflictingEntity: entity.title || entity.name,
        };
      }
    }

    return null;
  },
};

/**
 * Rule: Location Conflict
 * Checks if an NPC appears in multiple locations simultaneously.
 */
const locationRule: ContradictionRule = {
  id: "location_conflict",
  name: "Location Conflict",
  check: (entity, canon) => {
    if (!entity.id || !entity.name) return null;

    // Find all location assignments for this entity in canon
    const locations = canon.filter(
      (c) =>
        c.entity_type === "npc" &&
        c.entity_id === entity.id &&
        c.location_id
    );

    if (locations.length > 1) {
      const uniqueLocations = [...new Set(locations.map((l) => l.location_id))];
      if (uniqueLocations.length > 1) {
        return {
          type: "location",
          severity: "medium" as const,
          description: `${entity.name} appears in multiple locations: ${uniqueLocations.join(", ")}`,
          conflictingEntity: entity.name,
        };
      }
    }

    return null;
  },
};

export const CONTRADICTION_RULES: ContradictionRule[] = [
  aliveDeadRule,
  temporalRule,
  locationRule,
];

/**
 * Detect contradictions for a specific entity against canon entries.
 */
export function detectContradictions(
  entityType: string,
  entityId: string,
  userId: string
): Contradiction[] {
  const db = getDb();

  // Get entity data
  let entity: Record<string, any> | undefined;
  if (entityType === "npcs" || entityType === "npc") {
    entity = db.prepare(
      "SELECT * FROM npcs WHERE id = ? AND user_id = ?"
    ).get(entityId, userId) as Record<string, any> | undefined;
  } else if (entityType === "events" || entityType === "event") {
    entity = db.prepare(
      "SELECT * FROM events WHERE id = ? AND user_id = ?"
    ).get(entityId, userId) as Record<string, any> | undefined;
  } else if (entityType === "locations" || entityType === "location") {
    entity = db.prepare(
      "SELECT * FROM locations WHERE id = ? AND user_id = ?"
    ).get(entityId, userId) as Record<string, any> | undefined;
  }

  if (!entity) return [];

  // Get validated canon entries for comparison
  const canon = db.prepare(
    "SELECT * FROM entity_validations WHERE user_id = ? AND state = 'validated'"
  ).all(userId) as Record<string, any>[];

  // Also get events for alive/dead checks
  const events = db.prepare(
    "SELECT * FROM events WHERE user_id = ?"
  ).all(userId) as Record<string, any>[];

  const allCanon = [...canon, ...events];
  const contradictions: Contradiction[] = [];

  for (const rule of CONTRADICTION_RULES) {
    const result = rule.check(entity, allCanon);
    if (result) {
      contradictions.push(result);

      // Create validation record for review
      db.prepare(
        "INSERT INTO entity_validations (id, user_id, entity_type, entity_id, state, validation_notes, generated_by) VALUES (?, ?, ?, ?, 'under_review', ?, 'contradiction-detector')"
      ).run(
        crypto.randomUUID(),
        userId,
        entityType,
        entityId,
        result.description
      );
    }
  }

  return contradictions;
}

/**
 * Run contradiction checks on all entities for a user.
 * Returns total contradictions found.
 */
export function detectAllContradictions(userId: string): {
  total: number;
  byType: Record<string, number>;
} {
  const db = getDb();
  let total = 0;
  const byType: Record<string, number> = {};

  // Check all NPCs
  const npcs = db.prepare(
    "SELECT id FROM npcs WHERE user_id = ?"
  ).all(userId) as { id: string }[];

  for (const npc of npcs) {
    const contradictions = detectContradictions("npcs", npc.id, userId);
    for (const c of contradictions) {
      byType[c.type] = (byType[c.type] || 0) + 1;
    }
  }

  // Check all events
  const events = db.prepare(
    "SELECT id FROM events WHERE user_id = ?"
  ).all(userId) as { id: string }[];

  for (const event of events) {
    const contradictions = detectContradictions("events", event.id, userId);
    for (const c of contradictions) {
      byType[c.type] = (byType[c.type] || 0) + 1;
    }
  }

  return {
    total: Object.values(byType).reduce((sum, count) => sum + count, 0),
    byType,
  };
}

/**
 * Detect contradictions using both rule-based and semantic methods.
 * Returns combined results from both detection systems.
 */
export async function detectAllContradictionsWithSemantic(
  entityType: string,
  entityId: string,
  userId: string
): Promise<{
  ruleBased: Contradiction[];
  semantic: SemanticContradiction[];
  total: number;
}> {
  // Run rule-based detection
  const ruleBased = detectContradictions(entityType, entityId, userId);

  // Get entity content for semantic comparison
  const db = getDb();
  let content = "";

  switch (entityType) {
    case "npcs":
    case "npc": {
      const row = db.prepare(
        "SELECT name, file_path FROM npcs WHERE id = ? AND user_id = ?"
      ).get(entityId, userId) as { name: string; file_path: string | null } | undefined;
      if (row?.file_path) {
        try {
          const fs = require("fs");
          if (fs.existsSync(row.file_path)) {
            content = fs.readFileSync(row.file_path, "utf-8").slice(0, 2000);
          }
        } catch {
          // skip
        }
      }
      if (!content && row?.name) content = row.name;
      break;
    }
    case "events":
    case "event": {
      const row = db.prepare(
        "SELECT title, outcome FROM events WHERE id = ? AND user_id = ?"
      ).get(entityId, userId) as { title: string; outcome: string | null } | undefined;
      content = `${row?.title || ""}: ${row?.outcome || ""}`;
      break;
    }
    case "locations":
    case "location": {
      const row = db.prepare(
        "SELECT name, description FROM locations WHERE id = ? AND user_id = ?"
      ).get(entityId, userId) as { name: string; description: string | null } | undefined;
      content = `${row?.name || ""}: ${row?.description || ""}`;
      break;
    }
  }

  // Run semantic detection if we have content
  let semantic: SemanticContradiction[] = [];
  if (content.trim()) {
    semantic = await detectSemanticContradictions(userId, content, entityType, entityId);
  }

  return {
    ruleBased,
    semantic,
    total: ruleBased.length + semantic.length,
  };
}
