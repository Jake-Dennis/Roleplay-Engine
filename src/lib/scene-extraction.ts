import { generateText } from "@/lib/ollama";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { safeParseWarn } from "@/lib/safe-json";

interface SceneExtraction {
  location: string | null;
  goal: string | null;
  emotional_tone: string | null;
  active_npcs: string[];
  active_threads: string[];
  scene_summary: string | null;
}

/**
 * Auto-extract scene state from recent messages after each AI response.
 *
 * Fetches the last 10 messages, calls the LLM to extract scene state,
 * and upserts the result into scene_states.
 *
 * Errors are logged as warnings — no update is applied on failure.
 */
export async function extractAndApplySceneState(
  sessionId: string,
  userId: string
): Promise<void> {
  try {
    const db = getDb();

    // Fetch last 10 messages (most recent first)
    const messages = db.prepare(
      "SELECT content, sender_id FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT 10"
    ).all(sessionId) as { content: string; sender_id: string | null }[];

    if (messages.length === 0) {
      logger.debug("No messages to extract scene state from", { sessionId });
      return;
    }

    // Fetch current scene state for continuity
    const currentScene = db.prepare(
      "SELECT * FROM scene_states WHERE session_id = ?"
    ).get(sessionId) as Record<string, unknown> | undefined;

    // Format messages as "Narrator: ..." or "Player: ..."
    const formattedMessages = messages
      .reverse() // oldest first for chronological context
      .map((m) => {
        const sender = m.sender_id === null ? "Narrator" : "Player";
        return `${sender}: ${m.content}`;
      })
      .join("\n");

    // Build current scene JSON for continuity
    const currentSceneJson = currentScene
      ? JSON.stringify({
          location: currentScene.active_location_id,
          goal: currentScene.current_goal,
          emotional_tone: currentScene.emotional_tone,
          active_npcs: safeParseWarn<string[]>(currentScene.active_npcs as string, "scene active_npcs", []),
          active_threads: safeParseWarn<string[]>(currentScene.active_threads as string, "scene active_threads", []),
          scene_summary: currentScene.scene_summary,
        })
      : "{}";

    const prompt = `Extract the current scene state from these recent messages.
Return JSON with: location, goal, emotional_tone, active_npcs (array), active_threads (array), scene_summary.

Current scene state (for continuity, only update if messages indicate change):
${currentSceneJson}

Recent messages:
${formattedMessages}

Return ONLY valid JSON, no markdown, no explanation.`;

    const response = await generateText(prompt, {
      userId,
      temperature: 0.3,
    });

    const extracted = safeParseWarn<SceneExtraction>(
      response,
      "scene extraction LLM response"
    );

    if (!extracted) {
      logger.warn("Scene extraction: LLM returned invalid JSON, skipping update", {
        sessionId,
        responsePreview: response.slice(0, 200),
      });
      return;
    }

    // Upsert scene state
    const existing = db.prepare(
      "SELECT id FROM scene_states WHERE session_id = ?"
    ).get(sessionId);

    if (existing) {
      db.prepare(
        `UPDATE scene_states
         SET active_location_id = ?,
             current_goal = ?,
             emotional_tone = ?,
             active_npcs = ?,
             active_threads = ?,
             scene_summary = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = ?`
      ).run(
        extracted.location || null,
        extracted.goal || null,
        extracted.emotional_tone || null,
        JSON.stringify(extracted.active_npcs || []),
        JSON.stringify(extracted.active_threads || []),
        extracted.scene_summary || null,
        sessionId
      );
    } else {
      db.prepare(
        `INSERT INTO scene_states (id, session_id, active_location_id, current_goal, emotional_tone, active_npcs, active_threads, scene_summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        sessionId,
        extracted.location || null,
        extracted.goal || null,
        extracted.emotional_tone || null,
        JSON.stringify(extracted.active_npcs || []),
        JSON.stringify(extracted.active_threads || []),
        extracted.scene_summary || null
      );
    }

    logger.debug("Scene state extracted and applied", { sessionId });
  } catch (err: unknown) {
    logger.warn("Scene extraction failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
