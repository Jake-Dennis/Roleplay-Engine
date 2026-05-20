/**
 * Shared TypeScript types for the relationship subsystem.
 *
 * Centralizes common type definitions to eliminate `Record<string, any>`
 * and `as string`/`as number` assertions across relationship files.
 */

// ── Emotional State ─────────────────────────────────────────────────────────

/**
 * Parsed emotional state map: emotion name → numeric value (0-1 range).
 * e.g., { trust: 0.62, suspicion: 0.31 }
 */
export type EmotionalState = Record<string, number>;

// ── Shared History ──────────────────────────────────────────────────────────

export interface SharedHistoryEntry {
  type: string;
  summary: string;
  at: string; // ISO date string
}

// ── Decay Configuration ─────────────────────────────────────────────────────

export interface DecayConfig {
  emotionalHalfLifeDays: number;
  stageRegressionDays: number;
  minEmotionalState: string;
}

// ── Database Row ────────────────────────────────────────────────────────────

/**
 * Raw row from the `relationships` table.
 * JSON columns (emotional_state, shared_history, decay_rates) are strings.
 */
export interface RelationshipRow {
  id: string;
  user_id: string;
  universe_id: string | null;
  source_entity: string;
  target_entity: string;
  emotional_state: string | null;  // JSON: EmotionalState
  shared_history: string | null;   // JSON: SharedHistoryEntry[]
  relationship_stage: string | null;
  decay_rates: string | null;      // JSON: DecayConfig
  updated_at: string | null;
  created_at: string | null;
}

/**
 * RelationshipRow with group-access join columns.
 * Used by relationship-access.ts and API routes that join universes/groups.
 */
export interface RelationshipRowWithGroup extends RelationshipRow {
  group_id: string | null;
  group_owner_id: string | null;
}

// ── Evolution History ───────────────────────────────────────────────────────

export interface RelationshipEvolutionEntry {
  id: string;
  relationship_id: string;
  user_id: string;
  emotional_state: EmotionalState;
  relationship_stage: string | null;
  trigger_event: string | null;
  recorded_at: string;
}

/**
 * Raw evolution row from DB before parsing emotional_state.
 */
export interface RelationshipEvolutionRow {
  id: string;
  relationship_id: string;
  user_id: string;
  emotional_state: string | null;
  relationship_stage: string | null;
  trigger_event: string | null;
  recorded_at: string;
}

// ── Frontmatter ─────────────────────────────────────────────────────────────

/**
 * YAML frontmatter for relationship markdown files.
 * Extends the base MarkdownFrontmatter with relationship-specific fields.
 */
export interface RelationshipFrontmatter {
  id: string;
  name: string;
  type: "relationship";
  source: string;
  target: string;
  universe_id?: string;
  relationship_stage: string;
  updated_at: string;
  importance?: string;
  created_at?: string;
}

// ── Markdown Data ───────────────────────────────────────────────────────────

/**
 * Parsed data from a relationship markdown file.
 */
export interface RelationshipMarkdownData {
  frontmatter: RelationshipFrontmatter;
  emotionalState: EmotionalState;
  sharedHistory: SharedHistoryEntry[];
  decayConfig: DecayConfig;
  notes: string;
}

// ── Contradiction Detector Entities ─────────────────────────────────────────

/**
 * Generic entity row from NPC/event/location tables.
 * Used by contradiction-detector.ts for rule-based checks.
 */
export interface CanonEntity {
  id?: string;
  name?: string;
  title?: string;
  status?: string;
  occurred_at?: string;
  entry_type?: string;
  type?: string;
  event_type?: string;
  participants?: string;
  entity_type?: string;
  entity_id?: string;
  location_id?: string;
  [key: string]: unknown;
}

/**
 * Raw DB result for entity lookups (NPCs, events, locations).
 * More specific than Record<string, any> but flexible enough for dynamic columns.
 */
export interface EntityRow {
  id: string;
  name?: string;
  title?: string;
  status?: string;
  description?: string;
  occurred_at?: string;
  outcome?: string;
  file_path?: string | null;
  user_id: string;
  [key: string]: unknown;
}
