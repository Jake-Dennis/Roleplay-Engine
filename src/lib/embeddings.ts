/**
 * Embedding Generation
 * 
 * Creates vector embeddings for entities (messages, locations, NPCs, events)
 * using Ollama's bge-m3 model. Embeddings enable semantic search and similarity
 * matching for context retrieval.
 * 
 * Embedding targets:
 * - messages: For semantic message retrieval
 * - locations: For location-based context matching
 * - npcs: For NPC relevance scoring
 * - events: For event similarity and pattern matching
 * - narrative_memories: For memory retrieval
 */

import { getDb } from "@/lib/db";
import { generateEmbedding } from "@/lib/ollama";
import { safeParseWarn } from "@/lib/safe-json";
import type { DbDatabase } from '@/lib/types';

export interface EmbeddingResult {
  embeddingId: string;
  vector: number[];
}

export async function processEmbeddings(
  userId: string,
  entityType: string,
  entityId: string,
  textContent?: string
): Promise<EmbeddingResult> {
  const db = getDb();
  // Use provided content if available (avoids DB race where the entity write
  // hasn't propagated to this connection yet), otherwise fall back to lookup.
  const content = textContent ?? getEntityText(entityType, entityId);

  if (!content) {
    throw new Error(`No text content found for ${entityType}:${entityId}`);
  }

  // Generate embedding via Ollama
  const vector = await generateEmbedding(content);

  // Look up universe_id for this entity (separate queries avoid parameter-count bugs in CASE WHEN subquery)
  let universeId: string | null = null;
  switch (entityType) {
    case "message": {
      const row = db.prepare(
        "SELECT s.universe_id FROM messages m JOIN sessions s ON s.id = m.session_id WHERE m.id = ?"
      ).get(entityId) as { universe_id: string | null } | undefined;
      universeId = row?.universe_id ?? null;
      break;
    }
    case "location": {
      const row = db.prepare(
        "SELECT universe_id FROM locations WHERE id = ?"
      ).get(entityId) as { universe_id: string | null } | undefined;
      universeId = row?.universe_id ?? null;
      break;
    }
    case "npc": {
      const row = db.prepare(
        "SELECT universe_id FROM npcs WHERE id = ?"
      ).get(entityId) as { universe_id: string | null } | undefined;
      universeId = row?.universe_id ?? null;
      break;
    }
    case "event": {
      const row = db.prepare(
        "SELECT universe_id FROM events WHERE id = ?"
      ).get(entityId) as { universe_id: string | null } | undefined;
      universeId = row?.universe_id ?? null;
      break;
    }
    case "narrative_memory": {
      const row = db.prepare(
        "SELECT universe_id FROM narrative_memories WHERE id = ?"
      ).get(entityId) as { universe_id: string | null } | undefined;
      universeId = row?.universe_id ?? null;
      break;
    }
  }

  // Store in embedding_index
  const embeddingId = crypto.randomUUID();
  db.prepare(`
    INSERT OR REPLACE INTO embedding_index (id, user_id, universe_id, entity_type, entity_id, text_content, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(embeddingId, userId, universeId, entityType, entityId, content);

  // Store vector in a separate table (embedding vectors are too large for TEXT column)
  ensureVectorTable(db);
  db.prepare(`
    INSERT OR REPLACE INTO embedding_vectors (embedding_id, vector_data)
    VALUES (?, ?)
  `).run(embeddingId, JSON.stringify(vector));

  return { embeddingId, vector };
}

/**
 * Extract text content from an entity for embedding
 */
function getEntityText(entityType: string, entityId: string): string | null {
  const db = getDb();

  switch (entityType) {
    case "message": {
      const msg = db.prepare(
        "SELECT content FROM messages WHERE id = ? AND is_deleted = 0"
      ).get(entityId) as { content: string } | undefined;
      return msg?.content || null;
    }
    case "location": {
      const loc = db.prepare(
        "SELECT name, known_info, hidden_info FROM locations WHERE id = ?"
      ).get(entityId) as { name: string; known_info: string | null; hidden_info: string | null } | undefined;
      if (!loc) return null;
      return `${loc.name} ${loc.known_info || ""} ${loc.hidden_info || ""}`;
    }
    case "npc": {
      const npc = db.prepare(
        "SELECT name, tags FROM npcs WHERE id = ?"
      ).get(entityId) as { name: string; tags: string | null } | undefined;
      if (!npc) return null;
      return `${npc.name} ${npc.tags || ""}`;
    }
    case "event": {
      const evt = db.prepare(
        "SELECT title, outcome, consequences FROM events WHERE id = ?"
      ).get(entityId) as { title: string; outcome: string | null; consequences: string | null } | undefined;
      if (!evt) return null;
      return `${evt.title} ${evt.outcome || ""} ${evt.consequences || ""}`;
    }
    case "narrative_memory": {
      const mem = db.prepare(
        "SELECT content, type FROM narrative_memories WHERE id = ?"
      ).get(entityId) as { content: string; type: string } | undefined;
      if (!mem) return null;
      return `${mem.type}: ${mem.content}`;
    }
    default:
      return null;
  }
}

/**
 * Ensure the embedding_vectors table exists
 */
function ensureVectorTable(db: DbDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS embedding_vectors (
      embedding_id TEXT PRIMARY KEY REFERENCES embedding_index(id),
      vector_data TEXT NOT NULL
    )
  `);
}

/**
 * Get embedding vector for an entity
 */
export function getEmbedding(entityType: string, entityId: string): number[] | null {
  const db = getDb();

  const result = db.prepare(`
    SELECT ev.vector_data
    FROM embedding_index ei
    JOIN embedding_vectors ev ON ei.id = ev.embedding_id
    WHERE ei.entity_type = ? AND ei.entity_id = ?
  `).get(entityType, entityId) as { vector_data: string } | undefined;

  if (!result) return null;

  return safeParseWarn<number[]>(result.vector_data, "embedding vector");
}

/**
 * Check if an entity has an embedding
 */
export function hasEmbedding(entityType: string, entityId: string): boolean {
  const db = getDb();
  const result = db.prepare(
    "SELECT COUNT(*) as count FROM embedding_index WHERE entity_type = ? AND entity_id = ?"
  ).get(entityType, entityId) as { count: number } | undefined;
  return (result?.count || 0) > 0;
}

/**
 * Get entities that need embeddings for a user
 */
export function getEntitiesNeedingEmbeddings(userId: string, entityType?: string): { entityType: string; entityId: string }[] {
  const db = getDb();

  // Find entities without embeddings
  const missing = db.prepare(`
    SELECT 'message' as entity_type, m.id as entity_id
    FROM messages m
    WHERE m.session_id IN (SELECT id FROM sessions WHERE owner_id = ?)
      AND m.is_deleted = 0
      AND m.id NOT IN (SELECT entity_id FROM embedding_index WHERE entity_type = 'message')
    ${entityType ? "AND 'message' = ?" : ""}

    UNION ALL

    SELECT 'location' as entity_type, l.id as entity_id
    FROM locations l
    WHERE l.user_id = ?
      AND l.id NOT IN (SELECT entity_id FROM embedding_index WHERE entity_type = 'location')
    ${entityType ? "AND 'location' = ?" : ""}

    UNION ALL

    SELECT 'npc' as entity_type, n.id as entity_id
    FROM npcs n
    WHERE n.user_id = ?
      AND n.id NOT IN (SELECT entity_id FROM embedding_index WHERE entity_type = 'npc')
    ${entityType ? "AND 'npc' = ?" : ""}

    LIMIT 90
  `).all(userId, ...(entityType ? [entityType] : []), userId, ...(entityType ? [entityType] : []), userId, ...(entityType ? [entityType] : [])) as { entity_type: string; entity_id: string }[];

  return missing.map((m) => ({ entityType: m.entity_type, entityId: m.entity_id }));
}

/**
 * Delete embedding for an entity
 */
export function deleteEmbedding(entityType: string, entityId: string): void {
  const db = getDb();
  db.prepare(`
    DELETE FROM embedding_vectors WHERE embedding_id IN (
      SELECT id FROM embedding_index WHERE entity_type = ? AND entity_id = ?
    )
  `).run(entityType, entityId);
  db.prepare(
    "DELETE FROM embedding_index WHERE entity_type = ? AND entity_id = ?"
  ).run(entityType, entityId);
}


