/**
 * Session Recap Job Handler
 *
 * Generates an AI-powered summary of a roleplay session.
 * Fetches session messages, calls LLM for summarization, stores result.
 *
 * Job type: generate_session_recap
 */

import { getDb } from "@/lib/db";
import { generateText } from "@/lib/ollama";
import type { JobPayload, JobResult } from "@/lib/job-processor";
import { updateJobProgress, markJobCompleted } from "@/lib/job-processor";

// ---------------------------------------------------------------------------
// Job Handler
// ---------------------------------------------------------------------------

/**
 * generate_session_recap: Summarize a roleplay session.
 */
export async function handleSessionRecapJob(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, sessionId } = payload;
  if (!userId || !sessionId) throw new Error("Missing userId or sessionId");

  const db = getDb();

  updateJobProgress(jobId, 10, "Fetching messages...");

  // Fetch session messages
  const messages = db.prepare(`
    SELECT m.content, m.timestamp, u.username as sender
    FROM messages m
    LEFT JOIN users u ON m.sender_id = u.id
    WHERE m.session_id = ? AND m.is_deleted = 0
    ORDER BY m.timestamp ASC
  `).all(sessionId) as { content: string; timestamp: string; sender: string | null }[];

  if (messages.length === 0) {
    markJobCompleted(jobId);
    return {
      success: true,
      jobId,
      type: "generate_session_recap",
      data: { recap: "No messages found in this session." },
    };
  }

  updateJobProgress(jobId, 50, "Generating recap...");

  // Build transcript for LLM
  const transcript = messages
    .map((m) => `[${m.timestamp}] ${m.sender || "Unknown"}: ${m.content}`)
    .join("\n");

  const prompt = buildRecapPrompt(transcript);
  const recap = await generateText(prompt, {
    temperature: 0.5,
    num_predict: 4096,
    userId: userId as string,
  });

  updateJobProgress(jobId, 90, "Saving recap...");

  // Store result in job result field
  db.prepare("UPDATE job_queue SET result = ? WHERE id = ?").run(
    JSON.stringify({ recap }),
    jobId
  );
  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "generate_session_recap",
    data: { recap },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the summarization prompt.
 */
function buildRecapPrompt(transcript: string): string {
  return `You are summarizing a roleplay session. Write a concise recap in 3-5 paragraphs.

Focus on:
1. Key events and plot developments
2. Important character interactions and decisions
3. Story progression and unresolved threads

Session transcript:
---
${transcript}
---

Return ONLY the recap text, no markdown formatting, no preamble.`;
}
