import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { generateTextStream, getUserModels, getActivePersonaContext, buildPersonaPrompt, checkModelAvailable, type PersonaContext } from "@/lib/ollama";
import { buildSystemPrompt } from "@/lib/prompt-builder";
import { getRetrievedContext, assemblePromptWithBudget, type RetrievedContext } from "@/lib/retrieval";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { queueJob, processJobsByType, processUserJobs } from "@/lib/job-processor";
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from "@/lib/rate-limiter";
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { getServerConfig } from '@/lib/server-config';
import { validateLength } from '@/lib/validation';
import { markOllamaBusy, markOllamaIdle } from '@/lib/ollama-busy';

/**
 * Detect which NPC(s) the AI is roleplaying as from the generated response.
 * Scans the full response for known NPC names with speaking indicators.
 * Returns comma-separated NPC names or null if no NPC is detected.
 */
function detectSpeakingAs(response: string, activeNpcs: string[]): string | null {
  if (!response || activeNpcs.length === 0) return null;

  const body = response.toLowerCase();
  const found: string[] = [];

  for (const npc of activeNpcs) {
    if (!npc) continue;
    const npcLower = npc.toLowerCase();

    // Check if NPC name appears at the very start (strongest signal)
    if (body.startsWith(npcLower)) {
      if (!found.includes(npc)) found.push(npc);
      continue;
    }

    // Check for dialogue attribution patterns
    const dialoguePatterns = [
      `${npcLower} said`, `${npcLower} replied`, `${npcLower} answered`,
      `${npcLower} asked`, `${npcLower} murmured`, `${npcLower} whispered`,
      `${npcLower} called`, `${npcLower} shouted`, `${npcLower} growled`,
      `${npcLower} spoke`, `${npcLower} began`, `${npcLower} continued`,
      `${npcLower} nodded`, `${npcLower} stepped`, `${npcLower} turned`,
      `${npcLower} smiled`, `${npcLower} frowned`, `${npcLower} laughed`,
    ];
    for (const pattern of dialoguePatterns) {
      if (body.includes(pattern)) {
        if (!found.includes(npc)) found.push(npc);
        break;
      }
    }
  }

  return found.length > 0 ? found.join(", ") : null;
}

/**
 * POST /api/generate/[id]
 *
 * Generates an AI narrative response for the given session. This is the primary
 * generation endpoint — it retrieves full context (recent messages, wiki lore,
 * relationships, memories, narrative threads), assembles a structured prompt,
 * and streams the LLM response as SSE JSON-line chunks. Also queues background
 * jobs for summarization, embeddings, relationship analysis, and wiki extraction.
 *
 * @param request - The incoming Next.js request object containing JSON body with userMessage and optional parentMessageId
 * @param params - Route parameters containing the session id
 * @returns Response with SSE stream — each line is JSON: { chunk: string } for content, { done: true, messageId, intent } on completion
 * @throws 400 - If userMessage is missing or exceeds 10000 characters
 * @throws 401 - If authentication fails or token is missing
 * @throws 404 - If session is not found or user is not a participant
 * @throws 429 - If rate limit exceeded
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  cleanupExpiredEntries();
  const limit = checkRateLimit(`generate:${userId}`, "generate");
  if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);

  const { id: sessionId } = await params;
  const db = getDb();

  // Verify session access
  const session = db.prepare(`
    SELECT s.*, u.canon_mode, u.id as universe_id
    FROM sessions s
    LEFT JOIN universes u ON u.id = s.universe_id
    WHERE s.id = ? AND (s.owner_id = ? OR s.id IN (
      SELECT session_id FROM session_participants WHERE user_id = ?
    ))
  `).get(sessionId, userId, userId) as {
    id: string;
    name: string;
    universe_id: string | null;
    canon_mode: string | null;
  } | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

    requireJson(request);
    const body = await request.json();
  const { userMessage, parentMessageId } = body;

  if (!userMessage) {
    return NextResponse.json({ error: "userMessage is required" }, { status: 400 });
  }

  const messageError = validateLength(userMessage, 10000, "userMessage");
  if (messageError) return NextResponse.json({ error: messageError }, { status: 400 });

  // Session-aware persona: session persona → global active → undefined
  let persona: PersonaContext | null = null;
  const sessionPersonaId = (session as Record<string, unknown>).persona_id as string | undefined;
  if (sessionPersonaId) {
    const row = db.prepare(
      "SELECT name, description, personality, scenario, first_mes, mes_example, creator_notes, system_prompt, post_history_instructions, tags, writing_style, llm_model FROM personas WHERE id = ? AND user_id = ?"
    ).get(sessionPersonaId, userId) as {
      name: string;
      description: string | null;
      personality: string | null;
      scenario: string | null;
      first_mes: string | null;
      mes_example: string | null;
      creator_notes: string | null;
      system_prompt: string | null;
      post_history_instructions: string | null;
      tags: string | null;
      writing_style: string | null;
      llm_model: string | null;
    } | undefined;
    if (row) {
      let tags: string[] | null = null;
      if (row.tags) {
        try { tags = JSON.parse(row.tags); } catch { /* ignore */ }
      }
      persona = {
        name: row.name,
        description: row.description,
        personality: row.personality,
        scenario: row.scenario,
        firstMes: row.first_mes,
        mesExample: row.mes_example,
        creatorNotes: row.creator_notes,
        systemPrompt: row.system_prompt,
        postHistoryInstructions: row.post_history_instructions,
        tags,
        writingStyle: row.writing_style,
        llmModel: row.llm_model,
      };
    }
  }
  if (!persona) {
    persona = getActivePersonaContext(userId);
  }

  // Pre-flight model check: verify the resolved model exists on Ollama
  // before entering the retrieval pipeline or creating any placeholders.
  // This fails fast (~3s) instead of waiting for the 10-minute generation
  // timeout if the model hasn't been pulled yet.
  const preflightUserModels = getUserModels(userId);
  const preflightModel = persona?.llmModel || preflightUserModels.llmModel;
  if (preflightModel) {
    const modelAvailable = await checkModelAvailable(preflightModel);
    if (!modelAvailable) {
      return NextResponse.json({
        error: `Model "${preflightModel}" is not available on Ollama. Make sure it's pulled: ollama pull ${preflightModel}`,
        model: preflightModel,
      }, { status: 503 });
    }
  }

  // Build context using retrieval pipeline
  const ctx: RetrievedContext = await getRetrievedContext(
    sessionId,
    session.universe_id || "",
    userMessage
  );

  // Extract universe info from the first lore entry (universe overview page)
  let universeName: string | undefined;
  let timePeriod: string | undefined;
  try {
    const loreEntries = ctx?.lore?.entries || [];
    if (loreEntries.length > 0) {
      const overview = loreEntries[0];
      universeName = overview.name;
      const tpMatch = overview.description?.match(/time[_-]?period:?\s*(.+)/i);
      if (tpMatch) timePeriod = tpMatch[1].trim();
    }
  } catch { /* non-fatal */ }

  // Read narrator options from session_config
  let narratorOptions: import("@/lib/prompt-builder").NarratorOptions | undefined;
  try {
    const rows = db.prepare("SELECT key, value FROM session_config WHERE session_id = ?").all(sessionId) as { key: string; value: string }[];
    if (rows.length > 0) {
      narratorOptions = {};
      for (const row of rows) {
        if (row.key === "narrator_perspective") narratorOptions.perspective = row.value;
        else if (row.key === "narrator_pacing") narratorOptions.pacing = row.value;
        else if (row.key === "narrator_npc_voices") narratorOptions.npcVoices = row.value;
        else if (row.key === "narrator_style") narratorOptions.style = row.value;
      }
    }
  } catch { /* non-fatal */ }

  const basePrompt = buildSystemPrompt(universeName, timePeriod, narratorOptions);
  const systemPrompt = buildPersonaPrompt(persona, basePrompt);

  // Use the full context window configured in server settings
  const cfg = getServerConfig();
  const numCtx = cfg.modelDefaults?.[preflightModel]?.numCtx || 131072;
  const prompt = assemblePromptWithBudget(ctx, systemPrompt, numCtx);

  // Create the AI message placeholder
  const aiMessageId = crypto.randomUUID();
  db.prepare(
    "INSERT INTO messages (id, session_id, sender_id, content, parent_message_id, speaking_as) VALUES (?, ?, NULL, '', ?, NULL)"
  ).run(aiMessageId, sessionId, parentMessageId || null);

  // Emit generation started event
  // NOTE: Do NOT emit MESSAGE_CREATED here — the placeholder has empty content
  // and would cause the UI to show an empty message bubble. The UI already
  // shows a streaming indicator via the SSE response. MESSAGE_CREATED is
  // emitted by the messages API route for user messages.
  eventBus.emit(`${SessionEvents.GENERATION_STARTED}:${sessionId}`, {
    messageId: aiMessageId,
    sessionId,
  });

  // Update session timestamp
  db.prepare("UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);

  // Update scene intent
  if (ctx.intent) {
    db.prepare(
      `UPDATE scene_states SET current_intent = ? WHERE session_id = ?`
    ).run(ctx.intent, sessionId);
  }

  // Stream the response
  const encoder = new TextEncoder();
  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      eventBus.registerController(controller);
      markOllamaBusy();
      try {
        const resolvedModel = preflightModel;

        let chunkCount = 0;
        await generateTextStream(prompt, (chunk) => {
          fullResponse += chunk;
          chunkCount++;

          // Buffer DB writes — write every 50 chunks
          if (chunkCount % 50 === 0) {
            const speakingAs = detectSpeakingAs(fullResponse, ctx.scene.activeNpcs);
            db.prepare("UPDATE messages SET content = ?, speaking_as = ? WHERE id = ?").run(
              fullResponse,
              speakingAs,
              aiMessageId
            );
          }

          controller.enqueue(encoder.encode(JSON.stringify({ chunk }) + "\n"));
        }, {
          userId: userId,
          model: resolvedModel,
          temperature: undefined,
          top_p: undefined,
          num_ctx: numCtx,
          think: getServerConfig().ollama.thinkingMode ? undefined : false,
        });

        logger.info("[generate] Stream complete", { length: fullResponse.length, preview: fullResponse.slice(0, 100) });

        // Fix single-bracket proper nouns: [Mountains] -> [[Mountains]]
        fullResponse = fullResponse.replace(/(?<!\[)\[([A-Za-z0-9\s'\-]+?)\](?!\])/g, (match: string, content: string) => {
          return /[A-Z]/.test(content) ? `[[${content}]]` : match;
        });

        // Send done signal to client stream
        controller.enqueue(
          encoder.encode(JSON.stringify({ done: true, messageId: aiMessageId, contentLength: fullResponse.length }) + "\n")
        );

        // If the response is empty, delete the placeholder and bail out
        if (!fullResponse || fullResponse.trim().length < 5) {
          db.prepare("DELETE FROM messages WHERE id = ?").run(aiMessageId);
          eventBus.emit(`${SessionEvents.GENERATION_DONE}:${sessionId}`, {
            messageId: aiMessageId,
            sessionId,
            intent: ctx.intent,
            contentLength: 0,
          });
          controller.close();
          return;
        }

        const speakingAs = detectSpeakingAs(fullResponse, ctx.scene.activeNpcs);
        db.prepare("UPDATE messages SET content = ?, speaking_as = ? WHERE id = ?").run(
          fullResponse,
          speakingAs,
          aiMessageId
        );

        // Emit generation done event
        eventBus.emit(`${SessionEvents.GENERATION_DONE}:${sessionId}`, {
          messageId: aiMessageId,
          sessionId,
          intent: ctx.intent,
          contentLength: fullResponse.length,
        });

        // Emit message:created for auto-TTS (narrator messages)
        eventBus.emit(`${SessionEvents.MESSAGE_CREATED}:${sessionId}`, {
          id: aiMessageId,
          sessionId,
          senderId: null,
          content: fullResponse,
          personaId: null,
          personaName: null,
        });

        // Queue deferred extraction jobs — these run during idle processing
        // so they don't block the SSE stream from closing. The job handlers
        // emit SCENE_UPDATED / WIKI_PAGE_CREATED events on completion.
        queueJob(userId, "scene_state_extract", {
          sessionId,
          userId: userId,
        }, "low", session.universe_id || undefined);

        queueJob(userId, "extract_lore_comprehensive", {
          sessionId,
          userId: userId,
          universeId: session.universe_id || undefined,
        }, "low", session.universe_id || undefined);

        // Queue background jobs for async processing
        // NOTE: These queue for the AI's response (just persisted above at aiMessageId).
        // The companion route (sessions/[id]/messages/route.ts) separately queues the
        // SAME job types for the USER's message. Both are needed — each message type
        // (user vs AI) gets its own summarization + embedding.
        // High priority: summarize the new message
        queueJob(userId, "summarize_messages", {
          sessionId,
          messageId: aiMessageId,
          content: fullResponse,
        }, "high", session.universe_id || undefined);

        // High priority: generate embeddings for the new message
        queueJob(userId, "generate_embeddings", {
          sessionId,
          messageId: aiMessageId,
          content: fullResponse,
          entityType: "message",
          entityId: aiMessageId,
          userId: userId,
        }, "high", session.universe_id || undefined);

        // Medium priority: analyze relationship impacts
        queueJob(userId, "analyze_relationships", {
          sessionId,
          messageId: aiMessageId,
          content: fullResponse,
          userId: userId,
        }, "medium", session.universe_id || undefined);

        // Low priority: extract wiki event pages from the response
        queueJob(userId, "wiki_extract_event", {
          sessionId,
          userId: userId,
        }, "low", session.universe_id || undefined);

        // Low priority: analyze narrative threads in the session
        queueJob(userId, "thread_analysis", {
          sessionId,
          userId: userId,
        }, "low", session.universe_id || undefined);

        // Check for NPC mentions and queue evolution jobs
        if (session.universe_id) {
          try {
            const npcs = db.prepare(
              "SELECT id, name FROM npcs WHERE universe_id = ? AND is_canon = 0"
            ).all(session.universe_id) as { id: string; name: string }[];

            for (const npc of npcs) {
              if (fullResponse.toLowerCase().includes(npc.name.toLowerCase())) {
                queueJob(userId, "npc_evolution", {
                  userId: userId,
                  universeId: session.universe_id,
                  npcId: npc.id,
                }, "low", session.universe_id || undefined);
              }
            }
          } catch {
            // Non-fatal: failure to queue evolution jobs does not break generation
          }
        }

        // Queue session recap every 50 messages
        try {
          const msgCount = db.prepare(
            "SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND is_deleted = 0"
          ).get(sessionId) as { count: number } | undefined;
          if (msgCount && msgCount.count > 0 && msgCount.count % 50 === 0) {
            queueJob(userId, "generate_session_recap", {
              sessionId,
              userId,
            }, "low", session.universe_id || undefined);
          }
        } catch {
          // Non-fatal: failure to queue recap does not break generation
        }

        // Send completion signal with intent info
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              done: true,
              messageId: aiMessageId,
              intent: ctx.intent,
            }) + "\n"
          )
        );

        // Queue background job for narrative choices — this replaces the
        // synchronous generateText() call that used to block the SSE stream
        // from closing for 5–15 seconds. The job handler emits choices via
        // event bus → session SSE stream when complete.
        queueJob(userId, "generate_choices", {
          sessionId,
          userId,
          universeId: session.universe_id || undefined,
          userMessage,
          fullResponse,
          messageId: aiMessageId,
        }, "low", session.universe_id || undefined);

        controller.close();
        eventBus.unregisterController(controller);

        // Fire-and-forget: process relationship and thread analysis immediately
        // instead of waiting for idle processing (which delays 5-30 minutes).
        // Both handlers call Ollama (generateText) to analyze messages, so they
        // run async to avoid blocking the SSE stream from closing.
        (async () => {
          try {
            // Analyze relationships (medium priority) — updates relationship
            // emotional states, stages, and shared history from recent messages
            await processJobsByType(userId, "analyze_relationships", 1);
          } catch { /* non-fatal — falls back to idle processing */ }
        })();

        (async () => {
          try {
            // Analyze narrative threads (low priority) — detects story threads,
            // updates status, and creates timeline entries for resolved threads
            await processJobsByType(userId, "thread_analysis", 1);
          } catch { /* non-fatal — falls back to idle processing */ }
        })();
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        logger.error("Generation stream failed", { message: errMsg });
        // Remove empty AI placeholder message created before stream
        db.prepare("DELETE FROM messages WHERE id = ?").run(aiMessageId);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              error: `Generation failed: ${errMsg}`,
            }) + "\n"
          )
        );
        controller.close();
        eventBus.unregisterController(controller);
      } finally {
        // Mark Ollama idle so background jobs can resume
        markOllamaIdle();
        // Cascade: process queued jobs while Ollama is free.
        // Each job checks isOllamaBusy() before starting — if a user
        // generation starts mid-cascade, the rest stay queued.
        processUserJobs(userId, Infinity).catch(() => {});
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
