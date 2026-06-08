/**
 * @deprecated This file is not currently imported by any source module.
 * Kept for reference. Will be removed in a future cleanup pass once
 * all consumers are verified.
 * @reason Per-message summarization was intended to complement the batch
 * summarization system (summarization.ts) but was never integrated into
 * the generation pipeline. The message_summaries table and related
 * infrastructure exist but have no callers.
 */

/**
 * Per-Message Summarizer
 * 
 * Generates structured summaries immediately after each message is created.
 * Unlike batch summarization (summarization.ts) which compresses old messages,
 * this creates real-time semantic, emotional, relationship, and lore summaries
 * for individual messages.
 * 
 * Summary types stored in message_summaries table:
 * - semantic: What happened in plain language
 * - emotional: Emotional tone detected
 * - relationship_impact: How relationships changed
 * - lore_extracted: New facts/lore discovered
 */

import { getDb } from "@/lib/db";
import { generateText } from "@/lib/ollama";
import { safeParseWarn } from "@/lib/safe-json";

export interface MessageSummaryResult {
  summaryId: string;
  types: string[];
}

/**
 * Generate all 4 summary types for a single message.
 * Called immediately after a message is inserted.
 */
export async function summarizeMessage(messageId: string): Promise<MessageSummaryResult> {
  const db = getDb();

  // Fetch the message
  const message = db.prepare(`
    SELECT m.id, m.content, m.sender_id, m.session_id, s.universe_id
    FROM messages m
    JOIN sessions s ON s.id = m.session_id
    WHERE m.id = ?
  `).get(messageId) as {
    id: string;
    content: string;
    sender_id: string | null;
    session_id: string;
    universe_id: string | null;
  } | undefined;

  if (!message) {
    throw new Error(`Message ${messageId} not found`);
  }

  // Skip if already summarized
  const existing = db.prepare(
    "SELECT COUNT(*) as count FROM message_summaries WHERE message_id = ?"
  ).get(messageId) as { count: number } | undefined;

  if (existing && existing.count > 0) {
    return { summaryId: "", types: [] };
  }

  const senderLabel = message.sender_id === null ? "Narrator/AI" : "Player";

  const prompt = `Analyze the following message and return a JSON object with 4 summary types.

Message (${senderLabel}): ${message.content}

Return JSON in this exact format:
{
  "semantic": "1-2 sentence summary of what happened or was said",
  "emotional": "one word describing the emotional tone (e.g., tense, warm, hostile, neutral, joyful)",
  "relationship_impact": "brief description of how this affects relationships, or 'none' if no impact",
  "lore_extracted": ["list of any new facts, world-building details, or lore revealed"]
}

If no lore is extracted, return an empty array for lore_extracted.`;

  try {
    const response = await generateText(prompt, { temperature: 0.2 });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { summaryId: "", types: [] };
    }

    const parsed = safeParseWarn<Record<string, unknown>>(jsonMatch[0], "LLM message summary");
    if (!parsed) return { summaryId: "", types: [] };
    const summaryId = crypto.randomUUID();
    const types: string[] = [];

    // Store semantic summary
    if (parsed.semantic) {
      db.prepare(`
        INSERT INTO message_summaries (id, message_id, summary_type, content)
        VALUES (?, ?, 'semantic', ?)
      `).run(summaryId, messageId, parsed.semantic);
      types.push("semantic");
    }

    // Store emotional summary
    if (parsed.emotional) {
      const emotionalId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO message_summaries (id, message_id, summary_type, content)
        VALUES (?, ?, 'emotional', ?)
      `).run(emotionalId, messageId, parsed.emotional);
      types.push("emotional");
    }

    // Store relationship impact
    if (parsed.relationship_impact && parsed.relationship_impact !== "none") {
      const relId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO message_summaries (id, message_id, summary_type, content)
        VALUES (?, ?, 'relationship_impact', ?)
      `).run(relId, messageId, parsed.relationship_impact);
      types.push("relationship_impact");
    }

    // Store lore extracted
    if (Array.isArray(parsed.lore_extracted) && parsed.lore_extracted.length > 0) {
      for (const lore of parsed.lore_extracted) {
        const loreId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO message_summaries (id, message_id, summary_type, content)
          VALUES (?, ?, 'lore_extracted', ?)
        `).run(loreId, messageId, lore);
        types.push("lore_extracted");
      }
    }

    return { summaryId, types };
  } catch {
    return { summaryId: "", types: [] };
  }
}

/**
 * Get all summaries for a specific message.
 */
export function getMessageSummaries(messageId: string): {
  semantic: string | null;
  emotional: string | null;
  relationship_impact: string | null;
  lore_extracted: string[];
} {
  const db = getDb();

  const summaries = db.prepare(`
    SELECT summary_type, content
    FROM message_summaries
    WHERE message_id = ?
    ORDER BY created_at ASC
  `).all(messageId) as { summary_type: string; content: string }[];

  const result = {
    semantic: null as string | null,
    emotional: null as string | null,
    relationship_impact: null as string | null,
    lore_extracted: [] as string[],
  };

  for (const s of summaries) {
    switch (s.summary_type) {
      case "semantic":
        result.semantic = s.content;
        break;
      case "emotional":
        result.emotional = s.content;
        break;
      case "relationship_impact":
        result.relationship_impact = s.content;
        break;
      case "lore_extracted":
        result.lore_extracted.push(s.content);
        break;
    }
  }

  return result;
}

/**
 * Get semantic summaries for a session (used in context retrieval).
 */
export function getSessionSemanticSummaries(sessionId: string): {
  messageId: string;
  summary: string;
  emotional: string | null;
}[] {
  const db = getDb();

  return db.prepare(`
    SELECT ms.message_id, ms.content as summary, 
           (SELECT content FROM message_summaries WHERE message_id = ms.message_id AND summary_type = 'emotional' LIMIT 1) as emotional
    FROM message_summaries ms
    WHERE ms.message_id IN (SELECT id FROM messages WHERE session_id = ?)
      AND ms.summary_type = 'semantic'
    ORDER BY ms.created_at ASC
  `).all(sessionId) as { messageId: string; summary: string; emotional: string | null }[];
}
