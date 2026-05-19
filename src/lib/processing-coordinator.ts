/**
 * Processing Coordinator
 *
 * Single entry point for the idle-processing / job-processor / idle-enrichment
 * module triad. Breaks the circular dependency chain by re-exporting all
 * public APIs from one place.
 *
 * Dependency chain (before coordinator):
 *   idle-processing.ts → job-processor.ts → idle-enrichment.ts
 *
 * After coordinator:
 *   External consumers import from this file.
 *   Internal cross-imports within the triad also go through this file.
 */

// Re-export from idle-enrichment (leaf — no internal deps)
export {
  runIdleEnrichment,
  type EnrichmentResult,
} from "@/lib/idle-enrichment";

// Re-export from job-processor (depends on idle-enrichment)
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
  cancelSessionJobs,
  getJobStats,
  processJob,
  processUserJobs,
  processJobsByType,
  type JobType,
  type JobPriority,
  type JobStatus,
  type JobPayload,
  type QueuedJob,
  type JobResult,
} from "@/lib/job-processor";

// Re-export from idle-processing (depends on job-processor)
export {
  processIdleTime,
  getIdleTime,
  shouldProcessIdleTime,
  resetIdleTimer,
  queueIdleJobs,
  processIdleTier,
  type IdleProcessingResult,
} from "@/lib/idle-processing";
