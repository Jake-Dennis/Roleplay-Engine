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
import { processSummarization } from "@/lib/summarization";
import { processEmbeddings } from "@/lib/embeddings";
import { processRelationshipAnalysis } from "@/lib/relationship-analysis";
import { generateText } from "@/lib/ollama";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { getRetrievedContext, assemblePromptWithBudget } from "@/lib/retrieval";
import { summarizeMessage } from "@/lib/message-summarizer";
import { applyDecayToAllRelationships } from "@/lib/relationship-decay";
import { runIdleEnrichment } from "@/lib/idle-enrichment";

// Wiki I/O modules (Wave 1-3)
import { ingestSource } from "@/lib/wiki/ingest";
import { queryWiki } from "@/lib/wiki/query";
import { lintWiki } from "@/lib/wiki/lint";
import { readWikiPage, writeWikiPage, listWikiPages, WikiFrontmatter } from "@/lib/wiki/file-io";
import { generateIndex } from "@/lib/wiki/index-generator";
import { appendLog } from "@/lib/wiki/logger";

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
        return await handleGenerateResponse(job.id, payload);
      case "summarize_messages":
        return await handleSummarizeMessages(job.id, payload);
      case "summarize_message":
        return await handleSummarizeSingleMessage(job.id, payload);
      case "generate_embeddings":
        return await handleGenerateEmbeddings(job.id, payload);
      case "analyze_relationships":
        return await handleAnalyzeRelationships(job.id, payload);
      case "decay_relationships":
        return await handleDecayRelationships(job.id, payload);
      case "compress_memories":
        return await handleCompressMemories(job.id, payload);
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
        return await handleWikiIngest(job.id, payload);
      case "wiki_enrich_entity":
        return await handleWikiEnrichEntity(job.id, payload);
      case "wiki_generate_rumors":
        return await handleWikiGenerateRumors(job.id, payload);
      case "wiki_deepen_page":
        return await handleWikiDeepenPage(job.id, payload);
      case "wiki_deepen_location":
        return await handleWikiDeepenLocation(job.id, payload);
      case "wiki_extract_event":
        return await handleWikiExtractEvent(job.id, payload);
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
// Job Handlers
// ---------------------------------------------------------------------------

async function handleGenerateResponse(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { sessionId, messageId, content, parentMessageId } = payload;
  if (!sessionId || !messageId) {
    throw new Error("Missing sessionId or messageId");
  }

  const db = getDb();

  // B2: Look up session to get universe_id for context retrieval
  const session = db.prepare(`
    SELECT s.id, s.universe_id, u.canon_mode
    FROM sessions s
    LEFT JOIN universes u ON u.id = s.universe_id
    WHERE s.id = ?
  `).get(sessionId) as { id: string; universe_id: string | null; canon_mode: string | null } | undefined;

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // B2: System prompt (same as /api/generate/[id])
  const systemPrompt = `You are a narrative roleplay engine. You narrate immersive, character-driven stories in response to user actions. Write in a literary style with vivid description. Stay in character and maintain story consistency. Keep responses to 2-4 paragraphs unless the situation demands more.`;

  // B2: Use full context retrieval pipeline (scene, lore, relationships, recent messages, intent)
  const ctx = await getRetrievedContext(
    sessionId,
    session.universe_id || "",
    content as string
  );

  const prompt = assemblePromptWithBudget(ctx, systemPrompt, 6000);

  // Emit generation started event (M5)
  eventBus.emit(`${SessionEvents.GENERATION_STARTED}:${sessionId}`, {
    jobId,
    sessionId,
  });

  // Generate AI response using Ollama with full context
  const response = await generateText(prompt, { temperature: 0.8, num_ctx: 8192, userId: payload.userId || "" });

  // Insert the AI response as a new message
  const newMessageId = crypto.randomUUID();
  // A1: Set parent_message_id for conversation branching when provided
  db.prepare(
    "INSERT INTO messages (id, session_id, sender_id, content, parent_message_id) VALUES (?, ?, NULL, ?, ?)"
  ).run(newMessageId, sessionId, response, parentMessageId || null);

  // Update session timestamp
  db.prepare("UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);

  markJobCompleted(jobId);

  // Emit SSE events
  eventBus.emit(`${SessionEvents.MESSAGE_CREATED}:${sessionId}`, {
    messageId: newMessageId,
    sessionId,
    content: response,
    senderId: null,
  });

  // M5: Emit generation done event
  eventBus.emit(`${SessionEvents.GENERATION_DONE}:${sessionId}`, {
    messageId: newMessageId,
    sessionId,
    intent: ctx.intent,
    contentLength: response.length,
  });

  return {
    success: true,
    jobId,
    type: "generate_response",
    data: { messageId: newMessageId, content: response, intent: ctx.intent },
  };
}

async function handleSummarizeMessages(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { sessionId } = payload;
  if (!sessionId) throw new Error("Missing sessionId");

  updateJobProgress(jobId, 25, "Fetching messages...");
  const result = await processSummarization(sessionId as string);
  updateJobProgress(jobId, 75, "Saving summaries...");
  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "summarize_messages",
    data: { summarizedCount: result.summarizedCount },
  };
}

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

async function handleCompressMemories(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, sessionId, universeId } = payload;
  if (!userId) throw new Error("Missing userId");

  const db = getDb();

  // If universe is specified, only compress memories from sessions in that universe
  let memoryQuery = `
    SELECT nm.id, nm.content, nm.type, nm.importance, nm.created_at
    FROM narrative_memories nm
    WHERE nm.user_id = ?
      AND nm.created_at < datetime('now', '-7 days')
  `;
  const memoryParams: (string | number)[] = [userId];

  if (universeId) {
    memoryQuery += ` AND nm.universe_id = ?`;
    memoryParams.push(universeId);
  }

  if (sessionId) {
    memoryQuery += ` AND nm.session_id = ?`;
    memoryParams.push(sessionId);
  }

  memoryQuery += ` ORDER BY nm.created_at ASC LIMIT 50`;

  const memories = db.prepare(memoryQuery).all(...memoryParams) as {
    id: string;
    content: string;
    type: string;
    importance: string | null;
    created_at: string;
  }[];

  let compressedCount = 0;
  let archivedCount = 0;
  const totalMemories = memories.length;

  for (let i = 0; i < memories.length; i++) {
    const memory = memories[i];
    const age = (Date.now() - new Date(memory.created_at).getTime()) / (1000 * 60 * 60 * 24);

    if (age >= 90) {
      const prompt = `Summarize in 5-10 words: "${memory.content.slice(0, 200)}"`;
      try {
        const summary = await generateText(prompt, { temperature: 0.2, num_ctx: 2048, userId: userId as string });
        if (summary?.trim()) {
          db.prepare(`
            UPDATE narrative_memories
            SET content = ?, importance = 'archived', type = ?
            WHERE id = ?
          `).run(summary.trim(), `archived:${memory.type}`, memory.id);
          archivedCount++;
        }
      } catch { /* skip */ }
    } else if (age >= 30) {
      const prompt = `Summarize in 1 sentence: "${memory.content.slice(0, 200)}"`;
      try {
        const summary = await generateText(prompt, { temperature: 0.2, num_ctx: 2048, userId: userId as string });
        if (summary?.trim()) {
          db.prepare(`
            UPDATE narrative_memories
            SET content = ?, importance = 'low'
            WHERE id = ?
          `).run(summary.trim(), memory.id);
          compressedCount++;
        }
      } catch { /* skip */ }
    } else if (age >= 7) {
      const prompt = `Summarize in 2-3 sentences: "${memory.content.slice(0, 200)}"`;
      try {
        const summary = await generateText(prompt, { temperature: 0.2, num_ctx: 2048, userId: userId as string });
        if (summary?.trim()) {
          db.prepare(`
            UPDATE narrative_memories
            SET content = ?
            WHERE id = ?
          `).run(summary.trim(), memory.id);
          compressedCount++;
        }
      } catch { /* skip */ }
    }

    // Update progress every 25% of memories
    if (totalMemories > 4 && (i + 1) % Math.max(1, Math.floor(totalMemories / 4)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalMemories) * 80), `Compressing ${i + 1}/${totalMemories}...`);
    }
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "compress_memories",
    data: { compressedCount, archivedCount },
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

    const prompt = `Summarize the relationship between ${rel.source_entity} and ${rel.target_entity}.
Current emotional state: ${emotionSummary || "neutral"}
Recent history: ${history.slice(-3).map((h: any) => h.summary || h).join("; ")}

Write a 2-3 sentence narrative summary of their current relationship dynamic.`;

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
      const prompt = `Summarize this narrative memory in one sentence: "${memory.content.slice(0, 200)}"`;

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

async function handleSummarizeSingleMessage(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { messageId } = payload;
  if (!messageId) throw new Error("Missing messageId");

  updateJobProgress(jobId, 20, "Analyzing message...");
  const result = await summarizeMessage(messageId as string);
  updateJobProgress(jobId, 80, "Saving summaries...");
  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "summarize_message",
    data: { summaryId: result.summaryId, types: result.types },
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

  const prompt = `Analyze this narrative and identify the key story threads/themes. Return JSON:
{
  "threads": [
    {
      "name": "thread name",
      "status": "active|resolved|dormant",
      "summary": "brief description",
      "keyEntities": ["list of characters/locations involved"]
    }
  ]
}

Narrative:
${messageText}`;

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

// ---------------------------------------------------------------------------
// Wiki Enrichment Job Handlers
// ---------------------------------------------------------------------------

/**
 * Resolve the wiki root directory for a user/universe.
 */
function getWikiRoot(userId: string, universeId?: string): string {
  const dataDir = process.env.DATA_DIR || "./data";
  const basePath = universeId
    ? `${dataDir}/${userId}/wiki/${universeId}`
    : `${dataDir}/${userId}/wiki`;
  return basePath;
}

/**
 * wiki_ingest: Ingest source material into wiki pages.
 * Maps from: expand_lore
 */
async function handleWikiIngest(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId, sourcePath } = payload;
  if (!userId) throw new Error("Missing userId");
  if (!sourcePath) throw new Error("Missing sourcePath — wiki_ingest requires a source file to ingest");

  const wikiRoot = getWikiRoot(userId as string, universeId as string);

  updateJobProgress(jobId, 20, "Reading source file...");

  const result = await ingestSource(
    sourcePath as string,
    wikiRoot,
    universeId as string
  );
  updateJobProgress(jobId, 80, `Ingested ${result.created.length} pages, updated ${result.updated.length}`);
  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "wiki_ingest",
    data: { created: result.created.length, updated: result.updated.length, errors: result.errors },
  };
}

/**
 * wiki_enrich_entity: Enrich an existing wiki entity page with new details.
 * Maps from: enrich_npc
 */
async function handleWikiEnrichEntity(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId, entityId, entityType } = payload;
  if (!userId) throw new Error("Missing userId");

  const wikiRoot = getWikiRoot(userId as string, universeId as string);
  const pages = listWikiPages(wikiRoot);

  // Filter pages by universe and entity type
  const targetPages = pages.filter((p) => {
    const matchUniverse = !universeId || p.frontmatter.universe === universeId;
    const matchType = !entityType || p.frontmatter.type === entityType;
    const matchEntity = !entityId || p.path.includes(entityId as string);
    return matchUniverse && matchType && matchEntity;
  });

  // If no specific entity, pick top draft entities
  const entitiesToEnrich = targetPages.length > 0
    ? targetPages.slice(0, 3)
    : pages.filter((p) => p.frontmatter.status === "draft").slice(0, 3);

  let processed = 0;
  const totalEntities = entitiesToEnrich.length;

  for (let i = 0; i < entitiesToEnrich.length; i++) {
    const page = entitiesToEnrich[i];
    const title = page.frontmatter.title || page.path;

    const prompt = `Expand on this wiki entity "${title}". Current content:\n${page.content.slice(0, 1000)}\n\nAdd 2-3 new details about their personality, habits, motivations, or connections to other entities. Do not contradict existing facts. Return only the new content as markdown.`;

    try {
      const enrichment = await generateText(prompt, { userId: userId as string });
      const newContent = page.content.trimEnd() + `\n\n## Additional Details\n${enrichment}`;

      const updatedFrontmatter: WikiFrontmatter = {
        title: page.frontmatter.title as string || title,
        status: (page.frontmatter.status as WikiFrontmatter["status"]) || "draft",
        type: (page.frontmatter.type as WikiFrontmatter["type"]) || "entity",
        universe: page.frontmatter.universe as string,
        tags: page.frontmatter.tags as string[],
        updated: new Date().toISOString(),
      };

      writeWikiPage(page.path, newContent, updatedFrontmatter);
      processed++;
    } catch {
      // Skip failed entities
    }

    // Progress reporting
    if (totalEntities > 1 && (i + 1) % Math.max(1, Math.floor(totalEntities / 3)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalEntities) * 80), `Enriching ${i + 1}/${totalEntities}...`);
    }
  }

  // Regenerate index
  try {
    generateIndex(wikiRoot);
  } catch {
    // Non-fatal
  }

  // Append to log
  try {
    appendLog(wikiRoot, "update", "batch", `Processed: ${processed}`);
  } catch {
    // Non-fatal
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "wiki_enrich_entity",
    data: { processed },
  };
}

/**
 * wiki_generate_rumors: Generate rumor pages based on recent events.
 * Maps from: expand_rumors
 */
async function handleWikiGenerateRumors(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId } = payload;
  if (!userId) throw new Error("Missing userId");

  const db = getDb();
  const wikiRoot = getWikiRoot(userId as string, universeId as string);

  // Get recent events from DB (wrapped in try/catch — events table will be dropped in Phase 5)
  let recentEvents: { id: string; title: string; event_type: string; outcome: string | null; occurred_at: string }[] = [];
  try {
    let query = `
      SELECT id, title, event_type, outcome, occurred_at
      FROM events
      WHERE user_id = ? AND occurred_at > datetime('now', '-7 days')
    `;
    const params: (string | number)[] = [userId];

    if (universeId) {
      query += " AND universe_id = ?";
      params.push(universeId);
    }

    query += `
      ORDER BY occurred_at DESC
      LIMIT 5
    `;

    recentEvents = db.prepare(query).all(...params) as {
      id: string;
      title: string;
      event_type: string;
      outcome: string | null;
      occurred_at: string;
    }[];
  } catch {
    // events table may not exist — return 0 processed
    markJobCompleted(jobId);
    return { success: true, jobId, type: "wiki_generate_rumors", data: { processed: 0 } };
  }

  let processed = 0;
  const totalEvents = recentEvents.length;

  for (let i = 0; i < recentEvents.length; i++) {
    const event = recentEvents[i];

    // Check if a rumor page already exists for this event
    const pages = listWikiPages(wikiRoot);
    const existingRumor = pages.find(
      (p) => p.frontmatter.tags?.includes(`event:${event.id}`)
    );
    if (existingRumor) continue;

    const prompt = `Based on this event: "${event.title}" (${event.event_type}, outcome: ${event.outcome || "unknown"}), generate 1-2 rumors that might spread among NPCs. Rumors should be plausible but potentially inaccurate. Return as bullet points.`;

    try {
      const rumors = await generateText(prompt, { userId: userId as string });

      const filename = `rumor_${event.title.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-")}.md`;
      const pagePath = `${wikiRoot}/concepts/${filename}`;

      const frontmatter: WikiFrontmatter = {
        title: `Rumor: ${event.title}`,
        type: "concept",
        status: "draft",
        universe: universeId as string,
        tags: ["rumor", `event:${event.id}`, `type:${event.event_type}`],
        created: new Date().toISOString(),
      };

      writeWikiPage(pagePath, rumors, frontmatter);
      processed++;
    } catch {
      // Skip failed events
    }

    // Progress reporting
    if (totalEvents > 2 && (i + 1) % Math.max(1, Math.floor(totalEvents / 3)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalEvents) * 80), `Generating rumors ${i + 1}/${totalEvents}...`);
    }
  }

  // Regenerate index
  try {
    generateIndex(wikiRoot);
  } catch {
    // Non-fatal
  }

  // Append to log
  try {
    appendLog(wikiRoot, "create", "batch", `Processed: ${processed}`);
  } catch {
    // Non-fatal
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "wiki_generate_rumors",
    data: { processed },
  };
}

/**
 * wiki_deepen_page: Deepen an existing wiki page with new connections and details.
 * Maps from: lore_deepening
 */
async function handleWikiDeepenPage(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId, pagePath } = payload;
  if (!userId) throw new Error("Missing userId");

  const wikiRoot = getWikiRoot(userId as string, universeId as string);

  let pagesToDeepen: ReturnType<typeof listWikiPages> = [];

  if (pagePath) {
    // Deepen a specific page
    try {
      const page = readWikiPage(pagePath as string);
      pagesToDeepen = [page];
    } catch {
      markJobCompleted(jobId);
      return { success: true, jobId, type: "wiki_deepen_page", data: { deepenedCount: 0, error: "Page not found" } };
    }
  } else {
    // Find pages that haven't been deepened recently
    const allPages = listWikiPages(wikiRoot);
    pagesToDeepen = allPages
      .filter((p) => {
        const matchUniverse = !universeId || p.frontmatter.universe === universeId;
        const isOld = !p.frontmatter.updated || new Date(p.frontmatter.updated) < new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        return matchUniverse && isOld;
      })
      .slice(0, 5);
  }

  let deepened = 0;
  const totalPages = pagesToDeepen.length;

  for (let i = 0; i < pagesToDeepen.length; i++) {
    const page = pagesToDeepen[i];
    const title = page.frontmatter.title || page.path;

    const prompt = `Deepen this wiki page "${title}" (${page.frontmatter.type}). Current content:\n${page.content.slice(0, 800)}\n\nAdd new details, connections to other wiki entities, or implications. Do not contradict existing facts. Return only the new content as markdown.`;

    try {
      const deepening = await generateText(prompt, { userId: userId as string });
      const newContent = page.content.trimEnd() + `\n\n## Deeper Connections\n${deepening}`;

      const updatedFrontmatter: WikiFrontmatter = {
        title: page.frontmatter.title as string || title,
        status: (page.frontmatter.status as WikiFrontmatter["status"]) || "draft",
        type: (page.frontmatter.type as WikiFrontmatter["type"]) || "entity",
        universe: page.frontmatter.universe as string,
        tags: page.frontmatter.tags as string[],
        updated: new Date().toISOString(),
      };

      writeWikiPage(page.path, newContent, updatedFrontmatter);
      deepened++;
    } catch {
      // Skip failed pages
    }

    // Progress reporting
    if (totalPages > 1 && (i + 1) % Math.max(1, Math.floor(totalPages / 4)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalPages) * 80), `Deepening ${i + 1}/${totalPages}...`);
    }
  }

  // Regenerate index
  try {
    generateIndex(wikiRoot);
  } catch {
    // Non-fatal
  }

  // Append to log
  try {
    appendLog(wikiRoot, "update", "batch", `Deepened: ${deepened}`);
  } catch {
    // Non-fatal
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "wiki_deepen_page",
    data: { deepenedCount: deepened },
  };
}

/**
 * wiki_deepen_location: Deepen location wiki pages with atmospheric and historical details.
 * Maps from: expand_location_lore
 */
async function handleWikiDeepenLocation(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId, locationId } = payload;
  if (!userId) throw new Error("Missing userId");

  const wikiRoot = getWikiRoot(userId as string, universeId as string);
  const pages = listWikiPages(wikiRoot);

  // Filter for location-type pages
  let locationPages = pages.filter((p) => {
    const matchUniverse = !universeId || p.frontmatter.universe === universeId;
    const isEntity = p.frontmatter.type === "entity";
    const matchLocation = locationId
      ? p.path.includes(locationId as string)
      : true;
    return matchUniverse && isEntity && matchLocation;
  }).slice(0, 3);

  // If no location-specific pages found, fall back to any entity pages
  if (locationPages.length === 0 && !locationId) {
    locationPages = pages
      .filter((p) => !universeId || p.frontmatter.universe === universeId)
      .slice(0, 3);
  }

  let expanded = 0;

  for (const page of locationPages) {
    const title = page.frontmatter.title || page.path;
    const existingContent = page.content;
    if (!existingContent.trim()) continue;

    const prompt = `Expand on this location "${title}". Current description:\n${existingContent.slice(0, 500)}\n\nAdd 2-3 new atmospheric details, historical notes, or sensory descriptions. Do not contradict existing facts.`;

    try {
      const expansion = await generateText(prompt, { userId: userId as string });
      const newContent = existingContent.trimEnd() + `\n\n## Additional Lore\n${expansion}`;

      const updatedFrontmatter: WikiFrontmatter = {
        title: page.frontmatter.title as string || title,
        status: (page.frontmatter.status as WikiFrontmatter["status"]) || "draft",
        type: (page.frontmatter.type as WikiFrontmatter["type"]) || "entity",
        universe: page.frontmatter.universe as string,
        tags: page.frontmatter.tags as string[],
        updated: new Date().toISOString(),
      };

      writeWikiPage(page.path, newContent, updatedFrontmatter);
      expanded++;
    } catch {
      // Skip failed locations
    }
  }

  // Regenerate index
  try {
    generateIndex(wikiRoot);
  } catch {
    // Non-fatal
  }

  // Append to log
  try {
    appendLog(wikiRoot, "update", "batch", `Expanded: ${expanded}`);
  } catch {
    // Non-fatal
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "wiki_deepen_location",
    data: { expandedCount: expanded },
  };
}

/**
 * wiki_extract_event: Extract narrative events from session messages and create wiki event pages.
 * Maps from: extract_event
 */
async function handleWikiExtractEvent(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { sessionId, userId } = payload;
  if (!sessionId || !userId) throw new Error("Missing sessionId or userId");

  const db = getDb();
  const wikiRoot = getWikiRoot(userId as string);

  // Get recent messages from the session
  const messages = db.prepare(`
    SELECT id, content, sender_id, timestamp
    FROM messages
    WHERE session_id = ? AND is_deleted = 0
    ORDER BY timestamp DESC
    LIMIT 10
  `).all(sessionId) as { id: string; content: string; sender_id: string | null; timestamp: string }[];

  if (messages.length === 0) {
    markJobCompleted(jobId);
    return { success: true, jobId, type: "wiki_extract_event", data: { extractedCount: 0 } };
  }

  const messageText = messages
    .map((m) => `${m.sender_id === null ? "AI" : "Player"}: ${m.content}`)
    .join("\n");

  const prompt = `Analyze these recent messages and extract any significant narrative events. Return JSON:
{
  "events": [
    {
      "title": "brief event title",
      "eventType": "conflict|discovery|relationship|journey|decision|other",
      "outcome": "what happened as a result",
      "importance": "low|medium|high|critical"
    }
  ]
}

Messages:
${messageText}`;

  let extracted = 0;
  try {
    const response = await generateText(prompt, { temperature: 0.3, num_ctx: 4096, userId: userId as string });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.events)) {
        for (const event of parsed.events) {
          const filename = `event_${event.title.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-")}.md`;
          const pagePath = `${wikiRoot}/concepts/${filename}`;

          const body = `**Event Type:** ${event.eventType || "other"}\n**Outcome:** ${event.outcome || "Unknown"}\n**Importance:** ${event.importance || "medium"}\n\n## Details\nExtracted from session ${sessionId}.`;

          const frontmatter: WikiFrontmatter = {
            title: `Event: ${event.title || "Unknown Event"}`,
            type: "concept",
            status: "draft",
            tags: ["event", `type:${event.eventType || "other"}`, `importance:${event.importance || "medium"}`, `session:${sessionId}`],
            created: new Date().toISOString(),
          };

          writeWikiPage(pagePath, body, frontmatter);
          extracted++;
        }
      }
    }
  } catch {
    // Skip if extraction fails
  }

  // Regenerate index
  try {
    generateIndex(wikiRoot);
  } catch {
    // Non-fatal
  }

  // Append to log
  try {
    appendLog(wikiRoot, "create", sessionId as string, `Extracted: ${extracted}`);
  } catch {
    // Non-fatal
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "wiki_extract_event",
    data: { extractedCount: extracted },
  };
}
