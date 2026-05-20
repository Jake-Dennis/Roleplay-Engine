/**
 * Job Queue Processor
 * 
 * Processes queued background jobs on-demand or during idle-time windows.
 * Since there are no persistent background workers, jobs are processed:
 * 1. When explicitly triggered via API routes
 * 2. During idle-time processing tiers triggered by middleware
 * 3. After message creation (high-priority response generation)
 * 
 * Job types:
 * - generate_response: AI generates next message
 * - summarize_messages: Compress old messages into summaries
 * - generate_embeddings: Create vector embeddings for entities
 * - analyze_relationships: Update relationship states from recent messages
 * - expand_lore: Generate new lore entries with contradiction checks
 * - decay_relationships: Apply time-based relationship decay
 * - compress_memories: Archive and compress old narrative memories
 */

import { getDb } from "@/lib/db";
import { processEmbeddings } from "@/lib/embeddings";
import { processRelationshipAnalysis } from "@/lib/relationship-analysis";
import { generateText } from "@/lib/ollama";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { runIdleEnrichment } from "@/lib/idle-enrichment";
import { PROMPTS } from "@/lib/prompts";

// Extracted job handlers
import { handleResponseJob } from "./jobs/response-handler";
import { handleSummarizationJob } from "./jobs/summarization-handler";
import { handleWikiJob } from "./jobs/wiki-handler";

export type JobType =
  | "generate_response"
  | "summarize_messages"
  | "summarize_message"
  | "generate_embeddings"
  | "analyze_relationships"
  | "decay_relationships"
  | "compress_memories"
  | "refine_relationship_summary"
  | "archival_processing"
  | "thread_analysis"
  | "idle_enrichment"
  // Wiki enrichment job types
  | "wiki_ingest"
  | "wiki_enrich_entity"
  | "wiki_generate_rumors"
  | "wiki_deepen_page"
  | "wiki_deepen_location"
  | "wiki_extract_event";

export type JobPriority = "high" | "medium" | "low" | "idle";
export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface JobPayload {
  sessionId?: string;
  messageId?: string;
  content?: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  universeId?: string;
  [key: string]: unknown;
}

export interface QueuedJob {
  id: string;
  user_id: string;
  type: JobType;
  priority: JobPriority;
  status: JobStatus;
  payload: string;
  progress: number;
  progress_message: string | null;
  created_at: string;
  processed_at: string | null;
  error: string | null;
}

export interface JobResult {
  success: boolean;
  jobId: string;
  type: JobType;
  data?: Record<string, unknown>;
  error?: string;
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
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO job_queue (id, user_id, universe_id, type, priority, status, payload) VALUES (?, ?, ?, ?, ?, 'queued', ?)"
  ).run(id, userId, universeId || null, type, priority, JSON.stringify(payload));
  return id;
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
 * Mark a job as failed
 */
export function markJobFailed(jobId: string, error: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE job_queue SET status = 'failed', error = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(error, jobId);
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
 * Cancel all queued generate_response jobs for a specific session
 */
export function cancelSessionJobs(userId: string, sessionId: string): number {
  const db = getDb();
  const result = db.prepare(
    `UPDATE job_queue SET status = 'cancelled' 
     WHERE user_id = ? AND status = 'queued' AND type = 'generate_response' 
     AND payload LIKE ?`
  ).run(userId, `%${sessionId}%`);
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
       AND updated_at < datetime('now', '-5 minutes')`
  ).run();
  
  const recovered = result.changes;
  if (recovered > 0) {
    console.log(`[JobProcessor] Recovered ${recovered} stale job(s) — marked as failed.`);
  }
  
  return recovered;
}

// ---------------------------------------------------------------------------
// Job Processing
// ---------------------------------------------------------------------------

/**
 * Process a single job by dispatching to the appropriate handler
 */
export async function processJob(job: QueuedJob): Promise<JobResult> {
  markJobProcessing(job.id);

  try {
    const payload: JobPayload = JSON.parse(job.payload);

    switch (job.type) {
      case "generate_response":
        return await handleResponseJob(job.id, payload);
      case "summarize_messages":
      case "summarize_message":
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
      case "idle_enrichment":
        return await handleIdleEnrichment(job.id, payload);
      // Wiki-native job types
      case "wiki_ingest":
      case "wiki_enrich_entity":
      case "wiki_generate_rumors":
      case "wiki_deepen_page":
      case "wiki_deepen_location":
      case "wiki_extract_event":
        return await handleWikiJob(job.id, payload, job.type);
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markJobFailed(job.id, message);
    return { success: false, jobId: job.id, type: job.type, error: message };
  }
}

/**
 * Process all queued jobs for a user (up to maxJobs)
 */
export async function processUserJobs(userId: string, maxJobs: number = 10): Promise<JobResult[]> {
  const results: JobResult[] = [];

  for (let i = 0; i < maxJobs; i++) {
    const job = getNextJob(userId);
    if (!job) break;
    const result = await processJob(job);
    results.push(result);
  }

  return results;
}

/**
 * Process jobs of a specific type for a user
 */
export async function processJobsByType(
  userId: string,
  type: JobType,
  maxJobs: number = 5
): Promise<JobResult[]> {
  const results: JobResult[] = [];

  for (let i = 0; i < maxJobs; i++) {
    const job = getNextJob(userId, type);
    if (!job) break;
    const result = await processJob(job);
    results.push(result);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Remaining Job Handlers
// ---------------------------------------------------------------------------

async function handleGenerateEmbeddings(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { entityType, entityId, userId } = payload;
  if (!entityType || !entityId || !userId) {
    throw new Error("Missing entityType, entityId, or userId");
  }

  updateJobProgress(jobId, 30, "Generating embedding...");
  const result = await processEmbeddings(
    userId as string,
    entityType as string,
    entityId as string
  );
  updateJobProgress(jobId, 85, "Storing embedding...");
  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "generate_embeddings",
    data: { embeddingId: result.embeddingId },
  };
}

async function handleAnalyzeRelationships(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { sessionId, userId } = payload;
  if (!sessionId || !userId) throw new Error("Missing sessionId or userId");

  updateJobProgress(jobId, 20, "Analyzing messages...");
  const result = await processRelationshipAnalysis(
    userId as string,
    sessionId as string
  );
  updateJobProgress(jobId, 80, "Updating relationships...");
  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "analyze_relationships",
    data: { analyzedCount: result.analyzedCount },
  };
}

async function handleDecayRelationships(jobId: string, payload: JobPayload): Promise<JobResult> {
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

  const DEFAULT_DECAY_RATES = {
    emotionalHalfLifeDays: 7,
    stageRegressionDays: 14,
    minEmotionalState: "neutral",
  };

  const EMOTIONAL_STATES = ["devoted", "loving", "trusting", "friendly", "warm", "neutral", "cold", "distant", "suspicious", "hostile", "hateful"] as const;
  const RELATIONSHIP_STAGES = ["lovers", "close_friends", "friends", "allies", "acquaintances", "strangers"] as const;

  let decayedCount = 0;
  const totalRelationships = relationships.length;

  for (let i = 0; i < relationships.length; i++) {
    const rel = relationships[i];
    const rates = rel.decay_rates
      ? { ...DEFAULT_DECAY_RATES, ...JSON.parse(rel.decay_rates) }
      : DEFAULT_DECAY_RATES;

    const lastUpdate = rel.updated_at ? new Date(rel.updated_at) : new Date();
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
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
      db.prepare(`
        UPDATE relationships
        SET emotional_state = ?, relationship_stage = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newState, newStage, rel.id);
      decayedCount++;
    }

    // Update progress every 25% of relationships
    if (totalRelationships > 4 && (i + 1) % Math.max(1, Math.floor(totalRelationships / 4)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalRelationships) * 80), `Processing ${i + 1}/${totalRelationships}...`);
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

async function handleRefineRelationshipSummary(jobId: string, payload: JobPayload): Promise<JobResult> {
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
    const emotions = rel.emotional_state ? JSON.parse(rel.emotional_state) : {};
    const history = rel.shared_history ? JSON.parse(rel.shared_history) : [];

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
      const summary = await generateText(prompt, { userId: userId as string });
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

async function handleArchivalProcessing(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId } = payload;
  if (!userId) throw new Error("Missing userId");

  const db = getDb();

  let query = `
    SELECT id, content, importance, created_at
    FROM narrative_memories
    WHERE user_id = ? AND importance IS NOT NULL AND type != 'rumor'
  `;
  const params: (string | number)[] = [userId];

  if (universeId) {
    query += " AND universe_id = ?";
    params.push(universeId);
  }

  const memories = db.prepare(query).all(...params) as { id: string; content: string; importance: string; created_at: string }[];

  let archived = 0;
  const totalMemories = memories.length;
  for (let i = 0; i < memories.length; i++) {
    const memory = memories[i];
    const imp = JSON.parse(memory.importance);
    const score = (imp.emotional || 1) + (imp.local || 1) + (imp.canonical || 1) + (imp.recency || 1);

    if (score <= 4) {
      const prompt = PROMPTS.memoryArchiveSummary(memory.content.slice(0, 200));

      try {
        const summary = await generateText(prompt, { userId: userId as string });

        db.prepare(
          "UPDATE narrative_memories SET content = ?, importance = ? WHERE id = ?"
        ).run(`[ARCHIVED] ${summary}`, JSON.stringify({ emotional: 1, local: 1, canonical: 1, recency: 1 }), memory.id);
        archived++;
      } catch {
        // Skip failed memories
      }
    }

    // Update progress
    if (totalMemories > 2 && (i + 1) % Math.max(1, Math.floor(totalMemories / 3)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalMemories) * 80), `Archiving ${i + 1}/${totalMemories}...`);
    }
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "archival_processing",
    data: { archived },
  };
}

async function handleThreadAnalysis(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { sessionId, userId } = payload;
  if (!sessionId || !userId) throw new Error("Missing sessionId or userId");

  const db = getDb();

  // Get session messages
  const messages = db.prepare(`
    SELECT content, sender_id, timestamp
    FROM messages
    WHERE session_id = ? AND is_deleted = 0
    ORDER BY timestamp ASC
    LIMIT 50
  `).all(sessionId) as { content: string; sender_id: string | null; timestamp: string }[];

  if (messages.length < 5) {
    markJobCompleted(jobId);
    return { success: true, jobId, type: "thread_analysis", data: { threadsFound: 0 } };
  }

  const messageText = messages
    .map((m) => `${m.sender_id === null ? "AI" : "Player"}: ${m.content}`)
    .join("\n");

  const prompt = PROMPTS.analyzeThreads(messageText);

  let threadsFound = 0;
  try {
    const response = await generateText(prompt, { temperature: 0.3, num_ctx: 8192, userId: userId as string });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.threads)) {
        for (const thread of parsed.threads) {
          const threadId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO narrative_threads (id, user_id, session_id, name, status, summary, key_entities)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            threadId,
            userId,
            sessionId,
            thread.name || "Unknown Thread",
            thread.status || "active",
            thread.summary || "",
            JSON.stringify(thread.keyEntities || [])
          );
          threadsFound++;
        }
      }
    }
  } catch {
    // Skip if analysis fails
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "thread_analysis",
    data: { threadsFound },
  };
}

async function handleIdleEnrichment(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, idleMinutes, universeId } = payload;
  if (!userId) throw new Error("Missing userId");

  const minutes = typeof idleMinutes === "number" ? idleMinutes : 5;

  updateJobProgress(jobId, 10, `Starting idle enrichment (${minutes}min idle)...`);
  const result = await runIdleEnrichment(
    userId as string,
    minutes,
    (universeId as string) || null
  );
  updateJobProgress(jobId, 90, "Enrichment complete");
  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "idle_enrichment",
    data: {
      tier: result.tier,
      actionsCompleted: result.actionsCompleted,
      itemsProcessed: result.itemsProcessed,
    },
  };
}
