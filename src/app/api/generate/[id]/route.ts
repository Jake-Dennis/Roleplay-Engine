import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { generateTextStream, isOllamaAvailable, checkOllamaConnection, getUserModels, getActivePersonaContext, buildPersonaPrompt, type PersonaContext } from "@/lib/ollama";
import { getRetrievedContext, assemblePromptWithBudget, type RetrievedContext } from "@/lib/retrieval";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { queueJob } from "@/lib/job-processor";
import { OLLAMA_CONFIG } from "@/lib/config";
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from "@/lib/rate-limiter";
import type { DbDatabase } from "@/lib/types";
import { getAuthToken } from '@/lib/auth-token';
import { extractAndApplySceneState } from "@/lib/scene-extraction";
import { logger } from '@/lib/logger';
import { validateLength } from '@/lib/validation';

function getSessionSettings(db: DbDatabase, sessionId: string) {
  const rows = db.prepare(
    `SELECT key, value FROM session_settings WHERE session_id = ?`
  ).all(sessionId) as { key: string; value: string }[];

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  return {
    llmModel: map.llm_model || null,
    embeddingModel: map.embedding_model || null,
    temperature: map.temperature ? parseFloat(map.temperature) : null,
    topP: map.top_p ? parseFloat(map.top_p) : null,
    numCtx: map.num_ctx ? parseInt(map.num_ctx, 10) : null,
    systemPrompt: map.system_prompt || null,
    maxResponseLength: map.max_response_length ? parseInt(map.max_response_length, 10) : null,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  cleanupExpiredEntries();
  const limit = checkRateLimit(`generate:${decoded.sub}`, "generate");
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
  `).get(sessionId, decoded.sub, decoded.sub) as {
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

  // System prompt base
  const sessionSettings = getSessionSettings(db, sessionId);
  // Session-aware persona: session persona → global active → undefined
  let persona: PersonaContext | null = null;
  const sessionPersonaId = (session as Record<string, unknown>).persona_id as string | undefined;
  if (sessionPersonaId) {
    const row = db.prepare(
      "SELECT name, description, personality, scenario, first_mes, mes_example, creator_notes, system_prompt, post_history_instructions, tags, writing_style, llm_model FROM personas WHERE id = ? AND user_id = ?"
    ).get(sessionPersonaId, decoded.sub) as {
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
    persona = getActivePersonaContext(decoded.sub);
  }
  const baseSystemPrompt = sessionSettings.systemPrompt || `You are a narrative roleplay engine. You narrate immersive, character-driven stories in response to user actions. Write in a literary style with vivid description. Stay in character and maintain story consistency. Keep responses to 2-4 paragraphs unless the situation demands more.`;
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

  // Update scene intent (if scene state record exists)
  if (ctx.scene.location || ctx.scene.goal) {
    db.prepare(
      `UPDATE scene_states SET emotional_tone = ? WHERE session_id = ?`
    ).run(ctx.intent, sessionId);
  }

  // Stream the response
  const encoder = new TextEncoder();
  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      eventBus.registerController(controller);
      try {
        // Resolve model: session > persona > user > default
        const userModels = getUserModels(decoded.sub);
        const resolvedModel = sessionSettings.llmModel || persona?.llmModel || userModels.llmModel;

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
          userId: decoded.sub,
          model: resolvedModel,
          temperature: sessionSettings.temperature ?? undefined,
          top_p: sessionSettings.topP ?? undefined,
          num_ctx: sessionSettings.numCtx ?? undefined,
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

        // Auto-extract scene state from recent messages
        try {
          await extractAndApplySceneState(sessionId, decoded.sub);
          eventBus.emit(`${SessionEvents.SCENE_UPDATED}:${sessionId}`, { sessionId });
        } catch (err: unknown) {
          // Extraction failure should not break generation flow
          // extractAndApplySceneState already logs warnings internally
        }

        // Queue background jobs for async processing
        // High priority: summarize the new message
        queueJob(decoded.sub, "summarize_messages", {
          sessionId,
          messageId: aiMessageId,
          content: fullResponse,
        }, "high", session.universe_id || undefined);

        // High priority: generate embeddings for the new message
        queueJob(decoded.sub, "generate_embeddings", {
          sessionId,
          messageId: aiMessageId,
          content: fullResponse,
          entityType: "message",
          entityId: aiMessageId,
        }, "high", session.universe_id || undefined);

        // Medium priority: analyze relationship impacts
        queueJob(decoded.sub, "analyze_relationships", {
          sessionId,
          messageId: aiMessageId,
          content: fullResponse,
        }, "medium", session.universe_id || undefined);

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
