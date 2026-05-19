import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { generateTextStream, isOllamaAvailable, checkOllamaConnection, getUserModels, getActivePersonaContext, buildPersonaPrompt } from "@/lib/ollama";
import { getRetrievedContext, assemblePromptWithBudget, type RetrievedContext } from "@/lib/retrieval";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { queueJob } from "@/lib/job-processor";
import { OLLAMA_CONFIG } from "@/lib/config";

function getSessionSettings(db: any, sessionId: string) {
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
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

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

  const body = await request.json();
  const { userMessage, parentMessageId } = body;

  if (!userMessage) {
    return NextResponse.json({ error: "userMessage is required" }, { status: 400 });
  }

  // L3: Skip pre-flight connection check — let generateTextStream handle
  // retries internally. The pre-check would reject immediately without
  // giving the actual generation a chance to connect.

  // System prompt base
  const sessionSettings = getSessionSettings(db, sessionId);
  const persona = getActivePersonaContext(decoded.sub);
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
      try {
        // Resolve model: session > persona > user > default
        const userModels = getUserModels(decoded.sub);
        const resolvedModel = sessionSettings.llmModel || persona?.llmModel || userModels.llmModel;

        await generateTextStream(prompt, (chunk) => {
          fullResponse += chunk;

          // Update the message in the database incrementally
          db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(
            fullResponse,
            aiMessageId
          );

          controller.enqueue(encoder.encode(JSON.stringify({ chunk }) + "\n"));
        }, {
          userId: decoded.sub,
          model: resolvedModel,
          temperature: sessionSettings.temperature ?? undefined,
          top_p: sessionSettings.topP ?? undefined,
          num_ctx: sessionSettings.numCtx ?? undefined,
        });

        // Emit generation done event
        eventBus.emit(`${SessionEvents.GENERATION_DONE}:${sessionId}`, {
          messageId: aiMessageId,
          sessionId,
          intent: ctx.intent,
          contentLength: fullResponse.length,
        });

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
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              error: error instanceof Error ? error.message : "Generation failed",
            }) + "\n"
          )
        );
        controller.close();
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
