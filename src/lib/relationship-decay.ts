/**
 * Relationship Decay Scheduler
 * 
 * Applies time-based decay to relationships that haven't been interacted with.
 * Relationships naturally weaken over time unless reinforced by session activity.
 * 
 * Decay mechanics:
 * - Each relationship has configurable decay rates (stored as JSON)
 * - Default half-life: 7 days for emotional intensity, 14 days for stage regression
 * - Decay is applied during idle-time processing (30-minute tier) or on-demand
 * - Relationships at "strangers" stage don't decay further
 * - Recent session activity resets the decay timer
 */

import { getDb } from "@/lib/db";
import { syncRelationshipToFilesystem } from "@/lib/relationship-markdown";
import { EMOTION_HALF_LIVES } from "@/lib/relationship-constants";

export { EMOTION_HALF_LIVES };

export interface DecayResult {
  decayedCount: number;
  decayedRelationships: {
    id: string;
    source: string;
    target: string;
    previousState: string;
    newState: string;
    previousStage: string;
    newStage: string;
  }[];
}

// Default decay configuration
const DEFAULT_DECAY_RATES = {
  emotionalHalfLifeDays: 7,
  stageRegressionDays: 14,
  minEmotionalState: "neutral",
};

/**
 * Apply exponential decay to a single emotion value.
 * Formula: new_value = current_value × (0.5 ^ (days_inactive / half_life_days))
 */
export function applyEmotionDecay(
  currentValue: number,
  daysInactive: number,
  halfLifeDays: number
): number {
  if (daysInactive <= 0 || halfLifeDays <= 0) return currentValue;
  const decayFactor = Math.pow(0.5, daysInactive / halfLifeDays);
  return currentValue * decayFactor;
}

// Emotional state progression (strongest to weakest)
const EMOTIONAL_STATES = [
  "devoted",
  "loving",
  "trusting",
  "friendly",
  "warm",
  "neutral",
  "cold",
  "distant",
  "suspicious",
  "hostile",
  "hateful",
] as const;

// Relationship stage progression (closest to furthest)
const RELATIONSHIP_STAGES = [
  "lovers",
  "close_friends",
  "friends",
  "allies",
  "acquaintances",
  "strangers",
] as const;

/**
 * Apply relationship decay for a user
 */
export function processRelationshipDecay(userId: string): DecayResult {
  const db = getDb();

  // Get all relationships for this user
  const relationships = db.prepare(`
    SELECT r.id, r.source_entity, r.target_entity, r.emotional_state, r.relationship_stage,
           r.decay_rates, r.updated_at
    FROM relationships r
    WHERE r.user_id = ?
  `).all(userId) as {
    id: string;
    source_entity: string;
    target_entity: string;
    emotional_state: string | null;
    relationship_stage: string | null;
    decay_rates: string | null;
    updated_at: string | null;
  }[];

  const decayedRelationships: DecayResult["decayedRelationships"] = [];

  for (const rel of relationships) {
    // Parse decay rates
    const rates = rel.decay_rates
      ? { ...DEFAULT_DECAY_RATES, ...JSON.parse(rel.decay_rates) }
      : DEFAULT_DECAY_RATES;

    // Calculate days since last update
    const lastUpdate = rel.updated_at ? new Date(rel.updated_at) : new Date();
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

    // Skip if recently updated (within 24 hours)
    if (daysSinceUpdate < 1) continue;

    const previousState = rel.emotional_state || "neutral";
    const previousStage = rel.relationship_stage || "acquaintances";

    // Apply emotional decay
    const newState = applyEmotionalDecay(previousState, daysSinceUpdate, rates.emotionalHalfLifeDays);

    // Apply stage regression
    const newStage = applyStageRegression(previousStage, daysSinceUpdate, rates.stageRegressionDays);

    // Update if changed
    if (newState !== previousState || newStage !== previousStage) {
      db.prepare(`
        UPDATE relationships
        SET emotional_state = ?, relationship_stage = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newState, newStage, rel.id);

      // Sync to markdown files
      syncRelationshipToFilesystem(rel.id);

      decayedRelationships.push({
        id: rel.id,
        source: rel.source_entity,
        target: rel.target_entity,
        previousState,
        newState,
        previousStage,
        newStage,
      });
    }
  }

  return {
    decayedCount: decayedRelationships.length,
    decayedRelationships,
  };
}

/**
 * Apply emotional state decay based on half-life
 */
function applyEmotionalDecay(
  currentState: string,
  daysSinceUpdate: number,
  halfLifeDays: number
): string {
  const currentIndex = EMOTIONAL_STATES.indexOf(currentState as typeof EMOTIONAL_STATES[number]);
  if (currentIndex === -1) return "neutral";

  const neutralIndex = EMOTIONAL_STATES.indexOf("neutral");
  const minIndex = EMOTIONAL_STATES.indexOf(DEFAULT_DECAY_RATES.minEmotionalState as typeof EMOTIONAL_STATES[number]);

  // Calculate how many steps to decay
  const halfLives = daysSinceUpdate / halfLifeDays;
  const stepsToDecay = Math.floor(halfLives);

  if (stepsToDecay === 0) return currentState;

  // Decay toward neutral
  let newIndex: number;
  if (currentIndex < neutralIndex) {
    // Positive emotion: decay toward neutral
    newIndex = Math.min(currentIndex + stepsToDecay, neutralIndex);
  } else if (currentIndex > neutralIndex) {
    // Negative emotion: decay toward neutral
    newIndex = Math.max(currentIndex - stepsToDecay, neutralIndex);
  } else {
    // Already neutral
    newIndex = neutralIndex;
  }

  // Don't decay below minimum
  newIndex = Math.max(newIndex, minIndex);

  return EMOTIONAL_STATES[newIndex];
}

/**
 * Apply relationship stage regression
 */
function applyStageRegression(
  currentStage: string,
  daysSinceUpdate: number,
  regressionDays: number
): string {
  const currentIndex = RELATIONSHIP_STAGES.indexOf(currentStage as typeof RELATIONSHIP_STAGES[number]);
  if (currentIndex === -1) return "acquaintances";

  const strangerIndex = RELATIONSHIP_STAGES.indexOf("strangers");

  // Calculate regression steps
  const periods = daysSinceUpdate / regressionDays;
  const stepsToRegress = Math.floor(periods);

  if (stepsToRegress === 0) return currentStage;

  // Regress toward strangers
  const newIndex = Math.min(currentIndex + stepsToRegress, strangerIndex);

  return RELATIONSHIP_STAGES[newIndex];
}

/**
 * Reset decay timer for a relationship (called when interaction occurs)
 */
export function resetRelationshipDecay(userId: string, sourceEntity: string, targetEntity: string): void {
  const db = getDb();

  db.prepare(`
    UPDATE relationships
    SET updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND (
      (source_entity = ? AND target_entity = ?) OR
      (source_entity = ? AND target_entity = ?)
    )
  `).run(userId, sourceEntity, targetEntity, targetEntity, sourceEntity);
}

/**
 * Check if decay processing is needed (24-hour cycle)
 */
export function needsDecayProcessing(userId: string): boolean {
  const db = getDb();

  const lastDecay = db.prepare(`
    SELECT MAX(updated_at) as last_update
    FROM relationships
    WHERE user_id = ?
  `).get(userId) as { last_update: string | null } | undefined;

  if (!lastDecay?.last_update) return true;

  const hoursSinceDecay = (Date.now() - new Date(lastDecay.last_update).getTime()) / (1000 * 60 * 60);
  return hoursSinceDecay >= 24;
}

/**
 * Get decay statistics for a user
 */
export function getDecayStats(userId: string): {
  totalRelationships: number;
  decayingRelationships: number;
  stableRelationships: number;
} {
  const db = getDb();

  const total = db.prepare(
    "SELECT COUNT(*) as count FROM relationships WHERE user_id = ?"
  ).get(userId) as { count: number } | undefined;

  const decaying = db.prepare(`
    SELECT COUNT(*) as count FROM relationships
    WHERE user_id = ?
      AND updated_at < datetime('now', '-7 days')
  `).get(userId) as { count: number } | undefined;

  return {
    totalRelationships: total?.count || 0,
    decayingRelationships: decaying?.count || 0,
    stableRelationships: (total?.count || 0) - (decaying?.count || 0),
  };
}

/**
 * Apply decay to all relationships for a user using per-emotion half-life formulas.
 * Called during >30min idle enrichment or on-demand via job processor.
 * 
 * Formula: new_value = current_value × (0.5 ^ (days_inactive / half_life_days))
 */
export async function applyDecayToAllRelationships(
  userId: string,
  universeId: string | null = null
): Promise<{
  decayedCount: number;
  relationships: {
    id: string;
    source: string;
    target: string;
    previousEmotions: Record<string, number>;
    newEmotions: Record<string, number>;
  }[];
}> {
  const db = getDb();

  let query = `
    SELECT r.id, r.source_entity, r.target_entity, r.emotional_state, r.relationship_stage,
           r.decay_rates, r.updated_at
    FROM relationships r
    WHERE r.user_id = ?
  `;
  const params: (string | number)[] = [userId];

  if (universeId) {
    query += " AND r.universe_id = ?";
    params.push(universeId);
  }

  const relationships = db.prepare(query).all(...params) as {
    id: string;
    source_entity: string;
    target_entity: string;
    emotional_state: string | null;
    relationship_stage: string | null;
    decay_rates: string | null;
    updated_at: string | null;
  }[];

  const decayed: {
    id: string;
    source: string;
    target: string;
    previousEmotions: Record<string, number>;
    newEmotions: Record<string, number>;
  }[] = [];

  for (const rel of relationships) {
    const lastUpdate = rel.updated_at ? new Date(rel.updated_at) : new Date();
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

    // Skip if recently updated (within 24 hours)
    if (daysSinceUpdate < 1) continue;

    // Parse emotional state
    const emotions = rel.emotional_state ? JSON.parse(rel.emotional_state) : {};
    if (Object.keys(emotions).length === 0) continue;

    const previousEmotions = { ...emotions };
    const newEmotions: Record<string, number> = {};

    // Apply per-emotion decay
    for (const [emotion, value] of Object.entries(emotions)) {
      const halfLife = EMOTION_HALF_LIVES[emotion] || DEFAULT_DECAY_RATES.emotionalHalfLifeDays;
      const decayedValue = applyEmotionDecay(value as number, daysSinceUpdate, halfLife);
      newEmotions[emotion] = Math.round(decayedValue * 100) / 100;
    }

    // Check if any emotion changed significantly
    const hasChanged = Object.keys(newEmotions).some(
      (k) => Math.abs((newEmotions[k] || 0) - (previousEmotions[k] || 0)) > 0.05
    );

    if (hasChanged) {
      db.prepare(`
        UPDATE relationships
        SET emotional_state = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(newEmotions), rel.id);

      // Sync to markdown files
      syncRelationshipToFilesystem(rel.id);

      decayed.push({
        id: rel.id,
        source: rel.source_entity,
        target: rel.target_entity,
        previousEmotions,
        newEmotions,
      });
    }
  }

  return {
    decayedCount: decayed.length,
    relationships: decayed,
  };
}
