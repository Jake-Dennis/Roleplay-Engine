/**
 * Narrative Importance System
 *
 * 4-axis importance scoring for retrieval ranking and archival decisions.
 * Every entity and memory tracks emotional, local, canonical, and recency importance.
 *
 * Axes:
 * - emotional: How emotionally significant (low=1, medium=2, high=3, critical=4)
 * - local: How relevant to current location
 * - canonical: How important to canon/story
 * - recency: How recently referenced (decays over time)
 *
 * Composite Score:
 *   score = (emotional × 0.35) + (local × 0.25) + (canonical × 0.20) + (recency × 0.20)
 *   Max score = 16
 *
 * Archival Thresholds:
 * - ≤ 4: Archive to cold storage
 * - 5-8: Keep in database, low retrieval priority
 * - 9-12: Normal retrieval priority
 * - 13-16: Always include in context if relevant
 */

export type ImportanceLevel = "low" | "medium" | "high" | "critical";

export interface ImportanceScores {
  emotional: ImportanceLevel;
  local: ImportanceLevel;
  canonical: ImportanceLevel;
  recency: ImportanceLevel;
}

export interface ImportanceResult {
  composite: number;
  tier: "archived" | "low" | "normal" | "high";
  scores: ImportanceScores;
}

// Numeric mapping for importance levels
const LEVEL_VALUES: Record<ImportanceLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// Reverse mapping
const VALUE_LEVELS: Record<number, ImportanceLevel> = {
  1: "low",
  2: "medium",
  3: "high",
  4: "critical",
};

// Weights for composite score calculation
const WEIGHTS = {
  emotional: 0.35,
  local: 0.25,
  canonical: 0.20,
  recency: 0.20,
};

/**
 * Calculate composite importance score from 4-axis values
 */
export function calculateImportance(scores: ImportanceScores): ImportanceResult {
  const emotional = LEVEL_VALUES[scores.emotional];
  const local = LEVEL_VALUES[scores.local];
  const canonical = LEVEL_VALUES[scores.canonical];
  const recency = LEVEL_VALUES[scores.recency];

  const composite =
    emotional * WEIGHTS.emotional +
    local * WEIGHTS.local +
    canonical * WEIGHTS.canonical +
    recency * WEIGHTS.recency;

  // Normalize to 0-16 scale (multiply by 4 since weights sum to 1.0 and max per axis is 4)
  const normalizedScore = composite * 4;

  return {
    composite: Math.round(normalizedScore * 100) / 100,
    tier: scoreToTier(normalizedScore),
    scores,
  };
}

/**
 * Map composite score to archival tier
 */
function scoreToTier(score: number): ImportanceResult["tier"] {
  if (score <= 4) return "archived";
  if (score <= 8) return "low";
  if (score <= 12) return "normal";
  return "high";
}

/**
 * Convert numeric value to importance level
 */
export function valueToLevel(value: number): ImportanceLevel {
  const clamped = Math.max(1, Math.min(4, Math.round(value)));
  return VALUE_LEVELS[clamped] || "medium";
}

/**
 * Decay recency importance based on days since last reference
 * Recency decays faster than other axes
 */
export function decayRecency(
  currentLevel: ImportanceLevel,
  daysSinceReference: number
): ImportanceLevel {
  const currentValue = LEVEL_VALUES[currentLevel];

  // Decay rate: drops one level every 7 days of inactivity
  const levelsToDecay = Math.floor(daysSinceReference / 7);
  const newValue = Math.max(1, currentValue - levelsToDecay);

  return valueToLevel(newValue);
}

/**
 * Update importance scores based on narrative events
 */
export function updateImportance(
  current: ImportanceScores,
  event: {
    emotionalDelta?: number;
    localDelta?: number;
    canonicalDelta?: number;
    resetRecency?: boolean;
  }
): ImportanceScores {
  const emotional = Math.max(
    1,
    Math.min(4, LEVEL_VALUES[current.emotional] + (event.emotionalDelta || 0))
  );
  const local = Math.max(
    1,
    Math.min(4, LEVEL_VALUES[current.local] + (event.localDelta || 0))
  );
  const canonical = Math.max(
    1,
    Math.min(4, LEVEL_VALUES[current.canonical] + (event.canonicalDelta || 0))
  );
  const recency = event.resetRecency ? 4 : LEVEL_VALUES[current.recency];

  return {
    emotional: valueToLevel(emotional),
    local: valueToLevel(local),
    canonical: valueToLevel(canonical),
    recency: valueToLevel(recency),
  };
}

/**
 * Get entities that should be archived (score ≤ 4)
 */
export function getArchivalCandidates(
  entities: { id: string; importance: ImportanceScores }[]
): string[] {
  return entities
    .filter((e) => calculateImportance(e.importance).tier === "archived")
    .map((e) => e.id);
}

/**
 * Get entities that should always be included (score ≥ 13)
 */
export function getHighPriorityEntities(
  entities: { id: string; importance: ImportanceScores }[]
): string[] {
  return entities
    .filter((e) => calculateImportance(e.importance).tier === "high")
    .map((e) => e.id);
}

/**
 * Sort entities by importance score (descending)
 */
export function sortByImportance<T extends { importance: ImportanceScores }>(
  entities: T[]
): T[] {
  return [...entities].sort(
    (a, b) => calculateImportance(b.importance).composite - calculateImportance(a.importance).composite
  );
}
