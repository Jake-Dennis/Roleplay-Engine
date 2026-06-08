/**
 * Archival Processing Job Handler
 *
 * Handles the archival_processing job type — archives low-importance
 * narrative memories by generating compressed summaries.
 */

import { getDb } from "@/lib/db";
import { generateText, getActiveJobModel } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";
import { safeParseWarn } from "@/lib/safe-json";
import { LEVEL_VALUES, ImportanceLevel } from "@/lib/importance";
import { CONTENT_LIMITS } from "@/lib/config";
import { updateJobProgress, markJobCompleted } from "./queue";
import type { JobPayload, JobResult } from "./types";

/**
 * Handle archival processing — finds low-importance narrative memories
 * and replaces them with AI-generated compressed summaries.
 */
export async function handleArchivalProcessing(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId } = payload;
  if (!userId) throw new Error("Missing userId");

  const db = getDb();

  let query = `
    SELECT id, content, importance, created_at
    FROM narrative_memories
    WHERE user_id = ? AND importance IS NOT NULL AND type != 'rumor'
  `;
  const params: (string | number)[] = [userId];

  if (universeId) {
    query += " AND universe_id = ?";
    params.push(universeId);
  }

  const memories = db.prepare(query).all(...params) as { id: string; content: string; importance: string; created_at: string }[];

  let archived = 0;
  const totalMemories = memories.length;
  for (let i = 0; i < memories.length; i++) {
    const memory = memories[i];
    const imp = safeParseWarn<Record<string, string>>(memory.importance, "memory importance", {}) ?? {};
    const score = (LEVEL_VALUES[imp.emotional as ImportanceLevel] || 1) + (LEVEL_VALUES[imp.local as ImportanceLevel] || 1) + (LEVEL_VALUES[imp.canonical as ImportanceLevel] || 1) + (LEVEL_VALUES[imp.recency as ImportanceLevel] || 1);

    if (score <= 4) {
      const prompt = PROMPTS.memoryArchiveSummary(memory.content.slice(0, CONTENT_LIMITS.SHORT));

      try {
        const summary = await generateText(prompt, { temperature: 0.2, num_predict: 512, userId: userId as string, model: getActiveJobModel(userId as string) });

        db.prepare(
          "UPDATE narrative_memories SET content = ?, importance = ? WHERE id = ?"
        ).run(`[ARCHIVED] ${summary}`, JSON.stringify({ emotional: "low", local: "low", canonical: "low", recency: "low" }), memory.id);
        archived++;
      } catch {
        // Skip failed memories
      }
    }

    // Update progress
    if (totalMemories > 2 && (i + 1) % Math.max(1, Math.floor(totalMemories / 3)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalMemories) * 80), `Archiving ${i + 1}/${totalMemories}...`);
    }
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "archival_processing",
    data: { archived },
  };
}
