/**
 * Response Generation Job Handler
 *
 * Handles the "generate_response" job type — generates AI responses
 * using the full context retrieval pipeline and inserts them as messages.
 */

import { getDb } from "@/lib/db";
import { generateText } from "@/lib/ollama";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { getRetrievedContext, assemblePromptWithBudget } from "@/lib/retrieval";
import type { JobPayload, JobResult } from "@/lib/job-processor";
import { updateJobProgress, markJobCompleted } from "@/lib/job-processor";

export async function handleResponseJob(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { sessionId, messageId, content, parentMessageId } = payload;
  if (!sessionId || !messageId) {
    throw new Error("Missing sessionId or messageId");
  }

  const db = getDb();

  // B2: Look up session to get universe_id for context retrieval
  const session = db.prepare(`
    SELECT s.id, s.universe_id, u.canon_mode
    FROM sessions s
    LEFT JOIN universes u ON u.id = s.universe_id
    WHERE s.id = ?
  `).get(sessionId) as { id: string; universe_id: string | null; canon_mode: string | null } | undefined;

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // B2: System prompt (same as /api/generate/[id])
  const systemPrompt = `You are a narrative roleplay engine. You narrate immersive, character-driven stories in response to user actions. Write in a literary style with vivid description. Stay in character and maintain story consistency. Keep responses to 2-4 paragraphs unless the situation demands more.`;

  // B2: Use full context retrieval pipeline (scene, lore, relationships, recent messages, intent)
  const ctx = await getRetrievedContext(
    sessionId,
    session.universe_id || "",
    content as string
  );

  const prompt = assemblePromptWithBudget(ctx, systemPrompt, 6000);

  // Emit generation started event (M5)
  eventBus.emit(`${SessionEvents.GENERATION_STARTED}:${sessionId}`, {
    jobId,
    sessionId,
  });

  // Generate AI response using Ollama with full context
  const response = await generateText(prompt, { temperature: 0.8, num_ctx: 8192, userId: payload.userId || "" });

  // Insert the AI response as a new message
  const newMessageId = crypto.randomUUID();
  // A1: Set parent_message_id for conversation branching when provided
  db.prepare(
    "INSERT INTO messages (id, session_id, sender_id, content, parent_message_id) VALUES (?, ?, NULL, ?, ?)"
  ).run(newMessageId, sessionId, response, parentMessageId || null);

  // Update session timestamp
  db.prepare("UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);

  markJobCompleted(jobId);

  // Emit SSE events
  eventBus.emit(`${SessionEvents.MESSAGE_CREATED}:${sessionId}`, {
    messageId: newMessageId,
    sessionId,
    content: response,
    senderId: null,
  });

  // M5: Emit generation done event
  eventBus.emit(`${SessionEvents.GENERATION_DONE}:${sessionId}`, {
    messageId: newMessageId,
    sessionId,
    intent: ctx.intent,
    contentLength: response.length,
  });

  return {
    success: true,
    jobId,
    type: "generate_response",
    data: { messageId: newMessageId, content: response, intent: ctx.intent },
  };
}
