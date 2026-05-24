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
import { needsDecayProcessing } from "@/lib/relationship-decay";
import { needsMemoryCompression } from "@/lib/memory-compression";
import { IDLE_TIERS } from "@/lib/config";

// Extracted idle task modules
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import {
  wikiCompressSummaries,
  wikiRefineRelationships,
  wikiDeepenPages,
  wikiEnrichEntities,
  wikiGenerateRumors,
  wikiArchive,
  wikiDecayRelationships,
} from "./idle/wiki-tasks";
import {
  processRelationshipIdleAnalysis,
  queueRelationshipIdleJobs,
  processRelationshipIdleTier,
  processRemainingQueuedJobs,
} from "./idle/relationship-tasks";

// Processing tier thresholds (in milliseconds)
const TIER_THRESHOLDS = {
  tier1_5min: IDLE_TIERS.TIER_1,
  tier2_10min: IDLE_TIERS.TIER_2,
  tier3_15min: IDLE_TIERS.TIER_3,
  tier4_30min: IDLE_TIERS.TIER_4,
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
  // Wiki-specific metrics
  wikiPagesCreated: number;
  wikiPagesUpdated: number;
  wikiPagesArchived: number;
  wikiRumorsGenerated: number;
  wikiEntitiesEnriched: number;
  wikiRelationshipsDecayed: number;
}

// Track last processing time in memory (resets on server restart)
const lastProcessingTime = new Map<string, number>();

/**
 * Throttle for stale entry cleanup — prevents running on every processIdleTime call.
 */
let lastCleanupTime = 0;
const CLEANUP_THROTTLE_MS = 60_000; // 60 seconds
const STALE_ENTRY_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Remove entries older than 24 hours to prevent unbounded Map growth.
 */
function cleanupStaleProcessingEntries(): void {
  const now = Date.now();
  for (const [userId, timestamp] of lastProcessingTime.entries()) {
    if (now - timestamp > STALE_ENTRY_MAX_AGE_MS) {
      lastProcessingTime.delete(userId);
    }
  }
}

// ---------------------------------------------------------------------------
// Main Processing
// ---------------------------------------------------------------------------

/**
 * Process idle-time jobs for a user when they make a request.
 * Called from middleware on authenticated requests.
 */
export async function processIdleTime(userId: string, universeId: string | null = null): Promise<IdleProcessingResult> {
  // Throttled stale-entry cleanup
  const now = Date.now();
  if (now - lastCleanupTime > CLEANUP_THROTTLE_MS) {
    cleanupStaleProcessingEntries();
    lastCleanupTime = now;
  }

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
      wikiPagesCreated: 0,
      wikiPagesUpdated: 0,
      wikiPagesArchived: 0,
      wikiRumorsGenerated: 0,
      wikiEntitiesEnriched: 0,
      wikiRelationshipsDecayed: 0,
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
    wikiPagesCreated: 0,
    wikiPagesUpdated: 0,
    wikiPagesArchived: 0,
    wikiRumorsGenerated: 0,
    wikiEntitiesEnriched: 0,
    wikiRelationshipsDecayed: 0,
  };

  // Update last processing time
  lastProcessingTime.set(userId, now);

  const uid = universeId || undefined;

  // Tier 1 (5+ minutes): Process high-priority jobs
  if (idleTime >= TIER_THRESHOLDS.tier1_5min) {
    result.tiersProcessed.push("5min");

    // Wiki: compress summaries + refine relationships
    try {
      const compressResult = await wikiCompressSummaries(userId, uid);
      result.wikiPagesUpdated += compressResult.compressed;
      result.memoriesCompressed += compressResult.compressed;
    } catch { /* non-fatal */ }

    try {
      const refineResult = await wikiRefineRelationships(userId, uid);
      result.wikiPagesCreated += refineResult.refined;
      result.relationshipsAnalyzed += refineResult.refined;
    } catch { /* non-fatal */ }

  }

  // Tier 2 (10+ minutes): Relationship analysis + embeddings
  if (idleTime >= TIER_THRESHOLDS.tier2_10min) {
    result.tiersProcessed.push("10min");

    // Wiki: deepen pages + enrich entities
    try {
      const deepenResult = await wikiDeepenPages(userId, uid);
      result.wikiPagesUpdated += deepenResult.deepened;
      result.loreExpanded += deepenResult.deepened;
    } catch { /* non-fatal */ }

    try {
      const enrichResult = await wikiEnrichEntities(userId, uid);
      result.wikiEntitiesEnriched += enrichResult.enriched;
      result.wikiPagesUpdated += enrichResult.enriched;
    } catch { /* non-fatal */ }

    const embedResults = await processJobsByType(userId, "generate_embeddings", 10);
    result.jobsProcessed += embedResults.filter((r) => r.success).length;
    result.embeddingsCreated += embedResults.filter((r) => r.success).length;

    // Relationship analysis
    const analyzedCount = await processRelationshipIdleAnalysis(userId);
    result.relationshipsAnalyzed += analyzedCount;
  }

  // Tier 3 (15+ minutes): Lore expansion + semantic contradiction scan
  if (idleTime >= TIER_THRESHOLDS.tier3_15min) {
    result.tiersProcessed.push("15min");

    // Wiki: generate rumors + archive low-importance pages
    try {
      const rumorResult = await wikiGenerateRumors(userId, uid);
      result.wikiRumorsGenerated += rumorResult.rumorsGenerated;
      result.wikiPagesCreated += rumorResult.rumorsGenerated;
    } catch { /* non-fatal */ }

    try {
      const archiveResult = await wikiArchive(userId, uid);
      result.wikiPagesArchived += archiveResult.archived;
      result.memoriesCompressed += archiveResult.archived;
    } catch { /* non-fatal */ }
  }

  // Tier 4 (30+ minutes): Decay, compression, summarization
  if (idleTime >= TIER_THRESHOLDS.tier4_30min) {
    result.tiersProcessed.push("30min");

    // Wiki: decay relationships via wiki pages
    try {
      const decayResult = await wikiDecayRelationships(userId, uid);
      result.wikiRelationshipsDecayed += decayResult.decayed;
      result.relationshipsDecayed += decayResult.decayed;
    } catch { /* non-fatal */ }

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

        const pendingUpdates: { id: string; content: string; importance: string | null }[] = [];

        for (const memory of memories) {
          const age = (Date.now() - new Date(memory.created_at).getTime()) / (1000 * 60 * 60 * 24);
          if (age >= 90) {
            pendingUpdates.push({ id: memory.id, content: `[ARCHIVED] ${memory.content.slice(0, 100)}`, importance: "archived" });
            result.memoriesCompressed++;
          } else if (age >= 30) {
            pendingUpdates.push({ id: memory.id, content: memory.content.slice(0, 200), importance: "low" });
            result.memoriesCompressed++;
          } else if (age >= 7) {
            pendingUpdates.push({ id: memory.id, content: memory.content.slice(0, 500), importance: null });
            result.memoriesCompressed++;
          }
        }

        if (pendingUpdates.length > 0) {
          const batchUpdate = db.transaction((updates: { id: string; content: string; importance: string | null }[]) => {
            const withImportance = db.prepare(
              "UPDATE narrative_memories SET content = ?, importance = ? WHERE id = ?"
            );
            const withoutImportance = db.prepare(
              "UPDATE narrative_memories SET content = ? WHERE id = ?"
            );
            for (const { id, content, importance } of updates) {
              if (importance !== null) {
                withImportance.run(content, importance, id);
              } else {
                withoutImportance.run(content, id);
              }
            }
          });
          batchUpdate(pendingUpdates);
        }
      } catch {
        // Skip if compression fails
      }
    }

    // Summarization
    const sessionsNeedingSummaries = getSessionsNeedingSummaries(userId);
    for (const sessionId of sessionsNeedingSummaries.slice(0, 3)) {
      try {
        queueJob(userId, "summarize_messages", { sessionId }, "low");
      } catch {
        // Skip if queueing fails
      }
    }

    // Process remaining queued jobs
    const remainingCount = await processRemainingQueuedJobs(userId);
    result.jobsProcessed += remainingCount;
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
  let queued = 0;

  // Wiki job queueing
  // Queue wiki ingest for lore entries
  queueJob(userId, "extract_lore_comprehensive", { userId, universeId: universeId || undefined }, "low", universeId || undefined);
  queued++;

  // Queue wiki entity enrichment
  queueJob(userId, "wiki_enrich_entity", { userId, universeId: universeId || undefined }, "low", universeId || undefined);
  queued++;

  // Queue wiki rumor generation
  queueJob(userId, "wiki_generate_rumors", { userId, universeId: universeId || undefined }, "low", universeId || undefined);
  queued++;

  // Queue wiki page deepening
  queueJob(userId, "wiki_deepen_page", { userId, universeId: universeId || undefined }, "low", universeId || undefined);
  queued++;

  // Relationship-related queueing
  queued += queueRelationshipIdleJobs(userId, universeId);

  return queued;
}

/**
 * Process idle tier jobs triggered by client-side heartbeat.
 * Called when the client detects user inactivity and reports a tier change.
 *
 * Tiers:
 * 1 (5 min):  compress_memories, refine_relationship_summary
 * 2 (10 min): wiki_deepen_page, wiki_enrich_entity, generate_embeddings
 * 3 (15 min): wiki_generate_rumors, archival_processing
 * 4 (30 min): decay_relationships, summarize_messages
 */
export async function processIdleTier(
  userId: string,
  tier: number,
  _currentPage: string,
  universeId: string | null = null
): Promise<{ jobsQueued: number; tier: number }> {
  let queued = 0;

  try {
    switch (tier) {
      case 1: // 5 min idle
        queueJob(userId, "compress_memories", { userId, universeId: universeId || undefined }, "idle", universeId || undefined);
        queued++;
        queueJob(userId, "refine_relationship_summary", { userId, universeId: universeId || undefined }, "idle", universeId || undefined);
        queued++;
        break;

      case 2: // 10 min idle
        queueJob(userId, "wiki_deepen_page", { userId, universeId: universeId || undefined }, "idle", universeId || undefined);
        queued++;
        queueJob(userId, "wiki_enrich_entity", { userId, universeId: universeId || undefined }, "idle", universeId || undefined);
        queued++;
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
        queueJob(userId, "wiki_generate_rumors", { userId, universeId: universeId || undefined }, "idle", universeId || undefined);
        queued++;
        queueJob(userId, "archival_processing", { userId, universeId: universeId || undefined }, "idle", universeId || undefined);
        queued++;
        break;

      case 4: // 30 min idle
        if (needsDecayProcessing(userId)) {
          queueJob(userId, "decay_relationships", { userId, universeId: universeId || undefined }, "idle", universeId || undefined);
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
  } catch {
    // Log but don't throw — heartbeat should always succeed
  }

  // Process all queued jobs (including ones queued during generation, like
  // scene_state_extract, wiki_auto_extract, summarize_messages, etc.)
  // This is the only automatic path where queued jobs actually get processed.
  try {
    const results = await processUserJobs(userId, 10);
    queued += results.filter((r) => r.success).length;
  } catch {
    // Job processing errors are handled per-job; this catch is a safety net
  }

  return { jobsQueued: queued, tier };
}
