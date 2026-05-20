/**
 * Semantic Intent Fallback
 *
 * When the primary intent classifier is uncertain, this module uses semantic
 * embeddings to find similar past interactions and infer intent from context.
 *
 * Fallback triggers:
 * - Intent confidence below threshold
 * - Unknown intent classification
 * - Ambiguous multi-intent scenarios
 */

import { getDb } from "@/lib/db";
import { generateEmbedding } from "@/lib/ollama";
import { classifyIntent, type Intent, INTENT_PROTOTYPES } from "@/lib/intent-analyzer";
import { safeParseWarn } from "@/lib/safe-json";

export interface SemanticIntentResult {
  intent: Intent;
  confidence: number;
  source: "classifier" | "semantic" | "fallback";
  similarContexts: { content: string; similarity: number }[];
}

const CONFIDENCE_THRESHOLD = 0.6;
const MAX_SIMILAR_RESULTS = 5;

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Get or create embedding for a text string
 */
async function getOrCreateEmbedding(
  userId: string,
  entityType: string,
  entityId: string,
  textContent: string
): Promise<number[]> {
  const db = getDb();

  // Check if embedding exists
  const existing = db.prepare(
    "SELECT e.vector_data FROM embedding_index i JOIN embedding_vectors e ON i.id = e.embedding_id WHERE i.user_id = ? AND i.entity_type = ? AND i.entity_id = ?"
  ).get(userId, entityType, entityId) as { vector_data: string } | undefined;

  if (existing) {
    return safeParseWarn<number[]>(existing.vector_data, "embedding vector_data", []) ?? [];
  }

  // Generate new embedding
  const vector = await generateEmbedding(textContent, { userId });

  // Store embedding
  const embeddingId = crypto.randomUUID();
  db.prepare(
    "INSERT INTO embedding_index (id, user_id, entity_type, entity_id, text_content) VALUES (?, ?, ?, ?, ?)"
  ).run(embeddingId, userId, entityType, entityId, textContent);

  db.prepare(
    "INSERT INTO embedding_vectors (embedding_id, vector_data) VALUES (?, ?)"
  ).run(embeddingId, JSON.stringify(vector));

  return vector;
}

/**
 * Find semantically similar contexts for a given message
 */
async function findSimilarContexts(
  userId: string,
  message: string,
  limit: number = MAX_SIMILAR_RESULTS
): Promise<{ content: string; similarity: number; intent?: string }[]> {
  const db = getDb();

  // Generate embedding for the query message
  const queryVector = await generateEmbedding(message, { userId });

  // Get all embeddings for this user
  const embeddings = db.prepare(
    "SELECT i.id, i.text_content, e.vector_data FROM embedding_index i JOIN embedding_vectors e ON i.id = e.embedding_id WHERE i.user_id = ? AND i.text_content IS NOT NULL"
  ).all(userId) as { id: string; text_content: string; vector_data: string }[];

  // Compute similarities
  const similarities = embeddings
    .map((e) => {
      const vector = safeParseWarn<number[]>(e.vector_data, "embedding vector_data", []) ?? [];
      const sim = cosineSimilarity(queryVector, vector);
      return { content: e.text_content, similarity: sim };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return similarities;
}

/**
 * Infer intent from similar contexts
 */
function inferIntentFromContexts(
  contexts: { content: string; similarity: number }[],
  originalIntent: Intent
): { intent: Intent; confidence: number } {
  if (contexts.length === 0) {
    return { intent: originalIntent, confidence: 0.3 };
  }

  // Weight intents by similarity score
  const intentScores: Record<Intent, number> = {
    exploration: 0,
    combat: 0,
    social: 0,
    investigation: 0,
    rest: 0,
    travel: 0,
    ritual: 0,
  };
  let totalWeight = 0;

  for (const ctx of contexts) {
    // Simple heuristic: look for intent keywords in similar content
    const content = ctx.content.toLowerCase();
    const weights: Partial<Record<Intent, number>> = {
      combat: content.includes("attack") || content.includes("fight") || content.includes("battle") ? ctx.similarity : 0,
      social: content.includes("talk") || content.includes("ask") || content.includes("greet") ? ctx.similarity : 0,
      exploration: content.includes("look") || content.includes("search") || content.includes("examine") ? ctx.similarity : 0,
      travel: content.includes("move") || content.includes("go") || content.includes("run") ? ctx.similarity : 0,
    };

    for (const [intent, weight] of Object.entries(weights)) {
      intentScores[intent as Intent] = (intentScores[intent as Intent] || 0) + weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) {
    return { intent: originalIntent, confidence: 0.3 };
  }

  // Normalize and find best intent
  let bestIntent = originalIntent;
  let bestScore = 0;

  for (const [intent, score] of Object.entries(intentScores)) {
    const normalized = score / totalWeight;
    if (normalized > bestScore) {
      bestScore = normalized;
      bestIntent = intent as Intent;
    }
  }

  return { intent: bestIntent, confidence: Math.min(bestScore, 0.8) };
}

/**
 * Main entry point: classify intent with semantic fallback
 */
export async function classifyIntentWithFallback(
  userId: string,
  message: string
): Promise<SemanticIntentResult> {
  // Try primary classifier first
  const primaryIntent = classifyIntent(message);

  // If message has strong keyword matches, return immediately
  // (classifyIntent returns "social" as default for weak matches)
  const hasStrongMatch = Object.entries(INTENT_PROTOTYPES).some(([intent, prototype]) => {
    if (intent === primaryIntent) return false;
    const keywords = prototype.split(", ");
    return keywords.some(kw => message.toLowerCase().includes(kw.toLowerCase()));
  });

  if (!hasStrongMatch && primaryIntent !== "social") {
    return {
      intent: primaryIntent,
      confidence: 0.8,
      source: "classifier",
      similarContexts: [],
    };
  }

  // Fallback to semantic search for ambiguous cases
  try {
    const similarContexts = await findSimilarContexts(userId, message);
    const inferred = inferIntentFromContexts(similarContexts, primaryIntent);

    return {
      intent: inferred.intent,
      confidence: inferred.confidence,
      source: "semantic",
      similarContexts,
    };
  } catch {
    // Final fallback: default to social intent
    return {
      intent: "social",
      confidence: 0.2,
      source: "fallback",
      similarContexts: [],
    };
  }
}

/**
 * Index a message for future semantic search
 */
export async function indexMessageForSearch(
  userId: string,
  messageId: string,
  content: string
): Promise<void> {
  try {
    await getOrCreateEmbedding(userId, "message", messageId, content);
  } catch {
    // Silently fail - indexing is non-critical
  }
}
