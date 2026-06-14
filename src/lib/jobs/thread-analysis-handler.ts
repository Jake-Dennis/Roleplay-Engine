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
 * Resolve entity names to entity_registry IDs.
 * Checks for persona entities first (scoped to universe), falls back to name.
 */
function resolveEntityNamesToIds(db: ReturnType<typeof getDb>, userId: string, universeId: string | null, names: string[]): string[] {
  const ids: string[] = [];
  for (const name of names) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) continue;
    // Check for persona entity first (scoped to universe)
    if (universeId) {
      const persona = db.prepare(
        "SELECT id FROM entity_registry WHERE LOWER(display_name) = LOWER(?) AND entity_type = 'persona' AND universe_id = ? LIMIT 1"
      ).get(trimmed, universeId) as { id: string } | undefined;
      if (persona) { ids.push(persona.id); continue; }
    }
    const found = db.prepare(
      "SELECT id FROM entity_registry WHERE display_name = ? AND user_id = ? LIMIT 1"
    ).get(trimmed, userId) as { id: string } | undefined;
    ids.push(found?.id || trimmed);
  }
  return ids;
}

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

  // Get session's universe for persona-scoped entity lookups
  const sessionRow = db.prepare(
    "SELECT universe_id FROM sessions WHERE id = ?"
  ).get(sessionId) as { universe_id: string | null } | undefined;
  const universeId = sessionRow?.universe_id || null;

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
    const response = await generateText(prompt, { temperature: 0.3, userId: userId as string, model: getActiveJobModel(userId as string) });
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
                  INSERT INTO timeline_entries (id, user_id, universe_id, session_id, thread_id, title, description, occurred_at, entry_type, importance)
                  VALUES (?, ?, (SELECT universe_id FROM sessions WHERE id = ?), ?, ?, ?, ?, CURRENT_TIMESTAMP, 'thread_resolved', 'medium')
                `).run(entryId, userId, sessionId, sessionId, existing.id, `Thread Resolved: ${threadName}`, tsDesc);
              } catch {
                // Non-fatal
              }
            }

            // Update existing thread record
            const newEntities = Array.isArray(thread.keyEntities) ? thread.keyEntities : [];
            const newEntityIds = resolveEntityNamesToIds(db, userId as string, universeId, newEntities);
            db.prepare(`
              UPDATE narrative_threads SET status = ?, summary = ?, key_entities = ?, entity_ids = ? WHERE id = ?
            `).run(
              threadStatus,
              typeof thread.summary === 'string' ? thread.summary : "",
              JSON.stringify(newEntities),
              JSON.stringify(newEntityIds),
              existing.id
            );
          } else {
            // New thread — insert
            const threadId = crypto.randomUUID();
            const newEntities = Array.isArray(thread.keyEntities) ? thread.keyEntities : [];
            const newEntityIds = resolveEntityNamesToIds(db, userId as string, universeId, newEntities);
            db.prepare(`
              INSERT INTO narrative_threads (id, user_id, session_id, name, status, summary, key_entities, entity_ids)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              threadId,
              userId,
              sessionId,
              threadName,
              threadStatus,
              typeof thread.summary === 'string' ? thread.summary : "",
              JSON.stringify(newEntities),
              JSON.stringify(newEntityIds)
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
