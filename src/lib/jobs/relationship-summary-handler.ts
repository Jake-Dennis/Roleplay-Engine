/**
 * Relationship Summary Refinement Job Handler
 *
 * Handles the refine_relationship_summary job type — generates
 * AI-powered summaries of relationship dynamics.
 */

import { getDb } from "@/lib/db";
import { parseEmotionalState } from "@/lib/emotion-utils";
import { generateText, getActiveJobModel } from "@/lib/ollama";
import { PROMPTS } from "@/lib/prompts";
import { safeParseWarn } from "@/lib/safe-json";
import { updateJobProgress, markJobCompleted } from "./queue";
import type { JobPayload, JobResult } from "./types";

/**
 * Handle relationship summary refinement — generates a narrative summary
 * for each relationship based on its current emotional state and history.
 */
export async function handleRefineRelationshipSummary(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId } = payload;
  if (!userId) throw new Error("Missing userId");

  const db = getDb();

  let query = `
    SELECT id, source_entity, target_entity, emotional_state, shared_history
    FROM relationships
    WHERE user_id = ?
  `;
  const params: (string | number)[] = [userId];

  if (universeId) {
    query += " AND universe_id = ?";
    params.push(universeId);
  }

  const relationships = db.prepare(query).all(...params) as {
    id: string;
    source_entity: string;
    target_entity: string;
    emotional_state: string | null;
    shared_history: string | null;
  }[];

  let processed = 0;
  const totalRelationships = relationships.length;
  for (let i = 0; i < relationships.length; i++) {
    const rel = relationships[i];
    const emotions = parseEmotionalState(rel.emotional_state);
    const history = safeParseWarn<({ summary?: string } | string)[]>(rel.shared_history, "relationship shared_history", []) ?? [];

    const emotionSummary = Object.entries(emotions)
      .filter(([, v]) => (v as number) > 0.3)
      .map(([k, v]) => `${k}: ${(v as number).toFixed(2)}`)
      .join(", ");

    const prompt = PROMPTS.wikiSummarizeRelationship(
      rel.source_entity,
      rel.target_entity,
      emotionSummary || "neutral",
      history.slice(-3).map((h: { summary?: string } | string) => typeof h === 'string' ? h : (h.summary || h)).join("; ")
    );

    try {
      const summary = await generateText(prompt, { temperature: 0.2, num_predict: 1024, userId: userId as string, model: getActiveJobModel(userId as string) });
      db.prepare(
        "UPDATE relationships SET shared_history = ? WHERE id = ?"
      ).run(JSON.stringify([...history, { type: "summary", summary, at: new Date().toISOString() }]), rel.id);
      processed++;
    } catch {
      // Skip failed relationships
    }

    // Update progress every 25%
    if (totalRelationships > 4 && (i + 1) % Math.max(1, Math.floor(totalRelationships / 4)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalRelationships) * 80), `Summarizing ${i + 1}/${totalRelationships}...`);
    }
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "refine_relationship_summary",
    data: { processed },
  };
}
