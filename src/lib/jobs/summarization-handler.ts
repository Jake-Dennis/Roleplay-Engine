/**
 * Summarization Job Handler
 *
 * Handles summarization-related job types:
 * - summarize_messages: Batch summarization of old messages
 * - compress_memories: Age-based memory compression with LLM
 */

import { TIME, CONTENT_LIMITS } from "@/lib/config";
import { getDb } from "@/lib/db";
import { processSummarization } from "@/lib/summarization";
import { generateText } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";
import type { JobPayload, JobResult } from "@/lib/job-processor";
import { updateJobProgress, markJobCompleted } from "@/lib/job-processor";

export async function handleSummarizationJob(jobId: string, payload: JobPayload, jobType: "summarize_messages" | "compress_memories"): Promise<JobResult> {
  switch (jobType) {
    case "summarize_messages":
      return handleSummarizeMessages(jobId, payload);
    case "compress_memories":
      return handleCompressMemories(jobId, payload);
  }
}

async function handleSummarizeMessages(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { sessionId } = payload;
  if (!sessionId) throw new Error("Missing sessionId");

  updateJobProgress(jobId, 25, "Fetching messages...");
  const result = await processSummarization(sessionId as string);
  updateJobProgress(jobId, 75, "Saving summaries...");
  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "summarize_messages",
    data: { summarizedCount: result.summarizedCount },
  };
}

async function handleCompressMemories(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, sessionId, universeId } = payload;
  if (!userId) throw new Error("Missing userId");

  const db = getDb();

  // If universe is specified, only compress memories from sessions in that universe
  let memoryQuery = `
    SELECT nm.id, nm.content, nm.type, nm.importance, nm.created_at
    FROM narrative_memories nm
    WHERE nm.user_id = ?
      AND nm.created_at < datetime('now', '-7 days')
  `;
  const memoryParams: (string | number)[] = [userId];

  if (universeId) {
    memoryQuery += ` AND nm.universe_id = ?`;
    memoryParams.push(universeId);
  }

  if (sessionId) {
    memoryQuery += ` AND nm.session_id = ?`;
    memoryParams.push(sessionId);
  }

  memoryQuery += ` ORDER BY nm.created_at ASC LIMIT 50`;

  const memories = db.prepare(memoryQuery).all(...memoryParams) as {
    id: string;
    content: string;
    type: string;
    importance: string | null;
    created_at: string;
  }[];

  let compressedCount = 0;
  let archivedCount = 0;
  const totalMemories = memories.length;

  for (let i = 0; i < memories.length; i++) {
    const memory = memories[i];
    const age = (Date.now() - new Date(memory.created_at).getTime()) / TIME.ONE_DAY;

    if (age >= 90) {
      const prompt = PROMPTS.memorySummarizeArchived(memory.content.slice(0, CONTENT_LIMITS.SHORT));
      try {
        const summary = await generateText(prompt, { temperature: 0.2, num_predict: 512, userId: userId as string });
        if (summary?.trim()) {
          db.prepare(`
            UPDATE narrative_memories
            SET content = ?, importance = 'archived', type = ?
            WHERE id = ?
          `).run(summary.trim(), `archived:${memory.type}`, memory.id);
          archivedCount++;
        }
      } catch { /* skip */ }
    } else if (age >= 30) {
      const prompt = PROMPTS.memorySummarizeOneSentence(memory.content.slice(0, CONTENT_LIMITS.SHORT));
      try {
        const summary = await generateText(prompt, { temperature: 0.2, num_predict: 256, userId: userId as string });
        if (summary?.trim()) {
          db.prepare(`
            UPDATE narrative_memories
            SET content = ?, importance = 'low'
            WHERE id = ?
          `).run(summary.trim(), memory.id);
          compressedCount++;
        }
      } catch { /* skip */ }
    } else if (age >= 7) {
      const prompt = PROMPTS.memorySummarizeShort(memory.content.slice(0, CONTENT_LIMITS.SHORT));
      try {
        const summary = await generateText(prompt, { temperature: 0.2, num_predict: 512, userId: userId as string });
        if (summary?.trim()) {
          db.prepare(`
            UPDATE narrative_memories
            SET content = ?, importance = 'low'
            WHERE id = ?
          `).run(summary.trim(), memory.id);
          compressedCount++;
        }
      } catch { /* skip */ }
    }

    // Update progress every 25% of memories
    if (totalMemories > 4 && (i + 1) % Math.max(1, Math.floor(totalMemories / 4)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalMemories) * 80), `Compressing ${i + 1}/${totalMemories}...`);
    }
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "compress_memories",
    data: { compressedCount, archivedCount },
  };
}
