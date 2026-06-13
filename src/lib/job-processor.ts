/**
 * Job Queue Processor
 * 
 * Thin orchestrator for processing queued background jobs.
 * Handlers are extracted into src/lib/jobs/ modules.
 * 
 * Job types:
 * - summarize_messages: Compress old messages into summaries
 * - generate_embeddings: Create vector embeddings for entities
 * - analyze_relationships: Update relationship states from recent messages
 * - expand_lore: Generate new lore entries with contradiction checks
 * - decay_relationships: Apply time-based relationship decay
 * - compress_memories: Archive and compress old narrative memories
 */

import { safeParseWarn } from "@/lib/safe-json";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Re-exports — all symbols remain importable from "@/lib/job-processor"
// ---------------------------------------------------------------------------

// Types & constants
export {
  type JobType,
  type JobPriority,
  type JobStatus,
  type JobPayload,
  type QueuedJob,
  type JobResult,
  DEDUP_WINDOW_MS,
  JOB_DEBOUNCE_INTERVALS,
  JOB_RETENTION_DAYS,
} from "./jobs/types";

// Queue management + relationship evolution
export {
  queueJob,
  getNextJob,
  getUserJobs,
  markJobProcessing,
  updateJobProgress,
  markJobCompleted,
  markJobFailed,
  cancelJob,
  cancelAllUserJobs,
  retryJob,
  retryAllFailedJobs,
  getJobStats,
  recoverStaleJobs,
  reapOldJobs,
  recordEvolution,
  recordAnchor,
  backfillRelationshipEvolution,
} from "./jobs/queue";

// ---------------------------------------------------------------------------
// Imports for local use
// ---------------------------------------------------------------------------

import type { JobType, JobPayload, QueuedJob, JobResult } from "./jobs/types";
import { getNextJob, markJobProcessing, markJobFailed } from "./jobs/queue";
import { isOllamaBusy } from "@/lib/ollama-busy";

// Existing job handlers
import { handleSummarizationJob } from "./jobs/summarization-handler";
import { handleWikiJob } from "./jobs/wiki-handler";
import { handleNpcEvolutionJob } from "./jobs/npc-evolution";
import { handleLoreExtractionJob } from "./jobs/lore-extraction";
import { handleSessionRecapJob } from "./jobs/session-recap";
import { handleSceneStateExtract } from "./jobs/scene-handler";
import { handleNpcWikiSync } from "./jobs/npc-wiki-sync";

// New job handlers (Phase 3A extraction)
import { handleGenerateEmbeddings } from "./jobs/embedding-handler";
import { handleAnalyzeRelationships } from "./jobs/relationship-analysis-handler";
import { handleDecayRelationships } from "./jobs/decay-handler";
import { handleRefineRelationshipSummary } from "./jobs/relationship-summary-handler";
import { handleArchivalProcessing } from "./jobs/archival-handler";
import { handleThreadAnalysis } from "./jobs/thread-analysis-handler";
import { handleWikiSuggestRestructure } from "./jobs/wiki-restructure-suggestions";
import { process as handleGenerateChoices } from "./jobs/choices-handler";
import { process as handleEntityRefUpdate } from "./jobs/entity-ref-handler";

// ---------------------------------------------------------------------------
// Job Processing
// ---------------------------------------------------------------------------

/**
 * Process a single job by dispatching to the appropriate handler
 */
export async function processJob(job: QueuedJob): Promise<JobResult> {
  markJobProcessing(job.id);

  try {
    const payload: JobPayload = safeParseWarn<JobPayload>(job.payload, "job payload") ?? {};

    switch (job.type) {
      case "summarize_messages":
      case "compress_memories":
        return await handleSummarizationJob(job.id, payload, job.type);
      case "generate_embeddings":
        return await handleGenerateEmbeddings(job.id, payload);
      case "analyze_relationships":
        return await handleAnalyzeRelationships(job.id, payload);
      case "decay_relationships":
        return await handleDecayRelationships(job.id, payload);
      case "refine_relationship_summary":
        return await handleRefineRelationshipSummary(job.id, payload);
      case "archival_processing":
        return await handleArchivalProcessing(job.id, payload);
      case "thread_analysis":
        return await handleThreadAnalysis(job.id, payload);
      case "scene_state_extract":
        return await handleSceneStateExtract(job.id, payload);
      // Wiki-native job types
      case "wiki_ingest":
      case "wiki_enrich_entity":
      case "wiki_generate_rumors":
      case "wiki_deepen_page":
      case "wiki_deepen_location":
      case "wiki_extract_event":
      case "wiki_auto_extract":
      case "wiki_create_entity":
      case "wiki_curate_page":
      case "universe_wiki_sync":
        return await handleWikiJob(job.id, payload, job.type);
      case "wiki_suggest_restructure":
        return await handleWikiSuggestRestructure(job.id, payload);
      case "npc_evolution":
        return await handleNpcEvolutionJob(job.id, payload);
      case "npc_wiki_sync":
        return await handleNpcWikiSync(job.id, payload);
      case "extract_lore_comprehensive":
        return await handleLoreExtractionJob(job.id, payload);
      case "generate_session_recap":
        return await handleSessionRecapJob(job.id, payload);
      case "generate_choices":
        return await handleGenerateChoices(job);
      case "update_entity_references":
        return await handleEntityRefUpdate(job);
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : "";
    logger.error("[processJob] Job failed", { jobId: job.id, type: job.type, error: message, stack });
    markJobFailed(job.id, message);
    return { success: false, jobId: job.id, type: job.type, error: message };
  }
}

/**
 * Process all queued jobs for a user (up to maxJobs).
 *
 * Checks isOllamaBusy() before each job — if a user-facing generation starts,
 * processing stops immediately and remaining jobs stay queued for the next
 * idle window. This allows generation to preempt background work without
 * competing for Ollama.
 */
export async function processUserJobs(userId: string, maxJobs: number = 10): Promise<JobResult[]> {
  const results: JobResult[] = [];

  for (let i = 0; i < maxJobs; i++) {
    // Yield to user-facing generation
    if (isOllamaBusy()) break;

    const job = getNextJob(userId);
    if (!job) break;
    const result = await processJob(job);
    results.push(result);
  }

  return results;
}

/**
 * Process jobs of a specific type for a user (up to maxJobs).
 *
 * Also checks isOllamaBusy() before each job so that generation preempts
 * type-specific processing (e.g. the post-generation relationship/thread
 * analysis cascade).
 */
export async function processJobsByType(
  userId: string,
  type: JobType,
  maxJobs: number = 5
): Promise<JobResult[]> {
  const results: JobResult[] = [];

  for (let i = 0; i < maxJobs; i++) {
    // Yield to user-facing generation
    if (isOllamaBusy()) break;

    const job = getNextJob(userId, type);
    if (!job) break;
    const result = await processJob(job);
    results.push(result);
  }

  return results;
}
