import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { generateTextStream, getUserModels, getActivePersonaContext, buildPersonaPrompt, type PersonaContext } from "@/lib/ollama";
import { getRetrievedContext, assemblePromptWithBudget, type RetrievedContext } from "@/lib/retrieval";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { queueJob } from "@/lib/job-processor";
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from "@/lib/rate-limiter";
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { validateLength } from '@/lib/validation';

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

  // L3: Skip pre-flight connection check — let generateTextStream handle
  // retries internally. The pre-check would reject immediately without
  // giving the actual generation a chance to connect.

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
  const baseSystemPrompt = `You are a narrative roleplay engine. You narrate immersive, character-driven stories in response to user actions. Write in a literary style with vivid description. Stay in character and maintain story consistency. Keep responses to 2-4 paragraphs unless the situation demands more.`;
  const systemPrompt = buildPersonaPrompt(persona, baseSystemPrompt);

  // Build context using retrieval pipeline
  const ctx: RetrievedContext = await getRetrievedContext(
    sessionId,
    session.universe_id || "",
    userMessage
  );

  const prompt = assemblePromptWithBudget(ctx, systemPrompt, 6000);

  // Create the AI message placeholder
  const aiMessageId = crypto.randomUUID();
  db.prepare(
    "INSERT INTO messages (id, session_id, sender_id, content, parent_message_id) VALUES (?, ?, NULL, '', ?)"
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
      try {
        // Resolve model: persona > user > default
        const userModels = getUserModels(userId);
        const resolvedModel = persona?.llmModel || userModels.llmModel;

        let chunkCount = 0;
        await generateTextStream(prompt, (chunk) => {
          fullResponse += chunk;
          chunkCount++;

          // Buffer DB writes — write every 50 chunks
          if (chunkCount % 50 === 0) {
            db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(
              fullResponse,
              aiMessageId
            );
          }

          controller.enqueue(encoder.encode(JSON.stringify({ chunk }) + "\n"));
        }, {
          userId: userId,
          model: resolvedModel,
          temperature: undefined,
          top_p: undefined,
          num_ctx: undefined,
        });

        // Final write after stream completes — ensures complete content is saved
        db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(
          fullResponse,
          aiMessageId
        );

        // Emit generation done event
        eventBus.emit(`${SessionEvents.GENERATION_DONE}:${sessionId}`, {
          messageId: aiMessageId,
          sessionId,
          intent: ctx.intent,
          contentLength: fullResponse.length,
        });

        // Queue deferred extraction jobs — these run during idle processing
        // so they don't block the SSE stream from closing. The job handlers
        // emit SCENE_UPDATED / WIKI_PAGE_CREATED events on completion.
        queueJob(userId, "scene_state_extract", {
          sessionId,
          userId: userId,
        }, "low", session.universe_id || undefined);

        queueJob(userId, "wiki_auto_extract", {
          sessionId,
          userId: userId,
          universeId: session.universe_id || undefined,
          content: fullResponse,
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
        controller.close();
        eventBus.unregisterController(controller);
      } catch (err: unknown) {
        logger.error("Generation stream failed", err as Error);
        // Remove empty AI placeholder message created before stream
        db.prepare("DELETE FROM messages WHERE id = ?").run(aiMessageId);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              error: "Internal server error",
            }) + "\n"
          )
        );
        controller.close();
        eventBus.unregisterController(controller);
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
