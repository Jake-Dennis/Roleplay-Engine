/**
 * Relationship Idle Tasks
 *
 * Relationship-specific idle-time processing functions. Handles scheduling
 * and execution of relationship analysis, decay, and summary refinement
 * during user idle periods.
 */

import { getDb } from "@/lib/db";
import {
  queueJob,
  processUserJobs,
} from "@/lib/job-processor";
import { getSessionsNeedingRelationshipAnalysis, processRelationshipAnalysis } from "@/lib/relationship-analysis";
import { needsDecayProcessing } from "@/lib/relationship-decay";
import { getSessionsNeedingSummaries } from "@/lib/summarization";
import { getEntitiesNeedingEmbeddings } from "@/lib/embeddings";

/**
 * Process relationship analysis for sessions that need it (Tier 2).
 */
export async function processRelationshipIdleAnalysis(
  userId: string
): Promise<number> {
  let analyzed = 0;
  const sessionsNeedingAnalysis = getSessionsNeedingRelationshipAnalysis(userId);
  for (const sessionId of sessionsNeedingAnalysis.slice(0, 3)) {
    try {
      const analysisResult = await processRelationshipAnalysis(userId, sessionId);
      analyzed += analysisResult.analyzedCount;
    } catch {
      // Skip failed sessions
    }
  }
  return analyzed;
}

/**
 * Queue relationship-related idle jobs for a user.
 * Called from queueIdleJobs to add relationship jobs to the queue.
 */
export function queueRelationshipIdleJobs(
  userId: string,
  universeId: string | null
): number {
  const db = getDb();
  let queued = 0;

  // If no universe specified, get the user's most recent active universe
  const effectiveUniverse = universeId || (() => {
    const row = db.prepare(`
      SELECT universe_id FROM sessions
      WHERE owner_id = ? AND status = 'active' AND universe_id IS NOT NULL
      ORDER BY updated_at DESC LIMIT 1
    `).get(userId) as { universe_id: string } | undefined;
    return row?.universe_id || null;
  })();

  const uid = effectiveUniverse || undefined;

  // Queue relationship decay if needed
  if (needsDecayProcessing(userId)) {
    queueJob(userId, "decay_relationships", { userId, universeId: uid }, "low", uid);
    queued++;
  }

  // Queue summarization (relationship-adjacent)
  const sessionsNeedingSummaries = getSessionsNeedingSummaries(userId);
  for (const sessionId of sessionsNeedingSummaries.slice(0, 5)) {
    queueJob(userId, "summarize_messages", { sessionId }, "low");
    queued++;
  }

  return queued;
}

/**
 * Process idle tier jobs related to relationships.
 * Called from processIdleTier for relationship-specific tier actions.
 */
export async function processRelationshipIdleTier(
  userId: string,
  tier: number,
  universeId: string | null = null
): Promise<number> {
  let queued = 0;
  const uid = universeId || undefined;

  switch (tier) {
    case 1: // 5 min idle
      queueJob(userId, "compress_memories", { userId, universeId: uid }, "idle", uid);
      queued++;
      queueJob(userId, "refine_relationship_summary", { userId, universeId: uid }, "idle", uid);
      queued++;
      break;

    case 2: // 10 min idle
      // Embeddings (always queued)
      try {
        const entitiesNeedingEmbeddings = getEntitiesNeedingEmbeddings(userId);
        for (const entity of entitiesNeedingEmbeddings.slice(0, 5)) {
          queueJob(userId, "generate_embeddings", {
            entityType: entity.entityType,
            entityId: entity.entityId,
            userId,
          }, "idle");
          queued++;
        }
      } catch { /* skip if embedding queue fails */ }
      break;

    case 3: // 15 min idle
      queueJob(userId, "archival_processing", { userId, universeId: uid }, "idle", uid);
      queued++;
      break;

    case 4: // 30 min idle
      if (needsDecayProcessing(userId)) {
        queueJob(userId, "decay_relationships", { userId, universeId: uid }, "idle", uid);
        queued++;
      }
      // Summarization (always queued)
      try {
        const sessionsNeedingSummaries = getSessionsNeedingSummaries(userId);
        for (const sessionId of sessionsNeedingSummaries.slice(0, 3)) {
          queueJob(userId, "summarize_messages", { sessionId }, "idle");
          queued++;
        }
      } catch { /* skip if summarization fails */ }
      break;
  }

  return queued;
}

/**
 * Process remaining queued jobs (Tier 4 catch-all).
 * No limit — drains the entire queue one at a time in priority order.
 * Each job handler makes its own Ollama call as needed.
 */
export async function processRemainingQueuedJobs(userId: string): Promise<number> {
  const remainingResults = await processUserJobs(userId, Infinity);
  return remainingResults.filter((r) => r.success).length;
}
