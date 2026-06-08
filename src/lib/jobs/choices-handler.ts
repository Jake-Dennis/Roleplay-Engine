/**
 * Narrative Choices Generation Job Handler
 *
 * Handles the generate_choices job type — generates branching narrative
 * direction choices from the latest user message + AI response using Ollama.
 *
 * Previously this ran synchronously in the generate endpoint, blocking the
 * SSE stream from closing for 5–15 seconds. Now it runs as a background job
 * and emits the choices via the event bus when complete.
 */

import { getRetrievedContext } from "@/lib/retrieval";
import { generateText } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import type { JobPayload, JobResult } from "@/lib/job-processor";
import { updateJobProgress, markJobCompleted } from "@/lib/job-processor";
import { logger } from "@/lib/logger";
import type { QueuedJob } from "./types";

/**
 * Process a generate_choices job.
 *
 * Expects payload fields:
 *  - sessionId: string  — session context for retrieval
 *  - userId: string     — user for Ollama calls
 *  - universeId: string — universe context for retrieval
 *  - userMessage: string — the user's last message
 *  - fullResponse: string — the full AI response text
 *  - messageId: string   — the AI message id (included in SSE event)
 */
export async function process(job: QueuedJob): Promise<JobResult> {
  const payload: JobPayload = JSON.parse(job.payload);
  const { sessionId, userId, universeId, userMessage, fullResponse, messageId } = payload;

  if (!userId || !userMessage || !fullResponse) {
    throw new Error("Missing required payload fields: userId, userMessage, fullResponse");
  }

  updateJobProgress(job.id, 20, "Gathering narrative context...");

  // Retrieve narrative context for richer choice generation
  let ctx;
  try {
    ctx = await getRetrievedContext(
      sessionId as string,
      (universeId as string) || "",
      userMessage as string
    );
  } catch {
    // Non-fatal: if retrieval fails, proceed without additional context
    ctx = null;
  }

  updateJobProgress(job.id, 40, "Generating narrative choices...");

  // Build the choices prompt and call Ollama
  const choicesPrompt = PROMPTS.generateChoices(userMessage as string, fullResponse as string);
  const choicesRaw = await generateText(choicesPrompt, {
    userId: userId as string,
    temperature: 0.8,
    top_p: 0.9,
  });

  updateJobProgress(job.id, 70, "Parsing choices...");

  // Parse and validate the JSON response
  let options: string[] = [];
  try {
    const choicesParsed = JSON.parse(choicesRaw) as { options: string[] };
    if (
      choicesParsed?.options &&
      Array.isArray(choicesParsed.options) &&
      choicesParsed.options.length > 0
    ) {
      options = choicesParsed.options;
    }
  } catch (parseErr) {
    logger.warn("Failed to parse choices JSON from LLM output", parseErr as Error);
    // Non-fatal: emit empty options so the client can handle gracefully
  }

  updateJobProgress(job.id, 90, "Emitting choices to session...");

  // Emit via event bus so the session SSE stream relays choices to clients
  eventBus.emit(`${SessionEvents.CHOICES_GENERATED}:${sessionId}`, {
    sessionId,
    messageId,
    options,
  });

  markJobCompleted(job.id);
  return { success: true, jobId: job.id, type: "generate_choices", data: { options } };
}
