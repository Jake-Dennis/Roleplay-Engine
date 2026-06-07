/**
 * Message Summarization
 * 
 * Compresses old messages into concise summaries to reduce context window usage.
 * Summaries are stored in message_summaries table and used during context retrieval
 * instead of raw message content for older messages.
 * 
 * Summarization triggers:
 * - When a session has > 20 messages
 * - Messages older than the most recent 15 are candidates
 * - Summaries include emotional tone, relationship effects, and extracted lore
 */

import { getDb } from "@/lib/db";
import { generateText, getActiveJobModel } from "@/lib/ollama";
import { safeParseWarn } from "@/lib/safe-json";

export interface SummarizationResult {
  summarizedCount: number;
  summaryIds: string[];
}

/**
 * Summarize old messages in a session that haven't been summarized yet.
 * Groups messages into batches of 5 and creates a summary for each batch.
 */
export async function processSummarization(sessionId: string): Promise<SummarizationResult> {
  const db = getDb();

  // Resolve the userId for this session so we can route the LLM call to
  // the user's jobs model (which may differ from their chat model).
  const session = db.prepare(
    "SELECT owner_id FROM sessions WHERE id = ?"
  ).get(sessionId) as { owner_id: string } | undefined;
  if (!session) {
    return { summarizedCount: 0, summaryIds: [] };
  }
  const userId = session.owner_id;

  // Get messages that haven't been summarized yet, excluding the most recent 15
  const unsummarized = db.prepare(`
    SELECT m.id, m.content, m.sender_id, m.timestamp
    FROM messages m
    WHERE m.session_id = ? 
      AND m.is_deleted = 0
      AND m.id NOT IN (SELECT source_message_id FROM message_summaries)
    ORDER BY m.timestamp ASC
  `).all(sessionId) as { id: string; content: string; sender_id: string | null; timestamp: string }[];

  // Keep the most recent 15 messages unsummarized
  const recentCount = 15;
  const candidates = unsummarized.slice(0, Math.max(0, unsummarized.length - recentCount));

  if (candidates.length === 0) {
    return { summarizedCount: 0, summaryIds: [] };
  }

  // Process in batches of 5
  const batchSize = 5;
  const summaryIds: string[] = [];
  let summarizedCount = 0;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    if (batch.length === 0) continue;

    const summary = await summarizeBatch(batch, userId);
    if (!summary) continue;

    // Store summary for the last message in the batch
    const summaryId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO message_summaries (id, source_message_id, summary, emotional_tone, relationship_effects, lore_extracted)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      summaryId,
      batch[batch.length - 1].id,
      summary.text,
      summary.emotionalTone,
      JSON.stringify(summary.relationshipEffects),
      JSON.stringify(summary.loreExtracted)
    );

    summaryIds.push(summaryId);
    summarizedCount += batch.length;
  }

  return { summarizedCount, summaryIds };
}

/**
 * Summarize a batch of messages using Ollama
 */
async function summarizeBatch(
  messages: { id: string; content: string; sender_id: string | null; timestamp: string }[],
  userId: string
): Promise<{
  text: string;
  emotionalTone: string;
  relationshipEffects: string[];
  loreExtracted: string[];
} | null> {
  const messageText = messages
    .map((m) => `${m.sender_id === null ? "Narrator" : "Player"}: ${m.content}`)
    .join("\n");

  const prompt = `Summarize the following narrative exchange concisely. Then identify the emotional tone, any relationship changes, and any new lore/world-building details.

Format your response as JSON:
{
  "summary": "2-3 sentence summary of what happened",
  "emotionalTone": "one word describing the overall mood",
  "relationshipEffects": ["list of relationship changes or developments"],
  "loreExtracted": ["list of new world-building facts or lore revealed"]
}

Messages:
${messageText}`;

  try {
    const response = await generateText(prompt, {
      temperature: 0.3,
      num_predict: 1024,
      userId,
      model: getActiveJobModel(userId),
    });

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = safeParseWarn<{ summary?: string; emotionalTone?: string; relationshipEffects?: unknown[]; loreExtracted?: unknown[] }>(jsonMatch[0], "LLM batch summary response");
    if (!parsed) return null;
    return {
      text: parsed.summary || "",
      emotionalTone: parsed.emotionalTone || "neutral",
      relationshipEffects: Array.isArray(parsed.relationshipEffects) ? parsed.relationshipEffects as string[] : [],
      loreExtracted: Array.isArray(parsed.loreExtracted) ? parsed.loreExtracted as string[] : [],
    };
  } catch {
    return null;
  }
}

/**
 * Get summaries for a session to use in context retrieval
 */
export function getSessionSummaries(sessionId: string): {
  summaries: { id: string; summary: string; emotional_tone: string | null; created_at: string }[];
} {
  const db = getDb();
  const summaries = db.prepare(`
    SELECT id, summary, emotional_tone, created_at
    FROM message_summaries
    WHERE source_message_id IN (SELECT id FROM messages WHERE session_id = ?)
    ORDER BY created_at ASC
  `).all(sessionId) as { id: string; summary: string; emotional_tone: string | null; created_at: string }[];

  return { summaries };
}

/**
 * Check if a session needs summarization
 */
export function needsSummarization(sessionId: string): boolean {
  const db = getDb();

  const totalMessages = db.prepare(
    "SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND is_deleted = 0"
  ).get(sessionId) as { count: number } | undefined;

  const summarizedMessages = db.prepare(`
    SELECT COUNT(*) as count FROM message_summaries
    WHERE source_message_id IN (SELECT id FROM messages WHERE session_id = ?)
  `).get(sessionId) as { count: number } | undefined;

  const unsummarized = (totalMessages?.count || 0) - (summarizedMessages?.count || 0);
  return unsummarized > 15;
}

/**
 * Get session IDs that need summarization for a user
 */
export function getSessionsNeedingSummaries(userId: string): string[] {
  const db = getDb();

  const sessions = db.prepare(
    "SELECT id FROM sessions WHERE owner_id = ? AND status = 'active'"
  ).all(userId) as { id: string }[];

  return sessions
    .filter((s) => needsSummarization(s.id))
    .map((s) => s.id);
}
