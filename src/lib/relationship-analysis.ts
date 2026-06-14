/**
 * Relationship Analysis
 * 
 * Analyzes recent messages to detect and update relationship states between
 * entities (NPCs, characters, locations). Uses AI to infer emotional changes,
 * shared history updates, and relationship stage progression.
 * 
 * Analysis triggers:
 * - After every 10 new messages in a session
 * - During idle-time processing (10-minute tier)
 * - When explicitly requested via API
 */

import { getDb } from "@/lib/db";
import { generateText, getActiveJobModel } from "@/lib/ollama";
import { syncRelationshipToFilesystem } from "@/lib/relationship-markdown";
import { safeParseWarn } from "@/lib/safe-json";
import type { RelationshipRow } from "@/lib/relationship-types";
import type { DbDatabase } from "@/lib/types";

/**
 * Resolve an entity name to a registered entity ID from the entity_registry.
 *
 * Resolution order:
 * 1. Check entity_registry by display_name or aliases (user-scoped)
 * 2. Check personas table by name
 * 3. Check npcs table by name
 * 4. Create a transient NPC entity in the registry as a fallback
 *
 * Returns the entity ID string (e.g. "persona:{uuid}" or "npc:{uuid}")
 * or null if all resolution paths fail.
 */
function resolveEntityId(db: DbDatabase, userId: string, name: string, universeId: string | null = null): string | null {
  // Check for persona entity first (scoped to universe)
  if (universeId) {
    const persona = db.prepare(
      "SELECT id FROM entity_registry WHERE LOWER(display_name) = LOWER(?) AND entity_type = 'persona' AND universe_id = ? LIMIT 1"
    ).get(name, universeId) as { id: string } | undefined;
    if (persona) return persona.id;
  }
  // Try to resolve via entity_registry (display_name or aliases)
  const found = db.prepare(`
    SELECT er.id FROM entity_registry er
    LEFT JOIN entity_aliases ea ON ea.entity_id = er.id
    WHERE er.user_id = ? AND (er.display_name = ? OR ea.alias = ?)
    LIMIT 1
  `).get(userId, name, name) as { id: string } | undefined;

  if (found) return found.id;

  // 2. Not found in registry — create a transient entity in the registry
  const id = `npc:${crypto.randomUUID()}`;
  try {
    db.prepare(
      "INSERT INTO entity_registry (id, entity_type, display_name, user_id) VALUES (?, 'npc', ?, ?)"
    ).run(id, name, userId);
    return id;
  } catch {
    return null;
  }
}

export interface RelationshipAnalysisResult {
  analyzedCount: number;
  updatedRelationships: {
    source: string;
    target: string;
    emotionalState: string;
    stage: string;
  }[];
}

/**
 * Analyze relationships based on recent messages in a session
 */
export async function processRelationshipAnalysis(
  userId: string,
  sessionId: string
): Promise<RelationshipAnalysisResult> {
  const db = getDb();
  const sessionRow = db.prepare(
    "SELECT universe_id FROM sessions WHERE id = ?"
  ).get(sessionId) as { universe_id: string | null } | undefined;
  const universeId = sessionRow?.universe_id || null;

  // Get recent messages (last 20) for analysis
  const messages = db.prepare(`
    SELECT m.content, m.sender_id, m.timestamp, m.emotional_tone, m.location_context
    FROM messages m
    WHERE m.session_id = ? AND m.is_deleted = 0
    ORDER BY m.timestamp DESC
    LIMIT 20
  `).all(sessionId) as {
    content: string;
    sender_id: string | null;
    timestamp: string;
    emotional_tone: string | null;
    location_context: string | null;
  }[];

  if (messages.length < 3) {
    return { analyzedCount: 0, updatedRelationships: [] };
  }

  // Get existing relationships for this user
  const existingRels = db.prepare(`
    SELECT id, source_entity, target_entity, emotional_state, relationship_stage, shared_history
    FROM relationships
    WHERE user_id = ?
  `).all(userId) as Pick<RelationshipRow, "id" | "source_entity" | "target_entity" | "emotional_state" | "relationship_stage" | "shared_history">[];

  // Extract entity names from messages and existing relationships
  const entityNames = extractEntityNames(messages, existingRels);

  if (entityNames.length < 2) {
    return { analyzedCount: 0, updatedRelationships: [] };
  }

  // Analyze relationships using AI
  const analysis = await analyzeRelationshipsAI(messages, entityNames, existingRels, userId);

  // Update relationships in database
  const updatedRelationships: RelationshipAnalysisResult["updatedRelationships"] = [];

  for (const rel of analysis.relationships) {
    const existing = existingRels.find(
      (r) =>
        (r.source_entity === rel.source && r.target_entity === rel.target) ||
        (r.source_entity === rel.target && r.target_entity === rel.source)
    );

    if (existing) {
      // Update existing relationship
      try {
        const sourceId = resolveEntityId(db, userId, rel.source, universeId);
        const targetId = resolveEntityId(db, userId, rel.target, universeId);
        db.prepare(`
          UPDATE relationships
          SET emotional_state = ?, relationship_stage = ?, shared_history = ?,
              source_entity_id = ?, target_entity_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(rel.emotionalState, rel.stage, rel.sharedHistory, sourceId, targetId, existing.id);
      } catch (err) {
        console.error("[SQL ERROR] UPDATE relationships failed", { error: String(err), rel, existingId: existing.id });
        throw err;
      }

      // Sync to markdown files
      syncRelationshipToFilesystem(existing.id);
    } else {
      // Create new relationship
      const relId = crypto.randomUUID();
      try {
        const sourceId = resolveEntityId(db, userId, rel.source, universeId);
        const targetId = resolveEntityId(db, userId, rel.target, universeId);
        db.prepare(`
          INSERT INTO relationships (id, user_id, source_entity, target_entity,
            source_entity_id, target_entity_id,
            emotional_state, relationship_stage, shared_history, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(relId, userId, rel.source, rel.target, sourceId, targetId,
              rel.emotionalState, rel.stage, rel.sharedHistory);
      } catch (err) {
        console.error("[SQL ERROR] INSERT relationships failed", { error: String(err), relId, rel });
        throw err;
      }

      // Sync to markdown files
      syncRelationshipToFilesystem(relId);
    }

    updatedRelationships.push({
      source: rel.source,
      target: rel.target,
      emotionalState: rel.emotionalState,
      stage: rel.stage,
    });
  }

  return {
    analyzedCount: messages.length,
    updatedRelationships,
  };
}

/**
 * Extract entity names from messages and existing relationships
 */
function extractEntityNames(
  messages: { content: string }[],
  existingRels: { source_entity: string; target_entity: string }[]
): string[] {
  const names = new Set<string>();

  // Add existing relationship entities
  for (const rel of existingRels) {
    names.add(rel.source_entity);
    names.add(rel.target_entity);
  }

  return Array.from(names);
}

/**
 * Use AI to analyze relationships from messages
 */
async function analyzeRelationshipsAI(
  messages: { content: string; sender_id: string | null; emotional_tone: string | null }[],
  entityNames: string[],
  existingRels: { source_entity: string; target_entity: string; emotional_state: string | null; relationship_stage: string | null }[],
  userId: string
): Promise<{
  relationships: {
    source: string;
    target: string;
    emotionalState: string;
    stage: string;
    sharedHistory: string;
  }[];
}> {
  const messageText = messages
    .reverse()
    .map((m) => `${m.sender_id === null ? "Narrator" : "Player"}: ${m.content}`)
    .join("\n");

  const existingText = existingRels
    .map((r) => `${r.source_entity} → ${r.target_entity}: ${r.emotional_state || "neutral"} (${r.relationship_stage || "unknown"})`)
    .join("\n") || "No existing relationships";

  const prompt = `Analyze the relationships between characters based on these recent messages.

Existing relationships:
${existingText}

Known entities: ${entityNames.join(", ")}

Recent messages:
${messageText}

For each pair of entities that have interacted, provide:
- emotionalState: a JSON object representing an emotion vector with scores 0-1, e.g. {"trust":0.8,"familiarity":0.6,"warmth":0.7,"tension":0.1}. Use keys like trust, familiarity, warmth, tension, respect, attraction, hostility.
- stage: relationship stage (e.g., "strangers", "acquaintances", "friends", "close_friends", "allies", "rivals", "enemies", "lovers")
- sharedHistory: brief summary of what happened between them

Format as JSON array:
[
  {
    "source": "entity name",
    "target": "entity name",
    "emotionalState": {"trust": 0.8, "familiarity": 0.6},
    "stage": "stage",
    "sharedHistory": "summary"
  }
]

Only include relationships that have changed or are newly formed.`;

  try {
    const response = await generateText(prompt, { temperature: 0.3, userId, model: getActiveJobModel(userId) });

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { relationships: [] };

    const parsed = safeParseWarn<Array<{ source?: unknown; target?: unknown; emotionalState?: string; stage?: string; sharedHistory?: string }>>(jsonMatch[0], "LLM relationship analysis");
    if (!parsed || !Array.isArray(parsed)) return { relationships: [] };

    return {
      relationships: parsed
        .filter((r) => r.source && r.target)
        .map((r) => ({
          source: r.source as string,
          target: r.target as string,
          emotionalState: typeof r.emotionalState === 'object' ? JSON.stringify(r.emotionalState) : (r.emotionalState || "neutral"),
          stage: typeof r.stage === 'object' ? JSON.stringify(r.stage) : (r.stage || "acquaintances"),
          sharedHistory: typeof r.sharedHistory === 'object' ? JSON.stringify(r.sharedHistory) : (r.sharedHistory || ""),
        })),
    };
  } catch {
    return { relationships: [] };
  }
}

/**
 * Check if a session needs relationship analysis
 */
export function needsRelationshipAnalysis(sessionId: string): boolean {
  const db = getDb();

  // Count messages since last analysis
  const lastAnalysis = db.prepare(`
    SELECT MAX(updated_at) as last_update
    FROM relationships
    WHERE user_id IN (SELECT owner_id FROM sessions WHERE id = ?)
  `).get(sessionId) as { last_update: string | null } | undefined;

  const messageCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM messages
    WHERE session_id = ? AND is_deleted = 0
      AND timestamp > COALESCE(?, '1970-01-01')
  `).get(sessionId, lastAnalysis?.last_update || null) as { count: number } | undefined;

  return (messageCount?.count || 0) >= 10;
}

/**
 * Get sessions that need relationship analysis for a user
 */
export function getSessionsNeedingRelationshipAnalysis(userId: string): string[] {
  const db = getDb();

  const sessions = db.prepare(
    "SELECT id FROM sessions WHERE owner_id = ? AND status = 'active'"
  ).all(userId) as { id: string }[];

  return sessions
    .filter((s) => needsRelationshipAnalysis(s.id))
    .map((s) => s.id);
}
