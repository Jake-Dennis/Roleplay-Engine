/**
 * NPC Evolution Job Handler
 *
 * Analyzes recent message interactions involving an NPC and suggests
 * trait updates based on observed behavior. Skips canon NPCs.
 */

import { getDb } from "@/lib/db";
import { generateText } from "@/lib/ollama";
import { safeParseWarn } from "@/lib/safe-json";
import type { JobPayload, JobResult } from "@/lib/job-processor";
import { updateJobProgress, markJobCompleted, queueJob } from "@/lib/job-processor";

// ---------------------------------------------------------------------------
// Job Handler
// ---------------------------------------------------------------------------

/**
 * npc_evolution: Analyze NPC interactions and evolve traits.
 */
export async function handleNpcEvolutionJob(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId, npcId } = payload;
  if (!userId || !npcId) throw new Error("Missing userId or npcId");

  const db = getDb();

  updateJobProgress(jobId, 10, "Fetching NPC data...");

  // Fetch NPC
  const npc = db.prepare(
    "SELECT * FROM npcs WHERE id = ? AND user_id = ?"
  ).get(npcId, userId) as {
    id: string;
    name: string;
    description: string | null;
    personality_traits: string | null;
    behavior_patterns: string | null;
    is_canon: number;
    evolution_log: string | null;
  } | undefined;

  if (!npc) throw new Error("NPC not found");

  updateJobProgress(jobId, 20, "Checking canon status...");

  // Skip if canon — canon NPCs are immutable
  if (npc.is_canon) {
    markJobCompleted(jobId);
    return {
      success: true,
      jobId,
      type: "npc_evolution",
      data: { skipped: true, reason: "canon", npcName: npc.name },
    };
  }

  updateJobProgress(jobId, 30, "Finding relevant messages...");

  // Find recent messages mentioning the NPC name within the universe's sessions
  const messages = db.prepare(`
    SELECT m.content, m.sender_id, m.timestamp
    FROM messages m
    WHERE m.session_id IN (
      SELECT s.id FROM sessions s WHERE s.universe_id = ?
    )
    AND LOWER(m.content) LIKE LOWER(?)
    AND m.is_deleted = 0
    ORDER BY m.timestamp DESC
    LIMIT 50
  `).all(universeId || "", `%${npc.name}%`) as {
    content: string;
    sender_id: string | null;
    timestamp: string;
  }[];

  if (messages.length === 0) {
    markJobCompleted(jobId);
    return {
      success: true,
      jobId,
      type: "npc_evolution",
      data: { skipped: true, reason: "no_interactions", npcName: npc.name },
    };
  }

  updateJobProgress(jobId, 50, "Analyzing interactions...");

  // Build interaction transcript for the LLM
  const interactionText = messages
    .reverse()
    .map((m) => `${m.sender_id === null ? "AI" : "Player"}: ${m.content}`)
    .join("\n");

  const currentTraits = npc.personality_traits || "No traits defined";
  const currentBehavior = npc.behavior_patterns || "No behavior patterns defined";

  const prompt = buildEvolutionPrompt(npc.name, currentTraits, currentBehavior, interactionText);

  const response = await generateText(prompt, {
    temperature: 0.4,
    userId: userId as string,
  });

  updateJobProgress(jobId, 80, "Updating NPC...");

  // Parse the LLM response
  const evolution = parseEvolutionResponse(response);

  if (!evolution) {
    markJobCompleted(jobId);
    return {
      success: true,
      jobId,
      type: "npc_evolution",
      data: { skipped: true, reason: "unparseable_response", npcName: npc.name },
    };
  }

  // Build updated traits JSON
  const newTraits = JSON.stringify(evolution.traits);
  const newBehavior = evolution.behaviorPatterns
    ? JSON.stringify(evolution.behaviorPatterns)
    : npc.behavior_patterns;

  // Append to evolution log
  const logEntry = {
    timestamp: new Date().toISOString(),
    reason: "message_interaction_analysis",
    messagesAnalyzed: messages.length,
    previousTraits: currentTraits,
    newTraits: evolution.traits,
    behaviorChanges: evolution.behaviorChanges || [],
  };

  const existingLog = npc.evolution_log
    ? safeParseWarn<Array<Record<string, unknown>>>(npc.evolution_log, "npc evolution_log", []) ?? []
    : [];
  existingLog.push(logEntry);
  const updatedLog = JSON.stringify(existingLog);

  // Update NPC record
  db.prepare(`
    UPDATE npcs
    SET personality_traits = ?, behavior_patterns = ?, evolution_log = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newTraits, newBehavior, updatedLog, npcId);

  markJobCompleted(jobId);

  // Chain: sync updated NPC traits to wiki entity page (best-effort, non-fatal)
  try {
    queueJob(userId as string, "npc_wiki_sync", { userId, npcId, universeId }, "low", universeId as string | undefined);
  } catch {
    /* non-fatal — wiki sync failure does not break evolution */
  }

  return {
    success: true,
    jobId,
    type: "npc_evolution",
    data: {
      npcName: npc.name,
      messagesAnalyzed: messages.length,
      traitsUpdated: evolution.traits,
      behaviorChanges: evolution.behaviorChanges || [],
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the analysis prompt for NPC evolution.
 */
function buildEvolutionPrompt(
  npcName: string,
  currentTraits: string,
  currentBehavior: string,
  interactionText: string,
): string {
  return `You are analyzing the character development of an NPC named "${npcName}" based on recent roleplay interactions.

Current personality traits: ${currentTraits}
Current behavior patterns: ${currentBehavior}

Recent interactions (most recent last):
---
${interactionText}
---

Analyze how "${npcName}" has been portrayed in these interactions. Consider:
1. How the NPC responds to players and situations
2. Emotional patterns and reactions shown
3. Any emerging behavioral tendencies not captured in current traits
4. Whether existing traits should be strengthened, weakened, or modified

Respond with a JSON object in this exact format:
{
  "traits": {
    "trait_name": numeric_value_0_to_1,
    ...
  },
  "behaviorPatterns": ["pattern1", "pattern2", ...],
  "behaviorChanges": ["description of what changed and why", ...],
  "reasoning": "brief explanation of the evolution"
}

The traits object should include all current traits (possibly modified) plus any new traits that emerged. Values must be between 0 and 1.
The behaviorPatterns array should describe observable behavioral tendencies.
The behaviorChanges array should describe specific changes made and why.
Keep reasoning concise (1-2 sentences).

Return ONLY the JSON object, no markdown formatting, no explanation.`;
}

/**
 * Parse the LLM response into a structured evolution result.
 */
function parseEvolutionResponse(response: string): {
  traits: Record<string, number>;
  behaviorPatterns: string[];
  behaviorChanges: string[];
  reasoning: string;
} | null {
  try {
    // Try direct parse first
    let parsed = safeParseWarn<Record<string, unknown>>(response, "npc evolution response");

    // If that fails, try to extract JSON from the response
    if (!parsed) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = safeParseWarn<Record<string, unknown>>(jsonMatch[0], "npc evolution response (extracted)");
      }
    }

    if (!parsed) return null;

    const traits = parsed.traits as Record<string, number> | undefined;
    if (!traits || Object.keys(traits).length === 0) return null;

    // Normalize trait values to 0-1 range
    const normalizedTraits: Record<string, number> = {};
    for (const [key, value] of Object.entries(traits)) {
      const num = typeof value === "number" ? value : parseFloat(String(value));
      if (!isNaN(num)) {
        normalizedTraits[key] = Math.min(1, Math.max(0, num));
      }
    }

    return {
      traits: normalizedTraits,
      behaviorPatterns: Array.isArray(parsed.behaviorPatterns)
        ? parsed.behaviorPatterns.map(String)
        : [],
      behaviorChanges: Array.isArray(parsed.behaviorChanges)
        ? parsed.behaviorChanges.map(String)
        : [],
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch {
    return null;
  }
}
