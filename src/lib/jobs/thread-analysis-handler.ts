/**
 * Thread Analysis Job Handler
 *
 * Handles the thread_analysis job type — analyzes session messages
 * to identify and record narrative threads.
 *
 * Also detects thread resolution transitions and auto-creates
 * timeline entries when threads move to 'resolved' status.
 */

import crypto from "crypto";
import { getDb } from "@/lib/db";
import { generateText, getActiveJobModel } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";
import { safeParseWarn } from "@/lib/safe-json";
import { markJobCompleted } from "./queue";
import type { JobPayload, JobResult } from "./types";

/**
 * Handle thread analysis — examines session messages to identify
 * narrative threads and persists them to the database.
 */
export async function handleThreadAnalysis(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { sessionId, userId } = payload;
  if (!sessionId || !userId) throw new Error("Missing sessionId or userId");

  const db = getDb();

  // Get session messages
  const messages = db.prepare(`
    SELECT content, sender_id, timestamp
    FROM messages
    WHERE session_id = ? AND is_deleted = 0
    ORDER BY timestamp ASC
    LIMIT 50
  `).all(sessionId) as { content: string; sender_id: string | null; timestamp: string }[];

  if (messages.length < 5) {
    markJobCompleted(jobId);
    return { success: true, jobId, type: "thread_analysis", data: { threadsFound: 0 } };
  }

  // Fetch existing threads for status-diff detection
  const existingThreads = db.prepare(`
    SELECT id, name, status FROM narrative_threads WHERE session_id = ?
  `).all(sessionId) as { id: string; name: string; status: string }[];
  const threadByName = new Map<string, { id: string; name: string; status: string }>();
  for (const t of existingThreads) {
    threadByName.set(t.name.toLowerCase(), t);
  }

  const messageText = messages
    .map((m) => `${m.sender_id === null ? "AI" : "Player"}: ${m.content}`)
    .join("\n");

  const prompt = PROMPTS.analyzeThreads(messageText);

  let threadsFound = 0;
  try {
    const response = await generateText(prompt, { temperature: 0.3, num_predict: 1024, userId: userId as string, model: getActiveJobModel(userId as string) });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = safeParseWarn<Record<string, unknown>>(jsonMatch[0], "LLM thread analysis");
      if (parsed && Array.isArray(parsed.threads)) {
        for (const thread of parsed.threads) {
          const threadName = typeof thread.name === 'string' ? thread.name : "Unknown Thread";
          const threadStatus = typeof thread.status === 'string' ? thread.status : "active";
          const key = threadName.toLowerCase();
          const existing = threadByName.get(key);

          if (existing) {
            // Thread exists — update summary/key_entities and detect status transition
            if (existing.status !== threadStatus && threadStatus === "resolved") {
              // Thread just resolved — create timeline entry
              try {
                const entryId = crypto.randomUUID();
                const tsDesc = typeof thread.summary === 'string' ? thread.summary : null;
                db.prepare(`
                  INSERT INTO timeline_entries (id, user_id, session_id, thread_id, title, description, occurred_at, entry_type, importance)
                  VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'thread_resolved', 'medium')
                `).run(entryId, userId, sessionId, existing.id, `Thread Resolved: ${threadName}`, tsDesc);
              } catch {
                // Non-fatal
              }
            }

            // Update existing thread record
            const newEntities = Array.isArray(thread.keyEntities) ? thread.keyEntities : [];
            db.prepare(`
              UPDATE narrative_threads SET status = ?, summary = ?, key_entities = ? WHERE id = ?
            `).run(
              threadStatus,
              typeof thread.summary === 'string' ? thread.summary : "",
              JSON.stringify(newEntities),
              existing.id
            );
          } else {
            // New thread — insert
            const threadId = crypto.randomUUID();
            db.prepare(`
              INSERT INTO narrative_threads (id, user_id, session_id, name, status, summary, key_entities)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              threadId,
              userId,
              sessionId,
              threadName,
              threadStatus,
              typeof thread.summary === 'string' ? thread.summary : "",
              JSON.stringify(Array.isArray(thread.keyEntities) ? thread.keyEntities : [])
            );
          }
          threadsFound++;
        }
      }
    }
  } catch {
    // Skip if analysis fails
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "thread_analysis",
    data: { threadsFound },
  };
}
