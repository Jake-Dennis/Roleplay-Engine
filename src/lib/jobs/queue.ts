/**
 * Job Queue Management
 *
 * Queue management functions and relationship evolution recording.
 * Extracted from job-processor.ts during Phase 3A modularization.
 */

import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { DEDUP_WINDOW_MS, JOB_DEBOUNCE_INTERVALS, JOB_RETENTION_DAYS } from "./types";
import type { JobType, JobPriority, JobStatus, JobPayload, QueuedJob } from "./types";

/** Maximum retry attempts for any job — effectively unlimited. */
const MAX_RETRIES = 999;

// ---------------------------------------------------------------------------
// Relationship Evolution Recording
// ---------------------------------------------------------------------------

/**
 * Record a snapshot of a relationship's emotional state and stage into the
 * evolution history table. Called after analysis, decay, or manual updates.
 */
export function recordEvolution(
  relationshipId: string,
  userId: string,
  emotionalState: string | null,
  relationshipStage: string | null,
  triggerEvent: string
): void {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO relationship_evolution (id, relationship_id, user_id, emotional_state, relationship_stage, trigger_event) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, relationshipId, userId, emotionalState, relationshipStage, triggerEvent);
}

/**
 * Record a narrative anchor for a relationship — a significant story moment
 * that makes the relationship more resistant to decay.
 */
export function recordAnchor(
  relationshipId: string,
  userId: string,
  anchorType: string,
  description: string | null,
  emotionalImpact: string | null
): void {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO narrative_anchors (id, relationship_id, user_id, anchor_type, description, emotional_impact) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, relationshipId, userId, anchorType, description, emotionalImpact);
}

/**
 * Backfill initial evolution entries for existing relationships that don't
 * yet have one. Idempotent — skips relationships that already have an entry.
 *
 * Returns the count of evolution entries created.
 */
export function backfillRelationshipEvolution(userId?: string): { backfilled: number } {
  const db = getDb();

  let relationships: { id: string; emotional_state: string | null; relationship_stage: string | null; user_id: string }[];
  if (userId) {
    relationships = db.prepare(
      "SELECT id, emotional_state, relationship_stage, user_id FROM relationships WHERE user_id = ?"
    ).all(userId) as typeof relationships;
  } else {
    relationships = db.prepare(
      "SELECT id, emotional_state, relationship_stage, user_id FROM relationships"
    ).all() as typeof relationships;
  }

  let backfilled = 0;
  for (const rel of relationships) {
    // Skip if evolution entry already exists for this relationship (idempotent)
    const existing = db.prepare(
      "SELECT id FROM relationship_evolution WHERE relationship_id = ? LIMIT 1"
    ).get(rel.id);
    if (existing) continue;

    recordEvolution(rel.id, rel.user_id, rel.emotional_state, rel.relationship_stage, 'initial_backfill');
    backfilled++;
  }

  return { backfilled };
}

// ---------------------------------------------------------------------------
// Job Queue Management
// ---------------------------------------------------------------------------

/**
 * Queue a new background job
 */
export function queueJob(
  userId: string,
  type: JobType,
  payload: JobPayload,
  priority: JobPriority = "medium",
  universeId?: string
): string {
  const db = getDb();

  // Dedup check: same type + user_id + session context within dedup window
  const sessionId = payload.sessionId || null;
  const messageId = payload.messageId || null;
  const entityId = payload.entityId || null;

  const existing = db.prepare(
    `SELECT id FROM job_queue 
     WHERE user_id = ? AND type = ? AND status IN ('queued', 'processing')
     AND (? IS NULL OR payload LIKE ?)
     AND (? IS NULL OR payload LIKE ?)
     AND (? IS NULL OR payload LIKE ?)
     AND created_at > datetime('now', ? || ' seconds') 
     LIMIT 1`
  ).get(
    userId, type,
    sessionId, sessionId ? `%"sessionId":"${sessionId}"%` : null,
    messageId, messageId ? `%"messageId":"${messageId}"%` : null,
    entityId, entityId ? `%"entityId":"${entityId}"%` : null,
    `-${DEDUP_WINDOW_MS / 1000}`
  ) as { id: string } | undefined;

  if (existing) {
    return existing.id;
  }

  // Debounce check: burst-prone types respect minimum interval
  const debounceInterval = JOB_DEBOUNCE_INTERVALS[type];
  if (debounceInterval) {
    const recent = db.prepare(
      `SELECT id FROM job_queue 
       WHERE user_id = ? AND type = ? AND status IN ('queued', 'processing', 'completed')
       AND created_at > datetime('now', ? || ' seconds')
       LIMIT 1`
    ).get(userId, type, `-${debounceInterval}`) as { id: string } | undefined;

    if (recent) {
      return recent.id;
    }
  }

  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO job_queue (id, user_id, universe_id, type, priority, status, payload, max_retries) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)"
  ).run(id, userId, universeId || null, type, priority, JSON.stringify(payload), MAX_RETRIES);
  return id;
}

/**
 * Delete old completed/failed/cancelled jobs that exceed the retention period.
 * Returns count of deleted jobs.
 */
export function reapOldJobs(): number {
  const db = getDb();
  const result = db.prepare(
    `DELETE FROM job_queue 
     WHERE status IN ('completed', 'failed', 'cancelled') 
     AND created_at < datetime('now', '-' || ? || ' days')`
  ).run(JOB_RETENTION_DAYS);

  const count = result.changes;
  if (count > 0) {
    logger.info(`Reaped ${count} old jobs`);
  }
  return count;
}

/**
 * Get next queued job for a user, ordered by priority then creation time
 */
export function getNextJob(userId: string, type?: JobType, universeId?: string): QueuedJob | undefined {
  const db = getDb();
  let query = `
    SELECT * FROM job_queue 
    WHERE user_id = ? AND status = 'queued'
  `;
  const params: (string | number)[] = [userId];

  if (universeId) {
    query += " AND universe_id = ?";
    params.push(universeId);
  }
  if (type) {
    query += " AND type = ?";
    params.push(type);
  }

  query += `
    ORDER BY 
      CASE priority 
        WHEN 'high' THEN 1 
        WHEN 'medium' THEN 2 
        WHEN 'low' THEN 3 
        WHEN 'idle' THEN 4 
      END,
      created_at ASC
    LIMIT 1
  `;

  return db.prepare(query).get(...params) as QueuedJob | undefined;
}

/**
 * Get all queued jobs for a user
 */
export function getUserJobs(userId: string, status?: JobStatus, universeId?: string): QueuedJob[] {
  const db = getDb();
  let query = "SELECT * FROM job_queue WHERE user_id = ?";
  const params: (string | number)[] = [userId];

  if (universeId) {
    query += " AND universe_id = ?";
    params.push(universeId);
  }
  if (status) {
    query += " AND status = ?";
    params.push(status);
  }

  query += " ORDER BY created_at DESC";
  return db.prepare(query).all(...params) as QueuedJob[];
}

/**
 * Mark a job as processing
 */
export function markJobProcessing(jobId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE job_queue SET status = 'processing', progress = 0, progress_message = 'Starting...' WHERE id = ?"
  ).run(jobId);
}

/**
 * Update job progress (0-100) with optional message
 */
export function updateJobProgress(jobId: string, progress: number, message?: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE job_queue SET progress = ?, progress_message = ? WHERE id = ?"
  ).run(Math.min(100, Math.max(0, progress)), message || null, jobId);

  // Emit SSE event for real-time UI updates
  eventBus.emit(SessionEvents.JOB_PROGRESS, {
    jobId,
    progress: Math.min(100, Math.max(0, progress)),
    message: message || null,
  });
}

/**
 * Mark a job as completed
 */
export function markJobCompleted(jobId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE job_queue SET status = 'completed', progress = 100, progress_message = 'Completed', processed_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(jobId);
}

/**
 * Classify errors as transient (retryable) or permanent.
 * Transient: network issues, timeouts, rate limits, temporary DB locks
 * Permanent: missing fields, invalid references, schema violations, unknown job types
 */
function isTransientError(error: string): boolean {
  const transientPatterns = [
    "timeout", "timed out", "rate limit", "too many requests",
    "connection", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT",
    "database is locked", "SQLITE_BUSY", "temporary failure",
    "Service Unavailable", "503", "429", "fetch failed",
    "Ollama", "Failed to fetch",
  ];
  return transientPatterns.some(p => error.toLowerCase().includes(p.toLowerCase()));
}

/**
 * Mark a job as failed
 */
export function markJobFailed(jobId: string, error: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE job_queue SET status = 'failed', error = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(error, jobId);

  // Auto-retry transient errors with exponential backoff
  const job = db.prepare(
    "SELECT retry_count, max_retries FROM job_queue WHERE id = ?"
  ).get(jobId) as { retry_count: number | null; max_retries: number | null } | undefined;

  if (job && isTransientError(error) && (job.retry_count ?? 0) < (job.max_retries ?? MAX_RETRIES)) {
    const newRetryCount = (job.retry_count ?? 0) + 1;
    const backoffSeconds = Math.min(Math.pow(2, newRetryCount - 1), 30); // 1s, 2s, 4s, 8s, 16s, 30s (capped)
    db.prepare(`
      UPDATE job_queue 
      SET status = 'queued', error = NULL, progress = 0, progress_message = NULL, 
          processed_at = NULL, retry_count = ?,
          created_at = datetime('now', '+${backoffSeconds} seconds')
      WHERE id = ?
    `).run(newRetryCount, jobId);
    logger.info(`Auto-retrying job ${jobId} (attempt ${newRetryCount}/${job.max_retries ?? MAX_RETRIES}) with ${backoffSeconds}s backoff`);
  }
}

/**
 * Cancel a queued job
 */
export function cancelJob(jobId: string): boolean {
  const db = getDb();
  const result = db.prepare(
    "UPDATE job_queue SET status = 'cancelled' WHERE id = ? AND status = 'queued'"
  ).run(jobId);
  return result.changes > 0;
}

/**
 * Cancel all queued jobs for a user
 */
export function cancelAllUserJobs(userId: string): number {
  const db = getDb();
  const result = db.prepare(
    "UPDATE job_queue SET status = 'cancelled' WHERE user_id = ? AND status = 'queued'"
  ).run(userId);
  return result.changes;
}

/**
 * Retry a failed job — resets it to queued with cleared error.
 * Respects max_retries cap; returns false if cap reached.
 */
export function retryJob(jobId: string): boolean {
  const db = getDb();
  const job = db.prepare(
    "SELECT retry_count, max_retries FROM job_queue WHERE id = ? AND status = 'failed'"
  ).get(jobId) as { retry_count: number | null; max_retries: number | null } | undefined;

  if (!job) return false;

  const currentRetries = job.retry_count ?? 0;
  const maxRetries = job.max_retries ?? MAX_RETRIES;

  if (currentRetries >= maxRetries) {
    return false; // Cap reached — no more manual retries
  }

  db.prepare(`
    UPDATE job_queue 
    SET status = 'queued', error = NULL, progress = 0, progress_message = NULL, 
        processed_at = NULL, retry_count = ?
    WHERE id = ? AND status = 'failed'
  `).run(currentRetries + 1, jobId);
  return true;
}

/**
 * Retry all failed jobs for a user — only retries jobs where retry_count < max_retries.
 */
export function retryAllFailedJobs(userId: string): number {
  const db = getDb();
  const result = db.prepare(`
    UPDATE job_queue 
    SET status = 'queued', error = NULL, progress = 0, progress_message = NULL, 
        processed_at = NULL, retry_count = COALESCE(retry_count, 0) + 1
    WHERE user_id = ? AND status = 'failed' 
      AND (COALESCE(retry_count, 0) < COALESCE(max_retries, MAX_RETRIES))
  `).run(userId);
  return result.changes;
}

/**
 * Get job queue stats for a user
 */
export function getJobStats(userId: string): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(
    "SELECT status, COUNT(*) as count FROM job_queue WHERE user_id = ? GROUP BY status"
  ).all(userId) as { status: string; count: number }[];

  const stats: Record<string, number> = {};
  for (const row of rows) {
    stats[row.status] = row.count;
  }
  return stats;
}

/**
 * Recover stale jobs that were left in 'processing' state due to server crash.
 * Jobs stuck processing for more than 5 minutes are marked as failed.
 * Returns the number of jobs recovered.
 */
export function recoverStaleJobs(): number {
  const db = getDb();
  const result = db.prepare(
    `UPDATE job_queue 
     SET status = 'failed', 
         error = 'Server crashed during processing', 
         processed_at = CURRENT_TIMESTAMP 
     WHERE status = 'processing' 
       AND created_at < datetime('now', '-5 minutes')`
  ).run();
  
  const recovered = result.changes;
  if (recovered > 0) {
    logger.info(`Recovered ${recovered} stale job(s) — marked as failed.`);
  }
  
  return recovered;
}
