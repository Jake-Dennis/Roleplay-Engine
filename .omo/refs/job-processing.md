# Job Processing Subsystem

**Last Updated**: 2026-05-27

**Source files**: `src/lib/jobs/` directory (queue.ts, processor.ts, handler registry, per-type handlers) plus enqueue callers in API routes and idle-processing.ts.

---

## Table of Contents

- [1. job_queue Table Schema](#1-job_queue-table-schema)
- [2. Indexes](#2-indexes)
- [3. Status Model & Lifecycle](#3-status-model--lifecycle)
- [4. All 20 Job Types](#4-all-20-job-types)
- [5. Job Processor Flow](#5-job-processor-flow)
- [6. Dedup & Debounce](#6-dedup--debounce)
- [7. Idle Processing Tiers](#7-idle-processing-tiers)
- [8. Job Handlers](#8-job-handlers)
- [9. SSE Progress Flow](#9-sse-progress-flow)
- [10. Enqueue Callers by Source Route](#10-enqueue-callers-by-source-route)
- [11. Error Handling](#11-error-handling)
- [12. Known Gaps](#12-known-gaps)
- [13. Relationship Evolution Recording](#13-relationship-evolution-recording)

---

## 1. job_queue Table Schema

Defined in `scripts/init-db.ts:320`.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Job owner |
| universe_id | TEXT | FK -> universes(id) | Scope (nullable for session-only jobs) |
| type | TEXT | NOT NULL | Job type identifier (20 types) |
| priority | TEXT | DEFAULT 'medium' | 'low', 'medium', 'high', 'critical' |
| status | TEXT | DEFAULT 'queued' | 'queued', 'processing', 'completed', 'failed', 'cancelled' |
| payload | TEXT | — | JSON job parameters |
| progress | REAL | DEFAULT 0 | Progress 0-1 (mapped to 0-100 for SSE) |
| progress_message | TEXT | — | Human-readable status description |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | When job was enqueued |
| processed_at | DATETIME | — | When processing started or completed |
| error | TEXT | — | Error message if failed |
| result | TEXT | — | JSON result data |
| retry_count | INTEGER | DEFAULT 0 | Current retry attempt number |
| max_retries | INTEGER | DEFAULT 3 | Maximum retry attempts before permanent failure |

---

## 2. Indexes

Three indexes on job_queue for query performance:

| # | Index Name | Columns | Purpose |
|---|------------|---------|---------|
| 1 | idx_job_queue_status | status, priority | Fast lookup of queued jobs by priority for processing |
| 2 | idx_job_queue_universe | universe_id | Filter jobs scoped to a universe |
| 3 | idx_jobs_user_status_type | user_id, status, type, priority | Multi-column lookup for user-specific job views |

All created in `scripts/init-db.ts:456-495`.

---

## 3. Status Model & Lifecycle

### State Transitions

```
  queued ─────────────────────────────────────────┐
    │                                              │
    ▼                                              │
processing ──→ completed (success)                 │
    │                                              │
    ├──→ failed ──→ queued (auto-retry)            │
    │       │                                      │
    │       └──→ failed (permanent, retries exhausted)
    │                                              │
    └──→ cancelled (manual or preempted)           │
    │                                              │
    └──→ failed (stale recovery, >5min in processing)
```

### Transition Rules

- **queued → processing**: Job processor picks up the job and calls `markJobProcessing()`.
- **processing → completed**: Handler succeeds, calls `markJobCompleted()`.
- **processing → failed**: Handler throws, calls `markJobFailed()`. If `retry_count < max_retries`, status resets to `queued` for automatic retry.
- **failed → queued (auto-retry)**: On failure, if retry_count < max_retries, the job is re-queued with incremented retry_count. Default max_retries = 3.
- **failed (permanent)**: When retry_count >= max_retries, the job stays in `failed` status with the error preserved.
- **processing → failed (stale recovery)**: A periodic check finds jobs stuck in `processing` for >5 minutes and marks them as failed with `error = "Stale job"`.
- **cancelled**: Manually set via `/api/jobs` POST (cancel action) or when a job is preempted. No recovery from cancelled.

### Auto-Retry Behavior

On handler failure, `markJobFailed()` checks `retry_count < max_retries`. If retries remain:
- Status is set to `queued` (not `failed`)
- `retry_count` is incremented
- The job remains eligible for the next processor cycle
- Exponential backoff is applied (see Error Handling section)

On retry exhaustion (retry_count >= max_retries):
- Status stays `failed`
- `error` field holds the last error message
- No further processing attempts

### Stale Recovery

A periodic sweep identifies jobs with `status = 'processing'` and `processed_at < NOW() - 5 minutes`. These are force-failed with `error = "Stale job"` and retry_count is checked for re-queue eligibility.

---

## 4. All 20 Job Types

| # | Job Type | What It Does | Handler |
|---|----------|-------------|---------|
| 1 | summarize_messages | Generates message summaries after new messages arrive. Summarizes recent conversation into semantic, emotional, and relationship-impact summaries in message_summaries table. | summarization-handler |
| 2 | generate_embeddings | Computes vector embeddings (bge-m3, 1024-dim) for new/updated content and stores in embedding_index + embedding_vectors tables. Also syncs vec0 virtual tables. | embedding-handler |
| 3 | analyze_relationships | Analyzes recent messages to detect relationship changes between entities. Updates emotional_state, shared_history, relationship_stage in relationships table. | relationship-analysis-handler |
| 4 | decay_relationships | Applies time-based decay to relationship emotional states. Reduces intensity of relationships that haven't been updated recently. | decay-handler |
| 5 | compress_memories | Compresses old narrative memories into summarized form to save context space and maintain long-term history without full detail. | (memory compression handler) |
| 6 | refine_relationship_summary | Takes accumulated relationship evolution data and rewrites the relationship summary to reflect the current state. | relationship-summary-handler |
| 7 | archival_processing | Moves old, low-importance data to archival storage. Manages data retention and cleanup. | archival-handler |
| 8 | thread_analysis | Analyzes conversation for narrative thread tracking. Detects active, resolved, and abandoned threads. Updates narrative_threads table. | thread-analysis-handler |
| 9 | wiki_ingest | Ingests external content into the wiki from imported sources. Parses and stores as new wiki pages. | wiki-handler |
| 10 | wiki_enrich_entity | Enriches an existing wiki entity page with additional detail. Adds descriptions, traits, relationships, and cross-references. | wiki-handler |
| 11 | wiki_generate_rumors | Generates in-world rumors about wiki entities. Creates unverified lore that can be validated later. | wiki-handler |
| 12 | wiki_deepen_page | Deepens an existing wiki page by generating additional content sections. Expands short pages with more detail. | wiki-handler |
| 13 | wiki_deepen_location | Deepens a location wiki page specifically. Adds geography, history, notable features, and atmosphere details. | wiki-handler |
| 14 | wiki_extract_event | Extracts event data from conversation into the events table. Creates event records with participants, outcomes, and consequences. | lore-extraction |
| 15 | generate_session_recap | Generates a narrative recap of an entire session. Summarizes key events, character development, and plot progression. | session-recap |
| 16 | npc_evolution | Evolves NPCs based on narrative interactions. Updates personality traits, behavior patterns, and evolution_log in npcs table. | npc-evolution |
| 17 | extract_lore_comprehensive | Comprehensive lore extraction from all session messages. Runs full-depth entity, location, event, and relationship extraction. | lore-extraction |
| 18 | scene_state_extract | Extracts scene state from recent messages. Updates scene_states table with active location, intent, tension, conflict type, and stakes. | scene-handler |
| 19 | wiki_auto_extract | Automatically extracts wiki pages from conversation content. Creates wiki pages for entities, locations, and events mentioned in messages. | wiki-handler |
| 20 | universe_wiki_sync | Synchronizes wiki pages across a universe. Ensures cross-references, backlinks, and entity validations are consistent. | wiki-handler |

---

## 5. Job Processor Flow

### Core Processing Loop

The job processor (`src/lib/jobs/` processor entry point) runs the following flow:

```
1. processJob() called (from API trigger or idle processing)
    │
    ├──→ Fetch next queued job (ordered by priority, then created_at)
    │     WHERE status = 'queued' AND (dedup window passed)
    │
    ├──→ markJobProcessing(jobId)
    │     Sets status = 'processing', processed_at = NOW()
    │
    ├──→ switch(job.type) dispatch
    │     Maps job type string to registered handler function
    │     Handler registry maps type → handler module
    │
    ├──→ Handler execution (await handler.process(job))
    │     ├──→ Handler reads job.payload for parameters
    │     ├──→ Handler calls updateJobProgress() during execution
    │     └──→ Handler returns result or throws error
    │
    ├──→ On success: markJobCompleted(jobId, result)
    │     Sets status = 'completed', result = JSON
    │
    └──→ On error: markJobFailed(jobId, error)
          └──→ If retry_count < max_retries → status = 'queued' (retry)
          └──→ Else → status = 'failed' (permanent)
```

### Dispatch Mechanism

The processor uses a switch statement on `job.type` to select the appropriate handler module. Each handler is a module exporting a `process(job)` async function. The switch maps all 20 job type strings to their respective handler modules.

### Processing Triggers

Jobs are processed via two pathways:
1. **Synchronous API trigger**: Routes call `processJob()` immediately after enqueuing to process jobs inline (best-effort).
2. **Idle processing**: The idle processing system calls `processJob()` periodically (see Idle Processing Tiers section).

---

## 6. Dedup & Debounce

### Dedup (30-second window)

When a job is enqueued, the system checks if an identical job (same type + same scoping keys in payload) was already enqueued within the last 30 seconds. If so, the new enqueue is skipped. This prevents redundant jobs when multiple rapid events trigger the same processing.

### Debounce Configuration

Some job types have specific debounce intervals. When a debounced job is enqueued, the system replaces any existing queued/pending job of the same type+scope instead of creating a duplicate:

| Job Type | Debounce Interval | Scope Key |
|----------|------------------|-----------|
| wiki_extract_event | 60 seconds | sessionId |
| thread_analysis | 60 seconds | sessionId |
| scene_state_extract | 30 seconds | sessionId |
| analyze_relationships | 30 seconds | sessionId |

Debounce works by:
1. Looking up existing queued jobs of the same type+scope
2. If found within the interval, updating the existing job's payload instead of creating a new one
3. Resetting the created_at timer so the debounced job executes after the full interval from the latest trigger

---

## 7. Idle Processing Tiers

The idle processing system (`src/lib/idle-processing.ts`) runs on a user-configurable schedule. Each user has a `last_idle_t` field tracking their last processed tier. Tiers are checked in order, and only one tier runs per idle cycle.

### Tier Schedule

| Tier | Interval | Triggered Jobs | Description |
|------|----------|---------------|-------------|
| T1 | 5 minutes | compress_memories, refine_relationship_summary | Frequent lightweight maintenance |
| T2 | 10 minutes | wiki_deepen_page, wiki_enrich_entity, generate_embeddings | Content enrichment and indexing |
| T3 | 15 minutes | wiki_generate_rumors, archival_processing | Moderate-frequency lore generation and cleanup |
| T4 | 30 minutes | decay_relationships, summarize_messages | Infrequent but expensive operations |

### queueIdleJobs (Additional Idle Jobs)

Beyond the tier-scheduled jobs, `queueIdleJobs()` enqueues these additional job types during idle processing:

- extract_lore_comprehensive
- wiki_enrich_entity
- wiki_generate_rumors
- wiki_deepen_page

These run alongside the tier's scheduled jobs to provide comprehensive background processing without blocking user-facing operations.

---

## 8. Job Handlers

All handlers live in `src/lib/jobs/` and export a `process(job)` async function.

| Handler Module | File (relative to src/lib/jobs/) | Processes Job Types |
|----------------|----------------------------------|---------------------|
| summarization-handler | summarization-handler.ts | summarize_messages |
| wiki-handler | wiki-handler.ts | wiki_ingest, wiki_enrich_entity, wiki_generate_rumors, wiki_deepen_page, wiki_deepen_location, wiki_auto_extract, universe_wiki_sync |
| embedding-handler | embedding-handler.ts | generate_embeddings |
| relationship-analysis-handler | relationship-analysis-handler.ts | analyze_relationships |
| decay-handler | decay-handler.ts | decay_relationships |
| relationship-summary-handler | relationship-summary-handler.ts | refine_relationship_summary |
| archival-handler | archival-handler.ts | archival_processing |
| thread-analysis-handler | thread-analysis-handler.ts | thread_analysis |
| lore-extraction | lore-extraction.ts | wiki_extract_event, extract_lore_comprehensive |
| npc-evolution | npc-evolution.ts | npc_evolution |
| session-recap | session-recap.ts | generate_session_recap |
| scene-handler | scene-handler.ts | scene_state_extract |

### Handler Conventions

- All handlers receive the full `job_queue` row as their argument.
- Handlers call `updateJobProgress(jobId, progress, message)` to report status.
- Handlers should read `job.payload` (JSON) for type-specific parameters.
- Handlers return a result value (typically an object) that gets stored in `job.result`.
- Handlers throw on error; the processor catches and calls `markJobFailed()`.
- Handlers are responsible for their own DB transactions (better-sqlite3 synchronous).

---

## 9. SSE Progress Flow

### Update Path

```
job handler
    │
    ▼
updateJobProgress(jobId, progress, message)
  - Updates job_queue row: progress = val, progress_message = msg
  - progress: REAL 0-1 (stored in DB)
  - message: Human-readable string (nullable)
    │
    ▼
eventBus.emit(SessionEvents.JOB_PROGRESS, payload)
  - Event name: "job:progress"
  - Payload: { jobId: string, progress: number (0-100), message: string | null }
  - NOTE: Emitted WITHOUT session-scoped namespace (no ":sessionId" suffix)
    │
    ├──→ /api/jobs/stream (SSE, bare event subscription)
    │     Subscribes to "job:progress" directly
    │     Forwards to all connected job stream clients
    │
    └──→ /api/sessions/[id]/stream (SSE, scoped subscription)
          Subscribes to "job:progress:{sessionId}"
          Since JOB_PROGRESS is emitted WITHOUT namespace,
          session stream clients do NOT receive it
    │
    ▼
Client browser receives SSE event "job:progress"
  - Updates job progress UI (progress bar, status text)
```

### Progress Value Mapping

| DB Column | Range | SSE Payload | Client Display |
|-----------|-------|-------------|----------------|
| progress | 0.0 - 1.0 (REAL) | 0 - 100 (integer) | Percentage width |
| progress_message | string or null | string or null | Status text |

### markJobCompleted Gap

`markJobCompleted()` updates the job_queue row (status='completed', result=JSON, processed_at=NOW()) but does NOT emit any EventBus event. This means:

- Clients subscribed to JOB_COMPLETED via SSE never receive completion notifications
- The client must poll or infer completion from job progress reaching 100%
- Both the job SSE stream and session SSE stream subscribe to JOB_COMPLETED, but it is never emitted by any code path

---

## 10. Enqueue Callers by Source Route

### /api/generate/[id] (POST — AI Response Generation)

This route enqueues 7 jobs per AI response. These run after the AI generates a response message:

| Job | Purpose |
|-----|---------|
| scene_state_extract | Extract updated scene state from the AI response |
| wiki_auto_extract | Auto-extract wiki pages from new message content |
| summarize_messages | Generate message summaries |
| generate_embeddings | Create vector embeddings |
| analyze_relationships | Analyze relationship changes |
| wiki_extract_event | Extract event records |
| thread_analysis | Analyze narrative thread status |

### /api/sessions/[id]/messages (POST — User Sends Message)

Enqueues 2 jobs per user message:

| Job | Purpose |
|-----|---------|
| summarize_messages | Generate message summaries for the new user message |
| generate_embeddings | Create vector embeddings for the new content |

### /api/sessions/[id] (DELETE — Delete Session)

Enqueues 2 jobs on session deletion:

| Job | Purpose |
|-----|---------|
| scene_state_extract | Capture final scene state before deletion |
| analyze_relationships | Final relationship analysis pass |

### /api/sessions/[id]/messages/[messageId] (DELETE — Delete Message)

Enqueues 2 jobs on message deletion:

| Job | Purpose |
|-----|---------|
| scene_state_extract | Re-extract scene state after message removal |
| analyze_relationships | Re-analyze relationships after message removal |

### /api/sessions/[id]/recap (POST — Generate Session Recap)

Enqueues 1 job:

| Job | Purpose |
|-----|---------|
| generate_session_recap | Generate full session narrative recap |

### /api/universes/[id] (Universe Operations)

Enqueues 1 job:

| Job | Purpose |
|-----|---------|
| universe_wiki_sync | Synchronize wiki pages across the universe |

### /api/jobs (POST — Generic Job Operations)

This endpoint provides generic job management actions. The action is specified in the request body:

| Action | Behavior |
|--------|----------|
| queue | Enqueue a new job (type and payload from request body) |
| process | Trigger `processJob()` to process the next queued job |
| cancel | Set job status to 'cancelled' |
| retry | Reset a failed job to 'queued' for reprocessing |

### idle-processing.ts (Background Idle Processing)

See [Section 7](#7-idle-processing-tiers) for full tier breakdown.

**Tier-based jobs (per user's last_idle_t):**

| Tier | Jobs Enqueued |
|------|---------------|
| T1 (5min) | compress_memories, refine_relationship_summary |
| T2 (10min) | wiki_deepen_page, wiki_enrich_entity, generate_embeddings |
| T3 (15min) | wiki_generate_rumors, archival_processing |
| T4 (30min) | decay_relationships, summarize_messages |

**queueIdleJobs (additional, alongside tier):**

- extract_lore_comprehensive
- wiki_enrich_entity
- wiki_generate_rumors
- wiki_deepen_page

---

## 11. Error Handling

### Transient Error Detection

The system classifies errors as transient (retryable) or permanent based on error message content. Transient errors match these patterns:

| Error Pattern | Detects |
|---------------|---------|
| timeout | Network timeouts, LLM request timeouts |
| connection | Connection refused/reset, DNS failures |
| rate limit | API rate limiting |
| Ollama errors | Ollama service unavailable or overloaded (`"Ollama"` in error message) |
| SQLITE_BUSY | SQLite database locked by concurrent write |
| 503 | Service unavailable HTTP responses |
| 429 | Too many requests HTTP responses |

### Exponential Backoff

When a transient error triggers a retry, the system applies exponential backoff before re-queuing:

- Base delay: Starts at a minimum interval
- Growth: Delay doubles with each retry attempt
- Cap: Maximum delay is 30 seconds
- Formula: `min(base * 2^retry_count, 30s)`

### Retry Configuration

| Setting | Value |
|---------|-------|
| max_retries | 3 (default, per-job column) |
| Backoff base | ~1 second |
| Backoff cap | 30 seconds |
| Stale timeout | 5 minutes (processing → failed) |

### Permanent Failure Conditions

A job enters permanent `failed` status when:
- `retry_count >= max_retries` (default: 3 retries exhausted)
- Error is detected as non-transient (e.g., invalid payload, schema error, authorization failure)
- Job exceeds 5 minutes in `processing` state (stale recovery)

### Job Retention

- Jobs with status `completed` or `failed` are retained for 30 days after `processed_at`
- A cleanup sweep removes expired jobs to prevent table bloat
- Active jobs (`queued`, `processing`) are never cleaned up

### Stale Job Recovery

A periodic sweep detects jobs stuck in `processing` for more than 5 minutes. These are force-transitioned to `failed` with error `"Stale job"`. If retries remain, they are re-queued.

---

## 12. Known Gaps

### JOB_COMPLETED Event Gap

- `SessionEvents.JOB_COMPLETED` is declared and subscribed by both SSE streams (`/api/jobs/stream` and `/api/sessions/[id]/stream`)
- `markJobCompleted()` updates the DB row but does NOT call `eventBus.emit(SessionEvents.JOB_COMPLETED, ...)`
- This means clients subscribing to `job:completed` via SSE never receive completion notifications
- The job SSE stream subscribes to the bare event name; the session SSE stream subscribes to `job:completed:{sessionId}`
- Neither stream ever receives the event from any code path

### JOB_PROGRESS Namespace Gap

- `JOB_PROGRESS` is emitted without a session-scoped namespace (no `:sessionId` suffix)
- The session SSE stream subscribes to `job:progress:{sessionId}` — so session stream clients do NOT receive progress updates
- Only the job SSE stream (`/api/jobs/stream`) receives progress events (it subscribes to the bare event name)

---

## 13. Relationship Evolution Recording

The `queue.ts` module includes two utility functions for recording relationship history:

### recordEvolution(relationshipId, emotionalState, stage, triggerEvent)

Records a snapshot of relationship state at a point in time. Source table: `relationship_evolution`.

| Parameter | Type | Description |
|-----------|------|-------------|
| relationshipId | string | UUID of the relationship |
| emotionalState | object | JSON emotional vector snapshot |
| stage | string | Relationship stage at this point |
| triggerEvent | string | Event that caused the evolution |

Writes to `relationship_evolution` table: id (UUID), relationship_id, user_id (looked up from relationship), emotional_state, relationship_stage, trigger_event, recorded_at.

### recordAnchor(relationshipId, anchorType, description, emotionalImpact, irreversible)

Records a narrative anchor — a significant, potentially irreversible moment in a relationship. Source table: `narrative_anchors`.

| Parameter | Type | Description |
|-----------|------|-------------|
| relationshipId | string | UUID of the relationship |
| anchorType | string | Type of narrative anchor |
| description | string | Anchor description |
| emotionalImpact | string | Emotional significance |
| irreversible | boolean | Whether this can be undone (default: true) |

Writes to `narrative_anchors` table: id (UUID), relationship_id, user_id (looked up from relationship), anchor_type, description, emotional_impact, irreversible, created_at.

These are used by relationship-related job handlers (analyze_relationships, decay_relationships, refine_relationship_summary) to build a historical record of relationship changes over time.
