/**
 * Idle-Time Processing Tiers
 * 
 * Coordinates background job processing during user idle periods.
 * Since there are no persistent background workers, processing is triggered
 * by user requests (via middleware) when enough idle time has passed.
 * 
 * Processing tiers:
 * - 5 minutes: High-priority job processing (response generation)
 * - 10 minutes: Relationship analysis, embedding generation
 * - 15 minutes: Lore expansion
 * - 30 minutes: Relationship decay, memory compression, summarization
 * 
 * The system tracks the last processing time per user and triggers
 * appropriate tier processing when a new request arrives.
 */

import { getDb } from "@/lib/db";
import {
  processUserJobs,
  processJobsByType,
  queueJob,
  type JobType,
} from "@/lib/job-processor";
import { getSessionsNeedingSummaries } from "@/lib/summarization";
import { getEntitiesNeedingEmbeddings, processEmbeddings } from "@/lib/embeddings";
import { getSessionsNeedingRelationshipAnalysis, processRelationshipAnalysis } from "@/lib/relationship-analysis";
import { getUniversesNeedingLoreExpansion, processLoreExpansion } from "@/lib/lore-expansion";
import { needsDecayProcessing } from "@/lib/relationship-decay";
import { needsMemoryCompression } from "@/lib/memory-compression";

// Processing tier thresholds (in milliseconds)
const TIER_THRESHOLDS = {
  tier1_5min: 5 * 60 * 1000,
  tier2_10min: 10 * 60 * 1000,
  tier3_15min: 15 * 60 * 1000,
  tier4_30min: 30 * 60 * 1000,
};

export interface IdleProcessingResult {
  tiersProcessed: string[];
  jobsProcessed: number;
  summariesCreated: number;
  embeddingsCreated: number;
  relationshipsAnalyzed: number;
  loreExpanded: number;
  relationshipsDecayed: number;
  memoriesCompressed: number;
  contradictionsFound: number;
}

// Track last processing time in memory (resets on server restart)
const lastProcessingTime = new Map<string, number>();

/**
 * Process idle-time jobs for a user when they make a request.
 * Called from middleware on authenticated requests.
 */
export async function processIdleTime(userId: string, universeId: string | null = null): Promise<IdleProcessingResult> {
  const now = Date.now();
  const lastTime = lastProcessingTime.get(userId) || 0;
  const idleTime = now - lastTime;

  // Don't process if less than 5 minutes have passed
  if (idleTime < TIER_THRESHOLDS.tier1_5min) {
    return {
      tiersProcessed: [],
      jobsProcessed: 0,
      summariesCreated: 0,
      embeddingsCreated: 0,
      relationshipsAnalyzed: 0,
      loreExpanded: 0,
      relationshipsDecayed: 0,
      memoriesCompressed: 0,
      contradictionsFound: 0,
    };
  }

  const result: IdleProcessingResult = {
    tiersProcessed: [],
    jobsProcessed: 0,
    summariesCreated: 0,
    embeddingsCreated: 0,
    relationshipsAnalyzed: 0,
    loreExpanded: 0,
    relationshipsDecayed: 0,
    memoriesCompressed: 0,
    contradictionsFound: 0,
  };

  // Update last processing time
  lastProcessingTime.set(userId, now);

  // Tier 1 (5+ minutes): Process high-priority jobs
  if (idleTime >= TIER_THRESHOLDS.tier1_5min) {
    result.tiersProcessed.push("5min");
    const jobResults = await processJobsByType(userId, "generate_response", 5);
    result.jobsProcessed += jobResults.filter((r) => r.success).length;
  }

  // Tier 2 (10+ minutes): Relationship analysis + embeddings
  if (idleTime >= TIER_THRESHOLDS.tier2_10min) {
    result.tiersProcessed.push("10min");

    // Process queued embedding jobs
    const embedResults = await processJobsByType(userId, "generate_embeddings", 10);
    result.jobsProcessed += embedResults.filter((r) => r.success).length;
    result.embeddingsCreated += embedResults.filter((r) => r.success).length;

    // Queue and process relationship analysis for active sessions
    const sessionsNeedingAnalysis = getSessionsNeedingRelationshipAnalysis(userId);
    for (const sessionId of sessionsNeedingAnalysis.slice(0, 3)) {
      try {
        const analysisResult = await processRelationshipAnalysis(userId, sessionId);
        result.relationshipsAnalyzed += analysisResult.analyzedCount;
      } catch {
        // Skip failed sessions
      }
    }
  }

  // Tier 3 (15+ minutes): Lore expansion + semantic contradiction scan
  if (idleTime >= TIER_THRESHOLDS.tier3_15min) {
    result.tiersProcessed.push("15min");

    const universesNeedingExpansion = universeId
      ? [universeId]
      : getUniversesNeedingLoreExpansion(userId);
    for (const uid of universesNeedingExpansion.slice(0, 2)) {
      try {
        const expansionResult = await processLoreExpansion(userId, uid);
        result.loreExpanded += expansionResult.expandedCount;
      } catch {
        // Skip failed universes
      }
    }

    // Scan unverified lore for semantic contradictions
    try {
      const { scanUnverifiedLoreForContradictions } = await import("./semantic-contradiction");
      const scanResult = await scanUnverifiedLoreForContradictions(userId);
      result.contradictionsFound += scanResult.contradictionsFound;
    } catch {
      // Skip if semantic scan fails
    }
  }

  // Tier 4 (30+ minutes): Decay, compression, summarization
  if (idleTime >= TIER_THRESHOLDS.tier4_30min) {
    result.tiersProcessed.push("30min");

    // Relationship decay (universe-scoped)
    if (needsDecayProcessing(userId)) {
      try {
        const db = getDb();
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
          id: string; source_entity: string; target_entity: string;
          emotional_state: string | null; relationship_stage: string | null;
          decay_rates: string | null; updated_at: string | null;
        }[];

        const DEFAULT_DECAY_RATES = { emotionalHalfLifeDays: 7, stageRegressionDays: 14, minEmotionalState: "neutral" };
        const EMOTIONAL_STATES = ["devoted", "loving", "trusting", "friendly", "warm", "neutral", "cold", "distant", "suspicious", "hostile", "hateful"] as const;
        const RELATIONSHIP_STAGES = ["lovers", "close_friends", "friends", "allies", "acquaintances", "strangers"] as const;

        for (const rel of relationships) {
          const rates = rel.decay_rates ? { ...DEFAULT_DECAY_RATES, ...JSON.parse(rel.decay_rates) } : DEFAULT_DECAY_RATES;
          const lastUpdate = rel.updated_at ? new Date(rel.updated_at) : new Date();
          const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceUpdate < 1) continue;

          const previousState = rel.emotional_state || "neutral";
          const previousStage = rel.relationship_stage || "acquaintances";

          const ci = EMOTIONAL_STATES.indexOf(previousState as typeof EMOTIONAL_STATES[number]);
          const ni = EMOTIONAL_STATES.indexOf("neutral");
          const mi = EMOTIONAL_STATES.indexOf(rates.minEmotionalState as typeof EMOTIONAL_STATES[number]);
          const halfLives = daysSinceUpdate / rates.emotionalHalfLifeDays;
          const steps = Math.floor(halfLives);
          let newState = previousState;
          if (steps > 0 && ci !== -1) {
            let idx = ci < ni ? Math.min(ci + steps, ni) : ci > ni ? Math.max(ci - steps, ni) : ni;
            idx = Math.max(idx, mi);
            newState = EMOTIONAL_STATES[idx];
          }

          const si = RELATIONSHIP_STAGES.indexOf(previousStage as typeof RELATIONSHIP_STAGES[number]);
          const sri = RELATIONSHIP_STAGES.indexOf("strangers");
          const periods = daysSinceUpdate / rates.stageRegressionDays;
          const rSteps = Math.floor(periods);
          let newStage = previousStage;
          if (rSteps > 0 && si !== -1) newStage = RELATIONSHIP_STAGES[Math.min(si + rSteps, sri)];

          if (newState !== previousState || newStage !== previousStage) {
            db.prepare("UPDATE relationships SET emotional_state = ?, relationship_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newState, newStage, rel.id);
            result.relationshipsDecayed++;
          }
        }
      } catch {
        // Skip if decay fails
      }
    }

    // Memory compression (universe-scoped)
    if (needsMemoryCompression(userId)) {
      try {
        const db = getDb();
        let query = `
          SELECT id, content, type, importance, created_at
          FROM narrative_memories
          WHERE user_id = ? AND created_at < datetime('now', '-7 days')
        `;
        const params: (string | number)[] = [userId];
        if (universeId) {
          query += " AND universe_id = ?";
          params.push(universeId);
        }
        query += " ORDER BY created_at ASC LIMIT 50";
        const memories = db.prepare(query).all(...params) as {
          id: string; content: string; type: string; importance: string | null; created_at: string;
        }[];

        for (const memory of memories) {
          const age = (Date.now() - new Date(memory.created_at).getTime()) / (1000 * 60 * 60 * 24);
          if (age >= 90) {
            db.prepare("UPDATE narrative_memories SET content = ?, importance = 'archived' WHERE id = ?").run(`[ARCHIVED] ${memory.content.slice(0, 100)}`, memory.id);
            result.memoriesCompressed++;
          } else if (age >= 30) {
            db.prepare("UPDATE narrative_memories SET content = ?, importance = 'low' WHERE id = ?").run(memory.content.slice(0, 200), memory.id);
            result.memoriesCompressed++;
          } else if (age >= 7) {
            db.prepare("UPDATE narrative_memories SET content = ? WHERE id = ?").run(memory.content.slice(0, 300), memory.id);
            result.memoriesCompressed++;
          }
        }
      } catch {
        // Skip if compression fails
      }
    }

    // Summarization
    const sessionsNeedingSummaries = getSessionsNeedingSummaries(userId);
    for (const sessionId of sessionsNeedingSummaries.slice(0, 3)) {
      try {
        const { queueJob } = await import("./job-processor");
        queueJob(userId, "summarize_messages", { sessionId }, "low");
      } catch {
        // Skip if queueing fails
      }
    }

    // Process remaining queued jobs
    const remainingResults = await processUserJobs(userId, 10);
    result.jobsProcessed += remainingResults.filter((r) => r.success).length;
  }

  return result;
}

/**
 * Get the time since last idle processing for a user
 */
export function getIdleTime(userId: string): number {
  const lastTime = lastProcessingTime.get(userId) || 0;
  return Date.now() - lastTime;
}

/**
 * Check if idle processing should be triggered
 */
export function shouldProcessIdleTime(userId: string): boolean {
  const idleTime = getIdleTime(userId);
  return idleTime >= TIER_THRESHOLDS.tier1_5min;
}

/**
 * Reset the idle timer for a user (called on explicit job processing)
 */
export function resetIdleTimer(userId: string): void {
  lastProcessingTime.set(userId, Date.now());
}

/**
 * Queue idle-time jobs for a user
 */
export function queueIdleJobs(userId: string, universeId: string | null = null): number {
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

  // Queue embeddings for entities that need them
  const entitiesNeedingEmbeddings = getEntitiesNeedingEmbeddings(userId);
  for (const entity of entitiesNeedingEmbeddings.slice(0, 10)) {
    queueJob(userId, "generate_embeddings", {
      entityType: entity.entityType,
      entityId: entity.entityId,
      userId,
    }, "low");
    queued++;
  }

  // Queue summarization for sessions that need it
  const sessionsNeedingSummaries = getSessionsNeedingSummaries(userId);
  for (const sessionId of sessionsNeedingSummaries.slice(0, 5)) {
    queueJob(userId, "summarize_messages", { sessionId }, "low");
    queued++;
  }

  // Queue relationship analysis for active sessions
  const sessionsNeedingAnalysis = getSessionsNeedingRelationshipAnalysis(userId);
  for (const sessionId of sessionsNeedingAnalysis.slice(0, 3)) {
    queueJob(userId, "analyze_relationships", { sessionId, userId }, "low");
    queued++;
  }

  // Queue lore expansion for active universes
  const universesNeedingExpansion = effectiveUniverse
    ? [effectiveUniverse]
    : getUniversesNeedingLoreExpansion(userId);
  for (const uid of universesNeedingExpansion.slice(0, 2)) {
    queueJob(userId, "expand_lore", { universeId: uid, userId }, "low", uid);
    queued++;
  }

  // Queue decay if needed
  if (needsDecayProcessing(userId)) {
    queueJob(userId, "decay_relationships", { userId, universeId: effectiveUniverse || undefined }, "low", effectiveUniverse || undefined);
    queued++;
  }

  // Queue compression if needed
  if (needsMemoryCompression(userId)) {
    queueJob(userId, "compress_memories", { userId, universeId: effectiveUniverse || undefined }, "low", effectiveUniverse || undefined);
    queued++;
  }

  return queued;
}

/**
 * Process idle tier jobs triggered by client-side heartbeat.
 * Called when the client detects user inactivity and reports a tier change.
 *
 * Tiers:
 * 1 (5 min):  memory_compression, refine_relationship_summary
 * 2 (10 min): lore_deepening, enrich_npc, retrieval_optimization
 * 3 (15 min): expand_rumors, archival_processing
 * 4 (30 min): decay_relationships
 */
export async function processIdleTier(
  userId: string,
  tier: number,
  _currentPage: string,
  universeId: string | null = null
): Promise<{ jobsQueued: number; tier: number }> {
  let queued = 0;
  const uid = universeId || undefined; // Convert null to undefined for payload compatibility

  try {
    switch (tier) {
      case 1: // 5 min idle
        // Queue memory compression
        if (needsMemoryCompression(userId)) {
          queueJob(userId, "compress_memories", { userId, universeId: uid }, "idle", uid);
          queued++;
        }
        // Queue relationship summary refinement
        queueJob(userId, "refine_relationship_summary", { userId, universeId: uid }, "idle", uid);
        queued++;
        break;

      case 2: // 10 min idle
        // Queue lore deepening
        try {
          const universesNeedingExpansion = uid
            ? [uid]
            : getUniversesNeedingLoreExpansion(userId);
          for (const u of universesNeedingExpansion.slice(0, 2)) {
            queueJob(userId, "expand_lore", { universeId: u, userId }, "idle", u);
            queued++;
          }
        } catch { /* skip if lore expansion fails */ }
        // Queue NPC enrichment
        queueJob(userId, "enrich_npc", { userId, universeId: uid }, "idle", uid);
        queued++;
        // Queue retrieval optimization (embeddings)
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
        // Queue rumor expansion
        queueJob(userId, "expand_rumors", { userId, universeId: uid }, "idle", uid);
        queued++;
        // Queue archival processing
        queueJob(userId, "archival_processing", { userId, universeId: uid }, "idle", uid);
        queued++;
        break;

      case 4: // 30 min idle
        // Queue relationship decay
        if (needsDecayProcessing(userId)) {
          queueJob(userId, "decay_relationships", { userId, universeId: uid }, "idle", uid);
          queued++;
        }
        // Also queue summarization for sessions that need it
        try {
          const sessionsNeedingSummaries = getSessionsNeedingSummaries(userId);
          for (const sessionId of sessionsNeedingSummaries.slice(0, 3)) {
            queueJob(userId, "summarize_messages", { sessionId }, "idle");
            queued++;
          }
        } catch { /* skip if summarization fails */ }
        break;
    }
  } catch {
    // Log but don't throw — heartbeat should always succeed
  }

  return { jobsQueued: queued, tier };
}
