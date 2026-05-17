/**
 * Memory Compression and Archival
 * 
 * Compresses old narrative memories and messages to reduce database size
 * and improve retrieval performance. Old content is summarized and archived,
 * with the original content marked as archived.
 * 
 * Compression triggers:
 * - During idle-time processing (30-minute tier)
 * - When narrative_memories exceed 100 entries for a user
 * - When messages exceed 500 in a session
 * 
 * Compression tiers:
 * - Recent (0-7 days): No compression
 * - Short-term (7-30 days): Light summarization
 * - Long-term (30-90 days): Heavy summarization
 * - Archive (90+ days): Minimal summary + archival
 */

import { getDb } from "@/lib/db";
import { generateText } from "@/lib/ollama";

export interface CompressionResult {
  compressedCount: number;
  archivedCount: number;
}

// Compression thresholds
const MEMORY_COMPRESSION_THRESHOLD = 100;
const MESSAGE_COMPRESSION_THRESHOLD = 500;

/**
 * Compress and archive old memories for a user
 */
export async function processMemoryCompression(
  userId: string,
  sessionId?: string
): Promise<CompressionResult> {
  const db = getDb();

  let compressedCount = 0;
  let archivedCount = 0;

  // Compress narrative memories
  const memoryResult = await compressNarrativeMemories(userId, sessionId);
  compressedCount += memoryResult.compressed;
  archivedCount += memoryResult.archived;

  // Compress old messages if sessionId provided
  if (sessionId) {
    const messageResult = await compressMessages(sessionId);
    compressedCount += messageResult.compressed;
    archivedCount += messageResult.archived;
  }

  return { compressedCount, archivedCount };
}

/**
 * Compress narrative memories based on age
 */
async function compressNarrativeMemories(
  userId: string,
  sessionId?: string
): Promise<{ compressed: number; archived: number }> {
  const db = getDb();

  // Check if compression is needed
  let countQuery = "SELECT COUNT(*) as count FROM narrative_memories WHERE user_id = ?";
  const countParams: (string | number)[] = [userId];

  if (sessionId) {
    countQuery += " AND session_id = ?";
    countParams.push(sessionId);
  }

  const count = db.prepare(countQuery).get(...countParams) as { count: number } | undefined;
  if ((count?.count || 0) < MEMORY_COMPRESSION_THRESHOLD) {
    return { compressed: 0, archived: 0 };
  }

  // Get memories older than 7 days
  let memoryQuery = `
    SELECT id, content, type, importance, created_at
    FROM narrative_memories
    WHERE user_id = ?
      AND created_at < datetime('now', '-7 days')
  `;
  const memoryParams: (string | number)[] = [userId];

  if (sessionId) {
    memoryQuery += " AND session_id = ?";
    memoryParams.push(sessionId);
  }

  memoryQuery += " ORDER BY created_at ASC LIMIT 50";

  const memories = db.prepare(memoryQuery).all(...memoryParams) as {
    id: string;
    content: string;
    type: string;
    importance: string | null;
    created_at: string;
  }[];

  let compressed = 0;
  let archived = 0;

  for (const memory of memories) {
    const age = (Date.now() - new Date(memory.created_at).getTime()) / (1000 * 60 * 60 * 24);

    if (age >= 90) {
      // Archive: create minimal summary and mark as archived
      const summary = await summarizeContent(memory.content, "minimal");
      if (summary) {
        db.prepare(`
          UPDATE narrative_memories
          SET content = ?, importance = 'archived', type = ?
          WHERE id = ?
        `).run(summary, `archived:${memory.type}`, memory.id);
        archived++;
      }
    } else if (age >= 30) {
      // Long-term: heavy summarization
      const summary = await summarizeContent(memory.content, "heavy");
      if (summary) {
        db.prepare(`
          UPDATE narrative_memories
          SET content = ?, importance = 'low'
          WHERE id = ?
        `).run(summary, memory.id);
        compressed++;
      }
    } else if (age >= 7) {
      // Short-term: light summarization
      const summary = await summarizeContent(memory.content, "light");
      if (summary) {
        db.prepare(`
          UPDATE narrative_memories
          SET content = ?
          WHERE id = ?
        `).run(summary, memory.id);
        compressed++;
      }
    }
  }

  return { compressed, archived };
}

/**
 * Compress old messages in a session
 */
async function compressMessages(sessionId: string): Promise<{ compressed: number; archived: number }> {
  const db = getDb();

  // Check if compression is needed
  const count = db.prepare(
    "SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND is_deleted = 0"
  ).get(sessionId) as { count: number } | undefined;

  if ((count?.count || 0) < MESSAGE_COMPRESSION_THRESHOLD) {
    return { compressed: 0, archived: 0 };
  }

  // Get old messages that haven't been summarized
  const messages = db.prepare(`
    SELECT m.id, m.content, m.sender_id, m.timestamp
    FROM messages m
    WHERE m.session_id = ?
      AND m.is_deleted = 0
      AND m.timestamp < datetime('now', '-30 days')
      AND m.id NOT IN (SELECT source_message_id FROM message_summaries)
    ORDER BY m.timestamp ASC
    LIMIT 100
  `).all(sessionId) as {
    id: string;
    content: string;
    sender_id: string | null;
    timestamp: string;
  }[];

  if (messages.length === 0) {
    return { compressed: 0, archived: 0 };
  }

  // Group into batches and summarize
  const batchSize = 10;
  let compressed = 0;
  let archived = 0;

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const summary = await summarizeBatch(batch);

    if (summary) {
      // Store summary
      const summaryId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO message_summaries (id, source_message_id, summary, emotional_tone, created_at)
        VALUES (?, ?, ?, 'archived', CURRENT_TIMESTAMP)
      `).run(summaryId, batch[batch.length - 1].id, summary);

      // Mark messages as archived (soft delete with special flag)
      const ids = batch.map((m) => m.id);
      const placeholders = ids.map(() => "?").join(",");
      db.prepare(
        `UPDATE messages SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`
      ).run(...ids);

      archived += batch.length;
    }
  }

  return { compressed, archived };
}

/**
 * Summarize content using AI
 */
async function summarizeContent(content: string, level: "light" | "heavy" | "minimal"): Promise<string | null> {
  const lengthInstructions = {
    light: "Summarize in 2-3 sentences, preserving key details.",
    heavy: "Summarize in 1 sentence, capturing only the most important point.",
    minimal: "Summarize in 5-10 words, capturing the essence only.",
  };

  const prompt = `${lengthInstructions[level]}

Content:
${content}`;

  try {
    const response = await generateText(prompt, { temperature: 0.2, num_ctx: 2048 });
    return response.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Summarize a batch of messages
 */
async function summarizeBatch(
  messages: { content: string; sender_id: string | null }[]
): Promise<string | null> {
  const messageText = messages
    .map((m) => `${m.sender_id === null ? "Narrator" : "Player"}: ${m.content}`)
    .join("\n");

  const prompt = `Summarize these old messages in 2-3 sentences:

${messageText}`;

  try {
    const response = await generateText(prompt, { temperature: 0.2, num_ctx: 4096 });
    return response.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Check if a user needs memory compression
 */
export function needsMemoryCompression(userId: string): boolean {
  const db = getDb();

  const memoryCount = db.prepare(
    "SELECT COUNT(*) as count FROM narrative_memories WHERE user_id = ?"
  ).get(userId) as { count: number } | undefined;

  return (memoryCount?.count || 0) >= MEMORY_COMPRESSION_THRESHOLD;
}

/**
 * Get compression stats for a user
 */
export function getCompressionStats(userId: string): {
  totalMemories: number;
  compressedMemories: number;
  archivedMemories: number;
  totalMessages: number;
  summarizedMessages: number;
} {
  const db = getDb();

  const totalMemories = db.prepare(
    "SELECT COUNT(*) as count FROM narrative_memories WHERE user_id = ?"
  ).get(userId) as { count: number } | undefined;

  const archivedMemories = db.prepare(
    "SELECT COUNT(*) as count FROM narrative_memories WHERE user_id = ? AND importance = 'archived'"
  ).get(userId) as { count: number } | undefined;

  const totalMessages = db.prepare(
    "SELECT COUNT(*) as count FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE owner_id = ?) AND is_deleted = 0"
  ).get(userId) as { count: number } | undefined;

  const summarizedMessages = db.prepare(`
    SELECT COUNT(*) as count FROM message_summaries
    WHERE source_message_id IN (
      SELECT m.id FROM messages m
      JOIN sessions s ON m.session_id = s.id
      WHERE s.owner_id = ?
    )
  `).get(userId) as { count: number } | undefined;

  return {
    totalMemories: totalMemories?.count || 0,
    compressedMemories: (totalMemories?.count || 0) - (archivedMemories?.count || 0),
    archivedMemories: archivedMemories?.count || 0,
    totalMessages: totalMessages?.count || 0,
    summarizedMessages: summarizedMessages?.count || 0,
  };
}
