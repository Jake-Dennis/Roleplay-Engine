/**
 * Tests for job-processor.ts and jobs/queue.ts
 *
 * Covers:
 *  - queueJob: creation, dedup, debounce
 *  - getUserJobs: listing and filtering
 *  - getNextJob: priority/FIFO ordering
 *  - markJobProcessing / markJobCompleted / markJobFailed / updateJobProgress
 *  - cancelJob / cancelAllUserJobs / retryJob
 *  - recoverStaleJobs / getJobStats
 *  - processUserJobs / processJob / processJobsByType
 *
 * Uses bun:sqlite (in-memory) wrapped in a better-sqlite3-compatible
 * adapter because bun cannot load the better-sqlite3 native addon.
 * Mocks @/lib/db, @/lib/logger, @/lib/event-bus, @/lib/ollama-busy.
 * Mocks all job handler modules so processJob dispatch is testable.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { Database as BunDatabase } from "bun:sqlite";
import type { JobType, JobResult, QueuedJob } from "../types";

// ===========================================================================
// better-sqlite3 compatibility adapter for bun:sqlite
// ===========================================================================

class CompatStatement {
  private stmt: ReturnType<BunDatabase["query"]>;
  constructor(stmt: ReturnType<BunDatabase["query"]>) {
    this.stmt = stmt;
  }
  run(...params: unknown[]) {
    const result = this.stmt.run(...params);
    return { changes: result.changes };
  }
  get(...params: unknown[]) {
    return this.stmt.get(...params) ?? undefined;
  }
  all(...params: unknown[]) {
    return this.stmt.all(...params);
  }
}

class CompatDatabase {
  private db: BunDatabase;
  constructor() {
    this.db = new BunDatabase(":memory:");
    this.db.run("PRAGMA foreign_keys = ON");
  }
  prepare(sql: string) {
    return new CompatStatement(this.db.query(sql));
  }
  exec(sql: string) {
    this.db.run(sql);
  }
  close() {
    this.db.close();
  }
  get closed() {
    try {
      this.db.query("SELECT 1").get();
      return false;
    } catch {
      return true;
    }
  }
}

// ===========================================================================
// Mutable mock state
// ===========================================================================

let mockDb: CompatDatabase;
let mockIsOllamaBusy = false;

/** Captures events emitted by the event bus during tests */
const capturedEvents: { name: string; data: unknown }[] = [];

/** Captures handler calls from mocked job handler modules */
const handlerCalls: { handler: string; args: unknown[] }[] = [];

// ===========================================================================
// Module mocks — must appear BEFORE any imports under test
// ===========================================================================

mock.module("@/lib/db", () => ({
  getDb: () => mockDb,
}));

mock.module("@/lib/logger", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

mock.module("@/lib/event-bus", () => ({
  eventBus: {
    emit: (name: string, data: unknown) => {
      capturedEvents.push({ name, data });
    },
  },
  SessionEvents: {
    JOB_PROGRESS: "job:progress",
  },
}));

mock.module("@/lib/ollama-busy", () => ({
  isOllamaBusy: () => mockIsOllamaBusy,
}));

// ---------------------------------------------------------------------------
// Mock all job handler modules so processJob dispatch is testable.
// Each handler records the call and returns success.
// ---------------------------------------------------------------------------

function makeHandlerMock(handlerName: string, expectedType?: JobType) {
  return async (id: string, ...args: unknown[]): Promise<JobResult> => {
    handlerCalls.push({ handler: handlerName, args: [id, ...args] });
    // Some handlers receive type as last arg (summarization, wiki),
    // others don't (embedding, evolution, etc.) — use expectedType when provided.
    const jobType: JobType = expectedType ?? (args[args.length - 1] as JobType);
    return { success: true, jobId: id, type: jobType };
  };
}

mock.module("../summarization-handler", () => ({
  handleSummarizationJob: makeHandlerMock("handleSummarizationJob"),
}));

mock.module("../wiki-handler", () => ({
  handleWikiJob: makeHandlerMock("handleWikiJob"),
}));

mock.module("../npc-evolution", () => ({
  handleNpcEvolutionJob: makeHandlerMock("handleNpcEvolutionJob", "npc_evolution"),
}));

mock.module("../lore-extraction", () => ({
  handleLoreExtractionJob: makeHandlerMock("handleLoreExtractionJob", "extract_lore_comprehensive"),
}));

mock.module("../session-recap", () => ({
  handleSessionRecapJob: makeHandlerMock("handleSessionRecapJob", "generate_session_recap"),
}));

mock.module("../scene-handler", () => ({
  handleSceneStateExtract: makeHandlerMock("handleSceneStateExtract", "scene_state_extract"),
}));

mock.module("../npc-wiki-sync", () => ({
  handleNpcWikiSync: makeHandlerMock("handleNpcWikiSync", "npc_wiki_sync"),
}));

mock.module("../embedding-handler", () => ({
  handleGenerateEmbeddings: makeHandlerMock("handleGenerateEmbeddings", "generate_embeddings"),
}));

mock.module("../relationship-analysis-handler", () => ({
  handleAnalyzeRelationships: makeHandlerMock("handleAnalyzeRelationships", "analyze_relationships"),
}));

mock.module("../decay-handler", () => ({
  handleDecayRelationships: makeHandlerMock("handleDecayRelationships", "decay_relationships"),
}));

mock.module("../relationship-summary-handler", () => ({
  handleRefineRelationshipSummary: makeHandlerMock("handleRefineRelationshipSummary", "refine_relationship_summary"),
}));

mock.module("../archival-handler", () => ({
  handleArchivalProcessing: makeHandlerMock("handleArchivalProcessing", "archival_processing"),
}));

mock.module("../thread-analysis-handler", () => ({
  handleThreadAnalysis: makeHandlerMock("handleThreadAnalysis", "thread_analysis"),
}));

mock.module("../wiki-restructure-suggestions", () => ({
  handleWikiSuggestRestructure: makeHandlerMock("handleWikiSuggestRestructure", "wiki_suggest_restructure"),
}));

// ===========================================================================
// Imports under test
// ===========================================================================

import {
  queueJob,
  getNextJob,
  getUserJobs,
  markJobProcessing,
  markJobCompleted,
  markJobFailed,
  updateJobProgress,
  cancelJob,
  cancelAllUserJobs,
  retryJob,
  retryAllFailedJobs,
  getJobStats,
  recoverStaleJobs,
  reapOldJobs,
} from "../queue";

import {
  processUserJobs,
  processJobsByType,
  processJob,
} from "../../job-processor";

// ===========================================================================
// Test helpers
// ===========================================================================

function createTestDb(): CompatDatabase {
  const db = new CompatDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_queue (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      universe_id TEXT,
      type TEXT NOT NULL,
      priority TEXT DEFAULT 'low',
      status TEXT DEFAULT 'queued',
      payload TEXT DEFAULT '{}',
      progress REAL DEFAULT 0,
      progress_message TEXT,
      max_retries INTEGER DEFAULT 999,
      retry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME,
      error TEXT,
      result TEXT
    );
  `);
  return db;
}

function createTestUser(db: CompatDatabase): string {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
  ).run(id, `testuser_${id.slice(0, 8)}`, "hash");
  return id;
}

function createTestDbWithUser(): { db: CompatDatabase; userId: string } {
  const db = createTestDb();
  const userId = createTestUser(db);
  return { db, userId };
}

function countJobsByStatus(db: CompatDatabase, userId: string): Record<string, number> {
  const rows = db.prepare(
    "SELECT status, COUNT(*) as count FROM job_queue WHERE user_id = ? GROUP BY status"
  ).all(userId) as { status: string; count: number }[];
  const stats: Record<string, number> = {};
  for (const row of rows) stats[row.status] = row.count;
  return stats;
}

function getJobById(db: CompatDatabase, jobId: string): QueuedJob | undefined {
  return db.prepare("SELECT * FROM job_queue WHERE id = ?").get(jobId) as QueuedJob | undefined;
}

// ===========================================================================
// Tests
// ===========================================================================

beforeEach(() => {
  const { db, userId } = createTestDbWithUser();
  mockDb = db;
  (mockDb as any).__testUserId = userId;
  mockIsOllamaBusy = false;
  capturedEvents.length = 0;
  handlerCalls.length = 0;
});

afterEach(() => {
  if (mockDb && !mockDb.closed) {
    mockDb.close();
  }
});

// ---------------------------------------------------------------------------
// queueJob
// ---------------------------------------------------------------------------

describe("queueJob", () => {
  it("creates a job with queued status, correct priority, and type", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;
    const jobId = queueJob(userId, "generate_embeddings", { sessionId: "sess-1" }, "high");

    expect(jobId).toBeTruthy();
    const job = getJobById(db, jobId)!;
    expect(job).toBeDefined();
    expect(job.user_id).toBe(userId);
    expect(job.type).toBe("generate_embeddings");
    expect(job.priority).toBe("high");
    expect(job.status).toBe("queued");
    expect(job.max_retries).toBe(999);
    expect(JSON.parse(job.payload)).toEqual({ sessionId: "sess-1" });
  });

  it("uses medium priority by default", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;
    const jobId = queueJob(userId, "archival_processing", {});

    const job = getJobById(db, jobId)!;
    expect(job.priority).toBe("medium");
  });

  it("deduplicates identical jobs within the dedup window", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    // Uses a type WITHOUT debounce so dedup behavior can be observed in isolation
    const firstId = queueJob(userId, "archival_processing", {
      sessionId: "sess-1",
    });
    const secondId = queueJob(userId, "archival_processing", {
      sessionId: "sess-1",
    });

    expect(secondId).toBe(firstId);

    // Only one row in the DB
    const jobs = db.prepare("SELECT * FROM job_queue WHERE user_id = ?").all(userId);
    expect(jobs.length).toBe(1);
  });

  it("does NOT deduplicate jobs with different scope (different sessionId)", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    // Use a type WITHOUT debounce interval so dedup behavior is isolated
    const firstId = queueJob(userId, "archival_processing", {
      sessionId: "sess-1",
    });
    const secondId = queueJob(userId, "archival_processing", {
      sessionId: "sess-2",
    });

    expect(secondId).not.toBe(firstId);
    const jobs = db.prepare("SELECT * FROM job_queue WHERE user_id = ?").all(userId);
    expect(jobs.length).toBe(2);
  });

  it("does NOT dedup when previous job is already completed", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const firstId = queueJob(userId, "archival_processing", {
      sessionId: "sess-1",
    });
    markJobCompleted(firstId);

    const secondId = queueJob(userId, "archival_processing", {
      sessionId: "sess-1",
    });

    expect(secondId).not.toBe(firstId);
    const jobs = db.prepare("SELECT * FROM job_queue WHERE user_id = ?").all(userId);
    expect(jobs.length).toBe(2);
  });

  it("respects debounce intervals for burst-prone job types", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    // wiki_extract_event has a 60s debounce
    const firstId = queueJob(userId, "wiki_extract_event", {
      sessionId: "sess-1",
    });
    const secondId = queueJob(userId, "wiki_extract_event", {
      sessionId: "sess-2",
    });

    // Debounce applies regardless of scope — returns the first ID
    expect(secondId).toBe(firstId);
    const jobs = db.prepare("SELECT * FROM job_queue WHERE user_id = ?").all(userId);
    expect(jobs.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getUserJobs
// ---------------------------------------------------------------------------

describe("getUserJobs", () => {
  it("returns all jobs for a user", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    queueJob(userId, "summarize_messages", {});
    queueJob(userId, "generate_embeddings", {});

    const jobs = getUserJobs(userId);
    expect(jobs.length).toBe(2);
    jobs.forEach((j) => expect(j.user_id).toBe(userId));
  });

  it("returns empty array for a user with no jobs", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobs = getUserJobs(userId);
    expect(jobs).toEqual([]);
  });

  it("filters by status", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const id1 = queueJob(userId, "summarize_messages", {});
    const id2 = queueJob(userId, "generate_embeddings", {});
    markJobCompleted(id1);

    const queued = getUserJobs(userId, "queued");
    const completed = getUserJobs(userId, "completed");

    expect(queued.length).toBe(1);
    expect(queued[0].id).toBe(id2);
    expect(completed.length).toBe(1);
    expect(completed[0].id).toBe(id1);
  });

  it("does not return jobs belonging to a different user", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;
    const otherUserId = createTestUser(db);

    queueJob(userId, "summarize_messages", {});
    queueJob(otherUserId, "generate_embeddings", {});

    const jobs = getUserJobs(userId);
    expect(jobs.length).toBe(1);
    expect(jobs[0].user_id).toBe(userId);
  });
});

// ---------------------------------------------------------------------------
// getNextJob
// ---------------------------------------------------------------------------

describe("getNextJob", () => {
  it("returns the highest priority queued job", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    queueJob(userId, "summarize_messages", {}, "low");
    queueJob(userId, "generate_embeddings", {}, "high");
    queueJob(userId, "analyze_relationships", {}, "medium");

    const next = getNextJob(userId);
    expect(next).toBeDefined();
    expect(next!.priority).toBe("high");
    expect(next!.type).toBe("generate_embeddings");
  });

  it("returns oldest job among same priority (FIFO)", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const id1 = queueJob(userId, "summarize_messages", {}, "medium");
    // Small delay so timestamps differ
    db.prepare(
      "UPDATE job_queue SET created_at = datetime('now', '-1 second') WHERE id = ?"
    ).run(id1);
    const id2 = queueJob(userId, "generate_embeddings", {}, "medium");

    const next = getNextJob(userId);
    expect(next!.id).toBe(id1);
  });

  it("returns undefined when no queued jobs exist", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const next = getNextJob(userId);
    expect(next).toBeUndefined();
  });

  it("filters by type when specified", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    queueJob(userId, "summarize_messages", {}, "high");
    queueJob(userId, "generate_embeddings", {}, "high");

    const next = getNextJob(userId, "generate_embeddings");
    expect(next).toBeDefined();
    expect(next!.type).toBe("generate_embeddings");
  });
});

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

describe("state transitions", () => {
  it("markJobProcessing sets status to processing with 0 progress", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = queueJob(userId, "summarize_messages", {});
    markJobProcessing(jobId);

    const job = getJobById(db, jobId)!;
    expect(job.status).toBe("processing");
    expect(job.progress).toBe(0);
    expect(job.progress_message).toBe("Starting...");
  });

  it("markJobCompleted transitions to completed with 100% progress", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = queueJob(userId, "summarize_messages", {});
    markJobProcessing(jobId);
    markJobCompleted(jobId);

    const job = getJobById(db, jobId)!;
    expect(job.status).toBe("completed");
    expect(job.progress).toBe(100);
    expect(job.progress_message).toBe("Completed");
    expect(job.processed_at).not.toBeNull();
  });

  it("markJobFailed sets error and marks failed", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = queueJob(userId, "summarize_messages", {});
    markJobProcessing(jobId);
    markJobFailed(jobId, "Something went wrong");

    const job = getJobById(db, jobId)!;
    expect(job.status).toBe("failed");
    expect(job.error).toBe("Something went wrong");
    expect(job.processed_at).not.toBeNull();
  });

  it("updateJobProgress sets a progress value and emits event", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = queueJob(userId, "generate_embeddings", {});
    updateJobProgress(jobId, 50, "Halfway there");

    const job = getJobById(db, jobId)!;
    expect(job.progress).toBe(50);
    expect(job.progress_message).toBe("Halfway there");

    // Should emit SSE event
    expect(capturedEvents.length).toBe(1);
    expect(capturedEvents[0].name).toBe("job:progress");
    expect(capturedEvents[0].data).toEqual({
      jobId,
      progress: 50,
      message: "Halfway there",
    });
  });

  it("updateJobProgress clamps progress between 0 and 100", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = queueJob(userId, "summarize_messages", {});
    updateJobProgress(jobId, -10);
    updateJobProgress(jobId, 150);

    const job = getJobById(db, jobId)!;
    expect(job.progress).toBe(100); // last update was 150 → clamped to 100
  });

  it("allows completed -> processing transition (no state validation)", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = queueJob(userId, "summarize_messages", {});
    markJobProcessing(jobId);
    markJobCompleted(jobId);
   // No state validation prevents going back to processing
    markJobProcessing(jobId);

    const job = getJobById(db, jobId)!;
    expect(job.status).toBe("processing");
  });

  it("auto-retries transient errors with exponential backoff", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    // Create a job in processing state with low max_retries
    const jobId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO job_queue (id, user_id, type, priority, status, payload, max_retries, retry_count)
       VALUES (?, ?, 'summarize_messages', 'low', 'processing', '{}', 3, 0)`
    ).run(jobId, userId);

    // Transient error containing "timeout"
    markJobFailed(jobId, "Operation timed out after 30s");

    // Job should be re-queued
    const job = getJobById(db, jobId)!;
    expect(job.status).toBe("queued");
    expect(job.error).toBeNull();
    expect(job.retry_count).toBe(1);
    expect(job.progress).toBe(0);

    // Verify it's now pickable by getNextJob
    const next = getNextJob(userId);
    expect(next).toBeDefined();
    expect(next!.id).toBe(jobId);
  });

  it("does NOT auto-retry permanent errors", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = queueJob(userId, "summarize_messages", {});
    markJobProcessing(jobId);
    markJobFailed(jobId, "Invalid payload: missing required field");

    const job = getJobById(db, jobId)!;
    expect(job.status).toBe("failed");
    expect(job.error).toBe("Invalid payload: missing required field");
  });
});

// ---------------------------------------------------------------------------
// cancelJob / cancelAllUserJobs
// ---------------------------------------------------------------------------

describe("cancelJob", () => {
  it("cancels a queued job and returns true", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = queueJob(userId, "summarize_messages", {});
    const result = cancelJob(jobId);

    expect(result).toBe(true);
    const job = getJobById(db, jobId)!;
    expect(job.status).toBe("cancelled");
  });

  it("does NOT cancel a processing job and returns false", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = queueJob(userId, "summarize_messages", {});
    markJobProcessing(jobId);
    const result = cancelJob(jobId);

    expect(result).toBe(false);
    const job = getJobById(db, jobId)!;
    expect(job.status).toBe("processing");
  });

  it("returns false for nonexistent job", () => {
    const result = cancelJob("nonexistent-id");
    expect(result).toBe(false);
  });
});

describe("cancelAllUserJobs", () => {
  it("cancels all queued jobs for a user", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    queueJob(userId, "summarize_messages", {});
    queueJob(userId, "generate_embeddings", {});
    queueJob(userId, "analyze_relationships", {});

    const count = cancelAllUserJobs(userId);
    expect(count).toBe(3);

    const stats = countJobsByStatus(db, userId);
    expect(stats.cancelled).toBe(3);
  });

  it("does not cancel processing or completed jobs", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const id1 = queueJob(userId, "summarize_messages", {});
    const id2 = queueJob(userId, "generate_embeddings", {});
    markJobProcessing(id1);

    const count = cancelAllUserJobs(userId);
    expect(count).toBe(1); // Only the still-queued job

    expect(getJobById(db, id1)!.status).toBe("processing");
    expect(getJobById(db, id2)!.status).toBe("cancelled");
  });
});

// ---------------------------------------------------------------------------
// retryJob / retryAllFailedJobs
// ---------------------------------------------------------------------------

describe("retryJob", () => {
  it("resets a failed job to queued state", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = queueJob(userId, "summarize_messages", {});
    markJobProcessing(jobId);
    markJobFailed(jobId, "Some error");

    const result = retryJob(jobId);
    expect(result).toBe(true);

    const job = getJobById(db, jobId)!;
    expect(job.status).toBe("queued");
    expect(job.error).toBeNull();
    expect(job.progress).toBe(0);
    expect(job.retry_count).toBe(1);
  });

  it("returns false for non-failed jobs", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = queueJob(userId, "summarize_messages", {});
    const result = retryJob(jobId);
    expect(result).toBe(false);
  });

  it("returns false when max_retries cap is reached", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    // Create a job that has exhausted retries
    const jobId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO job_queue (id, user_id, type, priority, status, payload, max_retries, retry_count)
       VALUES (?, ?, 'summarize_messages', 'low', 'failed', '{}', 3, 3)`
    ).run(jobId, userId);

    const result = retryJob(jobId);
    expect(result).toBe(false);
  });
});

describe("retryAllFailedJobs", () => {
  it("retries all failed jobs for a user", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const id1 = queueJob(userId, "summarize_messages", {});
    const id2 = queueJob(userId, "generate_embeddings", {});
    markJobProcessing(id1);
    markJobFailed(id1, "error 1");
    markJobProcessing(id2);
    markJobFailed(id2, "error 2");

    const count = retryAllFailedJobs(userId);
    expect(count).toBe(2);

    expect(getJobById(db, id1)!.status).toBe("queued");
    expect(getJobById(db, id2)!.status).toBe("queued");
  });
});

// ---------------------------------------------------------------------------
// getJobStats
// ---------------------------------------------------------------------------

describe("getJobStats", () => {
  it("returns counts grouped by status", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const id1 = queueJob(userId, "summarize_messages", {});
    const id2 = queueJob(userId, "generate_embeddings", {});
    const id3 = queueJob(userId, "analyze_relationships", {});
    markJobProcessing(id1);
    markJobCompleted(id2);

    const stats = getJobStats(userId);
    expect(stats.queued).toBe(1);
    expect(stats.processing).toBe(1);
    expect(stats.completed).toBe(1);
  });

  it("returns empty object when user has no jobs", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const stats = getJobStats(userId);
    expect(stats).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// recoverStaleJobs
// ---------------------------------------------------------------------------

describe("recoverStaleJobs", () => {
  it("recovers jobs stuck in processing for more than 5 minutes", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = crypto.randomUUID();
    // Insert a job that was created 10 minutes ago and stuck in processing
    db.prepare(
      `INSERT INTO job_queue (id, user_id, type, priority, status, payload, created_at)
       VALUES (?, ?, 'summarize_messages', 'low', 'processing', '{}', datetime('now', '-10 minutes'))`
    ).run(jobId, userId);

    const count = recoverStaleJobs();
    expect(count).toBe(1);

    const job = getJobById(db, jobId)!;
    expect(job.status).toBe("failed");
    expect(job.error).toBe("Server crashed during processing");
  });

  it("does not recover recently created processing jobs", () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = queueJob(userId, "summarize_messages", {});
    markJobProcessing(jobId);

    const count = recoverStaleJobs();
    expect(count).toBe(0);

    const job = getJobById(db, jobId)!;
    expect(job.status).toBe("processing");
  });
});

// ---------------------------------------------------------------------------
// processUserJobs / processJob / processJobsByType
// ---------------------------------------------------------------------------

describe("processJob", () => {
  it("marks job as processing then delegates to correct handler", async () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = queueJob(userId, "generate_embeddings", { sessionId: "s-1" }, "high");
    const job = getJobById(db, jobId)!;

    const result = await processJob(job);

    expect(result.success).toBe(true);
    expect(result.jobId).toBe(jobId);
    expect(result.type).toBe("generate_embeddings");

    // Should have been marked processing (handler calls markJobCompleted itself in real code)
    expect(getJobById(db, jobId)!.status).toBe("processing");

    // Verify the correct handler was dispatched
    expect(handlerCalls.length).toBe(1);
    expect(handlerCalls[0].handler).toBe("handleGenerateEmbeddings");
    expect(handlerCalls[0].args[0]).toBe(jobId);
  });

  it("handles unknown job type by marking as failed", async () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const jobId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO job_queue (id, user_id, type, priority, status, payload)
       VALUES (?, ?, 'unknown_type_xyz', 'low', 'queued', '{}')`
    ).run(jobId, userId);

    const job = getJobById(db, jobId)!;
    const result = await processJob(job);

    expect(result.success).toBe(false);
    expect(result.jobId).toBe(jobId);
    expect(result.error).toContain("Unknown job type");

    // Job should be marked as failed
    expect(getJobById(db, jobId)!.status).toBe("failed");
    expect(getJobById(db, jobId)!.error).toContain("Unknown job type");
  });
});

describe("processUserJobs", () => {
  it("processes jobs in priority order", async () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    queueJob(userId, "analyze_relationships", {}, "low");
    queueJob(userId, "generate_embeddings", {}, "high");
    queueJob(userId, "summarize_messages", {}, "medium");

    const results = await processUserJobs(userId, 10);

    expect(results.length).toBe(3);

    // Should process high first, then medium, then low
    const types = results.map((r) => r.type);
    expect(types).toEqual(["generate_embeddings", "summarize_messages", "analyze_relationships"]);

    // All should be successful
    results.forEach((r) => expect(r.success).toBe(true));
  });

  it("processes up to maxJobs limit", async () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    queueJob(userId, "summarize_messages", {}, "medium");
    queueJob(userId, "generate_embeddings", {}, "medium");
    queueJob(userId, "analyze_relationships", {}, "medium");

    const results = await processUserJobs(userId, 2);

    expect(results.length).toBe(2);
  });

  it("stops processing when isOllamaBusy is true", async () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    queueJob(userId, "summarize_messages", {}, "medium");

    mockIsOllamaBusy = true;
    const results = await processUserJobs(userId, 10);

    expect(results.length).toBe(0);

    // Job should still be queued
    const stats = getJobStats(userId);
    expect(stats.queued).toBe(1);
  });

  it("returns empty array when no jobs are queued", async () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    const results = await processUserJobs(userId, 10);
    expect(results).toEqual([]);
  });

  it("handles errors by marking job as failed", async () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    // Create a job with an unknown type that will hit the default case
    const jobId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO job_queue (id, user_id, type, priority, status, payload)
       VALUES (?, ?, 'unknown_type_xyz', 'medium', 'queued', '{}')`
    ).run(jobId, userId);

    const results = await processUserJobs(userId, 10);

    expect(results.length).toBe(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("Unknown job type");
    expect(results[0].type).toBe("unknown_type_xyz");

    // Job should be marked as failed in DB
    const job = getJobById(db, jobId)!;
    expect(job.status).toBe("failed");
    expect(job.error).toContain("Unknown job type");
  });
});

describe("processJobsByType", () => {
  it("processes only jobs of the specified type", async () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    queueJob(userId, "summarize_messages", {}, "medium");
    queueJob(userId, "generate_embeddings", {}, "medium");
    queueJob(userId, "analyze_relationships", {}, "medium");

    const results = await processJobsByType(userId, "generate_embeddings", 5);

    expect(results.length).toBe(1);
    expect(results[0].type).toBe("generate_embeddings");
  });

  it("respects isOllamaBusy gating", async () => {
    const db = mockDb;
    const userId = (db as any).__testUserId as string;

    queueJob(userId, "analyze_relationships", {}, "medium");

    mockIsOllamaBusy = true;
    const results = await processJobsByType(userId, "analyze_relationships", 5);
    expect(results.length).toBe(0);
  });
});
