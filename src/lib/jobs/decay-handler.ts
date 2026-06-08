/**
 * Relationship Decay Job Handler
 *
 * Handles the decay_relationships job type — applies time-based
 * emotional state decay and relationship stage regression.
 */

import { TIME } from "@/lib/config";
import { getDb } from "@/lib/db";
import { safeParseWarn } from "@/lib/safe-json";
import { DEFAULT_DECAY_RATES, EMOTIONAL_STATES, RELATIONSHIP_STAGES } from "@/lib/relationship-decay";
import { updateJobProgress, markJobCompleted, recordEvolution } from "./queue";
import type { JobPayload, JobResult } from "./types";

/**
 * Handle relationship decay — applies time-based emotional and stage
 * decay to relationships that haven't been updated recently.
 */
export async function handleDecayRelationships(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId } = payload;
  if (!userId) throw new Error("Missing userId");

  const db = getDb();

  // Get relationships scoped to universe
  let query = `
    SELECT r.id, r.source_entity, r.target_entity, r.emotional_state, r.relationship_stage,
           r.decay_rates, r.updated_at
    FROM relationships r
    WHERE r.user_id = ?
  `;
  const params: (string | number)[] = [userId];

  if (universeId) {
    query += " AND r.universe_id = ?";
    params.push(universeId);
  }

  const relationships = db.prepare(query).all(...params) as {
    id: string;
    source_entity: string;
    target_entity: string;
    emotional_state: string | null;
    relationship_stage: string | null;
    decay_rates: string | null;
    updated_at: string | null;
  }[];

  let decayedCount = 0;
  const totalRelationships = relationships.length;
  const pendingUpdates: { id: string; state: string; stage: string }[] = [];

  for (let i = 0; i < relationships.length; i++) {
    const rel = relationships[i];
    const rates = rel.decay_rates
      ? { ...DEFAULT_DECAY_RATES, ...safeParseWarn<Partial<typeof DEFAULT_DECAY_RATES>>(rel.decay_rates, "relationship decay_rates", {}) }
      : DEFAULT_DECAY_RATES;

    const lastUpdate = rel.updated_at ? new Date(rel.updated_at) : new Date();
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / TIME.ONE_DAY;
    if (daysSinceUpdate < 1) continue;

    const previousState = rel.emotional_state || "neutral";
    const previousStage = rel.relationship_stage || "acquaintances";

    // Apply emotional decay
    const currentIndex = EMOTIONAL_STATES.indexOf(previousState as typeof EMOTIONAL_STATES[number]);
    const neutralIndex = EMOTIONAL_STATES.indexOf("neutral");
    const minIndex = EMOTIONAL_STATES.indexOf(rates.minEmotionalState as typeof EMOTIONAL_STATES[number]);
    const halfLives = daysSinceUpdate / rates.emotionalHalfLifeDays;
    const stepsToDecay = Math.floor(halfLives);

    let newState = previousState;
    if (stepsToDecay > 0 && currentIndex !== -1) {
      let newIndex: number;
      if (currentIndex < neutralIndex) {
        newIndex = Math.min(currentIndex + stepsToDecay, neutralIndex);
      } else if (currentIndex > neutralIndex) {
        newIndex = Math.max(currentIndex - stepsToDecay, neutralIndex);
      } else {
        newIndex = neutralIndex;
      }
      newIndex = Math.max(newIndex, minIndex);
      newState = EMOTIONAL_STATES[newIndex];
    }

    // Apply stage regression
    const stageIndex = RELATIONSHIP_STAGES.indexOf(previousStage as typeof RELATIONSHIP_STAGES[number]);
    const strangerIndex = RELATIONSHIP_STAGES.indexOf("strangers");
    const periods = daysSinceUpdate / rates.stageRegressionDays;
    const stepsToRegress = Math.floor(periods);

    let newStage = previousStage;
    if (stepsToRegress > 0 && stageIndex !== -1) {
      const newIndex = Math.min(stageIndex + stepsToRegress, strangerIndex);
      newStage = RELATIONSHIP_STAGES[newIndex];
    }

    if (newState !== previousState || newStage !== previousStage) {
      pendingUpdates.push({ id: rel.id, state: newState, stage: newStage });
      decayedCount++;
    }

    // Update progress every 25% of relationships
    if (totalRelationships > 4 && (i + 1) % Math.max(1, Math.floor(totalRelationships / 4)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalRelationships) * 80), `Processing ${i + 1}/${totalRelationships}...`);
    }
  }

  // Execute all batch updates in a single transaction
  if (pendingUpdates.length > 0) {
    const batchUpdate = db.transaction((updates: { id: string; state: string; stage: string }[]) => {
      const stmt = db.prepare(
        "UPDATE relationships SET emotional_state = ?, relationship_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      );
      for (const { id, state, stage } of updates) {
        stmt.run(state, stage, id);
      }
    });
    batchUpdate(pendingUpdates);

    // Record evolution after decay for each updated relationship
    for (const update of pendingUpdates) {
      recordEvolution(update.id, userId, update.state, update.stage, 'decay');
    }
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "decay_relationships",
    data: { decayedCount },
  };
}
