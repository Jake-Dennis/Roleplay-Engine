import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { generateTextStream, isOllamaAvailable, checkOllamaConnection } from "@/lib/ollama";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: sessionId } = await params;
  const db = getDb();

  // Verify session access
  const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (
      SELECT session_id FROM session_participants WHERE user_id = ?
    ))
  `).get(sessionId, decoded.sub, decoded.sub);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Check Ollama connection
  if (!isOllamaAvailable()) {
    const connected = await checkOllamaConnection();
    if (!connected) {
      return NextResponse.json(
        { error: "Ollama server is not available" },
        { status: 503 }
      );
    }
  }

  const body = await request.json();
  const { userMessage, context } = body;

  if (!userMessage) {
    return NextResponse.json({ error: "userMessage is required" }, { status: 400 });
  }

  // Build the prompt from context
  const prompt = buildPrompt(context, userMessage);

  // Create the AI message placeholder
  const aiMessageId = crypto.randomUUID();
  db.prepare(
    "INSERT INTO messages (id, session_id, sender_id, content) VALUES (?, ?, NULL, '')"
  ).run(aiMessageId, sessionId);

  // Update session timestamp
  db.prepare("UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);

  // Stream the response
  const encoder = new TextEncoder();
  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await generateTextStream(prompt, (chunk) => {
          fullResponse += chunk;

          // Update the message in the database incrementally
          db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(
            fullResponse,
            aiMessageId
          );

          controller.enqueue(encoder.encode(JSON.stringify({ chunk }) + "\n"));
        });

        // Send completion signal
        controller.enqueue(
          encoder.encode(JSON.stringify({ done: true, messageId: aiMessageId }) + "\n")
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

function buildPrompt(context: any, userMessage: string): string {
  const parts: string[] = [];

  // Scene state
  if (context.sceneState) {
    parts.push("[SCENE STATE]");
    if (context.sceneState.active_location) {
      parts.push(`Location: ${context.sceneState.active_location}`);
    }
    if (context.sceneState.current_goal) {
      parts.push(`Goal: ${context.sceneState.current_goal}`);
    }
    if (context.sceneState.emotional_tone) {
      parts.push(`Tone: ${context.sceneState.emotional_tone}`);
    }
    parts.push("");
  }

  // Active relationships
  if (context.relationships && context.relationships.length > 0) {
    parts.push("[ACTIVE RELATIONSHIPS]");
    for (const rel of context.relationships) {
      parts.push(`- ${rel.source} -> ${rel.target}: ${JSON.stringify(rel.emotional_state)}`);
    }
    parts.push("");
  }

  // Active lore
  if (context.lore && context.lore.length > 0) {
    parts.push("[ACTIVE LORE]");
    for (const item of context.lore) {
      parts.push(`- ${item.name}: ${item.summary}`);
    }
    parts.push("");
  }

  // Canon rules
  if (context.canonRules) {
    parts.push("[CANON RULES]");
    parts.push(context.canonRules);
    parts.push("");
  }

  // Narrative rules
  parts.push("[NARRATIVE RULES]");
  parts.push("- Generate only what the story needs");
  parts.push("- Maintain consistent characterization");
  parts.push("- Preserve emotional continuity");
  parts.push("- Avoid full world simulation");
  parts.push("- Focus on narrative relevance");
  parts.push("");

  // Recent messages
  if (context.recentMessages && context.recentMessages.length > 0) {
    parts.push("[RECENT MESSAGES]");
    for (const msg of context.recentMessages) {
      const sender = msg.sender_name || (msg.sender_id ? "AI" : "AI");
      parts.push(`${sender}: ${msg.content}`);
    }
    parts.push("");
  }

  // User input
  parts.push("[USER INPUT]");
  parts.push(userMessage);

  return parts.join("\n");
}
