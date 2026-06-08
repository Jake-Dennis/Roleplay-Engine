# Full Automation — Wiki, NPCs, Personas, Relationships, Threads, Timelines, Jobs

## TL;DR

> **Quick Summary**: Wire up 5 remaining automation gaps so narrative state propagates automatically between all subsystems — timeline entries from sessions/events/threads/phases, NPC→wiki sync, persona→NPC bridge, auto-queued session recaps and NPC evolution.
>
> **Deliverables**:
> - `init-db.ts` — Add missing `timeline_entries` table schema
> - Timeline entries auto-created from 4 trigger sources
> - NPC evolution handler triggers NPC→wiki page sync
> - Persona creation auto-creates NPC record
> - `generate_session_recap` and `npc_evolution` jobs auto-queued
> - New handler files + test coverage via bun test
>
> **Estimated Effort**: Medium (~3-5 hours)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Tasks 4-7 → Tasks 9-11 → Task 12 → Final Wave

---

## Context

### Original Request
Wire up all remaining automation gaps between Wiki, NPCs, Personas, Relationships, Threads, Timelines, and Jobs so that narrative state cascades automatically.

### Interview Summary
**Key Decisions**:
- **All 5 gaps** in scope: timeline auto-population, NPC↔Wiki sync, Persona→NPC bridge, session recaps, NPC evolution triggers
- **Timeline triggers**: Session creation/ending, wiki event pages, thread resolution, scene phase changes — all 4
- **Recap cadence**: Every 50 messages + on session end/archive
- **Persona→NPC**: One-time creation only (no overwrite on update)
- **NPC→Wiki**: Unidirectional, separate job after evolution
- **Timeline content**: Structured source data, no LLM calls
- **No backfill**: Forward-only automation
- **Test strategy**: Extend existing bun test setup with TDD for new files

### Metis Review
**Critical Finding**: `timeline_entries` table is NOT defined in `scripts/init-db.ts` — must be added as prerequisite.
**Key Findings**:
- Thread analysis handler is additive-only: doesn't detect status transitions (must be extended)
- No "every 50 messages" counter infrastructure exists (must query COUNT(*) at trigger point)
- Personas table lives in `group-migrations.ts` (runtime), not `init-db.ts`
- Scene extraction already updates `sessions.narrative_phase` — diff-based trigger viable
- Existing `npc_evolution` and `generate_session_recap` handlers exist but have zero triggers
- Wiki file I/O uses in-memory locks — must check `isLocked()` before writing

---

## Work Objectives

### Core Objective
> Automate all narrative state propagation so that changes in one subsystem (session, wiki, NPC, persona, thread, timeline) correctly cascade to all dependent subsystems without manual intervention.

### Scope IN
1. Timeline auto-population from session creation/ending, wiki event pages, narrative thread resolution, and scene phase changes
2. NPC → Wiki sync when NPC evolution updates traits
3. Persona → NPC bridge (one-time creation at persona creation)
4. Session recaps auto-queued (every 50 messages + on session end)
5. NPC evolution auto-queued after NPC-relevant interactions (name matching)
6. TDD for new handler files via existing bun test setup
7. Schema fix: add `timeline_entries` table to `scripts/init-db.ts`
8. Extend thread-analysis-handler for status transition detection

### Scope OUT (Explicit)
- No backfill of timeline entries for existing sessions or data
- No bidirectional NPC ↔ Wiki sync (NPC → Wiki only)
- No NER system for NPC detection — simple `LIKE`-based name matching only
- No LLM-generated content for timeline entries — structured source data only
- No relationship decay automation changes (already works via idle tiers)
- No memory compression changes (already works via idle tiers)
- No existing data migration or retroactive changes
- No UI changes to timeline, relationship, persona, or other pages
- No Persona → NPC update propagation (one-time creation at persona creation only)
- No changes to the existing wiki → NPC / wiki → relationship auto-creation

### Must Have
- `timeline_entries` table created in `scripts/init-db.ts` with FK to sessions + narrative_threads
- Session creation triggers a timeline entry on first message (not on creation)
- Session status change to ended/archived triggers a timeline entry
- Wiki event pages (`wiki_extract_event`) also insert a timeline entry
- Thread resolution (active→resolved) creates a timeline entry
- Scene phase change (`narrative_phase` field changes) creates a timeline entry
- NPC evolution that changes traits also syncs to the wiki entity page
- Persona creation auto-creates NPC record (name + description + personality mapped)
- `generate_session_recap` queued every 50 messages and on session end
- `npc_evolution` queued when AI response mentions an NPC by name
- New handlers have at least 1 TDD test case

### Must NOT Have (Guardrails)
- No LLM calls for timeline content — structured source data only
- No overwriting independently-edited NPCs on persona update
- No queuing NPC evolution jobs for canon NPCs (`is_canon = 1`)
- No backfill of existing data
- No bidirectional sync in either direction
- No NER or NLP for NPC mention detection
- No breaking existing behavior — all new code is additive

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES — bun test with `package.json` script `"bun test"` and existing test file `src/lib/__tests__/safe-json.test.ts`
- **Automated tests**: TDD — each new handler file gets a test file with `describe`/`it`/`expect`
- **Framework**: bun test (existing)
- **TDD pattern**: RED → GREEN → REFACTOR per handler

### QA Policy
Evidence saved to `.omo/evidence/`.
- **Timeline entries**: curl + DB queries to verify INSERT happened
- **NPC→Wiki sync**: Read wiki `.md` file after evolution job completes
- **Persona→NPC**: curl API to create persona → curl GET NPCs → verify match
- **Session recaps**: curl GET /api/jobs after message threshold
- **NPC evolution trigger**: Check job_queue after NPC-mention generation

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — all independent):
├── Task 1: Add timeline_entries table schema [quick]
├── Task 2: Add debounce configs for recap + evolution [quick]
├── Task 3: Verify/test existing bun test setup [quick]

Wave 2 (Timeline triggers — all depend on Task 1, parallel otherwise):
├── Task 4: Session start/end → timeline entry [unspecified-high]
├── Task 5: Wiki event page → timeline entry [unspecified-high]
├── Task 6: Thread resolution → timeline entry [unspecified-high]
└── Task 7: Scene phase change → timeline entry [unspecified-high]

Wave 3 (NPC/Persona bridges — independent of Wave 2):
├── Task 8: Persona → NPC bridge [quick]
├── Task 9: NPC evolution auto-queue trigger [unspecified-high]
└── Task 10: NPC → Wiki sync job handler [deep]

Wave 4 (Recap + integration — depends on Waves 2-3):
├── Task 11: Session recap auto-queue [unspecified-high]

Wave FINAL (After ALL tasks — parallel review):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality + build check [unspecified-high]
├── Task F3: Integration QA execution [unspecified-high]
└── Task F4: Scope fidelity + test coverage [deep]
```

### Dependency Matrix
- **1**: (none) — 4, 5, 6, 7
- **2**: (none) — 9, 11
- **3**: (none) — all test tasks
- **4**: 1 — F3
- **5**: 1 — F3
- **6**: 1 — F3
- **7**: 1 — F3
- **8**: (none) — F3
- **9**: 2 — 10, F3
- **10**: 9 — F3
- **11**: 2 — F3
- **F1-F4**: 4-11 — user okay

---

## TODOs

- [x] 1. Add `timeline_entries` table schema to `init-db.ts`

  **What to do**:
  - Open `scripts/init-db.ts`, find the `timeline_layers` table creation block (~line 113)
  - Add `CREATE TABLE IF NOT EXISTS timeline_entries (...)` after `timeline_layers`
  - Schema (from Metis findings — the table is used in the API but missing from schema):
    ```sql
    CREATE TABLE IF NOT EXISTS timeline_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      thread_id TEXT REFERENCES narrative_threads(id),
      title TEXT NOT NULL,
      description TEXT,
      occurred_at TEXT NOT NULL,
      era TEXT,
      entry_type TEXT DEFAULT 'event',
      importance TEXT DEFAULT 'medium',
      metadata TEXT
    );
    ```
  - Also add `CREATE INDEX idx_timeline_entries_session ON timeline_entries(session_id);`
  - Add `CREATE INDEX idx_timeline_entries_user ON timeline_entries(user_id);`

  **Must NOT do**:
  - Do NOT modify any existing table definitions
  - Do NOT change existing column definitions in other tables

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding one table definition to a single schema file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 4, 5, 6, 7
  - **Blocked By**: None

  **References**:
  - `scripts/init-db.ts` — Schema file with all existing CREATE TABLE statements
  - `src/app/api/timeline/route.ts:155` — INSERT pattern used at runtime (confirm column names)
  - `scripts/delete-all-data.js` — References timeline_entries (confirm table name is expected)

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: Table created on fresh schema
    Tool: Bash
    Preconditions: init-db.ts updated with new CREATE TABLE
    Steps:
      1. Search for "CREATE TABLE IF NOT EXISTS timeline_entries" in init-db.ts
      2. Verify all columns present: id, user_id, session_id, thread_id, title, description, occurred_at, era, entry_type, importance, metadata
      3. Verify FK to users(id) and sessions(id) with ON DELETE CASCADE
      4. Verify indexes on session_id and user_id
    Expected Result: Table definition found with all required columns and FKs
    Evidence: .omo/evidence/task-1-schema-check.txt

  Scenario: Table placement is correct
    Tool: Bash
    Preconditions: init-db.ts updated
    Steps:
      1. Search for timeline_layers in init-db.ts and get its line number
      2. Search for timeline_entries and verify it's placed right after timeline_layers
    Expected Result: timeline_entries appears immediately after timeline_layers block
    Evidence: .omo/evidence/task-1-placement-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-1-schema-check.txt`
  - [ ] `.omo/evidence/task-1-placement-check.txt`

  **Commit**: YES
  - Message: `fix(schema): add missing timeline_entries table definition`
  - Files: `scripts/init-db.ts`
  - Pre-commit: `npm run build` (verify no TypeScript errors)

---

- [x] 2. Add debounce config for `generate_session_recap`

  **What to do**:
  - Open `src/lib/jobs/types.ts`
  - Add `generate_session_recap` to `JOB_DEBOUNCE_INTERVALS` with 120s debounce
  - Add `npc_evolution` to `JOB_DEBOUNCE_INTERVALS` with 60s debounce (per-NPC — prevent N jobs for N NPCs mentioned)

  **Must NOT do**:
  - Do NOT change any existing debounce values for other job types

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two-line config change in one file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 9, 11
  - **Blocked By**: None

  **References**:
  - `src/lib/jobs/types.ts:72-77` — `JOB_DEBOUNCE_INTERVALS` record
  - `src/lib/jobs/queue.ts` — Debounce/dedup logic implementation

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: Debounce configs added
    Tool: Bash
    Preconditions: types.ts updated
    Steps:
      1. Search for "generate_session_recap" in JOB_DEBOUNCE_INTERVALS
      2. Verify value is 120 (seconds)
      3. Search for "npc_evolution" in JOB_DEBOUNCE_INTERVALS
      4. Verify value is 60 (seconds)
    Expected Result: Both job types in JOB_DEBOUNCE_INTERVALS with correct values
    Evidence: .omo/evidence/task-2-debounce-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-2-debounce-check.txt`

  **Commit**: NO (groups with 9, 11)

---

- [x] 3. Verify and extend bun test infrastructure

  **What to do**:
  - Verify `package.json` has `"test": "bun test"` — confirmed it does
  - Verify `bun test` runs without errors on existing tests: `bun test src/lib/__tests__/safe-json.test.ts`
  - Create a shared test helper in `src/lib/__tests__/helpers.ts` with common test utilities:
    - `createTestDb()` — Returns an in-memory better-sqlite3 database with key tables
    - `createTestUser()` — Creates a test user and returns userId
    - `createTestUniverse()` — Creates a test universe and returns universeId
  - Write initial test harness for the new job types (as a template for TDD):
    - `src/lib/jobs/__tests__/helpers.ts` — Job-specific test utilities
  - Run `bun test` and confirm all tests pass

  **Must NOT do**:
  - Do NOT modify existing application code — test infrastructure only
  - Do NOT add test coverage for existing untested code — only setup + new code TDD

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verify infra + create helper files. Simple but foundational.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Test tasks in Wave 2-4 (test dependencies for TDD)
  - **Blocked By**: None

  **References**:
  - `src/lib/__tests__/safe-json.test.ts` — Existing test file for pattern
  - `package.json` — Has `"test": "bun test"` script
  - `scripts/init-db.ts` — Schema for test helpers (in-memory DB setup)

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: Test infrastructure works
    Tool: Bash
    Preconditions: helpers.ts created
    Steps:
      1. Run "bun test" from project root
      2. Verify exit code is 0
      3. Verify output reports all tests passing
    Expected Result: bun test passes (existing tests + new helpers)
    Evidence: .omo/evidence/task-3-test-infra.txt

  Scenario: Test helper creates DB correctly
    Tool: Bash
    Preconditions: helpers.ts written
    Steps:
      1. Check createTestDb is exported
      2. Check createTestUser is exported
      3. Check createTestUniverse is exported
    Expected Result: All 3 helpers exported from helpers.ts
    Evidence: .omo/evidence/task-3-helpers.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-3-test-infra.txt`
  - [ ] `.omo/evidence/task-3-helpers.txt`

  **Commit**: YES
  - Message: `test: set up bun test infrastructure with shared helpers`
  - Files: `src/lib/__tests__/helpers.ts`, `src/lib/jobs/__tests__/helpers.ts`
  - Pre-commit: `bun test`

---

- [x] 4. Session creation/ending → timeline entry

  **What to do**:
  Two trigger points:
  1. **First message in a session** (NOT session creation):
     - In `src/app/api/sessions/[id]/messages/route.ts` (or wherever the first message is handled):
       - After inserting the first message, check `SELECT COUNT(*) FROM messages WHERE session_id = ?`
       - If count === 1 (this is the first message), INSERT a `timeline_entries` row with:
         - `entry_type = 'session_start'`
         - `title = session name or "Session started"`
         - `description = session description or null`
         - `occurred_at = message timestamp`
         - `session_id = session ID`
         - `user_id = user ID`
         - `importance = 'medium'`
     - Wrap in try-catch — failure to create timeline entry should NOT break message sending

  2. **Session status change to ended/archived**:
     - In `src/app/api/sessions/[id]/route.ts` PUT handler:
       - Check if new status is `'ended'` or `'archived'` AND old status was `'active'`
       - If status transition detected, INSERT a `timeline_entries` row with:
         - `entry_type = 'session_end'`
         - `title = "Session ended" or "Session archived"`
         - `description = brief session summary (existing summary, if available)`
         - `occurred_at = current timestamp`
         - `session_id = session ID`
         - `user_id = user ID`
         - `importance = 'medium'`
     - Wrap in try-catch — failure should NOT break session status update

  **Must NOT do**:
  - Do NOT create timeline entry on session creation (only on first message)
  - Do NOT block the primary operation if timeline insertion fails
  - Do NOT use LLM to generate descriptions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Two trigger points in separate files, inline SQL, try-catch pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: F3
  - **Blocked By**: Task 1

  **References**:
  - `src/lib/jobs/lore-extraction.ts:328` — Pattern for INSERT INTO relationships (inline SQL, try-catch)
  - `src/app/api/sessions/route.ts:141-182` — Pattern for fire-and-forget data creation during session operations
  - `src/app/api/generate/[id]/route.ts:213-265` — Pattern for queueJob() calls
  - `src/app/api/sessions/[id]/route.ts` — PUT handler for session status change
  - `src/app/api/sessions/[id]/messages/[messageId]/route.ts` — Message sending logic

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: First message creates session_start timeline entry
    Tool: Bash
    Preconditions: Session exists with 0 messages
    Steps:
      1. POST a message to the session
      2. Query: SELECT * FROM timeline_entries WHERE session_id = ? AND entry_type = 'session_start'
      3. Verify exactly 1 row returned
      4. Verify title is set and occurred_at matches message timestamp
    Expected Result: Timeline entry created with entry_type = 'session_start'
    Evidence: .omo/evidence/task-4-session-start.txt

  Scenario: Session status change creates session_end timeline entry
    Tool: Bash (with curl for API calls)
    Preconditions: Session is active with at least 1 message
    Steps:
      1. PUT /api/sessions/[id] with status = 'ended'
      2. Query: SELECT * FROM timeline_entries WHERE session_id = ? AND entry_type = 'session_end'
      3. Verify exactly 1 row returned
      4. Verify title contains "ended" or similar
    Expected Result: Timeline entry created with entry_type = 'session_end'
    Evidence: .omo/evidence/task-4-session-end.txt

  Scenario: Session end does not block if timeline insert fails
    Tool: N/A — code review
    Steps:
      1. Verify timeline INSERT is wrapped in try-catch
      2. Verify session status update happens BEFORE or independent of timeline insert
    Expected Result: Session update not dependent on timeline insert success
    Evidence: .omo/evidence/task-4-fail-safe.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-4-session-start.txt`
  - [ ] `.omo/evidence/task-4-session-end.txt`
  - [ ] `.omo/evidence/task-4-fail-safe.txt`

  **Commit**: NO (groups with 5, 6, 7)

---

- [x] 5. Wiki event page → timeline entry

  **What to do**:
  - Open `src/lib/jobs/wiki-handler.ts` and find the `handleWikiExtractEvent` function
  - After each event wiki page is successfully created, INSERT a `timeline_entries` row:
    - `entry_type = 'event'`
    - `title = event title (from wiki page frontmatter)`
    - `description = event description (first 200 chars)`
    - `occurred_at = event date if available, else current timestamp`
    - `session_id = session ID from job payload`
    - `user_id = user ID from job payload`
    - `importance = event.importance or 'medium'`
  - Wrap in try-catch — failure to create timeline entry should NOT break wiki page creation
  - Follow the existing try-catch pattern used for event page creation (each event handled individually)

  **Must NOT do**:
  - Do NOT use LLM to generate timeline entry content — use the event data directly
  - Do NOT block wiki page creation if timeline insert fails
  - Do NOT create duplicate entries (check if entry already exists for this event)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Extending existing handler with inline SQL, maintaining existing patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7)
  - **Blocks**: F3
  - **Blocked By**: Task 1

  **References**:
  - `src/lib/jobs/wiki-handler.ts:handleWikiExtractEvent` — Event extraction handler (find exact line)
  - `src/lib/jobs/lore-extraction.ts` — Pattern for inline try-catch SQL inserts
  - `src/lib/jobs/wiki-handler.ts` — Payload structure (sessionId, userId, universeId)

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: Event wiki page creation also creates timeline entry
    Tool: Bash
    Preconditions: Session with messages that can be extracted as events
    Steps:
      1. Trigger wiki_extract_event job via API or test
      2. Check that event wiki page was created (glob for event_*.md in concepts dir)
      3. Query: SELECT * FROM timeline_entries WHERE entry_type = 'event'
      4. Verify at least 1 row returned
      5. Verify title matches event title from wiki page
    Expected Result: Timeline entry created for each wiki event page
    Evidence: .omo/evidence/task-5-event-timeline.txt

  Scenario: Timeline insert failure does not block wiki page
    Tool: N/A — code review
    Steps:
      1. Verify timeline INSERT is wrapped in try-catch in wiki-handler.ts
      2. Verify event wiki page is created before timeline insert
    Expected Result: Wiki page creation independent of timeline insert
    Evidence: .omo/evidence/task-5-fail-safe.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-5-event-timeline.txt`
  - [ ] `.omo/evidence/task-5-fail-safe.txt`

  **Commit**: NO (groups with 4, 6, 7)

---

- [x] 6. Thread resolution → timeline entry

  **What to do**:
  - Extend `src/lib/jobs/thread-analysis-handler.ts` to detect thread status transitions:
    1. Before running the LLM analysis, query existing `narrative_threads` for the session: `SELECT name, status FROM narrative_threads WHERE session_id = ?`
    2. After LLM returns new thread data (with statuses), compare: for any thread where old status != new status, detect the transition
    3. For threads transitioning to `'resolved'` or completed state, INSERT a `timeline_entries` row:
       - `entry_type = 'thread_resolution'`
       - `title = "${thread.name} resolved"`
       - `description = thread.summary or null`
       - `occurred_at = current timestamp`
       - `session_id = session ID`
       - `thread_id = thread ID`
       - `user_id = user ID`
       - `importance = 'medium'`
    4. Also update existing threads when LLM returns a matching name (update summary, status)
    5. Wrap all timeline inserts in try-catch — failure should NOT break thread analysis

  **Must NOT do**:
  - Do NOT create timeline entries for newly created threads — only for status transitions
  - Do NOT create duplicate entries if thread analysis runs multiple times
  - Do NOT use LLM specifically for timeline content — use structured thread data
  - Do NOT break the existing additive behavior (new threads still inserted)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Extending handler logic with state diffing and conditional inserts
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7)
  - **Blocks**: F3
  - **Blocked By**: Task 1

  **References**:
  - `src/lib/jobs/thread-analysis-handler.ts` — Full file (82 lines), additive-only handler
  - `scripts/init-db.ts` — narrative_threads table schema (id, session_id, name, status, summary, key_entities)
  - `src/app/api/generate/[id]/route.ts:261` — Where thread_analysis job is queued

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: Thread status transition creates timeline entry
    Tool: Bash
    Preconditions: Session with an existing active narrative_thread
    Steps:
      1. Run thread_analysis that returns a status change for the thread (active→resolved)
      2. Query: SELECT * FROM timeline_entries WHERE entry_type = 'thread_resolution'
      3. Verify 1 row returned
      4. Verify title contains thread name
      5. Verify thread_id matches the resolved thread
    Expected Result: Timeline entry created for thread resolution
    Evidence: .omo/evidence/task-6-thread-resolve.txt

  Scenario: New thread does not create timeline entry
    Tool: Bash
    Preconditions: Session with no existing threads
    Steps:
      1. Run thread_analysis on session
      2. Query: SELECT * FROM timeline_entries WHERE entry_type = 'thread_resolution'
      3. Verify 0 rows returned (no transitions, all new threads)
    Expected Result: No timeline entry for newly created threads
    Evidence: .omo/evidence/task-6-new-thread.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-6-thread-resolve.txt`
  - [ ] `.omo/evidence/task-6-new-thread.txt`

  **Commit**: NO (groups with 4, 5, 7)

---

- [x] 7. Scene phase change → timeline entry

  **What to do**:
  - Open `src/lib/scene-extraction.ts` (called by `scene_state_extract` job handler)
  - After the scene state is extracted and the session's `narrative_phase` is updated:
    1. Query the session's current `narrative_phase` (already set by `extractAndApplySceneState`)
    2. Read the session's previous `narrative_phase` — this is available because you're about to update it. Use a transaction or compare: get old value before update, then compare with new LLM-extracted value
    3. If old != new (phase changed), INSERT a `timeline_entries` row:
       - `entry_type = 'phase_change'`
       - `title = "Phase: ${newPhase}"`
       - `description = "Narrative phase changed from ${oldPhase} to ${newPhase}"`
       - `occurred_at = current timestamp`
       - `session_id = session ID`
       - `user_id = user ID`
       - `importance = 'high'` (phase changes are narratively significant)
  - Wrap in try-catch — failure should NOT break scene state extraction
  - Track: use the old `narrative_phase` value fetched from DB before the extraction writes the new value
    - Alternative: fetch old phase BEFORE calling `extractAndApplySceneState()`, then compare after

  **Must NOT do**:
  - Do NOT create timeline entries if the phase hasn't changed (same value)
  - Do NOT create duplicate entries for the same phase transition (track in session or use dedup)
  - Do NOT block scene extraction if timeline insert fails
  - Do NOT use LLM to generate phase change descriptions — use structured text

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Extending scene extraction with phase diffing logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: F3
  - **Blocked By**: Task 1

  **References**:
  - `src/lib/scene-extraction.ts` — Scene extraction module (reads sessions.narrative_phase, updates it)
  - `src/lib/jobs/scene-handler.ts` — Job handler that calls extractAndApplySceneState
  - `src/app/api/generate/[id]/route.ts:213` — Where scene_state_extract is queued

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: Phase change creates timeline entry
    Tool: Bash
    Preconditions: Session with narrative_phase = 'rising_action'
    Steps:
      1. Run scene_state_extract that returns narrative_phase = 'climax'
      2. Query: SELECT * FROM timeline_entries WHERE entry_type = 'phase_change'
      3. Verify 1 row returned
      4. Verify title contains "Phase: climax"
      5. Verify description mentions old phase
    Expected Result: Timeline entry created for phase transition
    Evidence: .omo/evidence/task-7-phase-change.txt

  Scenario: Same phase does not create timeline entry
    Tool: Bash
    Preconditions: Session with narrative_phase = 'rising_action'
    Steps:
      1. Run scene_state_extract that returns narrative_phase = 'rising_action' (no change)
      2. Query: SELECT * FROM timeline_entries WHERE entry_type = 'phase_change'
      3. Verify 0 rows returned
    Expected Result: No timeline entry for unchanged phase
    Evidence: .omo/evidence/task-7-no-change.txt

  Scenario: Phase change failure does not block scene extraction
    Tool: N/A — code review
    Steps:
      1. Verify timeline INSERT is wrapped in try-catch
      2. Verify scene state update independent of timeline insert
    Expected Result: Scene extraction unaffected by timeline insert failure
    Evidence: .omo/evidence/task-7-fail-safe.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-7-phase-change.txt`
  - [ ] `.omo/evidence/task-7-no-change.txt`
  - [ ] `.omo/evidence/task-7-fail-safe.txt`

  **Commit**: YES (groups 4, 5, 6, 7)
  - Message: `feat(timeline): auto-populate timeline entries from sessions, events, threads, and scene phases`
  - Files: `src/app/api/sessions/[id]/route.ts`, `src/app/api/sessions/[id]/messages/[messageId]/route.ts`, `src/lib/jobs/wiki-handler.ts`, `src/lib/jobs/thread-analysis-handler.ts`, `src/lib/scene-extraction.ts`
  - Pre-commit: `bun test`

---

- [x] 8. Persona → NPC bridge

  **What to do**:
  - Open `src/app/api/personas/route.ts` and find the POST handler
  - After the persona is successfully created, check if an NPC already exists with the same name + universe:
    ```sql
    SELECT id FROM npcs WHERE user_id = ? AND LOWER(name) = LOWER(?) AND universe_id = ?
    ```
  - If NOT found, insert a new NPC record:
    ```sql
    INSERT INTO npcs (id, user_id, universe_id, name, description, personality_traits, is_canon)
    VALUES (?, ?, ?, ?, ?, ?, 0)
    ```
    - `name` = persona name
    - `description` = persona description
    - `personality_traits` = JSON.stringify([personality traits from persona.personality or null])
    - `universe_id` = persona's universe_id (if set)
    - `is_canon` = 0 (derived, not canon)
  - Wrap in try-catch — failure to create NPC should NOT break persona creation
  - Follow existing pattern: `src/app/api/sessions/route.ts:141-182` (fire-and-forget with try-catch)

  **Must NOT do**:
  - Do NOT update existing NPC if one already exists with same name+universe
  - Do NOT create NPC if persona has no universe_id (no universe to associate with)
  - Do NOT block persona creation if NPC insert fails
  - Do NOT sync persona updates to NPC (one-time creation only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single trigger point, follows existing patterns exactly
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10)
  - **Blocks**: F3
  - **Blocked By**: None

  **References**:
  - `src/app/api/personas/route.ts` — POST handler for persona creation
  - `src/lib/jobs/lore-extraction.ts:182-198` — Existing NPC auto-creation pattern (check + insert)
  - `src/lib/wiki/auto-extract.ts:185` — Same pattern for NPC creation during wiki auto-extract
  - `scripts/init-db.ts` — npcs table schema

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: Persona creation auto-creates NPC
    Tool: Bash (curl)
    Preconditions: User and universe exist
    Steps:
      1. POST /api/personas with name="Test NPC", description="A test", universe_id=X
      2. GET /api/npcs?universe_id=X
      3. Verify an NPC exists with name="Test NPC" and description="A test"
    Expected Result: NPC created from persona data
    Evidence: .omo/evidence/task-8-persona-npc.txt

  Scenario: Duplicate persona name does not create duplicate NPC
    Tool: Bash (curl)
    Preconditions: NPC already exists with name "Test NPC" in universe X
    Steps:
      1. POST /api/personas with name="Test NPC", universe_id=X (same name)
      2. GET /api/npcs?universe_id=X
      3. Verify only 1 NPC with name "Test NPC" (case-insensitive)
    Expected Result: NPC not duplicated
    Evidence: .omo/evidence/task-8-no-duplicate.txt

  Scenario: No universe_id → no NPC creation
    Tool: Bash (curl)
    Preconditions: User exists
    Steps:
      1. POST /api/personas with name="No Universe", no universe_id field
      2. GET /api/npcs with search for "No Universe"
      3. Verify no NPC created
    Expected Result: No NPC created when persona has no universe
    Evidence: .omo/evidence/task-8-no-universe.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-8-persona-npc.txt`
  - [ ] `.omo/evidence/task-8-no-duplicate.txt`
  - [ ] `.omo/evidence/task-8-no-universe.txt`

  **Commit**: YES
  - Message: `feat(persona): auto-create NPC from persona data on persona creation`
  - Files: `src/app/api/personas/route.ts`
  - Pre-commit: `bun test`

---

- [x] 9. NPC evolution auto-queued after relevant interactions

  **What to do**:
  - In `src/app/api/generate/[id]/route.ts`, after the AI message is generated:
    1. Get the list of NPCs in the session's universe: `SELECT id, name FROM npcs WHERE universe_id = ? AND is_canon = 0`
    2. For each non-canon NPC, check if the AI response text contains the NPC name (case-insensitive `LIKE` match against `fullResponse`)
    3. For each matching NPC, queue an `npc_evolution` job:
       ```typescript
       queueJob(userId, "npc_evolution", {
         userId,
         universeId: session.universe_id,
         npcId: npc.id,
       }, "low", session.universe_id || undefined);
       ```
    4. Debounce handled by `JOB_DEBOUNCE_INTERVALS` (60s per type) — same-type jobs within 60s of each other are skipped
    5. Wrap in try-catch — failure to queue evolution should NOT break generation
  - Follow the exact same pattern as the existing 7 jobs queued at lines 213-265 of the generate endpoint

  **Must NOT do**:
  - Do NOT queue jobs for canon NPCs (`is_canon = 1`)
  - Do NOT use NER/NLP — simple string matching only
  - Do NOT block the generation response if evolution queueing fails
  - Do NOT add LLM calls to detect NPC mentions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Adding trigger logic to generate endpoint following existing patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10)
  - **Blocks**: Task 10, F3
  - **Blocked By**: Task 2 (debounce config needed)

  **References**:
  - `src/app/api/generate/[id]/route.ts:213-265` — Pattern: 7 existing queueJob calls after generation
  - `src/lib/jobs/npc-evolution.ts` — The handler itself (already exists, needs trigger)
  - `src/lib/db.ts` — DB access pattern
  - `src/lib/jobs/queue.ts` — queueJob signature

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: AI response mentioning NPC name queues evolution job
    Tool: Bash (curl + DB query)
    Preconditions: Session with universe containing non-canon NPC "John"
    Steps:
      1. POST /api/generate/[sessionId] with a prompt that causes AI to say "John"
      2. Query job_queue for type = 'npc_evolution' with payload containing npcId
      3. Verify at least 1 npc_evolution job exists
      4. Verify payload.npcId matches the NPC's id
    Expected Result: NPC evolution job queued
    Evidence: .omo/evidence/task-9-evolution-queued.txt

  Scenario: AI response not mentioning NPC does not queue evolution
    Tool: Bash (curl + DB query)
    Preconditions: Session with universe containing NPC "John"
    Steps:
      1. POST /api/generate with a prompt about unrelated topics
      2. Query job_queue for type = 'npc_evolution'
      3. Verify 0 npc_evolution jobs queued
    Expected Result: No evolution job for unmentioned NPCs
    Evidence: .omo/evidence/task-9-evolution-skip.txt

  Scenario: Canon NPC does not trigger evolution
    Tool: Bash (curl + DB query)
    Preconditions: Session with universe containing canon NPC "Alice"
    Steps:
      1. POST /api/generate with response mentioning "Alice"
      2. Query job_queue for type = 'npc_evolution'
      3. Verify no jobs queued for Alice's npcId (canon NPCs skipped)
    Expected Result: No evolution job for canon NPCs
    Evidence: .omo/evidence/task-9-canon-skip.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-9-evolution-queued.txt`
  - [ ] `.omo/evidence/task-9-evolution-skip.txt`
  - [ ] `.omo/evidence/task-9-canon-skip.txt`

  **Commit**: NO (groups with 10, 11)

---

- [x] 10. NPC → Wiki sync job handler

  **What to do**:
  - Create a new handler file `src/lib/jobs/npc-wiki-sync.ts`
  - Export a function: `async function handleNpcWikiSync(jobId: string, payload: JobPayload): Promise<JobResult>`
  - It should:
    1. Fetch the NPC from DB: `SELECT * FROM npcs WHERE id = ?`
    2. Find the corresponding wiki entity page: look in `data/{userId}/wiki/{universeId}/entities/` for a file whose title frontmatter matches the NPC name
    3. If the wiki page doesn't exist, skip with a log
    4. If the wiki page exists and is locked (`isLocked()` check from `src/lib/wiki/validation.ts`), skip with a log
    5. Read the existing page, update the body:
       - Find the "**Traits:**" line and replace it with current NPC traits
       - Add a new section "## NPC Evolution" with the latest behavior update
       - Update frontmatter `updated` timestamp
    6. Write the page back using `writeWikiPage()`
    7. Wrap all file I/O in try-catch — failure to sync wiki should NOT break anything

  - Register the handler in `src/lib/job-processor.ts`:
    - Add `"npc_wiki_sync"` to the `JobType` union in `types.ts`
    - Add case to the dispatch switch in `job-processor.ts`
    - Add to `validJobTypes` array in `src/app/api/jobs/route.ts` if it filters types
  - Modify `npc-evolution.ts` (or a wrapper) to queue `npc_wiki_sync` after successful NPC evolution:
    ```typescript
    // At end of handleNpcEvolutionJob, after markJobCompleted:
    queueJob(userId, "npc_wiki_sync", { userId, npcId, universeId }, "low", universeId);
    ```

  **Must NOT do**:
  - Do NOT update locked wiki pages (reviewed/locked status)
  - Do NOT create wiki pages that don't already exist
  - Do NOT modify NPC data based on wiki content (unidirectional only)
  - Do NOT add LLM calls for content generation

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: New handler with file I/O, lock checking, and frontmatter manipulation. Requires careful integration with existing wiki patterns.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: F3
  - **Blocked By**: Task 9 (depends on NPC evolution existing)

  **References**:
  - `src/lib/jobs/npc-evolution.ts` — Existing evolution handler (pattern to follow + modify)
  - `src/lib/job-processor.ts` — Dispatch switch for registering new job types
  - `src/lib/jobs/types.ts` — JobType union (add "npc_wiki_sync")
  - `src/lib/wiki/file-io.ts` — readWikiPage, writeWikiPage, sanitizeWikiFilename
  - `src/lib/wiki/validation.ts` — isLocked() function
  - `src/lib/wiki/wiki-root.ts` — getWikiRoot() for finding wiki directory
  - `src/lib/jobs/queue.ts` — queueJob for chaining

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: NPC evolution triggers wiki sync
    Tool: Bash (curl + DB query + file read)
    Preconditions: NPC "John" exists with wiki entity page that is NOT locked
    Steps:
      1. Queue an npc_evolution job for NPC "John" (or trigger via message)
      2. Wait for job processing
      3. Read the wiki file: data/{userId}/wiki/{universeId}/entities/John.md
      4. Verify the body contains updated personality_traits
      5. Verify frontmatter.updated is recent
    Expected Result: Wiki page updated with NPC evolution data
    Evidence: .omo/evidence/task-10-wiki-sync.txt

  Scenario: Locked wiki page is NOT overwritten
    Tool: Bash (curl + DB query + file read)
    Preconditions: NPC exists with wiki page that is locked (reviewed/locked status)
    Steps:
      1. Queue an npc_evolution job for this NPC
      2. Wait for job processing
      3. Read the wiki file — verify frontmatter.updated has NOT changed
      4. Check job logs for "skipped" or "locked" message
    Expected Result: Locked wiki page preserved, sync skipped
    Evidence: .omo/evidence/task-10-locked-skip.txt

  Scenario: TDD test for new handler
    Tool: Bash
    Preconditions: Handler file + test file exist
    Steps:
      1. Run "bun test src/lib/jobs/__tests__/npc-wiki-sync.test.ts"
      2. Verify test passes
    Expected Result: Handler has at least 1 test case
    Evidence: .omo/evidence/task-10-test.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-10-wiki-sync.txt`
  - [ ] `.omo/evidence/task-10-locked-skip.txt`
  - [ ] `.omo/evidence/task-10-test.txt`

  **Commit**: NO (groups with 9, 11)

---

- [x] 11. Session recap auto-queued (periodic + on-end)

  **What to do**:
  Two trigger points:

  1. **Periodic (every 50 messages)** — in `src/app/api/generate/[id]/route.ts`:
     - After queuing the existing jobs, query message count for the session:
       ```sql
       SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND is_deleted = 0
       ```
     - If `count % 50 === 0` (every 50 messages since session start), queue `generate_session_recap`:
       ```typescript
       queueJob(userId, "generate_session_recap", {
         sessionId,
         userId,
       }, "low", session.universe_id || undefined);
       ```
     - Debounce handled by `JOB_DEBOUNCE_INTERVALS` (120s) — prevents duplicate if same 50th message triggers twice

  2. **On session end** — in `src/app/api/sessions/[id]/route.ts` PUT handler:
     - After successfully updating session status to 'ended' or 'archived', queue `generate_session_recap`:
       ```typescript
       queueJob(userId, "generate_session_recap", {
         sessionId: id,
         userId,
       }, "low", universeId || undefined);
       ```
     - Follow the same pattern as the periodic trigger
     - Wrap in try-catch — failure to queue recap should NOT break session status update

  **Must NOT do**:
  - Do NOT queue recap if session has fewer than 10 messages (too short to recap)
  - Do NOT block generation or session update if recap queueing fails
  - Do NOT queue recap on every message — only at 50-message intervals + session end
  - Do NOT modify the session-recap handler itself (it already works)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Two trigger points, follows existing queueJob patterns exactly
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F3
  - **Blocked By**: Task 2 (debounce config)

  **References**:
  - `src/app/api/generate/[id]/route.ts:213-265` — Pattern for queueJob calls after generation
  - `src/app/api/sessions/[id]/route.ts` — PUT handler for session status change
  - `src/lib/jobs/session-recap.ts` — Existing handler (no changes needed)
  - `src/lib/jobs/types.ts:72-77` — Debounce config (generate_session_recap: 120s)

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: Every 50th message queues recap
    Tool: Bash (curl + DB query)
    Preconditions: Session with 49 messages
    Steps:
      1. POST a message to bring count to 50
      2. Query: SELECT * FROM job_queue WHERE type = 'generate_session_recap' AND payload LIKE '%sessionId%'
      3. Verify 1 recap job exists
    Expected Result: Recap job queued at 50 messages
    Evidence: .omo/evidence/task-11-periodic-recap.txt

  Scenario: Session end queues recap
    Tool: Bash (curl + DB query)
    Preconditions: Active session with 10+ messages
    Steps:
      1. PUT /api/sessions/[id] with status = 'ended'
      2. Query: SELECT * FROM job_queue WHERE type = 'generate_session_recap'
      3. Verify recap job exists (may be 2nd if periodic already triggered)
    Expected Result: Recap job queued on session end
    Evidence: .omo/evidence/task-11-end-recap.txt

  Scenario: Session with <10 messages does not queue recap
    Tool: Bash (curl + DB query)
    Preconditions: Session with 5 messages
    Steps:
      1. PUT /api/sessions/[id] with status = 'ended'
      2. Query: SELECT * FROM job_queue WHERE type = 'generate_session_recap'
      3. Verify 0 recap jobs (too short)
    Expected Result: No recap for sessions with <10 messages
    Evidence: .omo/evidence/task-11-short-session.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-11-periodic-recap.txt`
  - [ ] `.omo/evidence/task-11-end-recap.txt`
  - [ ] `.omo/evidence/task-11-short-session.txt`

  **Commit**: YES (groups 9, 10, 11)
  - Message: `feat(jobs): auto-queue NPC evolution, NPC→wiki sync, and session recap jobs`
  - Files: `src/app/api/generate/[id]/route.ts`, `src/app/api/sessions/[id]/route.ts`, `src/lib/jobs/npc-wiki-sync.ts`, `src/lib/job-processor.ts`, `src/lib/jobs/types.ts`, `src/app/api/jobs/route.ts`
  - Pre-commit: `bun test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
- [x] F2. **Code Quality + Build Check** — `unspecified-high`
- [x] F3. **Integration QA Execution** — `unspecified-high`
- [x] F4. **Scope Fidelity + Test Coverage** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built (no scope creep). Check "Must NOT do" compliance. Verify each new handler file has at least 1 TDD test. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Tests [N/N handlers with tests] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| Task(s) | Message | Files |
|---------|---------|-------|
| 1 | `fix(schema): add missing timeline_entries table definition` | `scripts/init-db.ts` |
| 3 | `test: set up bun test infrastructure with shared helpers` | `src/lib/__tests__/helpers.ts`, `src/lib/jobs/__tests__/helpers.ts` |
| 4-7 | `feat(timeline): auto-populate timeline entries from sessions, events, threads, and scene phases` | `src/app/api/sessions/[id]/route.ts`, `src/app/api/sessions/[id]/messages/[messageId]/route.ts`, `src/lib/jobs/wiki-handler.ts`, `src/lib/jobs/thread-analysis-handler.ts`, `src/lib/scene-extraction.ts` |
| 8 | `feat(persona): auto-create NPC from persona data on persona creation` | `src/app/api/personas/route.ts` |
| 9-11 | `feat(jobs): auto-queue NPC evolution, NPC→wiki sync, and session recap jobs` | `src/app/api/generate/[id]/route.ts`, `src/app/api/sessions/[id]/route.ts`, `src/lib/jobs/npc-wiki-sync.ts`, `src/lib/job-processor.ts`, `src/lib/jobs/types.ts`, `src/app/api/jobs/route.ts`, `src/lib/job-processor.ts` |
| 2 | (no commit — groups with 9-11) | — |
| F1-F4 | `feat: final verification for full automation plan` | — |

---

## Success Criteria

### Verification Commands
```bash
# Timeline entries table exists
grep -r "CREATE TABLE.*timeline_entries" scripts/init-db.ts

# Session start timeline entry
sqlite3 data/roleplay.db "SELECT * FROM timeline_entries WHERE entry_type = 'session_start'"

# Session end timeline entry
sqlite3 data/roleplay.db "SELECT * FROM timeline_entries WHERE entry_type = 'session_end'"

# Event timeline entry
sqlite3 data/roleplay.db "SELECT * FROM timeline_entries WHERE entry_type = 'event'"

# Thread resolution timeline entry
sqlite3 data/roleplay.db "SELECT * FROM timeline_entries WHERE entry_type = 'thread_resolution'"

# Phase change timeline entry
sqlite3 data/roleplay.db "SELECT * FROM timeline_entries WHERE entry_type = 'phase_change'"

# NPC from persona
sqlite3 data/roleplay.db "SELECT name FROM npcs WHERE name LIKE '%persona_name%'"

# NPC evolution job queued
sqlite3 data/roleplay.db "SELECT * FROM job_queue WHERE type = 'npc_evolution' LIMIT 5"

# Session recap job queued
sqlite3 data/roleplay.db "SELECT * FROM job_queue WHERE type = 'generate_session_recap' LIMIT 5"

# Tests pass
bun test

# NPC→Wiki sync (check wiki page for updated traits)
grep -r "personality_traits" data/*/wiki/*/entities/*.md
```

### Final Checklist
- [ ] `timeline_entries` table exists in schema with FKs and indexes
- [ ] Session start entry created on first message (not session creation)
- [ ] Session end entry created on status change to ended/archived
- [ ] Wiki event extraction also creates timeline entry
- [ ] Thread resolution creates timeline entry (status transition detection)
- [ ] Scene phase change creates timeline entry (diff-based, not on every extraction)
- [ ] Persona creation auto-creates NPC (one-time, no duplicates)
- [ ] NPC evolution auto-queued when AI response mentions NPC (non-canon only)
- [ ] NPC→Wiki sync updates wiki entity page after evolution (locked pages skipped)
- [ ] Session recap auto-queued every 50 messages + on session end (min 10 messages)
- [ ] All debounce configs in place (recap: 120s, NPC evolution: 60s)
- [ ] bun test passes with new handler tests
- [ ] No scope creep (no LLM timeline content, no backfill, no bidirectional sync, no NER)
