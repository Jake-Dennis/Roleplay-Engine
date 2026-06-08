# Job Queue Remediation

## TL;DR

> **Quick Summary**: Fix 5 categories of job queue issues found by audit: replace always-failing `wiki_ingest` with `extract_lore_comprehensive`, remove 2 dead handler types, wire 2 dormant-but-valuable handlers, add missing `embedding_vectors` schema, and add auto-retry with backoff.
> 
> **Deliverables**:
> - 1 job handler fix (idle-processing.ts → extract_lore_comprehensive instead of wiki_ingest)
> - 2 dormant handlers removed (summarize_message, idle_enrichment) + idle-enrichment.ts deleted
> - 2 dormant handlers wired (wiki_extract_event, thread_analysis in generate route)
> - 1 dormant handler wired via NPC detail page UI (npc_evolution)
> - embedding_vectors table added to init-db.ts + schema-migrations.ts
> - retry_count + max_retries columns on job_queue + auto-retry with error classification + exponential backoff
> - retry count display in jobs UI
> - Cleanup of removed types from JobType union, jobs API route, and jobs page
> 
> **Estimated Effort**: Medium (12 implementation tasks + 4 verification)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1 (schema) → T3+T4 (dead code removal) → T5+T6 (handler fixes) → T8-T10 (retry) → Final Wave

---

## Context

### Original Request
After auditing all 19 job queue types, fix all remaining issues: `wiki_ingest` always fails, 6 dormant handlers (some to remove, some to wire), missing `embedding_vectors` schema, and no persistent retry mechanism.

### Interview Summary
**Key Discussions**:
- **Scope**: "All of them" — all 5 categories selected
- **Already fixed this session**: `analyze_relationships` missing userId (3 sites), `locations` table created, `generate_session_recap` missing userId

**Research Findings**:
- `wiki_ingest`: idle-processing.ts queues it without `sourcePath`. Old `expand_lore` (message-driven) was renamed to `wiki_ingest` (file-driven) but idle processor never updated. Replace with `extract_lore_comprehensive`.
- **Dormant handlers**: 2 remove (`summarize_message`, `idle_enrichment`), 2 wire in generate route (`wiki_extract_event`, `thread_analysis`), 1 wire via UI button (`npc_evolution`), 1 already active (`extract_lore_comprehensive`)
- **Missing schema**: `embedding_vectors` table only created at runtime via `ensureVectorTable()` in embeddings.ts — not in `init-db.ts` or `schema-migrations.ts`
- **Retry**: API + UI exists for manual retry, but no `retry_count`/`max_retries` columns, no auto-retry, no backoff, no error classification

### Metis Review
**Identified Gaps** (addressed):
- **npc_evolution**: Cannot wire in generate route — needs per-NPC `npcId`. Must be UI button on NPC detail page.
- **Wave conflict**: T5+T6 both edit `generate/[id]/route.ts` — must be combined into one task or sequential
- **Cascade removal**: Removing handler types requires updating JobType union, processJob switch, jobs API route, and jobs page UI — all in same task
- **Permanent vs transient**: Auto-retry must distinguish permanent errors (missing fields) from transient (Ollama timeout)
- **EnrichmentResult**: If `idle-enrichment.ts` deleted, its return type used in job-processor.ts handler must be handled
- **embedding_vectors**: Use `CREATE TABLE IF NOT EXISTS` pattern, matching existing migrations

---

## Work Objectives

### Core Objective
Fix all 5 categories of job queue issues from the audit: malfunctioning wiki_ingest job, dead/wiring handlers, missing schema, and retry mechanism gaps.

### Concrete Deliverables
- `src/lib/idle-processing.ts`: Replace `wiki_ingest` queue with `extract_lore_comprehensive`
- `src/lib/job-processor.ts`: Remove `summarize_message` + `idle_enrichment` from switch/JobType; add auto-retry with error classification + backoff
- `src/lib/jobs/summarization-handler.ts`: Remove `handleSummarizeSingleMessage`
- `src/lib/idle-enrichment.ts`: DELETE entire file (599 lines dead code)
- `src/app/api/generate/[id]/route.ts`: Add `wiki_extract_event` + `thread_analysis` queue calls
- NPC detail page: Add "Evolve NPC" button that queues `npc_evolution`
- `scripts/init-db.ts`: Add `embedding_vectors` table definition, add `retry_count` + `max_retries` to `job_queue`
- `src/lib/schema-migrations.ts`: Add `embedding_vectors` migration + `retry_count` + `max_retries` migrations
- `src/app/api/jobs/route.ts`: Remove dormant types from `validJobTypes`
- `src/app/(app)/jobs/page.tsx`: Remove dormant types from `JOB_TYPES`/`JOB_TYPE_LABELS`; add `retry_count` display
- `src/app/(app)/npcs/` or NPC components: Add evolution trigger button

### Must Have
- wiki_ingest no longer fails — replaced with extract_lore_comprehensive in idle processing
- summarize_message + idle_enrichment cannot be queued (removed from registry)
- wiki_extract_event + thread_analysis queued after message generation
- npc_evolution queuable from NPC detail page
- embedding_vectors table defined in init-db.ts + schema-migrations.ts
- job_queue has retry_count + max_retries columns
- markJobFailed() auto-retries transient errors with exponential backoff
- retryJob()/retryAllFailedJobs() honor max_retries cap
- Jobs UI shows retry_count
- Build passes (npx next build, zero errors)

### Must NOT Have (Guardrails)
- NO changes to extract_lore_comprehensive handler (already wired via LoreExtractionTrigger)
- NO wire npc_evolution in generate route (not possible — needs npcId)
- NO remove wiki_ingest handler itself (API route still needs it for manual file ingestion)
- NO changes to summarization batch handler (summarize_messages is active)
- NO auto-retry for permanent errors (missing fields, invalid entity refs, schema violations)
- NO new npm dependencies
- NO changes to DB schema beyond the specified tables/columns

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None
- **Agent-Executed QA**: Mandatory for all tasks

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Schema verification**: Run Node.js with better-sqlite3 to query PRAGMA table_info and confirm columns exist
- **API verification**: curl to `/api/jobs` with removed job types → expect 400 error
- **Build verification**: `npx next build` — zero errors

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Schema — order-independent, all parallel):
├── T1: Add embedding_vectors table to init-db.ts + schema-migrations.ts
└── T2: Add retry_count + max_retries columns to job_queue (init-db.ts + schema-migrations.ts)

Wave 2 (Dead code removal — must precede Wave 3, parallel sub-tasks):
├── T3: Remove summarize_message handler + all references (3 files: handler, JobType, API route, UI page)
└── T4: Remove idle_enrichment handler + runIdleEnrichment + delete idle-enrichment.ts

Wave 3 (Handler fixes — sequential within same file, T5+T6 combined for same file edit):
├── T5: Replace wiki_ingest with extract_lore_comprehensive in idle-processing.ts
├── T6: Wire wiki_extract_event + thread_analysis in generate/[id]/route.ts (combined, same file)
└── T7: Wire npc_evolution via NPC detail page button

Wave 4 (Retry — single cohesive system):
├── T8: Add auto-retry with error classification + exponential backoff in markJobFailed()
├── T9: Cap retryJob()/retryAllFailedJobs() at max_retries
└── T10: Show retry_count + retry attempt limit in jobs UI

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── F1: Plan Compliance Audit (oracle)
├── F2: Code Quality Review (unspecified-high)
├── F3: Real Manual QA (unspecified-high)
└── F4: Scope Fidelity Check (deep)
```

### Dependency Matrix
- T1, T2: No deps — Wave 1 parallel
- T3, T4: No deps on each other — Wave 2 parallel; blocks T6 (API route must be updated before wiring)
- T5: Blocked by nothing — Wave 3
- T6: Blocked by T3, T4 (API route lists must be clean before new types are added)
- T7: Blocked by nothing — Wave 3
- T8, T9, T10: Blocked by T2 (columns must exist before auto-retry logic) — Wave 4 sequential
- Final Wave: Blocked by all T1-T10

---

## TODOs

- [x] 1. Add `embedding_vectors` table to init-db.ts + schema-migrations.ts

  **What to do**:
  - In `scripts/init-db.ts`, add the `embedding_vectors` table right after the `embedding_index` table (after line ~253):
    ```sql
    -- Embedding vectors (stored separately for vector search)
    CREATE TABLE IF NOT EXISTS embedding_vectors (
      embedding_id TEXT PRIMARY KEY REFERENCES embedding_index(id),
      vector_data TEXT NOT NULL
    );
    ```
  - In `src/lib/schema-migrations.ts`, add the same `CREATE TABLE IF NOT EXISTS embedding_vectors` migration at the end (after the `locations` migration block), using the existing try-catch pattern:
    ```typescript
    // Migration: Add embedding_vectors table (created at runtime by ensureVectorTable(), 
    // but must be in schema for fresh DBs)
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS embedding_vectors (
          embedding_id TEXT PRIMARY KEY REFERENCES embedding_index(id),
          vector_data TEXT NOT NULL
        )
      `).run();
    } catch {
      // Table already exists — safe to ignore
    }
    ```

  **Must NOT do**:
  - Do NOT remove `ensureVectorTable()` from embeddings.ts — it's still needed as a runtime safety net
  - Do NOT add indexes to embedding_vectors — the PK serves as the lookup key

  **Recommended Agent Profile**: `quick`
  **Parallelization**: Wave 1 | Blocks: nothing | Blocked By: nothing

  **Acceptance Criteria**:
  - [ ] `embedding_vectors` table defined in `scripts/init-db.ts`
  - [ ] `embedding_vectors` table migration added to `src/lib/schema-migrations.ts`
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: embedding_vectors exists in init-db.ts
    Tool: Bash
    Preconditions: None
    Steps:
      1. grep for "CREATE TABLE IF NOT EXISTS embedding_vectors" in scripts/init-db.ts
      2. grep for "embedding_vectors" in src/lib/schema-migrations.ts
    Expected Result: Both files contain the CREATE TABLE statement.
    Evidence: .omo/evidence/task-1-embedding-vectors.txt

  Scenario: Table can be created in a real DB
    Tool: Bash
    Preconditions: None
    Steps:
      1. node -e "const Database=require('better-sqlite3');const db=new Database(':memory:');db.exec(read from schema-migrations.ts snippet);console.log(!!db.prepare('SELECT name FROM sqlite_master WHERE type=\\'table\\' AND name=\\'embedding_vectors\\'').get())"
    Expected Result: Returns true — table was created.
    Evidence: .omo/evidence/task-1-table-created.txt
  ```

- [x] 2. Add `retry_count` + `max_retries` columns to job_queue

  **What to do**:
  - In `scripts/init-db.ts`, add these columns to the `job_queue` CREATE TABLE (after `error` column, around line 239):
    ```sql
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    ```
  - In `src/lib/schema-migrations.ts`, add two migrations at the end:
    ```typescript
    // Migration: Add retry_count to job_queue
    try {
      db.prepare("ALTER TABLE job_queue ADD COLUMN retry_count INTEGER DEFAULT 0").run();
    } catch { /* Column already exists */ }

    // Migration: Add max_retries to job_queue
    try {
      db.prepare("ALTER TABLE job_queue ADD COLUMN max_retries INTEGER DEFAULT 3").run();
    } catch { /* Column already exists */ }
    ```

  **Must NOT do**:
  - Do NOT remove the existing `job_queue` CREATE TABLE — only add columns
  - Do NOT change the `status` column behavior or default

  **Recommended Agent Profile**: `quick`
  **Parallelization**: Wave 1 | Blocks: T8, T9, T10 | Blocked By: nothing

  **Acceptance Criteria**:
  - [ ] `retry_count INTEGER DEFAULT 0` defined in init-db.ts job_queue CREATE TABLE
  - [ ] `max_retries INTEGER DEFAULT 3` defined in init-db.ts job_queue CREATE TABLE
  - [ ] Both ALTER TABLE migrations in schema-migrations.ts
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Columns exist in schema
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read scripts/init-db.ts — verify retry_count + max_retries in CREATE TABLE
      2. Read src/lib/schema-migrations.ts — verify both ALTER TABLE ADD COLUMN
    Expected Result: Both columns defined in both files.
    Evidence: .omo/evidence/task-2-retry-columns.txt

  Scenario: Migration runs without error
    Tool: Bash
    Preconditions: Real DB with job_queue table
    Steps:
      1. node -e "const Database=require('better-sqlite3');const db=new Database('data/global.db');db.exec('ALTER TABLE job_queue ADD COLUMN test_col INTEGER DEFAULT 0');const cols=db.prepare('PRAGMA table_info(job_queue)').all();console.log(cols.map(c=>c.name).join(','));db.exec('ALTER TABLE job_queue DROP COLUMN test_col')"
      2. Verify retry_count and max_retries appear in column list
    Expected Result: Columns present and ALTER TABLE works.
    Evidence: .omo/evidence/task-2-columns-exist.txt
  ```

---

## TODOs (Wave 2 — Dead Code Removal)

- [x] 3. Remove `summarize_message` (singular) handler + all references

  **What to do**:
  **Handler file** (`src/lib/jobs/summarization-handler.ts`):
  - Remove the `"summarize_message"` case from the switch in `handleSummarizationJob()` (line 22-23)
  - Remove the entire `handleSummarizeSingleMessage()` function (lines 46-61)

  **Job processor** (`src/lib/job-processor.ts`):
  - Remove `case "summarize_message":` from the `processJob()` switch (line 324, keep the other two cases)
  - Remove `"summarize_message"` from the `JobType` union type (line 41)

  **API route** (`src/app/api/jobs/route.ts`):
  - Remove `"summarize_message"` from the `validJobTypes` array (line 69)

  **Jobs page** (`src/app/(app)/jobs/page.tsx`):
  - Remove `"summarize_message"` from the `JOB_TYPES` array
  - Remove `"summarize_message"` from the `JOB_TYPE_LABELS` object

  **Must NOT do**:
  - Do NOT touch the batch `summarize_messages` handler — it's actively used
  - Do NOT remove `"compress_memories"` — it's in the same switch block

  **Recommended Agent Profile**: `quick` — 5 mechanical removals across 4 files
  **Parallelization**: Wave 2 | Blocks: T6 (API route must be clean) | Blocked By: nothing

  **Acceptance Criteria**:
  - [ ] No `"summarize_message"` case in summarization-handler.ts
  - [ ] No `handleSummarizeSingleMessage` function
  - [ ] No `"summarize_message"` in JobType union, validJobTypes, JOB_TYPES, or JOB_TYPE_LABELS
  - [ ] `POST /api/jobs` with `{ action: "queue", type: "summarize_message" }` returns 400
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Removed from all locations
    Tool: Bash
    Preconditions: None
    Steps:
      1. grep -r "summarize_message" src/ --include="*.ts" --include="*.tsx"
    Expected Result: Only the batch usage "summarize_messages" appears (plural). No singular "summarize_message".
    Evidence: .omo/evidence/task-3-removed.txt

  Scenario: API rejects removed type
    Tool: Bash (curl)
    Preconditions: Authentication token
    Steps:
      1. curl -X POST "http://localhost:3000/api/jobs" -H "Content-Type: application/json" -d "{\"action\":\"queue\",\"type\":\"summarize_message\"}" -b "auth-token=..."
    Expected Result: 400 response with validation error.
    Evidence: .omo/evidence/task-3-api-rejects.txt

  Scenario: Build passes
    Tool: Bash
    Preconditions: All edits applied
    Steps:
      1. npx next build
    Expected Result: ✓ Compiled successfully. Zero errors.
    Evidence: .omo/evidence/task-3-build.txt
  ```

- [x] 4. Remove `idle_enrichment` handler + `runIdleEnrichment()` + delete idle-enrichment.ts

  **What to do**:
  **Job processor** (`src/lib/job-processor.ts`):
  - Remove `import { runIdleEnrichment } from "@/lib/idle-enrichment"` (line 26)
  - Remove `"idle_enrichment"` from the `JobType` union type (line 49)
  - Remove the entire `case "idle_enrichment": return await handleIdleEnrichment(...)` block (lines 339-340)
  - Remove the entire `handleIdleEnrichment()` function (lines 760-785)

  **API route** (`src/app/api/jobs/route.ts`):
  - Remove `"idle_enrichment"` from `validJobTypes` array

  **Jobs page** (`src/app/(app)/jobs/page.tsx`):
  - Remove `"idle_enrichment"` from `JOB_TYPES` array
  - Remove `"idle_enrichment"` from `JOB_TYPE_LABELS` object

  **Delete file**: `src/lib/idle-enrichment.ts` (599 lines dead code)

  **Must NOT do**:
  - Do NOT remove any other idle-job-related imports or functions
  - Do NOT remove `handleIdleEnrichment`'s result type `{ tier, actionsCompleted, itemsProcessed }` — it's local to the removed function

  **Recommended Agent Profile**: `unspecified-high` — file deletion + 5 file modifications
  **Parallelization**: Wave 2 | Blocks: T6 (API route must be clean) | Blocked By: nothing

  **Acceptance Criteria**:
  - [ ] No `import { runIdleEnrichment }` in job-processor.ts
  - [ ] No `"idle_enrichment"` in JobType, validJobTypes, JOB_TYPES, or JOB_TYPE_LABELS
  - [ ] No `case "idle_enrichment"` or `handleIdleEnrichment` in job-processor.ts
  - [ ] `src/lib/idle-enrichment.ts` deleted
  - [ ] `POST /api/jobs` with `{ action: "queue", type: "idle_enrichment" }` returns 400
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Removed from all locations
    Tool: Bash
    Preconditions: None
    Steps:
      1. grep -r "idle_enrichment" src/ --include="*.ts" --include="*.tsx"
      2. Test-Path src/lib/idle-enrichment.ts
    Expected Result: No references remain. File deleted.
    Evidence: .omo/evidence/task-4-removed.txt

  Scenario: API rejects removed type
    Tool: Bash (curl)
    Preconditions: Auth token
    Steps:
      1. curl -X POST "http://localhost:3000/api/jobs" -H "Content-Type: application/json" -d "{\"action\":\"queue\",\"type\":\"idle_enrichment\"}" -b "auth-token=..."
    Expected Result: 400 response.
    Evidence: .omo/evidence/task-4-api-rejects.txt

  Scenario: Build passes
    Tool: Bash
    Preconditions: All edits applied
    Steps:
      1. npx next build
    Expected Result: ✓ Compiled successfully.
    Evidence: .omo/evidence/task-4-build.txt
  ```

---

## TODOs (Wave 3 — Handler Fixes & Wiring)

- [x] 5. Replace `wiki_ingest` with `extract_lore_comprehensive` in idle-processing.ts

  **What to do**:
  **File**: `src/lib/idle-processing.ts` (line ~343)
  - Change from:
    ```typescript
    queueJob(userId, "wiki_ingest", { userId, universeId: universeId || undefined }, "low", universeId || undefined);
    ```
  - Change to:
    ```typescript
    queueJob(userId, "extract_lore_comprehensive", { userId, universeId: universeId || undefined }, "low", universeId || undefined);
    ```
  - Remove the `sourcePath` field (was never provided — that's the whole bug)
  - The `extract_lore_comprehensive` handler only needs `{ userId, universeId }` — no sourcePath needed

  **Must NOT do**:
  - Do NOT remove the `wiki_ingest` handler — it's still needed for manual file ingestion via POST /api/wiki/ingest
  - Do NOT change any other queue calls in idle-processing.ts

  **Recommended Agent Profile**: `quick` — single line change
  **Parallelization**: Wave 3 | Blocks: nothing | Blocked By: nothing

  **Acceptance Criteria**:
  - [ ] `idle-processing.ts` queues `extract_lore_comprehensive` instead of `wiki_ingest`
  - [ ] No `sourcePath` in the payload
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Queue call changed
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/lib/idle-processing.ts around line 343
      2. grep for "extract_lore_comprehensive" in src/lib/idle-processing.ts
    Expected Result: Queue call uses extract_lore_comprehensive, not wiki_ingest.
    Evidence: .omo/evidence/task-5-fixed.txt

  Scenario: No wiki_ingest remains in idle-processing
    Tool: Bash
    Preconditions: None
    Steps:
      1. grep -n "wiki_ingest" src/lib/idle-processing.ts
    Expected Result: Zero matches — no wiki_ingest queue calls in idle-processing.
    Evidence: .omo/evidence/task-5-no-wiki-ingest.txt

  Scenario: Build passes
    Tool: Bash
    Preconditions: All edits applied
    Steps:
      1. npx next build
    Expected Result: ✓ Compiled successfully.
    Evidence: .omo/evidence/task-5-build.txt
  ```

- [x] 6. Wire `wiki_extract_event` + `thread_analysis` in generate route

  **What to do**:
  **File**: `src/app/api/generate/[id]/route.ts`
  - After the existing queue calls at lines 223-259 (after the `analyze_relationships` queue at line 258), add two new queue calls:

    ```typescript
    // Low priority: extract wiki event pages from the response
    queueJob(decoded.sub, "wiki_extract_event", {
      sessionId,
      userId: decoded.sub,
    }, "low", session.universe_id || undefined);

    // Low priority: analyze narrative threads in the session
    queueJob(decoded.sub, "thread_analysis", {
      sessionId,
      userId: decoded.sub,
    }, "low", session.universe_id || undefined);
    ```

  - Both handlers already exist and are registered in `processJob()` in job-processor.ts
  - Both use `"low"` priority — they should not block the response stream

  **Must NOT do**:
  - Do NOT add these at `"medium"` or `"high"` priority — they're background analysis
  - Do NOT modify the existing queue calls (scene_state_extract, wiki_auto_extract, summarize_messages, generate_embeddings, analyze_relationships)
  - Do NOT modify any other files

  **Recommended Agent Profile**: `unspecified-high` — modifying generate route (careful not to break existing logic)
  **Parallelization**: Wave 3, sequential after T3+T4 | Blocks: nothing | Blocked By: T3, T4 (API route type lists must be clean)

  **Acceptance Criteria**:
  - [ ] `wiki_extract_event` queued after analyze_relationships in generate route
  - [ ] `thread_analysis` queued after analyze_relationships in generate route
  - [ ] Both use `"low"` priority
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Queue calls added to generate route
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/app/api/generate/[id]/route.ts — confirm wiki_extract_event and thread_analysis queue calls
    Expected Result: Both queue calls present after the existing analyze_relationships call.
    Evidence: .omo/evidence/task-6-wired.txt

  Scenario: Build passes
    Tool: Bash
    Preconditions: All edits applied
    Steps:
      1. npx next build
    Expected Result: ✓ Compiled successfully.
    Evidence: .omo/evidence/task-6-build.txt
  ```

- [x] 7. Wire `npc_evolution` via NPC detail page button

  **What to do**:
  `npc_evolution` requires an `npcId` in the payload — it can't be triggered from the generate route (which only has `sessionId`). It needs a manual trigger somewhere the user can select a specific NPC.

  **Approach**: Add an "Evolve" button on the NPC detail/edit page that queues a `npc_evolution` job for that specific NPC.

  **Implementation**:
  1. Find or verify the NPC detail page exists at `src/app/(app)/npcs/[id]/page.tsx`
  2. If it doesn't exist as a detail page, find where NPCs are displayed and choose the most appropriate location
  3. Add a `queueNpcEvolution(npcId)` client function that POSTs to `/api/jobs` with:
     ```typescript
     fetch('/api/jobs', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         action: 'queue',
         type: 'npc_evolution',
         payload: { npcId, userId },
         priority: 'low'
       })
     });
     ```
  4. Add a button/icon on the NPC card or detail view that triggers this function
  5. Show a toast/status indicator after queuing

  **Must NOT do**:
  - Do NOT wire this in the generate route (won't work — no npcId available there)
  - Do NOT create a full NPC detail page if one doesn't exist — use the best available location

  **Recommended Agent Profile**: `visual-engineering` — UI work on NPC page
  **Parallelization**: Wave 3 | Blocks: nothing | Blocked By: nothing

  **Acceptance Criteria**:
  - [ ] "Evolve" button or trigger exists on NPC detail/card view
  - [ ] Clicking it queuest a `npc_evolution` job with the NPC's `npcId`
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Button exists on NPC page
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read NPC detail page — confirm npc_evolution queue code
    Expected Result: Evolve trigger wired up.
    Evidence: .omo/evidence/task-7-npc-evolution.txt

  Scenario: Build passes
    Tool: Bash
    Preconditions: All edits applied
    Steps:
      1. npx next build
    Expected Result: ✓ Compiled successfully.
    Evidence: .omo/evidence/task-7-build.txt
  ```

---

## TODOs (Wave 4 — Retry Mechanism)

- [x] 8. Add auto-retry with error classification + exponential backoff in `markJobFailed()`

  **What to do**:
  **File**: `src/lib/job-processor.ts`

  **1. Add error classification function**:
  ```typescript
  /**
   * Classify errors as transient (retryable) or permanent.
   * Transient: network issues, timeouts, rate limits, temporary DB locks
   * Permanent: missing fields, invalid references, schema violations, unknown job types
   */
  function isTransientError(error: string): boolean {
    const transientPatterns = [
      "Ollama", "timeout", "timed out", "rate limit", "too many requests",
      "connection", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT",
      "database is locked", "SQLITE_BUSY", "temporary failure",
      "Service Unavailable", "503", "429",
    ];
    return transientPatterns.some(p => error.toLowerCase().includes(p.toLowerCase()));
  }
  ```

  **2. Modify `markJobFailed()` to auto-retry transient errors**:
  - After setting status to `'failed'`, check if the error is transient
  - If transient AND `retry_count < max_retries`:
    - Increment `retry_count`
    - Calculate backoff: `Math.min(1000 * Math.pow(2, retry_count - 1), 30000)` ms
    - Set `created_at` to `datetime('now', '+X seconds')` to delay reprocessing
    - Set status back to `'queued'`, clear error and progress
  - If permanent or max retries reached: leave status as `'failed'`

  ```typescript
  export function markJobFailed(jobId: string, error: string): void {
    const db = getDb();
    db.prepare(`
      UPDATE job_queue SET status = 'failed', error = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(error, jobId);

    // Auto-retry transient errors with exponential backoff
    const job = db.prepare(
      "SELECT retry_count, max_retries FROM job_queue WHERE id = ?"
    ).get(jobId) as { retry_count: number; max_retries: number } | undefined;

    if (job && isTransientError(error) && (job.retry_count ?? 0) < (job.max_retries ?? 3)) {
      const newRetryCount = (job.retry_count ?? 0) + 1;
      const backoffSeconds = Math.min(Math.pow(2, newRetryCount - 1), 30); // 1s, 2s, 4s, 8s, 16s, 30s (capped)
      db.prepare(`
        UPDATE job_queue 
        SET status = 'queued', error = NULL, progress = 0, progress_message = NULL, 
            processed_at = NULL, retry_count = ?,
            created_at = datetime('now', '+${backoffSeconds} seconds')
        WHERE id = ?
      `).run(newRetryCount, jobId);
      logger.info(`Auto-retrying job ${jobId} (attempt ${newRetryCount}/${job.max_retries ?? 3}) with ${backoffSeconds}s backoff`);
    }
  }
  ```

  **3. Handle edge case**: If `retry_count` column is NULL (old jobs queued before migration), treat as 0.

  **Must NOT do**:
  - Do NOT auto-retry permanent errors (missing userId, invalid entity ID, unknown job type)
  - Do NOT use `MAX()` for backoff — use explicit cap at 30 seconds
  - Do NOT remove the error message after retry — the error is cleared (set to NULL) since job is re-queued

  **Recommended Agent Profile**: `deep` — requires understanding of error patterns, SQL, and edge cases
  **Parallelization**: Wave 4 | Blocks: nothing | Blocked By: T2 (columns must exist)

  **Acceptance Criteria**:
  - [ ] `isTransientError()` function exists with blacklist of permanent error patterns
  - [ ] `markJobFailed()` auto-retries transient errors with backoff
  - [ ] Permanent errors (missing fields, invalid references) are NOT retried
  - [ ] Jobs stay `'failed'` after exceeding `max_retries`
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Transient error is auto-retried
    Tool: Bash (curl + DB query)
    Preconditions: Dev server running
    Steps:
      1. Queue a job that will fail with "Ollama timeout" (simulate by inserting a known-bad wiki job)
      2. Wait 5 seconds
      3. Query job_queue for the job — check retry_count > 0 and status = 'failed' or 'queued'
    Expected Result: retry_count incremented, job attempted again.
    Evidence: .omo/evidence/task-8-transient-retry.txt

  Scenario: Permanent error is NOT retried
    Tool: Bash
    Preconditions: None
    Steps:
      1. Queue a job that will fail with "Missing userId"
      2. Wait briefly
      3. Query job_queue — check retry_count = 0, status = 'failed'
    Expected Result: Job failed permanently, no retry.
    Evidence: .omo/evidence/task-8-permanent-no-retry.txt

  Scenario: Max retries exceeded stays failed
    Tool: Bash
    Preconditions: DB with test job
    Steps:
      1. Set retry_count = max_retries on a job, then trigger a failing transient error
      2. Verify status = 'failed' (not auto-retried again)
    Expected Result: Job stays failed after max_retries.
    Evidence: .omo/evidence/task-8-max-retries.txt

  Scenario: Build passes
    Tool: Bash
    Preconditions: All edits applied
    Steps:
      1. npx next build
    Expected Result: ✓ Compiled successfully.
    Evidence: .omo/evidence/task-8-build.txt
  ```

- [x] 9. Cap `retryJob()` / `retryAllFailedJobs()` at `max_retries`

  **What to do**:
  **File**: `src/lib/job-processor.ts`

  **Update `retryJob(jobId)`** (around line 250-256):
  - Before resetting to `'queued'`, check the job's current `retry_count` against `max_retries`
  - If `retry_count >= max_retries`, return false (don't allow manual retry beyond cap)
  - If `retry_count < max_retries`, increment `retry_count` by 1 and reset to queued

  ```typescript
  export function retryJob(jobId: string): boolean {
    const db = getDb();
    const job = db.prepare(
      "SELECT retry_count, max_retries FROM job_queue WHERE id = ? AND status = 'failed'"
    ).get(jobId) as { retry_count: number | null; max_retries: number | null } | undefined;

    if (!job) return false;
    
    const currentRetries = job.retry_count ?? 0;
    const maxRetries = job.max_retries ?? 3;
    
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
  ```

  **Update `retryAllFailedJobs(userId)`** (around line 261-267):
  - Same check — skip jobs that have reached `max_retries`
  - Only return count of actually retried jobs

  ```typescript
  export function retryAllFailedJobs(userId: string): number {
    const db = getDb();
    const result = db.prepare(`
      UPDATE job_queue 
      SET status = 'queued', error = NULL, progress = 0, progress_message = NULL, 
          processed_at = NULL, retry_count = retry_count + 1
      WHERE user_id = ? AND status = 'failed' 
        AND (retry_count IS NULL OR retry_count < max_retries OR max_retries IS NULL)
    `).run(userId);
    return result.changes;
  }
  ```

  **Must NOT do**:
  - Do NOT hide the cap from users — the UI should show retry_count so they understand why retry is blocked
  - Do NOT change the function signatures (other code may depend on them)

  **Recommended Agent Profile**: `quick` — function modifications in one file
  **Parallelization**: Wave 4, sequential after T8 | Blocks: nothing | Blocked By: T2 (columns), T8 (infrastructure)

  **Acceptance Criteria**:
  - [ ] `retryJob()` increments `retry_count` and rejects jobs at `max_retries`
  - [ ] `retryAllFailedJobs()` increments and caps per job, returns correct count
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Manual retry increments counter
    Tool: Bash (curl + DB query)
    Preconditions: A failed job exists in DB
    Steps:
      1. POST /api/jobs { action: "retry", jobId: "..." }
      2. SELECT retry_count FROM job_queue WHERE id = "..."
    Expected Result: retry_count incremented by 1, status = 'queued'.
    Evidence: .omo/evidence/task-9-retry-increment.txt

  Scenario: Manual retry blocked at max_retries
    Tool: Bash
    Preconditions: A job with retry_count = max_retries
    Steps:
      1. POST /api/jobs { action: "retry", jobId: "..." }
    Expected Result: Returns success: false, job stays failed.
    Evidence: .omo/evidence/task-9-retry-blocked.txt

  Scenario: Build passes
    Tool: Bash
    Preconditions: All edits applied
    Steps:
      1. npx next build
    Expected Result: ✓ Compiled successfully.
    Evidence: .omo/evidence/task-9-build.txt
  ```

- [x] 10. Show `retry_count` + retry attempt limit in jobs UI

  **What to do**:
  **File**: `src/app/(app)/jobs/page.tsx`
  - Add "Retries" column or badge on failed job cards showing `job.retry_count` / `job.max_retries`
  - Example: "Retry 2/3" badge on a failed job that has been retried twice
  - For queued/processing jobs: show retry_count as a muted indicator "Retry 1" (implied "of max_retries")
  - When the "Retry" button is disabled (at max_retries), show a tooltip or disabled state: "Max retries reached"

  **Implementation approach**:
  - The job list already fetches job data including all DB columns — retry_count and max_retries should be available in the existing job objects
  - Add a small `<span>` after the error message or in the job badge area showing retry count
  - For the retry button: disable it when `job.retry_count >= job.max_retries`, with a tooltip

  **Must NOT do**:
  - Do NOT redesign the entire jobs page — only add retry_count display
  - Do NOT add new npm dependencies

  **Recommended Agent Profile**: `visual-engineering` — UI modifications on jobs page
  **Parallelization**: Wave 4, sequential after T9 | Blocks: nothing | Blocked By: T8, T9

  **Acceptance Criteria**:
  - [ ] Failed job cards show `retry_count / max_retries`
  - [ ] Retry button disabled when `retry_count >= max_retries`
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Retry count displayed on failed job
    Tool: Playwright or Bash (read page)
    Preconditions: A failed job with retry_count=2 exists
    Steps:
      1. Load jobs page, filter by failed
      2. Look for "Retry 2/3" or equivalent badge on the failed job
    Expected Result: retry_count is visible to the user.
    Evidence: .omo/evidence/task-10-retry-display.txt

  Scenario: Retry button disabled at max
    Tool: Playwright
    Preconditions: A failed job with retry_count=3, max_retries=3
    Steps:
      1. Load jobs page, filter by failed
      2. Hover over the retry button for that job
    Expected Result: Button is disabled/greyed out with explanation tooltip.
    Evidence: .omo/evidence/task-10-retry-disabled.txt

  Scenario: Build passes
    Tool: Bash
    Preconditions: All edits applied
    Steps:
      1. npx next build
    Expected Result: ✓ Compiled successfully.
    Evidence: .omo/evidence/task-10-build.txt
  ```

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have" and "Must NOT Have": verify implementation exists or forbidden patterns are absent. Check evidence files exist in `.omo/evidence/`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx next build`. Review for `as any`, `@ts-ignore`, empty catches, `console.log` in production code, unused imports.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Execute critical QA scenarios:
  - Verify `extract_lore_comprehensive` queues in idle-processing (not wiki_ingest)
  - Verify `POST /api/jobs` rejects `summarize_message` and `idle_enrichment` with 400
  - Verify database has `embedding_vectors` table, `retry_count` and `max_retries` columns
  - Verify `npc_evolution` can be queued via API (manual trigger works)
  - Check evidence files
  Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **T1**: `fix(db): add embedding_vectors table to init-db.ts and schema-migrations.ts`
- **T2**: `fix(db): add retry_count and max_retries columns to job_queue`
- **T3**: `cleanup(jobs): remove dormant summarize_message handler and all references`
- **T4**: `cleanup(jobs): remove dormant idle_enrichment handler and delete idle-enrichment.ts`
- **T5**: `fix(jobs): replace always-failing wiki_ingest with extract_lore_comprehensive in idle processing`
- **T6**: `feat(jobs): wire wiki_extract_event and thread_analysis in generate route`
- **T7**: `feat(jobs): add npc_evolution trigger button to NPC detail page`
- **T8**: `feat(jobs): add auto-retry with transient error classification and exponential backoff`
- **T9**: `fix(jobs): cap retryJob/retryAllFailedJobs at max_retries`
- **T10**: `feat(ui): show retry_count in jobs page`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: ✓ Compiled successfully, zero errors
```

### Final Checklist
- [ ] `extract_lore_comprehensive` queued (not `wiki_ingest`) in idle-processing.ts
- [ ] `summarize_message` and `idle_enrichment` removed from all code + API rejects them
- [ ] `wiki_extract_event` and `thread_analysis` queued in generate route
- [ ] `npc_evolution` triggerable from NPC detail page
- [ ] `embedding_vectors` table in init-db.ts + schema-migrations.ts
- [ ] `retry_count` + `max_retries` columns on job_queue
- [ ] Transient errors auto-retried with backoff; permanent errors not retried
- [ ] Manual retry capped at max_retries
- [ ] Jobs UI shows retry_count
- [ ] `npx next build` passes

