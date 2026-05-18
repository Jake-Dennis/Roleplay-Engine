/**
 * Importance Scoring — Database Integration
 * 
 * Bridges the pure importance.ts utility functions with the database.
 * Handles storing, retrieving, and updating importance scores for all entity types.
 * 
 * Composite score formula: (emotional × 0.35) + (local × 0.25) + (canonical × 0.20) + (recency × 0.20)
 * Values: low=1, medium=2, high=3, critical=4. Max = 16.
 * 
 * Archival thresholds:
 * - ≤ 4: Archive to cold storage
 * - 5-8: Keep in database, low retrieval priority
 * - 9-12: Normal retrieval priority
 * - 13-16: Always include in context if relevant
 */

import { getDb } from "@/lib/db";
import {
  calculateImportance,
  type ImportanceScores,
  type ImportanceLevel,
} from "@/lib/importance";

export type ArchivalAction = "archive" | "low_priority" | "normal" | "always_include";

export interface EntityImportance {
  entityType: string;
  entityId: string;
  scores: ImportanceScores;
  composite: number;
  tier: ArchivalAction;
}

/**
 * Map composite score to archival action.
 */
export function getArchivalAction(score: number): ArchivalAction {
  if (score <= 4) return "archive";
  if (score <= 8) return "low_priority";
  if (score <= 12) return "normal";
  return "always_include";
}

/**
 * Calculate and store importance score for an entity.
 */
export async function updateImportanceScores(
  entityType: string,
  entityId: string,
  scores: ImportanceScores
): Promise<number> {
  const result = calculateImportance(scores);
  const db = getDb();

  // Determine which table to update based on entity type
  const tableMap: Record<string, string> = {
    message: "messages",
    relationship: "relationships",
    lore: "lore_entries",
    event: "events",
    npc: "npcs",
    location: "locations",
  };

  const table = tableMap[entityType.toLowerCase()];
  if (!table) {
    // Store in a generic importance_scores table for unknown types
    db.prepare(`
      INSERT OR REPLACE INTO importance_scores (entity_type, entity_id, emotional, local, canonical, recency, composite_score, tier, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      entityType,
      entityId,
      scores.emotional,
      scores.local,
      scores.canonical,
      scores.recency,
      result.composite,
      result.tier
    );
    return result.composite;
  }

  // Update the specific table's importance_score column
  try {
    db.prepare(`
      UPDATE ${table}
      SET importance_score = ?
      WHERE id = ?
    `).run(result.composite, entityId);
  } catch {
    // Column may not exist yet — store in generic table
    db.prepare(`
      INSERT OR REPLACE INTO importance_scores (entity_type, entity_id, emotional, local, canonical, recency, composite_score, tier, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      entityType,
      entityId,
      scores.emotional,
      scores.local,
      scores.canonical,
      scores.recency,
      result.composite,
      result.tier
    );
  }

  return result.composite;
}

/**
 * Get importance scores for an entity.
 */
export function getEntityImportance(entityType: string, entityId: string): EntityImportance | null {
  const db = getDb();

  // Check generic table first
  const generic = db.prepare(`
    SELECT emotional, local, canonical, recency, composite_score, tier
    FROM importance_scores
    WHERE entity_type = ? AND entity_id = ?
  `).get(entityType, entityId) as {
    emotional: string;
    local: string;
    canonical: string;
    recency: string;
    composite_score: number;
    tier: string;
  } | undefined;

  if (generic) {
    const scores: ImportanceScores = {
      emotional: generic.emotional as ImportanceLevel,
      local: generic.local as ImportanceLevel,
      canonical: generic.canonical as ImportanceLevel,
      recency: generic.recency as ImportanceLevel,
    };
    return {
      entityType,
      entityId,
      scores,
      composite: generic.composite_score,
      tier: generic.tier as ArchivalAction,
    };
  }

  // Check specific tables
  const tableMap: Record<string, string> = {
    message: "messages",
    relationship: "relationships",
    lore: "lore_entries",
    event: "events",
    npc: "npcs",
    location: "locations",
  };

  const table = tableMap[entityType.toLowerCase()];
  if (!table) return null;

  const row = db.prepare(`
    SELECT importance_score
    FROM ${table}
    WHERE id = ?
  `).get(entityId) as { importance_score: number | null } | undefined;

  if (!row || row.importance_score === null) return null;

  // Reconstruct scores from composite (approximate)
  const score = row.importance_score;
  const level = scoreToLevel(score / 4);
  const scores: ImportanceScores = {
    emotional: level,
    local: level,
    canonical: level,
    recency: level,
  };

  return {
    entityType,
    entityId,
    scores,
    composite: score,
    tier: getArchivalAction(score),
  };
}

/**
 * Get all entities below archival threshold (score ≤ 4).
 */
export function getArchivalCandidates(userId: string): EntityImportance[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT entity_type, entity_id, emotional, local, canonical, recency, composite_score, tier
    FROM importance_scores
    WHERE entity_type IN ('message', 'lore', 'event', 'relationship')
      AND composite_score <= 4
    ORDER BY composite_score ASC
  `).all() as {
    entity_type: string;
    entity_id: string;
    emotional: string;
    local: string;
    canonical: string;
    recency: string;
    composite_score: number;
    tier: string;
  }[];

  return rows.map((r) => ({
    entityType: r.entity_type,
    entityId: r.entity_id,
    scores: {
      emotional: r.emotional as ImportanceLevel,
      local: r.local as ImportanceLevel,
      canonical: r.canonical as ImportanceLevel,
      recency: r.recency as ImportanceLevel,
    },
    composite: r.composite_score,
    tier: r.tier as ArchivalAction,
  }));
}

/**
 * Get high-priority entities (score ≥ 13) that should always be included.
 */
export function getHighPriorityEntities(userId: string): EntityImportance[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT entity_type, entity_id, emotional, local, canonical, recency, composite_score, tier
    FROM importance_scores
    WHERE composite_score >= 13
    ORDER BY composite_score DESC
  `).all() as {
    entity_type: string;
    entity_id: string;
    emotional: string;
    local: string;
    canonical: string;
    recency: string;
    composite_score: number;
    tier: string;
  }[];

  return rows.map((r) => ({
    entityType: r.entity_type,
    entityId: r.entity_id,
    scores: {
      emotional: r.emotional as ImportanceLevel,
      local: r.local as ImportanceLevel,
      canonical: r.canonical as ImportanceLevel,
      recency: r.recency as ImportanceLevel,
    },
    composite: r.composite_score,
    tier: r.tier as ArchivalAction,
  }));
}

/**
 * Helper: map a numeric score (1-4) to an importance level.
 */
function scoreToLevel(value: number): ImportanceLevel {
  const clamped = Math.max(1, Math.min(4, Math.round(value)));
  const levels: Record<number, ImportanceLevel> = {
    1: "low",
    2: "medium",
    3: "high",
    4: "critical",
  };
  return levels[clamped] || "medium";
}

/**
 * Decay recency for all entities of a user based on days since last interaction.
 * Called during idle-time processing.
 */
export function decayAllRecencyScores(userId: string, daysSinceActivity: number): number {
  const db = getDb();

  const rows = db.prepare(`
    SELECT id, recency, composite_score
    FROM importance_scores
    WHERE entity_type IN ('message', 'lore', 'event', 'relationship')
  `).all() as { id: string; recency: string; composite_score: number }[];

  let updated = 0;
  for (const row of rows) {
    const currentLevel = row.recency as ImportanceLevel;
    const currentValue = { low: 1, medium: 2, high: 3, critical: 4 }[currentLevel] || 2;

    // Decay rate: drops one level every 7 days of inactivity
    const levelsToDecay = Math.floor(daysSinceActivity / 7);
    const newValue = Math.max(1, currentValue - levelsToDecay);
    const newLevel = scoreToLevel(newValue);

    if (newLevel !== currentLevel) {
      db.prepare(`
        UPDATE importance_scores
        SET recency = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newLevel, row.id);
      updated++;
    }
  }

  return updated;
}
