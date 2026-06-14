import crypto from "crypto";
import { generateText, getActiveJobModel } from "@/lib/ollama";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { CONTENT_LIMITS } from "@/lib/config";
import { safeParseWarn } from "@/lib/safe-json";

/**
 * Resolve a list of NPC name strings to entity_registry IDs.
 * Falls back to the name itself if no matching entity is found.
 */
function resolveNpcNamesToIds(db: ReturnType<typeof getDb>, userId: string, names: string[]): string[] {
  const ids: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const found = db.prepare(
      "SELECT id FROM entity_registry WHERE display_name = ? AND user_id = ? AND entity_type = 'npc' LIMIT 1"
    ).get(trimmed, userId) as { id: string } | undefined;
    ids.push(found?.id || trimmed);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Decision Point Detection (Task 34)
// ---------------------------------------------------------------------------

/**
 * Keywords that indicate the AI is presenting a narrative choice.
 */
const AI_CHOICE_KEYWORDS = /\b(you can|(?:your\s+)?choice|choose|decide|option|either\s+.+\s+or|what do you|how do you|will you|do you (?:want|wish|prefer)|you must decide|it'?s up to you|the choice is yours)\b/i;

/**
 * Keywords that indicate a user has made a decision.
 * Designed to catch both explicit ("I choose X") and implicit ("Let's go") selections.
 */
const USER_DECISION_KEYWORDS = /\b(i (?:choose|decide|pick|select|will|shall|would like|want|'ll|will go|head)\b|(?:i'?d?\s*(?:like|prefer|rather|opt for|go with))\b|let'?s\b|we (?:will|shall|should|can|could|'ll)\b|(?:yes|no|okay|sure|fine|alright|absolutely|deal|agreed)\b)/i;

/**
 * Short acknowledgment messages that should NOT be recorded as decisions.
 * Matches very brief responses that don't convey a meaningful narrative choice.
 */
function isSimpleAcknowledgment(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 20) {
    // Only mark as acknowledgment if it doesn't contain decision-like language
    return !USER_DECISION_KEYWORDS.test(trimmed);
  }
  return false;
}

/**
 * Extract the sentence or phrase containing the choice from AI text.
 * Returns a truncated context (up to 200 chars) around the choice keyword.
 */
function extractChoicePrompt(aiText: string): string | null {
  const sentences = aiText.match(/[^.!?\n]+[.!?\n]*/g) || [aiText];
  for (const sentence of sentences) {
    if (AI_CHOICE_KEYWORDS.test(sentence)) {
      const trimmed = sentence.trim();
      return trimmed.length > 300 ? trimmed.substring(0, 297) + "..." : trimmed;
    }
  }
  return null;
}

/**
 * Extract what the user chose from their response text.
 * Returns the user message content (truncated), which serves as the "choice made".
 */
function extractChoiceMade(userText: string): string | null {
  const trimmed = userText.trim();
  if (!trimmed || isSimpleAcknowledgment(trimmed)) return null;

  // Find the sentence with decision context
  const sentences = trimmed.match(/[^.!?\n]+[.!?\n]*/g) || [trimmed];
  for (const sentence of sentences) {
    if (USER_DECISION_KEYWORDS.test(sentence)) {
      return sentence.trim().substring(0, 200);
    }
  }

  // If no explicit decision keyword but longer than an acknowledgment,
  // the user's action implies a choice — use the first sentence
  return sentences[0]?.trim().substring(0, 200) || trimmed.substring(0, 200);
}

/**
 * Detect whether the most recent AI-user message pair constitutes
 * a decision point. Uses simple keyword heuristics — no LLM calls.
 */
function isDecisionPair(aiMessage: string, userMessage: string): boolean {
  const aiHasChoice = AI_CHOICE_KEYWORDS.test(aiMessage);
  if (!aiHasChoice) return false;

  // User must not be a simple acknowledgment
  if (isSimpleAcknowledgment(userMessage)) return false;

  // User must either have decision keywords or be substantial enough
  // to imply a meaningful selection (longer than a single word/grunt)
  return USER_DECISION_KEYWORDS.test(userMessage) || userMessage.trim().length >= 40;
}

/**
 * Detect and record decision points from recent messages.
 *
 * Examines the last 2 messages (AI + user response) for choice-presenting
 * language. Uses keyword heuristics only — no LLM calls.
 *
 * Designed to be called as post-processing after scene extraction.
 */
export function detectAndRecordDecisionPoints(
  sessionId: string,
  userId: string
): void {
  try {
    const db = getDb();

    // Fetch the last 3 messages to examine the most recent AI-user exchange
    const messages = db.prepare(
      "SELECT content, sender_id FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT 3"
    ).all(sessionId) as { content: string; sender_id: string | null }[];

    if (messages.length < 2) return;

    // The most recent AI message and the user message before it
    // (or the most recent user message and the AI message before it)
    const aiMsg = messages.find(m => m.sender_id === null);
    const userMsg = messages.find(m => m.sender_id !== null);

    if (!aiMsg || !userMsg) return;

    // Check if this exchange constitutes a decision point
    if (!isDecisionPair(aiMsg.content, userMsg.content)) return;

    // Check for recent duplicate — avoid recording the same decision twice
    const recentDecision = db.prepare(
      "SELECT id FROM decision_points WHERE session_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get(sessionId) as { id: string } | undefined;

    if (recentDecision) {
      const recent = db.prepare(
        "SELECT prompt, choices_made FROM decision_points WHERE id = ?"
      ).get(recentDecision.id) as { prompt: string; choices_made: string | null } | undefined;

      if (recent) {
        const recentChoices = safeParseWarn<string[]>(recent.choices_made, "decision choices_made", []) ?? [];
        const newChoice = extractChoiceMade(userMsg.content);

        // If the same choice is already recorded with identical content, skip
        if (newChoice && recentChoices.includes(newChoice) && recent.prompt.includes(extractChoicePrompt(aiMsg.content)?.substring(0, 50) || "")) {
          logger.debug("Skipping duplicate decision point", { sessionId });
          return;
        }
      }
    }

    // Get current scene context for narrative context
    const sceneState = db.prepare(
      "SELECT scene_summary FROM scene_states WHERE session_id = ?"
    ).get(sessionId) as { scene_summary: string | null } | undefined;

    const choicePrompt = extractChoicePrompt(aiMsg.content);
    const choiceMade = extractChoiceMade(userMsg.content);

    if (!choicePrompt || !choiceMade) return;

    // Record the decision point
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO decision_points (id, session_id, user_id, prompt, choices_made, narrative_context)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      sessionId,
      userId,
      choicePrompt,
      JSON.stringify([choiceMade]),
      sceneState?.scene_summary || null
    );

    logger.debug("Decision point recorded", { sessionId, decisionId: id });
  } catch (err: unknown) {
    logger.warn("Decision point detection failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Scene Extraction
// ---------------------------------------------------------------------------

interface SceneGoal {
  goal: string;
  progress: string;
}

interface SceneConflict {
  conflict: string;
  parties: string[];
}

interface SceneExtraction {
  // Existing scene-level fields
  location: string | null;
  goal: string | null;
  emotional_tone: string | null;
  active_npcs: string[];
  active_threads: string[];
  scene_summary: string | null;

  // New scene-level fields (Task 32)
  scene_type: string | null;          // combat|exploration|dialogue|investigation|travel|downtime|ritual
  scene_tension: number | null;       // 0.0-1.0
  conflict_type: string | null;       // none|direct|indirect|internal|environmental
  stakes: string | null;              // free text

  // New session-level narrative state fields (Task 32)
  narrative_tension: number | null;   // 0-1
  pacing: number | null;              // 0-1
  narrative_phase: string | null;     // setup|rising_action|climax|falling_action|resolution|downtime
  active_goals: SceneGoal[] | null;
  active_conflicts: SceneConflict[] | null;
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

    // Fetch last 15 messages (most recent first)
    const messages = db.prepare(
      "SELECT content, sender_id FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT 15"
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
          scene_type: currentScene.scene_type ?? null,
          scene_tension: currentScene.scene_tension ?? null,
          conflict_type: currentScene.conflict_type ?? null,
          stakes: currentScene.stakes ?? null,
        })
      : "{}";

    const prompt = `Extract the current scene and narrative state from these recent messages.
Return JSON with these fields:

Scene-level fields:
- location (string): Current location/area
- goal (string): Current scene goal
- emotional_tone (string): Emotional atmosphere
- active_npcs (array of strings): NPCs present
- active_threads (array of strings): Active narrative threads
- scene_summary (string): Brief scene summary
- scene_type (string): One of: combat, exploration, dialogue, investigation, travel, downtime, ritual
- scene_tension (number): 0.0-1.0, current tension level in the scene
- conflict_type (string): One of: none, direct, indirect, internal, environmental
- stakes (string): What's at risk in this scene

Session-level narrative state fields (represent the overall session arc):
- narrative_tension (number): 0-1, overall story tension for the entire session
- pacing (number): 0-1, how fast the story is moving
- narrative_phase (string): One of: setup, rising_action, climax, falling_action, resolution, downtime
- active_goals (array of {goal: string, progress: string}): Current character goals and their progress
- active_conflicts (array of {conflict: string, parties: array of strings}): Active conflicts and involved parties

Current scene state (for continuity, only update if messages indicate change):
${currentSceneJson}

Recent messages:
${formattedMessages}

Return ONLY valid JSON, no markdown, no explanation.`;

    const response = await generateText(prompt, {
      userId,
      model: getActiveJobModel(userId),
      temperature: 0.3,
    });

    const extracted = safeParseWarn<SceneExtraction>(
      response,
      "scene extraction LLM response"
    );

    if (!extracted) {
      logger.warn("Scene extraction: LLM returned invalid JSON, skipping update", {
        sessionId,
        responsePreview: response.slice(0, CONTENT_LIMITS.SHORT),
      });
      return;
    }

    // Upsert scene state
    const existing = db.prepare(
      "SELECT id FROM scene_states WHERE session_id = ?"
    ).get(sessionId);

    // Resolve NPC names to entity IDs
    const npcNames = extracted.active_npcs || [];
    const npcIds = resolveNpcNamesToIds(db, userId, npcNames);

    if (existing) {
      db.prepare(
        `UPDATE scene_states
         SET active_location_id = ?,
             current_goal = ?,
             emotional_tone = ?,
             active_npcs = ?,
             active_npc_ids = ?,
             active_threads = ?,
             scene_summary = ?,
             scene_type = ?,
             scene_tension = ?,
             conflict_type = ?,
             stakes = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = ?`
      ).run(
        extracted.location || null,
        extracted.goal || null,
        extracted.emotional_tone || null,
        JSON.stringify(npcNames),
        JSON.stringify(npcIds),
        JSON.stringify(extracted.active_threads || []),
        extracted.scene_summary || null,
        extracted.scene_type || null,
        extracted.scene_tension ?? null,
        extracted.conflict_type || null,
        extracted.stakes || null,
        sessionId
      );
    } else {
      db.prepare(
        `INSERT INTO scene_states (id, session_id, active_location_id, current_goal, emotional_tone, active_npcs, active_npc_ids, active_threads, scene_summary, scene_type, scene_tension, conflict_type, stakes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        sessionId,
        extracted.location || null,
        extracted.goal || null,
        extracted.emotional_tone || null,
        JSON.stringify(npcNames),
        JSON.stringify(npcIds),
        JSON.stringify(extracted.active_threads || []),
        extracted.scene_summary || null,
        extracted.scene_type || null,
        extracted.scene_tension ?? null,
        extracted.conflict_type || null,
        extracted.stakes || null
      );
    }

    // Capture old narrative phase before updating (for diff-based timeline entry)
    const oldSession = db.prepare("SELECT narrative_phase FROM sessions WHERE id = ?").get(sessionId) as { narrative_phase: string | null } | undefined;
    const oldPhase = oldSession?.narrative_phase ?? null;

    // Session-level narrative state update (same atomic block as scene upsert)
    db.prepare(
      `UPDATE sessions
       SET narrative_tension = ?,
           pacing = ?,
           narrative_phase = ?,
           active_goals = ?,
           active_conflicts = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      extracted.narrative_tension ?? null,
      extracted.pacing ?? null,
      extracted.narrative_phase || null,
      extracted.active_goals ? JSON.stringify(extracted.active_goals) : null,
      extracted.active_conflicts ? JSON.stringify(extracted.active_conflicts) : null,
      sessionId
    );

    // Auto-create timeline entry for narrative phase changes
    const newPhase = extracted.narrative_phase ?? null;
    if (newPhase && oldPhase !== newPhase) {
      try {
        const entryId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO timeline_entries (id, user_id, universe_id, session_id, thread_id, title, description, occurred_at, entry_type, importance)
          VALUES (?, ?, (SELECT universe_id FROM sessions WHERE id = ?), ?, ?, ?, ?, CURRENT_TIMESTAMP, 'phase_change', 'low')
        `).run(
          entryId, userId, sessionId, sessionId, null,
          `Phase Change: ${oldPhase || "none"} → ${newPhase}`,
          `Narrative phase transitioned from ${oldPhase || "none"} to ${newPhase}`
        );
      } catch {
        // Non-fatal — timeline entry should not block scene extraction
      }
    }

    logger.debug("Scene state and narrative state extracted and applied", { sessionId });
  } catch (err: unknown) {
    logger.warn("Scene extraction failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
