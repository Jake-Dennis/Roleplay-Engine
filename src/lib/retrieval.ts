import { getDb, isVecAvailable } from "@/lib/db";
import { classifyIntent, type Intent } from "@/lib/intent-analyzer";
import { classifyIntentWithFallback } from "@/lib/semantic-intent-fallback";
import { generateEmbedding } from "@/lib/ollama";
import { vectorSearch } from "@/lib/embeddings";

// H5: Re-export prompt assembly functions from canonical source (prompt-builder.ts)
export {
  assemblePrompt,
  assemblePromptWithBudget,
  estimateTokens,
  applyContextBudget,
  buildIntentContext,
} from "@/lib/prompt-builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SceneContext {
  location: string | null;
  goal: string | null;
  tone: string | null;
  activeNpcs: string[];
}

export interface LoreContext {
  entries: { id: number; name: string; description: string; type: string }[];
}

export interface RelationshipContext {
  relationships: { source: string; target: string; state: string | null }[];
}

export interface MessageContext {
  messages: { senderId: string | null; content: string; timestamp: string }[];
}

export interface RetrievedContext {
  scene: SceneContext;
  lore: LoreContext;
  relationships: RelationshipContext;
  recentMessages: MessageContext;
  canonContext: string | null;
  intent: Intent;
}

// ---------------------------------------------------------------------------
// Retrieval functions
// ---------------------------------------------------------------------------

/**
 * Fetch the current scene state for a session
 */
export function getSceneContext(sessionId: string): SceneContext {
  const db = getDb();
  const result = db.prepare(
    `SELECT active_location_id, current_goal, emotional_tone, active_npcs
     FROM scene_states
     WHERE session_id = ?
     ORDER BY updated_at DESC LIMIT 1`
  ).get(sessionId) as {
    active_location_id: string | null;
    current_goal: string | null;
    emotional_tone: string | null;
    active_npcs: string | null;
  } | undefined;

  if (!result) {
    return { location: null, goal: null, tone: null, activeNpcs: [] };
  }

  return {
    location: result.active_location_id,
    goal: result.current_goal,
    tone: result.emotional_tone,
    activeNpcs: result.active_npcs
      ? result.active_npcs.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [],
  };
}

/**
 * Fetch lore entries relevant to a session's universe
 * Lore data comes from locations and NPCs with descriptions
 * Uses vector search when sqlite-vec is available
 */
export async function getLoreContext(universeId: string, query?: string): Promise<LoreContext> {
  const db = getDb();

  // If vector search is available and we have a query, use it
  if (isVecAvailable() && query) {
    try {
      const queryVector = await generateEmbedding(query);

      // Search for relevant lore
      const loreResults = vectorSearch("location", queryVector, universeId, 5);
      const npcResults = vectorSearch("npc", queryVector, universeId, 5);

      // Get full lore entries for matched entities
      const matchedLocationIds = loreResults.map((r) => r.entityId);
      const matchedNpcIds = npcResults.map((r) => r.entityId);

      const locations = matchedLocationIds.length > 0
        ? db.prepare(
            `SELECT id, name, known_info as description, 'location' as type
             FROM locations
             WHERE id IN (${matchedLocationIds.map(() => "?").join(",")})
          `).all(...matchedLocationIds) as { id: number; name: string; description: string; type: string }[]
        : [];

      const npcs = matchedNpcIds.length > 0
        ? db.prepare(
            `SELECT id, name, tags as description, 'npc' as type
             FROM npcs
             WHERE id IN (${matchedNpcIds.map(() => "?").join(",")})
          `).all(...matchedNpcIds) as { id: number; name: string; description: string; type: string }[]
        : [];

      const allEntries = [
        ...(locations || []).map((l: any) => ({
          id: l.id,
          name: l.name,
          description: typeof l.description === 'string' ? l.description : (l.description ? JSON.stringify(l.description) : ''),
          type: l.type,
        })),
        ...(npcs || []).map((n: any) => ({
          id: n.id,
          name: n.name,
          description: typeof n.description === 'string' ? n.description : (n.description ? JSON.stringify(n.description) : ''),
          type: n.type,
        })),
      ];

      if (allEntries.length > 0) {
        return { entries: allEntries };
      }
    } catch {
      // Fall back to keyword-based retrieval
    }
  }

  // Fallback: keyword-based retrieval
  const locations = db.prepare(
    `SELECT id, name, known_info as description, 'location' as type
     FROM locations
     WHERE universe_id = ?
     ORDER BY name`
  ).all(universeId) as { id: number; name: string; description: string; type: string }[];

  const npcs = db.prepare(
    `SELECT id, name, tags as description, 'npc' as type
     FROM npcs
     WHERE universe_id = ?
     ORDER BY name`
  ).all(universeId) as { id: number; name: string; description: string; type: string }[];

  const allEntries = [
    ...(locations || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      description: typeof l.description === 'string' ? l.description : (l.description ? JSON.stringify(l.description) : ''),
      type: l.type,
    })),
    ...(npcs || []).map((n: any) => ({
      id: n.id,
      name: n.name,
      description: typeof n.description === 'string' ? n.description : (n.description ? JSON.stringify(n.description) : ''),
      type: n.type,
    })),
  ];

  return { entries: allEntries };
}

/**
 * Fetch NPC relationships for characters in the current universe
 */
export function getRelationshipContext(universeId: string): RelationshipContext {
  try {
    const db = getDb();
    // relationships table: source_entity, target_entity, emotional_state
    const relationships = db.prepare(
      `SELECT r.source_entity, r.target_entity, r.emotional_state
       FROM relationships r
       WHERE r.universe_id = ?
       ORDER BY r.updated_at DESC`
    ).all(universeId) as { source_entity: string; target_entity: string; emotional_state: string | null }[];

    return {
      relationships: (relationships || []).map((r) => ({
        source: r.source_entity,
        target: r.target_entity,
        state: r.emotional_state,
      })),
    };
  } catch {
    return { relationships: [] };
  }
}

/**
 * Fetch the most recent N messages for a session
 */
export function getRecentMessages(
  sessionId: string,
  limit: number = 30
): MessageContext {
  const db = getDb();
  const messages = db.prepare(
    `SELECT sender_id as senderId, content, timestamp
     FROM messages
     WHERE session_id = ? AND is_deleted = 0
     ORDER BY timestamp ASC
     LIMIT ?`
  ).all(sessionId, limit) as { senderId: string | null; content: string; timestamp: string }[];

  return { messages: messages || [] };
}

/**
 * Fetch canon context for a universe
 */
export function getCanonContext(universeId: string): string | null {
  const db = getDb();
  const universe = db.prepare(
    `SELECT name, boundaries, canon_mode FROM universes WHERE id = ?`
  ).get(universeId) as { name: string; boundaries: string | null; canon_mode: string | null } | undefined;

  if (!universe) return null;

  let boundariesText = "";
  if (universe.boundaries) {
    try {
      const parsed = JSON.parse(universe.boundaries);
      boundariesText = Array.isArray(parsed) ? parsed.join(", ") : universe.boundaries;
    } catch {
      boundariesText = universe.boundaries;
    }
  }

  const context = boundariesText || universe.name;
  if (!context) return null;

  const modeLabel =
    universe.canon_mode === "strict"
      ? "STRICT CANON"
      : universe.canon_mode === "loose"
        ? "LOOSE CANON"
        : "CUSTOM CANON";

  return `[CANON: ${modeLabel}]\n${context}`;
}

// ---------------------------------------------------------------------------
// Main retrieval pipeline
// ---------------------------------------------------------------------------

/**
 * Retrieve all context for a session to assemble into a prompt.
 * This is the main entry point for the retrieval pipeline.
 */
export async function getRetrievedContext(
  sessionId: string,
  universeId: string,
  userMessage?: string
): Promise<RetrievedContext> {
  const scene = getSceneContext(sessionId);
  const lore = await getLoreContext(universeId, userMessage);
  const relationships = getRelationshipContext(universeId);
  const recentMessages = getRecentMessages(sessionId);
  const canonContext = getCanonContext(universeId);

  const intent = userMessage ? classifyIntent(userMessage) : "social";

  return {
    scene,
    lore,
    relationships,
    recentMessages,
    canonContext,
    intent,
  };
}

/**
 * Retrieve context with semantic intent fallback for ambiguous inputs.
 * D4: Uses embeddings to find similar past interactions when keyword
 * classification is uncertain.
 */
export async function getRetrievedContextWithFallback(
  sessionId: string,
  universeId: string,
  userId: string,
  userMessage?: string
): Promise<RetrievedContext> {
  const scene = getSceneContext(sessionId);
  const lore = await getLoreContext(universeId, userMessage);
  const relationships = getRelationshipContext(universeId);
  const recentMessages = getRecentMessages(sessionId);
  const canonContext = getCanonContext(universeId);

  let intent: Intent = "social";
  if (userMessage) {
    try {
      const result = await classifyIntentWithFallback(userId, userMessage);
      intent = result.intent;
    } catch {
      // Fallback to fast keyword classifier
      intent = classifyIntent(userMessage);
    }
  }

  return {
    scene,
    lore,
    relationships,
    recentMessages,
    canonContext,
    intent,
  };
}
