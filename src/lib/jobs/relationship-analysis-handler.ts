/**
 * Relationship Analysis Job Handler
 *
 * Handles the analyze_relationships job type — updates relationship states
 * from recent messages and detects emotional polarity flips.
 */

import { getDb } from "@/lib/db";
import { processRelationshipAnalysis } from "@/lib/relationship-analysis";
import { updateJobProgress, markJobCompleted, recordEvolution, recordAnchor } from "./queue";
import { logger } from "@/lib/logger";
import type { JobPayload, JobResult } from "./types";

/**
 * Handle relationship analysis for a session.
 * Analyzes messages, updates relationships, records evolution snapshots,
 * and detects significant emotional shifts for narrative anchors.
 */
export async function handleAnalyzeRelationships(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { sessionId, userId } = payload;
  if (!sessionId || !userId) throw new Error("Missing sessionId or userId");

  updateJobProgress(jobId, 20, "Analyzing messages...");
  let result;
  try {
    result = await processRelationshipAnalysis(
      userId as string,
      sessionId as string
    );
  } catch (err) {
    logger.error("[analyze_relationships] processRelationshipAnalysis failed", { error: String(err), jobId, sessionId });
    throw err;
  }
  updateJobProgress(jobId, 80, "Updating relationships...");

  // Only record evolution for relationships that actually changed
  try {
    const db = getDb();
    const allRelationships = db.prepare(
      "SELECT id, emotional_state, relationship_stage FROM relationships WHERE user_id = ?"
    ).all(userId) as { id: string; emotional_state: string | null; relationship_stage: string | null }[];
    for (const rel of allRelationships) {
      const lastEvo = db.prepare(
        "SELECT emotional_state, relationship_stage FROM relationship_evolution WHERE relationship_id = ? ORDER BY recorded_at DESC LIMIT 1"
      ).get(rel.id) as { emotional_state: string | null; relationship_stage: string | null } | undefined;
      const stateChanged = lastEvo?.emotional_state !== rel.emotional_state;
      const stageChanged = lastEvo?.relationship_stage !== rel.relationship_stage;
      if (stateChanged || stageChanged || !lastEvo) {
        recordEvolution(rel.id, userId as string, rel.emotional_state, rel.relationship_stage, 'relationship_analysis');
      }
    }
  } catch (err) {
    logger.error("[analyze_relationships] Evolution recording failed", { error: String(err), jobId });
    throw err;
  }

  // Detect significant emotional shifts and record narrative anchors
  try {
    const db = getDb();
    const allRelationships = db.prepare(
      "SELECT id, emotional_state, relationship_stage FROM relationships WHERE user_id = ?"
    ).all(userId) as { id: string; emotional_state: string | null; relationship_stage: string | null }[];
    for (const rel of allRelationships) {
      const previousEvolution = db.prepare(
      "SELECT emotional_state FROM relationship_evolution WHERE relationship_id = ? ORDER BY recorded_at DESC LIMIT 1 OFFSET 1"
    ).get(rel.id) as { emotional_state: string | null } | undefined;

    if (previousEvolution && previousEvolution.emotional_state && rel.emotional_state) {
      const prev = previousEvolution.emotional_state;
      const curr = rel.emotional_state;
      const negativeStates = ["hateful", "hostile", "suspicious", "distant", "cold"];
      const positiveStates = ["warm", "friendly", "trusting", "loving", "devoted"];

      const wasNegative = negativeStates.includes(prev);
      const wasPositive = positiveStates.includes(prev);
      const isNegative = negativeStates.includes(curr);
      const isPositive = positiveStates.includes(curr);

      // Detect emotional polarity flip (negative ↔ positive crossing neutral)
      if ((wasNegative && isPositive) || (wasPositive && isNegative)) {
        recordAnchor(
          rel.id,
          userId as string,
          "turning_point",
          `Emotional shift from "${prev}" to "${curr}"`,
          `Crossed polarity boundary from ${prev} to ${curr}`
        );
      }
    }
    }
  } catch (err) {
    logger.error("[analyze_relationships] Anchor recording failed", { error: String(err), jobId });
    throw err;
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "analyze_relationships",
    data: { analyzedCount: result.analyzedCount },
  };
}
