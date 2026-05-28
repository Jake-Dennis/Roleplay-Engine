/**
 * Vector Search
 * 
 * Provides semantic search across all entity types using vector embeddings.
 * Computes cosine similarity in JavaScript for reliable results regardless
 * of sqlite-vec extension availability.
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
 * Compute cosine similarity between two vectors.
 * Returns a value in [0, 1] where 1 = identical, 0 = orthogonal or opposite.
 * Handles edge cases: NaN/Infinity → 0, zero-length/empty → 0, mismatched dims → 0.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];

    // Guard against NaN or Infinity in vector components
    if (!isFinite(ai) || !isFinite(bi)) return 0;

    dotProduct += ai * bi;
    magnitudeA += ai * ai;
    magnitudeB += bi * bi;
  }

  const magProduct = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);

  // Avoid division by zero (zero-vector)
  if (magProduct === 0) return 0;

  const cos = dotProduct / magProduct;

  // Clamp to [0, 1] — cosine can be negative for opposite vectors
  return Math.max(0, Math.min(1, cos));
}

/**
 * Search for entities similar to a query text using vector embeddings.
 * Uses in-memory JS cosine similarity instead of sqlite-vec's vec_cosine_distance
 * because vector_data is stored as JSON text (not packed float32 BLOBs).
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
  if (!queryVector || queryVector.length === 0) {
    return [];
  }

  const db = getDb();

  // Fetch all embeddings with vector data for this user
  let querySql = `
    SELECT 
      ei.id,
      ei.entity_type,
      ei.entity_id,
      ei.text_content,
      ei.created_at,
      ev.vector_data
    FROM embedding_index ei
    JOIN embedding_vectors ev ON ei.id = ev.embedding_id
    WHERE ei.user_id = ?
  `;

  const params: (string | number)[] = [userId];

  if (entityType) {
    querySql += " AND ei.entity_type = ?";
    params.push(entityType);
  }

  const rows = db.prepare(querySql).all(...params) as {
    id: string;
    entity_type: string;
    entity_id: string;
    text_content: string | null;
    created_at: string;
    vector_data: string;
  }[];

  if (rows.length === 0) {
    return [];
  }

  // Compute cosine similarity in JS for each stored vector
  const scored: { row: (typeof rows)[0]; similarity: number }[] = [];

  for (const row of rows) {
    try {
      const storedVector = JSON.parse(row.vector_data) as number[];
      if (!Array.isArray(storedVector) || storedVector.length === 0) continue;
      const similarity = cosineSimilarity(queryVector, storedVector);
      scored.push({ row, similarity });
    } catch {
      // Skip rows with invalid vector data
      continue;
    }
  }

  // Sort by similarity descending, filter by minScore, apply limit
  return scored
    .filter((r) => r.similarity >= minScore)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((r) => ({
      id: r.row.id,
      entityType: r.row.entity_type,
      entityId: r.row.entity_id,
      score: r.similarity,
      textContent: r.row.text_content,
      createdAt: r.row.created_at,
    }));
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
