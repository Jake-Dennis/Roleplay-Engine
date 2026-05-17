/**
 * Context Compression
 * 
 * Compresses context for AI prompts by intelligently summarizing and truncating
 * different context sections based on relevance and token budget.
 * 
 * Compression strategies:
 * - Messages: Keep most recent, summarize older ones
 * - Lore: Keep highest importance, truncate by relevance
 * - Relationships: Keep active relationships, summarize inactive
 * - Scene state: Always keep full (high signal-to-noise)
 * - Intent: Always keep full (guides retrieval)
 */

import { getDb } from "@/lib/db";
import { generateText } from "@/lib/ollama";
import { getSessionSummaries } from "@/lib/summarization";

export interface CompressedContext {
  systemPrompt: string;
  sceneState: string | null;
  intent: string | null;
  messages: string;
  lore: string | null;
  relationships: string | null;
  estimatedTokens: number;
}

/**
 * Compress context to fit within a token budget
 */
export async function compressContext(
  sessionId: string,
  options?: {
    maxTokens?: number;
    userMessage?: string;
  }
): Promise<CompressedContext> {
  const { maxTokens = 6000, userMessage } = options || {};

  const db = getDb();

  // Get scene state (always keep full)
  const sceneState = getSceneState(sessionId);

  // Get intent (always keep full)
  const intent = userMessage ? classifyIntent(userMessage) : null;

  // Get and compress messages
  const messages = await compressMessages(sessionId, maxTokens * 0.6);

  // Get and compress lore
  const lore = await compressLore(sessionId, maxTokens * 0.25);

  // Get and compress relationships
  const relationships = await compressRelationships(sessionId, maxTokens * 0.1);

  // Build system prompt
  const systemPrompt = buildSystemPrompt(sceneState, intent);

  // Estimate total tokens
  const estimatedTokens = estimateTokens(
    systemPrompt + (messages || "") + (lore || "") + (relationships || "")
  );

  return {
    systemPrompt,
    sceneState,
    intent,
    messages,
    lore,
    relationships,
    estimatedTokens,
  };
}

/**
 * Get scene state as formatted string
 */
function getSceneState(sessionId: string): string | null {
  const db = getDb();

  const scene = db.prepare(`
    SELECT active_location_id, current_goal, emotional_tone, active_npcs, scene_summary
    FROM scene_states
    WHERE session_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(sessionId) as {
    active_location_id: string | null;
    current_goal: string | null;
    emotional_tone: string | null;
    active_npcs: string | null;
    scene_summary: string | null;
  } | undefined;

  if (!scene) return null;

  const parts: string[] = ["[SCENE]"];
  if (scene.active_location_id) parts.push(`Location: ${scene.active_location_id}`);
  if (scene.current_goal) parts.push(`Goal: ${scene.current_goal}`);
  if (scene.emotional_tone) parts.push(`Tone: ${scene.emotional_tone}`);
  if (scene.active_npcs) parts.push(`Present: ${scene.active_npcs}`);
  if (scene.scene_summary) parts.push(scene.scene_summary);

  return parts.join("\n");
}

/**
 * Classify user intent
 */
function classifyIntent(message: string): string {
  const lower = message.toLowerCase();

  if (/\b(attack|fight|defend|strike|battle|weapon|kill|hit)\b/.test(lower)) return "combat";
  if (/\b(explore|search|look|investigate|discover|examine)\b/.test(lower)) return "exploration";
  if (/\b(talk|ask|convince|persuade|greet|negotiate|say)\b/.test(lower)) return "social";
  if (/\b(clue|who|what happened|evidence|mystery|solve)\b/.test(lower)) return "investigation";
  if (/\b(rest|sleep|camp|wait|break)\b/.test(lower)) return "rest";
  if (/\b(go|travel|journey|move|head|walk)\b/.test(lower)) return "travel";
  if (/\b(spell|ritual|pray|magic|channel|cast)\b/.test(lower)) return "ritual";

  return "social";
}

/**
 * Build system prompt from scene state and intent
 */
function buildSystemPrompt(sceneState: string | null, intent: string | null): string {
  const parts: string[] = [
    "You are a narrative AI generating immersive roleplay responses.",
    "Respond in third-person past tense with rich descriptive prose.",
    "Stay consistent with established canon and character personalities.",
  ];

  if (sceneState) parts.push(sceneState);
  if (intent) parts.push(`[PLAYER INTENT: ${intent}]`);

  return parts.join("\n");
}

/**
 * Compress messages for context
 */
async function compressMessages(
  sessionId: string,
  tokenBudget: number
): Promise<string> {
  const db = getDb();

  // Get recent messages (last 15)
  const recentMessages = db.prepare(`
    SELECT sender_id, content, timestamp
    FROM messages
    WHERE session_id = ? AND is_deleted = 0
    ORDER BY timestamp DESC
    LIMIT 15
  `).all(sessionId) as {
    sender_id: string | null;
    content: string;
    timestamp: string;
  }[];

  // Get summaries for older messages
  const { summaries } = getSessionSummaries(sessionId);

  // Build message context
  const parts: string[] = ["[MESSAGES]"];

  // Add summaries first (older context)
  for (const summary of summaries.slice(-5)) {
    parts.push(`[Summary] ${summary.summary}`);
  }

  // Add recent messages (most recent last)
  for (const msg of recentMessages.reverse()) {
    const speaker = msg.sender_id === null ? "Narrator" : "Player";
    parts.push(`${speaker}: ${msg.content}`);
  }

  const text = parts.join("\n");

  // Truncate if over budget
  if (estimateTokens(text) > tokenBudget) {
    // Keep only the most recent messages
    const truncated = recentMessages.slice(-8);
    const truncatedParts = ["[MESSAGES]"];
    for (const msg of truncated) {
      const speaker = msg.sender_id === null ? "Narrator" : "Player";
      truncatedParts.push(`${speaker}: ${msg.content}`);
    }
    return truncatedParts.join("\n");
  }

  return text;
}

/**
 * Compress lore for context
 */
async function compressLore(
  sessionId: string,
  tokenBudget: number
): Promise<string | null> {
  const db = getDb();

  // Get session's universe
  const session = db.prepare(
    "SELECT universe_id FROM sessions WHERE id = ?"
  ).get(sessionId) as { universe_id: string | null } | undefined;

  if (!session?.universe_id) return null;

  // Get locations for this universe's user
  const locations = db.prepare(`
    SELECT name, known_info, importance
    FROM locations
    WHERE user_id = (SELECT user_id FROM universes WHERE id = ?)
    ORDER BY
      CASE importance
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END
    LIMIT 10
  `).all(session.universe_id) as {
    name: string;
    known_info: string | null;
    importance: string;
  }[];

  if (locations.length === 0) return null;

  const parts: string[] = ["[LORE]"];
  for (const loc of locations) {
    parts.push(`[${loc.importance.toUpperCase()}] ${loc.name}: ${loc.known_info || "No details"}`);
  }

  const text = parts.join("\n");

  // Truncate if over budget
  if (estimateTokens(text) > tokenBudget) {
    const truncated = locations.slice(0, 5);
    const truncatedParts = ["[LORE]"];
    for (const loc of truncated) {
      truncatedParts.push(`[${loc.importance.toUpperCase()}] ${loc.name}: ${loc.known_info || "No details"}`);
    }
    return truncatedParts.join("\n");
  }

  return text;
}

/**
 * Compress relationships for context
 */
async function compressRelationships(
  sessionId: string,
  tokenBudget: number
): Promise<string | null> {
  const db = getDb();

  // Get session's universe
  const session = db.prepare(
    "SELECT universe_id FROM sessions WHERE id = ?"
  ).get(sessionId) as { universe_id: string | null } | undefined;

  if (!session?.universe_id) return null;

  // Get relationships for this user
  const relationships = db.prepare(`
    SELECT source_entity, target_entity, emotional_state, relationship_stage
    FROM relationships
    WHERE user_id = (SELECT user_id FROM universes WHERE id = ?)
    ORDER BY updated_at DESC
    LIMIT 10
  `).all(session.universe_id) as {
    source_entity: string;
    target_entity: string;
    emotional_state: string | null;
    relationship_stage: string | null;
  }[];

  if (relationships.length === 0) return null;

  const parts: string[] = ["[RELATIONSHIPS]"];
  for (const rel of relationships) {
    const state = rel.emotional_state || "neutral";
    const stage = rel.relationship_stage || "acquaintances";
    parts.push(`${rel.source_entity} → ${rel.target_entity}: ${state} (${stage})`);
  }

  const text = parts.join("\n");

  // Truncate if over budget
  if (estimateTokens(text) > tokenBudget) {
    const truncated = relationships.slice(0, 5);
    const truncatedParts = ["[RELATIONSHIPS]"];
    for (const rel of truncated) {
      const state = rel.emotional_state || "neutral";
      const stage = rel.relationship_stage || "acquaintances";
      truncatedParts.push(`${rel.source_entity} → ${rel.target_entity}: ${state} (${stage})`);
    }
    return truncatedParts.join("\n");
  }

  return text;
}

/**
 * Estimate token count (chars / 4 for English text)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Summarize a block of text using AI
 */
export async function summarizeText(text: string, maxLength: number = 200): Promise<string> {
  const prompt = `Summarize the following text in ${maxLength} characters or less:

${text}`;

  try {
    const response = await generateText(prompt, { temperature: 0.2, num_ctx: 4096 });
    return response.trim().slice(0, maxLength);
  } catch {
    return text.slice(0, maxLength);
  }
}
