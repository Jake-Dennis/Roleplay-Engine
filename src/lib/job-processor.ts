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
import { processLoreExpansion } from "@/lib/lore-expansion";
import { generateText } from "@/lib/ollama";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import { getRetrievedContext, assemblePromptWithBudget } from "@/lib/retrieval";
import { summarizeMessage } from "@/lib/message-summarizer";
import { applyDecayToAllRelationships } from "@/lib/relationship-decay";
import { runIdleEnrichment } from "@/lib/idle-enrichment";

export type JobType =
  | "generate_response"
  | "summarize_messages"
  | "summarize_message"
  | "generate_embeddings"
  | "analyze_relationships"
  | "expand_lore"
  | "decay_relationships"
  | "compress_memories"
  | "refine_relationship_summary"
  | "enrich_npc"
  | "expand_rumors"
  | "archival_processing"
  | "extract_event"
  | "expand_location_lore"
  | "thread_analysis"
  | "lore_deepening"
  | "idle_enrichment";

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
      case "expand_lore":
        return await handleExpandLore(job.id, payload);
      case "decay_relationships":
        return await handleDecayRelationships(job.id, payload);
      case "compress_memories":
        return await handleCompressMemories(job.id, payload);
      case "refine_relationship_summary":
        return await handleRefineRelationshipSummary(job.id, payload);
      case "enrich_npc":
        return await handleEnrichNpc(job.id, payload);
      case "expand_rumors":
        return await handleExpandRumors(job.id, payload);
      case "archival_processing":
        return await handleArchivalProcessing(job.id, payload);
      case "extract_event":
        return await handleExtractEvent(job.id, payload);
      case "expand_location_lore":
        return await handleExpandLocationLore(job.id, payload);
      case "thread_analysis":
        return await handleThreadAnalysis(job.id, payload);
      case "lore_deepening":
        return await handleLoreDeepening(job.id, payload);
      case "idle_enrichment":
        return await handleIdleEnrichment(job.id, payload);
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

async function handleExpandLore(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { universeId, userId } = payload;
  if (!universeId || !userId) throw new Error("Missing universeId or userId");

  updateJobProgress(jobId, 20, "Scanning existing lore...");
  const result = await processLoreExpansion(
    userId as string,
    universeId as string
  );
  updateJobProgress(jobId, 80, "Generating new lore...");
  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "expand_lore",
    data: { expandedCount: result.expandedCount },
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

async function handleEnrichNpc(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId } = payload;
  if (!userId) throw new Error("Missing userId");

  const db = getDb();

  let query = `
    SELECT n.id, n.name, n.file_path, n.importance
    FROM npcs n
    WHERE n.user_id = ? AND n.importance IN ('high', 'critical')
  `;
  const params: (string | number)[] = [userId];

  if (universeId) {
    query += " AND n.universe_id = ?";
    params.push(universeId);
  }

  query += `
    ORDER BY n.importance DESC
    LIMIT 3
  `;

  const npcs = db.prepare(query).all(...params) as { id: string; name: string; file_path: string; importance: string }[];

  let processed = 0;
  const totalNpcs = npcs.length;
  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i];
    const filePath = npc.file_path;
    if (!filePath) continue;

    const fs = require("fs");
    const path = require("path");
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

    if (!fs.existsSync(fullPath)) continue;

    const existingContent = fs.readFileSync(fullPath, "utf-8");

    const prompt = `Expand on the NPC "${npc.name}". Current lore:\n${existingContent.slice(0, 1000)}\n\nAdd 2-3 new details about their personality, habits, or hidden motivations. Do not contradict existing facts. Return only the new content as markdown.`;

    try {
      const enrichment = await generateText(prompt, { userId: userId as string });
      const newContent = existingContent + `\n\n## Recent Observations\n${enrichment}`;
      fs.writeFileSync(fullPath, newContent, "utf-8");

      db.prepare(
        "INSERT INTO lore_validations (id, user_id, entity_type, entity_id, state, generated_by) VALUES (?, ?, 'npc', ?, 'generated_unverified', 'enrich_npc')"
      ).run(crypto.randomUUID(), userId, npc.id);
      processed++;
    } catch {
      // Skip failed NPCs
    }

    // Update progress
    if (totalNpcs > 1 && (i + 1) % Math.max(1, Math.floor(totalNpcs / 3)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalNpcs) * 80), `Enriching ${i + 1}/${totalNpcs}...`);
    }
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "enrich_npc",
    data: { processed },
  };
}

async function handleExpandRumors(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId } = payload;
  if (!userId) throw new Error("Missing userId");

  const db = getDb();

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

  const recentEvents = db.prepare(query).all(...params) as { id: string; title: string; event_type: string; outcome: string | null; occurred_at: string }[];

  let processed = 0;
  const totalEvents = recentEvents.length;
  for (let i = 0; i < recentEvents.length; i++) {
    const event = recentEvents[i];
    const existingRumor = db.prepare(
      "SELECT id FROM narrative_memories WHERE user_id = ? AND type = 'rumor' AND content LIKE ?"
    ).get(userId, `%${event.title}%`);

    if (existingRumor) continue;

    const prompt = `Based on this event: "${event.title}" (${event.event_type}, outcome: ${event.outcome || "unknown"}), generate 1-2 rumors that might spread among NPCs. Rumors should be plausible but potentially inaccurate. Return as bullet points.`;

    try {
      const rumors = await generateText(prompt, { userId: userId as string });

      db.prepare(
        "INSERT INTO narrative_memories (id, user_id, session_id, type, content, importance, related_entities) VALUES (?, ?, NULL, 'rumor', ?, ?, ?)"
      ).run(
        crypto.randomUUID(),
        userId,
        rumors,
        JSON.stringify({ emotional: 1, local: 2, canonical: 1, recency: 4 }),
        JSON.stringify([event.id])
      );
      processed++;
    } catch {
      // Skip failed events
    }

    // Update progress
    if (totalEvents > 2 && (i + 1) % Math.max(1, Math.floor(totalEvents / 3)) === 0) {
      updateJobProgress(jobId, Math.round(((i + 1) / totalEvents) * 80), `Expanding rumors ${i + 1}/${totalEvents}...`);
    }
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "expand_rumors",
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

async function handleExtractEvent(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { sessionId, userId } = payload;
  if (!sessionId || !userId) throw new Error("Missing sessionId or userId");

  const db = getDb();

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
    return { success: true, jobId, type: "extract_event", data: { extractedCount: 0 } };
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
          const eventId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO events (id, user_id, session_id, title, event_type, outcome, importance, occurred_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run(
            eventId,
            userId,
            sessionId,
            event.title || "Unknown Event",
            event.eventType || "other",
            event.outcome || null,
            event.importance || "medium"
          );
          extracted++;
        }
      }
    }
  } catch {
    // Skip if extraction fails
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "extract_event",
    data: { extractedCount: extracted },
  };
}

async function handleExpandLocationLore(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId, locationId } = payload;
  if (!userId) throw new Error("Missing userId");

  const db = getDb();

  let query = `
    SELECT l.id, l.name, l.description
    FROM locations l
    WHERE l.user_id = ?
  `;
  const params: (string | number)[] = [userId];

  if (locationId) {
    query += " AND l.id = ?";
    params.push(locationId as string);
  } else if (universeId) {
    query += " AND l.universe_id = ?";
    params.push(universeId as string);
  }

  query += " ORDER BY l.updated_at DESC LIMIT 3";

  const locations = db.prepare(query).all(...params) as {
    id: string;
    name: string;
    description: string | null;
  }[];

  let expanded = 0;
  for (const loc of locations) {
    const existingLore = loc.description || "";
    if (!existingLore) continue;

    const prompt = `Expand on the location "${loc.name}". Current description:\n${existingLore.slice(0, 500)}\n\nAdd 2-3 new atmospheric details, historical notes, or sensory descriptions. Do not contradict existing facts.`;

    try {
      const expansion = await generateText(prompt, { userId: userId as string });

      db.prepare(`
        INSERT INTO narrative_memories (id, user_id, universe_id, session_id, type, content, importance)
        VALUES (?, ?, ?, NULL, 'location_lore', ?, ?)
      `).run(
        crypto.randomUUID(),
        userId,
        universeId,
        `[LOCATION LORE] ${loc.name}: ${expansion}`,
        JSON.stringify({ emotional: 1, local: 3, canonical: 2, recency: 4 })
      );

      db.prepare(`
        INSERT INTO lore_validations (id, user_id, entity_type, entity_id, state, generated_by)
        VALUES (?, ?, 'location', ?, 'generated_unverified', 'expand_location_lore')
      `).run(crypto.randomUUID(), userId, loc.id);

      expanded++;
    } catch {
      // Skip failed locations
    }
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "expand_location_lore",
    data: { expandedCount: expanded },
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

async function handleLoreDeepening(jobId: string, payload: JobPayload): Promise<JobResult> {
  const { userId, universeId } = payload;
  if (!userId) throw new Error("Missing userId");

  const db = getDb();

  // Get lore entries that haven't been deepened recently
  let query = `
    SELECT le.id, le.title, le.content, le.type
    FROM lore_entries le
    WHERE le.user_id = ?
  `;
  const params: (string | number)[] = [userId];

  if (universeId) {
    query += " AND le.universe_id = ?";
    params.push(universeId);
  }

  query += `
    AND le.updated_at < datetime('now', '-3 days')
    ORDER BY le.updated_at ASC
    LIMIT 5
  `;

  const loreEntries = db.prepare(query).all(...params) as {
    id: string;
    title: string;
    content: string;
    type: string;
  }[];

  let deepened = 0;
  for (const entry of loreEntries) {
    const prompt = `Deepen this lore entry "${entry.title}" (${entry.type}). Current content:\n${entry.content.slice(0, 800)}\n\nAdd new details, connections to other lore, or implications. Do not contradict existing facts. Return only the new content.`;

    try {
      const deepening = await generateText(prompt, { userId: userId as string });

      db.prepare(`
        INSERT INTO narrative_memories (id, user_id, universe_id, session_id, type, content, importance, related_entities)
        VALUES (?, ?, ?, NULL, 'lore_deepening', ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        userId,
        universeId,
        `[LORE DEEPENING] ${entry.title}: ${deepening}`,
        JSON.stringify({ emotional: 1, local: 2, canonical: 3, recency: 4 }),
        JSON.stringify([entry.id])
      );

      db.prepare(`
        INSERT INTO lore_validations (id, user_id, entity_type, entity_id, state, generated_by)
        VALUES (?, ?, 'lore', ?, 'generated_unverified', 'lore_deepening')
      `).run(crypto.randomUUID(), userId, entry.id);

      deepened++;
    } catch {
      // Skip failed entries
    }
  }

  markJobCompleted(jobId);

  return {
    success: true,
    jobId,
    type: "lore_deepening",
    data: { deepenedCount: deepened },
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
