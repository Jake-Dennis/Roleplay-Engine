/**
 * Vector Search with sqlite-vec
 * 
 * Provides semantic search across all entity types using vector embeddings.
 * Uses sqlite-vec for efficient similarity search in SQLite.
 * 
 * Search targets:
 * - messages: Semantic message retrieval
 * - locations: Location-based context matching
 * - npcs: NPC relevance scoring
 * - events: Event similarity and pattern matching
 * - narrative_memories: Memory retrieval
 */

import { getDb } from "@/lib/db";
import { generateEmbedding } from "@/lib/ollama";

export interface SearchResult {
  id: string;
  entityType: string;
  entityId: string;
  score: number;
  textContent: string | null;
  createdAt: string;
}

/**
 * Search for entities similar to a query text using vector embeddings
 */
export async function vectorSearch(
  userId: string,
  query: string,
  options?: {
    limit?: number;
    entityType?: string;
    minScore?: number;
  }
): Promise<SearchResult[]> {
  const { limit = 10, entityType, minScore = 0.5 } = options || {};

  // Generate embedding for the query
  const queryVector = await generateEmbedding(query);

  const db = getDb();

  // Get all embeddings for this user
  let query_sql = `
    SELECT 
      ei.id,
      ei.entity_type,
      ei.entity_id,
      ei.text_content,
      ei.created_at,
      vec_cosine_distance(ev.vector_data, ?) as distance
    FROM embedding_index ei
    JOIN embedding_vectors ev ON ei.id = ev.embedding_id
    WHERE ei.user_id = ?
  `;

  const params: (string | number)[] = [JSON.stringify(queryVector), userId];

  if (entityType) {
    query_sql += " AND ei.entity_type = ?";
    params.push(entityType);
  }

  query_sql += `
    ORDER BY distance ASC
    LIMIT ?
  `;
  params.push(limit);

  const results = db.prepare(query_sql).all(...params) as {
    id: string;
    entity_type: string;
    entity_id: string;
    text_content: string | null;
    created_at: string;
    distance: number;
  }[];

  // Convert distance to similarity score (1 - distance)
  return results
    .map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      score: 1 - r.distance,
      textContent: r.text_content,
      createdAt: r.created_at,
    }))
    .filter((r) => r.score >= minScore);
}

/**
 * Search for similar messages in a session
 */
export async function searchSimilarMessages(
  sessionId: string,
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  const db = getDb();

  // Get session owner
  const session = db.prepare(
    "SELECT owner_id FROM sessions WHERE id = ?"
  ).get(sessionId) as { owner_id: string } | undefined;

  if (!session) return [];

  return vectorSearch(session.owner_id, query, {
    limit,
    entityType: "message",
    minScore: 0.3,
  });
}

/**
 * Search for similar locations
 */
export async function searchSimilarLocations(
  userId: string,
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  return vectorSearch(userId, query, {
    limit,
    entityType: "location",
    minScore: 0.3,
  });
}

/**
 * Search for similar NPCs
 */
export async function searchSimilarNPCs(
  userId: string,
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  return vectorSearch(userId, query, {
    limit,
    entityType: "npc",
    minScore: 0.3,
  });
}

/**
 * Search for similar narrative memories
 */
export async function searchSimilarMemories(
  userId: string,
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  return vectorSearch(userId, query, {
    limit,
    entityType: "narrative_memory",
    minScore: 0.3,
  });
}

/**
 * Get search statistics for a user
 */
export function getSearchStats(userId: string): {
  totalEmbeddings: number;
  byEntityType: Record<string, number>;
} {
  const db = getDb();

  const total = db.prepare(
    "SELECT COUNT(*) as count FROM embedding_index WHERE user_id = ?"
  ).get(userId) as { count: number } | undefined;

  const byType = db.prepare(
    "SELECT entity_type, COUNT(*) as count FROM embedding_index WHERE user_id = ? GROUP BY entity_type"
  ).all(userId) as { entity_type: string; count: number }[];

  const byEntityType: Record<string, number> = {};
  for (const row of byType) {
    byEntityType[row.entity_type] = row.count;
  }

  return {
    totalEmbeddings: total?.count || 0,
    byEntityType,
  };
}
