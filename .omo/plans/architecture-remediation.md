# Architecture Remediation — Full Plan

## TL;DR

> **Quick Summary**: Comprehensive remediation of the Roleplay Engine architecture — fixing data integrity bugs, wiring existing-but-disconnected infrastructure into the retrieval pipeline, adding job queue hygiene, implementing wiki entity resolution and provenance, materializing the relationship evolution system, and building a minimal narrative state engine. All verification is agent-executed (no test framework).
>
> **Deliverables**:
> - Phase 0: 6 data/schema bug fixes
> - Phase 1: 9 retrieval pipeline integrations (narrative_memories, vector search, importance scoring, message summaries, narrative threads, SSE)
> - Phase 2: 5 job queue hygiene improvements (dedup, reaper, double-queue fix, debounce, type fix)
> - Phase 3: 5 wiki entity resolution + provenance tasks
> - Phase 4: 4 relationship evolution tasks
> - Phase 5: 5 narrative state engine tasks
> - Phase 6: 5 UI surfaces (retrieval inspector, job admin, entity browser, timeline, state debug panel)
> - Wave 8: 2 integration test tasks (cross-phase + regression sweep)
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 8 waves (plus final verification)
> **Critical Path**: Phase 0 → Phase 1 → Phase 2-5 concurrent → Phase 6 (UI) → Wave 8 (Tests) → Final Verification

---

## Context

### Original Request
User provided a comprehensive architecture improvement document and requested "full and complete plans for everything" — covering retrieval quality, intent classification, prompt compiler refactor, wiki stability, relationship formalization, job queue hygiene, memory compression, retrieval ranking, narrative state engine, information hygiene, and scene state enrichment.

### Interview Summary
**Key Findings**:
- ~50-60% of proposed systems already exist but are disconnected from the retrieval pipeline (narrative_memories, vector search, importance scoring, message summarization, narrative threads, semantic intent fallback)
- The retrieval pipeline (`getRetrievedContext()`) fetches 6 flat sources: scene state, wiki lore, relationships, recent messages, canon context, intent — but never uses the memory/embedding/importance infrastructure
- Critical bugs exist: emotional_tone column overwritten by intent, message_summaries schema mismatch, missing tables (relationship_evolution, events), narrative_threads DDL drift, vectorSearch() data format broken
- Job queue: 22 job types, 9 jobs per message+generate roundtrip, NO deduplication, NO reaping
- Three parallel contradiction detection systems (none with resolution), three parallel provenance systems

**Metis Review Findings**:
- 16 new critical discoveries from exploration agents beyond initial manual analysis
- Key finding: the disconnection problem is deeper than expected — ~50-60% of infrastructure is already built but stranded
- Several systems are broken (vector search data format, missing tables) not just disconnected
- Parallel systems (3 provenance, 3 contradiction detectors) need consolidation

---

## Work Objectives

### Core Objective
Systematically remediate the Roleplay Engine architecture across 6 phases: fix data/schema bugs, wire disconnected infrastructure into retrieval, add job queue hygiene, implement wiki entity resolution and provenance, materialize relationship evolution, and build a minimal narrative state engine.

### Concrete Deliverables
- Phase 0: 6 schema/data fixes applied (no regressions)
- Phase 1: 9 pipeline integrations — narrative_memories, vector search, importance scoring, message summaries, narrative threads, and SSE scene updates all operational in retrieval
- Phase 2: Job queue deduplication, reaper, double-queue fix, debouncing, type fix — all applied
- Phase 3: Entity mention extraction, name→wiki-page resolver, contradiction resolution pipeline, unified provenance, entity resolution wired into generation
- Phase 4: relationship_evolution table created and populated, narrative anchors added, evolution wired into prompt context
- Phase 5: Tension, pacing, narrative_phase, goals, conflicts, decision points tracked and wired into retrieval
- Phase 6: 5 UI surfaces — retrieval inspector, job queue admin panel, entity browser + contradiction review, relationship timeline, narrative state debug panel
- Wave 8: 2 integration test tasks — cross-phase integration suite + full regression sweep

### Definition of Done
- [x] `npx next build` passes with zero errors
- [x] All QA scenarios pass (per-task evidence in `.omo/evidence/`)
- [x] Phase 0 bugs verified fixed (emotional_tone no longer overwritten, message_summaries insert succeeds)
- [x] Phase 1: narrative_memories appear in generated prompts
- [x] Phase 2: duplicate jobs no longer created, old jobs reaped
- [x] Phase 3: duplicate wiki entities detected and flagged; provenance trackable
- [x] Phase 4: relationship_evolution table populated on analysis
- [x] Phase 5: narrative state fields populated and injected into prompts
- [x] Phase 6: all 5 UI panels render without errors and display live data
- [x] Wave 8: all cross-phase integration tests pass, full regression sweep passes

### Must Have
- All phases must pass agent-executed QA scenarios
- Zero regressions in existing prompt quality
- All new sections must respect the 6000-token budget
- Error handling: fail open (return empty/null) — never crash the generate route
- Each phase independently verifiable before next phase begins

### Must NOT Have (Guardrails)
- No new test framework or test dependencies
- No ORM or query builder
- No new barrel exports (import patterns remain explicit)
- No background workers or persistent processes
- No schema changes that break existing data
- No removing existing API routes or components
- No rewriting working systems — connect, don't replace
- No auto-resolution of wiki contradictions (flag only, human decides)
- No new contradiction detection engines (pick from existing 3)
- No new provenance system (pick from existing 3, deprecate others)
- No full entity registry — name-to-wiki-page resolution only
- No ML-based retrieval ranking — weighted linear combination only

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks)

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario}.{ext}`.

- **API/Business logic**: Bash (curl) — GET/POST endpoints, assert JSON response status + fields
- **Build verification**: Bash (`npx next build`) — zero errors
- **DB verification**: Bash (SQLite queries via `bun`) — verify rows, schema changes
- **Frontend/UI**: Playwright — if UI changes needed, navigate/interact/assert DOM

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Phase 0 — Foundation & Data Integrity):
├── Task 1: Fix emotional_tone/intent column split
├── Task 2: Fix message_summaries schema divergence
├── Task 3: Remove dead code (semantic-intent-fallback.ts)
├── Task 4: CREATE missing tables (relationship_evolution, events)
├── Task 5: Fix narrative_threads DDL drift
└── Task 6: Fix vectorSearch() data format (JSON vs packed float32)

Wave 2 (Phase 1 — Wire Infrastructure into Retrieval):
├── Task 7: Extend RetrievedContext type for new data sources
├── Task 8: Add narrative_memories retrieval → prompt section
├── Task 9: Add message_summaries injection when budget truncates messages
├── Task 10: Add narrative_threads → [ACTIVE THREADS] prompt section
├── Task 11: Wire vector search into wiki context scoring
├── Task 12: Wire importance scores into memory ranking
├── Task 13: Extend prompt-builder.ts with new sections
├── Task 14: Rebalance token budget in applyContextBudget()
└── Task 15: Fix useSession SSE subscription for SCENE_UPDATED

Wave 3 (Phase 2 — Job Queue Hygiene):
├── Task 16: Add deduplication to queueJob()
├── Task 17: Add job reaper (DELETE old completed/failed/cancelled)
├── Task 18: Fix double-queuing (messages + generate routes)
├── Task 19: Add debouncing for rapid-repeated job types
└── Task 20: Fix QueuedJob TypeScript type gap (missing `result` field)

Wave 4 (Phase 3 — Wiki Entity Resolution & Provenance):
├── Task 21: Build entity mention extraction from memories/summaries
├── Task 22: Build name→wiki-page resolver (utilizing backlinks.ts)
├── Task 23: Add contradiction detection → flag resolution step
├── Task 24: Unify provenance tracking (pick ONE system, deprecate others)
└── Task 25: Add entity resolution to generation pipeline

Wave 5 (Phase 4 — Relationship Evolution):
├── Task 26: Materialize relationship_evolution table + backfill data
├── Task 27: Add narrative event anchors to relationships schema
├── Task 28: Wire relationship evolution into retrieval pipeline
└── Task 29: Deepen relationship context in prompt (history + anchors)

Wave 6 (Phase 5 — Narrative State Engine):
├── Task 30: Add tension/pacing/narrative_phase to sessions table
├── Task 31: Add goals array + active_conflicts to scene_states
├── Task 32: Extract narrative state fields during scene_extraction job
├── Task 33: Wire narrative state into retrieval → prompt
└── Task 34: Add decision points tracking (at minimum: store choices)

Wave 7 (Phase 6 — UI Layer):
├── Task 35: Build Retrieval Inspector (debug overlay for session page)
├── Task 36: Build Job Queue Admin Panel
├── Task 37: Build Entity Browser + Contradiction Review UI
├── Task 38: Build Relationship Timeline UI
└── Task 39: Build Narrative State Debug Panel

Wave 8 (Integration & Regression Tests — after ALL phases, before Final Verification):
├── Task 40: Run cross-phase integration test suite (5 scenarios)
└── Task 41: Run full regression sweep (all ~35 acceptance criteria)

Wave FINAL (After ALL waves — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: End-to-end QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

- **Wave 1 (Tasks 1-6)**: Independent — can start immediately
  - Blocks: Waves 2-7 (all downstream phases depend on clean data/schemas)
- **Wave 2 (Tasks 7-15)**: Depends on Wave 1
  - Blocks: Waves 4-5 partially (entity extraction + evolution use enriched retrieval)
- **Wave 3 (Tasks 16-20)**: Depends on Wave 1 (clean schemas)
  - Independent of Wave 2 — can run in parallel with Wave 2
- **Wave 4 (Tasks 21-25)**: Depends on Wave 1 + Wave 2-ish (needs enriched retrieval for entity extraction)
- **Wave 5 (Tasks 26-29)**: Depends on Wave 1 + Wave 2 + Wave 4 (needs entity resolution)
- **Wave 6 (Tasks 30-34)**: Depends on Wave 1 + Wave 2 + Wave 5 (needs relationship context)
- **Wave 7 (Tasks 35-39)**: Depends on Waves 1-6 (all back-end must exist before UI can consume it)
- **Wave 8 (Tasks 40-41)**: Depends on Waves 1-7 (integration tests run after all implementation)
  - Blocks: Wave FINAL (nothing reaches final verification without passing integration)
- **Wave FINAL (F1-F4)**: Depends on ALL prior waves (including Wave 8)

### Parallelizable Groups
- Wave 2 + Wave 3: Can run simultaneously (different subsystems)
- Wave 4 + Wave 3: Can start once Wave 1 is done
- Wave 7: All 5 UI tasks can run in parallel (independent front-end components)
- Wave 8: Sequential (integration tests depend on all prior phases)
- Tasks within each wave: sequential within wave (each builds on the previous)

---

## Test Plan

> **Every acceptance criterion in every task must be verified by an agent-executable test.** This section defines the test methodology, coverage requirements, and acceptance matrix. No human-in-the-loop verification is permitted.

### Test Methodology

| Technique | Tool | When Used |
|-----------|------|-----------|
| Direct SQL assertion | `bun -e` with better-sqlite3 | Schema changes, data integrity, backfill verification |
| API smoke test | `curl` against running dev server | Route handlers, response shapes, error codes |
| Prompt injection test | `curl` to generate endpoint + capture prompt dump | Retrieval content appearing in generation |
| UI state assertion | Playwright (navigate, interact, screenshot, assert DOM) | Front-end panels, debug overlays, timeline views |
| Build verification | `npx next build` | No TypeScript/build errors after changes |
| Job queue inspection | SQLite `SELECT` on job_queue table | Dedup, reaper, debounce, double-queue |
| File system assertion | `bun -e` + fs.readFileSync | Wiki file creation, provenance logs |
| Embedding format check | `bun -e` with Float32Array constructor | Vector search data format |

### Coverage Requirements

Every task MUST satisfy ALL applicable categories:

| Category | Required? | What It Tests |
|----------|-----------|---------------|
| Happy path | ✅ Mandatory | The primary function works with valid inputs |
| Null/empty | ✅ Mandatory | System handles missing data gracefully |
| Boundary | ✅ Mandatory | Edge values (max token budget, 0 results, single result) |
| Data integrity | ✅ Mandatory | No corruption, no phantom writes, rollback on failure |
| Idempotency | 🔷 Where applicable | Running twice produces same result as once |
| Race condition | 🔷 Where applicable | Concurrent writes don't corrupt state |
| Recovery | 🔷 Where applicable | System recovers from partial failure |
| Regression | ✅ Mandatory | Existing behavior is preserved |

### Acceptance Criteria Matrix

```
Phase 0 — Data Integrity:
  [AC-0.1] emotional_tone column no longer overwritten by intent
    → Verify: SQL assert emotional_tone != intent in scene_states after generation
  [AC-0.2] message_summaries INSERT succeeds with correct schema
    → Verify: SQL assert row exists in message_summaries after summarize_messages job
  [AC-0.3] semantic-intent-fallback.ts removed, no imports broken
    → Verify: grep for imports returns 0, build passes
  [AC-0.4] relationship_evolution + events tables exist
    → Verify: SQL .tables includes both
  [AC-0.5] narrative_threads DDL matches TypeScript type
    → Verify: SQL PRAGMA table_info matches type fields
  [AC-0.6] vectorSearch() accepts float32 and JSON, returns correct data
    → Verify: curl API call + assert result shape

Phase 1 — Retrieval Pipeline:
  [AC-1.1] RetrievedContext includes new data sources
    → Verify: TypeScript compiles with new fields
  [AC-1.2] narrative_memories appear in generated prompt
    → Verify: curl generate → prompt dump contains [NARRATIVE MEMORIES] section
  [AC-1.3] message_summaries injected when messages truncated
    → Verify: curl generate with oversized context → summary present, raw messages absent
  [AC-1.4] narrative_threads in [ACTIVE THREADS] section
    → Verify: curl generate → prompt contains thread names
  [AC-1.5] Vector search boosts wiki scores
    → Verify: curl wiki context → entries with vector matches score higher
  [AC-1.6] Importance scores drive memory ranking
    → Verify: SQL assert memories ordered by importance DESC
  [AC-1.7] New prompt sections render in correct order
    → Verify: curl prompt dump → sections in expected sequence
  [AC-1.8] Token budget rebalanced per plan spec
    → Verify: curl prompt dump → budget allocation matches targets
  [AC-1.9] SSE scene updates propagate to UI without refresh
    → Verify: Playwright → send message → scene state panel updates automatically

Phase 2 — Job Queue:
  [AC-2.1] Duplicate jobs not created (same type + session + entity_id)
    → Verify: SQL assert count=1 after duplicate trigger
  [AC-2.2] Old completed/failed jobs reaped
    → Verify: SQL assert jobs older than threshold deleted
  [AC-2.3] No double-queuing on roundtrip
    → Verify: SQL assert count=1 per type per roundtrip
  [AC-2.4] Rapid-repeated jobs debounced
    → Verify: SQL assert only latest instance present
  [AC-2.5] QueuedJob.result field matches DB schema
    → Verify: TypeScript compiles, SQL PRAGMA matches

Phase 3 — Entity Resolution & Provenance:
  [AC-3.1] Entity mentions extracted from memories/summaries
    → Verify: SQL assert entity_mentions table has entries
  [AC-3.2] Name→wiki-page resolution returns correct matches
    → Verify: curl resolve endpoint with known name → correct wiki page ID
  [AC-3.3] Contradictions flagged with resolution step
    → Verify: SQL assert contradiction_flags has entries with status
  [AC-3.4] Single provenance system active
    → Verify: grep for deprecated provenance calls → 0
  [AC-3.5] Entity resolution boosts wiki scoring in generation
    → Verify: curl generate → entity-matched pages score higher

Phase 4 — Relationship Evolution:
  [AC-4.1] relationship_evolution table populated
    → Verify: SQL assert rows exist after analysis job
  [AC-4.2] Narrative anchors have distinct type + timestamps
    → Verify: SQL assert anchors have type column and created_at
  [AC-4.3] Evolution data appears in retrieval
    → Verify: curl generate → [RELATIONSHIPS] section includes evolution
  [AC-4.4] Prompt context includes history + anchors
    → Verify: curl generate → relationship section has historical entries

Phase 5 — Narrative State:
  [AC-5.1] Tension/pacing/narrative_phase columns exist
    → Verify: SQL PRAGMA table_info sessions
  [AC-5.2] Goals + conflicts in scene_states
    → Verify: SQL SELECT goals, active_conflicts returns data
  [AC-5.3] State extracted during scene_extraction job
    → Verify: SQL assert scene_states updated after job
  [AC-5.4] Narrative state in retrieval → prompt
    → Verify: curl generate → [SCENE STATE] includes narrative fields
  [AC-5.5] Decision points tracked
    → Verify: SQL assert decision_points table has entries
  [AC-5.6] (Enhanced) State transitions logged
    → Verify: SQL assert state_history has entries per change
  [AC-5.7] (Enhanced) Prompt prefers recent state over stale
    → Verify: curl generate with old state → prompt uses latest

Phase 6 — UI Layer:
  [AC-6.1] Retrieval inspector toggles and shows context
    → Verify: Playwright keyboard shortcut → panel visible with data
  [AC-6.2] Job admin panel renders with filters
    → Verify: Playwright /admin/jobs → table + filter interaction
  [AC-6.3] Entity browser shows resolved entities
    → Verify: Playwright /admin/entities → entity list + detail
  [AC-6.4] Relationship timeline shows evolution
    → Verify: Playwright session page → timeline component with changes
  [AC-6.5] Narrative debug panel shows state
    → Verify: Playwright debug toggle → state fields + history
```

### Regression Testing

Every phase MUST verify that previous phases still pass:
- **Phase 1 regressions**: Rerun Phase 0 acceptance criteria
- **Phase 2 regressions**: Rerun Phase 0 + Phase 1 ACs
- **Phase 3 regressions**: Rerun Phases 0-2 ACs
- **Phase 4 regressions**: Rerun Phases 0-3 ACs
- **Phase 5 regressions**: Rerun Phases 0-4 ACs
- **Phase 6 regressions**: Rerun Phases 0-5 ACs (Playwright for UI + API/SQL for back-end)
- **Wave 8 regressions**: Full sweep of ALL preceding ACs

### Cross-Phase Integration Test Scenarios

These scenarios verify that components WORK TOGETHER, not just in isolation:

```
Integration-1: Full generate flow with all data sources
  Phases: 1 + 3 + 4 + 5
  Flow: Send message → scene extraction → entity mention extraction → 
        relationship evolution check → narrative state update → 
        retrieval (memories + wiki + relationships + threads + narrative state) → 
        prompt assembly → generation
  Verify: Prompt dump contains all expected sections, no empty sections,
          budget respected, no crash
  Tool: curl + SQLite

Integration-2: Contradiction → resolution → manual dismiss
  Phases: 3 + 6
  Flow: LLM generates contradictory wiki content → contradiction detected → 
        flagged in contradiction_flags → admin UI shows it → 
        user dismisses from UI → status changes
  Verify: End-to-end from detection to UI action
  Tool: curl + Playwright

Integration-3: Relationship evolution → timeline render
  Phases: 4 + 6
  Flow: Analysis job updates relationship_evolution → 
        Relationship timeline UI fetches data → renders changes
  Verify: Timeline shows correct state transitions
  Tool: Playwright

Integration-4: Narrative state → debug panel → prompt bias
  Phases: 5 + 6
  Flow: Scene extraction updates narrative state → 
        Debug panel shows new values → 
        Next generate uses updated state in prompt
  Verify: State change → panel update → prompt change chain
  Tool: curl + Playwright

Integration-5: Job queue failure → admin retry → success
  Phases: 2 + 6
  Flow: Job fails → status=errored → admin panel shows it → 
        user clicks Retry → job re-queued → runs → status=completed
  Verify: Retry cycle works end-to-end
  Tool: Playwright + SQLite
```

---

## TODOs

### WAVE 1 — PHASE 0: Foundation & Data Integrity

> **TL;DR**: Fix the critical schema and data bugs that would corrupt any downstream work. Emotional_tone column being overwritten by intent, message_summaries column mismatch causing silent failures, missing DB tables, DDL drift, dead code, and broken vector search. Everything else depends on clean data.
>
> **Must NOT do in this wave**: No changes to the retrieval pipeline yet. No changes to prompt builder. Fix schemas only.

- [x] 1. Fix emotional_tone / intent column split

  **What to do**:
  - In `src/app/api/generate/[id]/route.ts`, find the line that writes `ctx.intent` into `scene_states.emotional_tone` (around line 168)
  - Option A (preferred): Add a new column `current_intent TEXT` to `scene_states` table AND keep `emotional_tone` as-is for LLM-extracted emotional tone
  - Option B: Remove the overwrite entirely (stop writing intent to emotional_tone)
  - Add a DB migration in `src/lib/schema-migrations.ts` to add the column
  - Update the generate route to write intent to the new column instead
  - Update SceneContext type in `src/lib/retrieval.ts` to include `currentIntent` if Option A

  **Must NOT do**:
  - Don't rename or drop emotional_tone — it's used by LLM extraction and UI
  - Don't change the scene extraction job (it correctly writes emotional tone)

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Requires careful DB schema migration + understanding of two conflicting writers

  **Parallelization**: Wave 1 — sequential (blocks Tasks 2-6)

  **References**:
  - `src/app/api/generate/[id]/route.ts:166-169` — The overwrite: `UPDATE scene_states SET emotional_tone = ? WHERE session_id = ?`
  - `src/lib/retrieval.ts:17-23` — SceneContext type (needs currentIntent field)
  - `src/lib/schema-migrations.ts` — Existing migration pattern
  - `scripts/init-db.ts:111-121` — scene_states table DDL
  - `src/lib/scene-extraction.ts` — LLM extraction that correctly writes emotional_tone

  **Acceptance Criteria**:
  - [ ] Generate route writes intent to `current_intent` column (or stops overwriting)
  - [ ] Scene extraction job still writes emotional tone correctly
  - [ ] `npx next build` passes
  - [ ] Migration runs without errors on existing DB

  **QA Scenarios**:
  ```
  Scenario: Intent no longer overwrites emotional_tone
    Tool: Bash (curl + SQLite)
    Preconditions: Dev server running, a session exists with scene state
    Steps:
      1. `curl -s POST /api/sessions/{id}/scene -H "Content-Type: application/json" -d '{"emotional_tone":"tense"}'` — set emotional_tone via API
      2. `curl -s POST /api/generate/{id} -H "Content-Type: application/json" -d '{"userMessage":"I attack the guard"}'` — trigger generation
      3. `bun -e "const db=require('./src/lib/db').getDb(); const r=db.prepare('SELECT emotional_tone, current_intent FROM scene_states WHERE session_id=?').get('{id}'); console.log(JSON.stringify(r))"` 
    Expected Result: `emotional_tone` is "tense" (still preserved), `current_intent` is "combat"
    Evidence: .omo/evidence/task-1-emotional-tone-preserved.json
  ```

- [x] 2. Fix message_summaries schema divergence

  **What to do**:
  - There's a column name mismatch: `init-db.ts` creates `message_summaries` with column `source_message_id` but `message-summarizer.ts` inserts with column `message_id`
  - Check which schema is correct by looking at existing data and consumers
  - Fix the INSERT statement in `message-summarizer.ts` to use `source_message_id` OR alter the table to add `message_id` and keep both
  - Fix any other consumers that reference the wrong column name
  - Add migration in schema-migrations.ts if altering

  **Must NOT do**:
  - Don't rewrite message-summarizer.ts — just fix the column reference
  - Don't drop existing data — migrate if needed

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Schema debugging + column reference correction, needs grep across codebase

  **Parallelization**: Wave 1 — after Task 1

  **References**:
  - `scripts/init-db.ts` — `message_summaries` table DDL (find column names)
  - `src/lib/message-summarizer.ts` — INSERT statement using wrong column name
  - `src/lib/summarization.ts` — batch summarization, check column usage
  - `src/lib/jobs/summarization-handler.ts` — checks for existing summarizations

  **Acceptance Criteria**:
  - [ ] `message-summarizer.ts` INSERT succeeds without column error
  - [ ] Existing data preserved
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Message summarization INSERT succeeds
    Tool: Bash (SQLite)
    Preconditions: Dev server running
    Steps:
      1. `curl -s -X POST /api/sessions/{id}/messages -H "Content-Type: application/json" -d '{"content":"Test message"}'`
      2. Wait 2 seconds for summarization job to process
      3. `bun -e "const db=require('./src/lib/db').getDb(); const r=db.prepare('SELECT * FROM message_summaries LIMIT 1').all(); console.log(JSON.stringify(r))"`
    Expected Result: Row exists in message_summaries, no column errors
    Evidence: .omo/evidence/task-2-summaries-inserting.json
  ```

- [x] 3. Remove dead code (classifyIntentWithFallback)

  **What to do**:
  - `classifyIntentWithFallback()` in `src/lib/semantic-intent-fallback.ts` is fully implemented (235 lines) but never imported anywhere
  - Either: (a) Delete the file entirely, or (b) Wire it into `getRetrievedContext()` as the intent classifier instead of the pure keyword `classifyIntent()`
  - User preference: remove dead code. Wiring can be done in Phase 1.
  - Remove the export, delete `semantic-intent-fallback.ts`, remove any remaining imports
  - Check `src/lib/retrieval.ts` line 368 to confirm it uses `classifyIntent()` (not the dead function)

  **Must NOT do**:
  - Don't remove `classifyIntent()` from `intent-analyzer.ts` — it's still used

  **Recommended Agent Profile**: `quick`
  - Reason: Trivial deletion of dead code, simple grep verification

  **Parallelization**: Wave 1 — can run parallel with Tasks 1-2

  **References**:
  - `src/lib/semantic-intent-fallback.ts` — entire file to delete
  - `src/lib/retrieval.ts` — line 368, verify no import of dead function

  **Acceptance Criteria**:
  - [ ] `semantic-intent-fallback.ts` deleted
  - [ ] No remaining imports of `classifyIntentWithFallback` anywhere
  - [ ] `npx next build` passes (no broken imports)
  - [ ] `classifyIntent()` in retrieval still works

  **QA Scenarios**:
  ```
  Scenario: Dead code removed, no broken imports
    Tool: Bash
    Preconditions: Codebase clean
    Steps:
      1. `npx next build`
    Expected Result: Build succeeds, no missing module errors
    Evidence: .omo/evidence/task-3-build-pass.txt
    
  Scenario: Intent still classifies in retrieval
    Tool: Bash (curl)
    Preconditions: Dev server running
    Steps:
      1. `curl -s POST /api/generate/{id} -H "Content-Type: application/json" -d '{"userMessage":"I attack the dragon"}' | head -c 200`
    Expected Result: Generation works, intent classification not broken
    Evidence: .omo/evidence/task-3-generation-works.txt
  ```

- [x] 4. CREATE missing DB tables (relationship_evolution, events)

  **What to do**:
  - `relationship_evolution` table is referenced in `relationship-types.ts` (RelationshipEvolutionEntry, RelationshipEvolutionRow) but never created in `scripts/init-db.ts`
  - `events` table is referenced in `contradiction-detector.ts` and `semantic-contradiction.ts` but never created in init-db.ts
  - Add CREATE TABLE IF NOT EXISTS statements for both to `scripts/init-db.ts`
  - Add migration in `src/lib/schema-migrations.ts` for existing databases
  - Determine the exact column definitions from the consuming code

  **relationship_evolution table** (infer from `relationship-types.ts:63-84`):
  ```sql
  CREATE TABLE IF NOT EXISTS relationship_evolution (
    id TEXT PRIMARY KEY,
    relationship_id TEXT NOT NULL REFERENCES relationships(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    emotional_state TEXT,       -- JSON: EmotionalState
    relationship_stage TEXT,
    trigger_event TEXT,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```

  **events table** (infer from `contradiction-detector.ts` CanonEntity + semantic-contradiction.ts CanonEntry):
  ```sql
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT,
    event_type TEXT,
    description TEXT,
    participants TEXT,          -- JSON array
    location_id TEXT,
    occurred_at TEXT,
    outcome TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```

  **Must NOT do**:
  - Don't change existing consumer code that references these tables (just make the tables exist)
  - Don't drop or rename existing columns if tables were created by workaround

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Schema definition requires reading all consumers of both tables

  **Parallelization**: Wave 1 — can run parallel with Tasks 1-3

  **References**:
  - `src/lib/relationship-types.ts:63-84` — RelationshipEvolutionEntry type
  - `src/lib/contradiction-detector.ts` — events table consumers
  - `src/lib/semantic-contradiction.ts` — events table consumers
  - `scripts/init-db.ts` — existing table creation pattern
  - `src/lib/schema-migrations.ts` — migration pattern

  **Acceptance Criteria**:
  - [ ] `relationship_evolution` table created in init-db.ts
  - [ ] `events` table created in init-db.ts
  - [ ] Migration runs without errors
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Missing tables now exist
    Tool: Bash (SQLite)
    Preconditions: Dev server restarted after migration
    Steps:
      1. `bun -e "const db=require('./src/lib/db').getDb(); const tables=db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('relationship_evolution','events')\").all(); console.log(JSON.stringify(tables))"`
    Expected Result: Both tables listed
    Evidence: .omo/evidence/task-4-tables-exist.json
  ```

- [x] 5. Fix narrative_threads DDL drift

  **What to do**:
  - The `narrative_threads` table in `scripts/init-db.ts` has a sparser schema than what the runtime code expects
  - The API route and thread analysis handler reference columns like `description`, `arc_type`, `resolved_at`, `updated_at`, `summary`, `key_entities` that may not exist in the DDL
  - Compare the actual DDL against all INSERT/SELECT statements that reference narrative_threads
  - Add missing columns to both init-db.ts and schema-migrations.ts
  - Use `ALTER TABLE ... ADD COLUMN` for existing databases

  **Must NOT do**:
  - Don't remove existing columns — only add missing ones
  - Don't change the CREATE TABLE order (migration must be additive)

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Schema drift debugging across multiple consumers

  **Parallelization**: Wave 1 — after Tasks 1-4 (schema familiarity)

  **References**:
  - `scripts/init-db.ts` — current narrative_threads DDL
  - `src/lib/job-processor.ts:744-803` — `handleThreadAnalysis()` — columns written
  - `src/app/api/narrative-threads/route.ts` — API route (if exists)
  - `src/lib/schema-migrations.ts` — migration pattern

  **Acceptance Criteria**:
  - [ ] narrative_threads DDL matches all runtime INSERT columns
  - [ ] Migration runs without errors
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Thread analysis writes all columns without error
    Tool: Bash (SQLite)
    Preconditions: Dev server running
    Steps:
      1. Generate a message that triggers thread_analysis
      2. Wait for job to process
      3. `bun -e "const db=require('./src/lib/db').getDb(); const r=db.prepare('SELECT * FROM narrative_threads LIMIT 1').all(); console.log(JSON.stringify(r[0]?.columns ? Object.keys(r[0]) : r))"`
    Expected Result: All expected columns return data without schema errors
    Evidence: .omo/evidence/task-5-threads-schema-fixed.json
  ```

- [x] 6. Fix vectorSearch() data format (JSON vs packed float32)

  **What to do**:
  - `vectorSearch()` in `src/lib/vector-search.ts` uses `vec_cosine_distance()` on vectors stored as JSON text in `embedding_vectors.vector_data`
  - sqlite-vec's `vec_cosine_distance()` expects packed float32 BLOB data, not JSON text strings
  - This means vector search is likely returning garbage results or errors
  - Fix: Convert stored JSON vectors to packed float32 before passing to vec_cosine_distance, OR bypass vec0 tables and implement cosine similarity in JS (which the `semantic-contradiction.ts` already does correctly with `cosineSimilarity()`)
  - Option A (preferred, matches existing pattern): Add in-memory JS cosine similarity fallback like `semantic-intent-fallback.ts` does — compare query embedding against all stored embeddings using JS math
  - Option B: Convert vector_data storage to BLOB format and fix vec0 table inserts

  **Must NOT do**:
  - Don't remove the vec0 virtual table definitions (may be used by future features)
  - Don't change embedding generation format (bge-m3 outputs JSON arrays of numbers)

  **Recommended Agent Profile**: `deep`
  - Reason: Requires understanding sqlite-vec data format + fixing a broken search without breaking embedding storage

  **Parallelization**: Wave 1 — independent of other tasks

  **References**:
  - `src/lib/vector-search.ts` — current vectorSearch() using vec_cosine_distance
  - `src/lib/semantic-contradiction.ts:31-46` — working JS cosineSimilarity() example
  - `scripts/init-db.ts` — vec0 virtual table creation
  - `src/lib/embeddings.ts` — how embeddings are stored (JSON text in vector_data)
  - sqlite-vec docs (check node_modules or docs)

  **Acceptance Criteria**:
  - [ ] `vectorSearch()` returns correct cosine similarity values in [0,1] range
  - [ ] Graceful fallback when vec0 extension unavailable
  - [ ] `npx next build` passes
  - [ ] No regressions in existing embedding storage

  **QA Scenarios**:
  ```
  Scenario: Vector search returns valid similarity scores
    Tool: Bash (SQLite + bun)
    Preconditions: A user with at least 2 embedded entities exists
    Steps:
      1. `bun -e "
        const {vectorSearch} = require('./src/lib/vector-search');
        vectorSearch('user-1', 'test query', {limit: 3}).then(r => console.log(JSON.stringify(r)))
      "`
    Expected Result: Results have `similarity` field with values between 0 and 1
    Evidence: .omo/evidence/task-6-vector-search-works.json
    
  Scenario: Empty embedding index returns empty gracefully
    Tool: Bash (bun)
    Preconditions: Fresh user with no embeddings
    Steps:
      1. Same command with a new userId
    Expected Result: Empty array returned, no crash
    Evidence: .omo/evidence/task-6-empty-index.txt
  ```

  **Enhanced QA Coverage** (beyond per-task scenarios):
  ```
  Scenario [Edge Case]: All Phase 0 migrations run on empty DB
    Tool: Bash (SQLite)
    Preconditions: Fresh DB with no tables
    Steps:
      1. Run schema-migrations.ts up()
      2. `bun -e "const db=require('./src/lib/db').getDb(); const t=db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all(); console.log(t.length)"`
    Expected Result: All tables created, no migration errors — even from empty state
    Evidence: .omo/evidence/phase-0-empty-db-migration.txt

  Scenario [Data Integrity]: Rollback on migration failure
    Tool: Bash (SQLite)
    Preconditions: Migration halfway applied
    Steps:
      1. Manually simulate a mid-migration failure (kill process)
      2. Re-run migration
      3. Verify all expected columns exist via PRAGMA table_info
    Expected Result: Migration is idempotent — partial state doesn't corrupt
    Evidence: .omo/evidence/phase-0-migration-rollback.txt

  Scenario [Regression]: Existing sessions continue to work after all fixes
    Tool: Bash (curl + SQLite)
    Preconditions: Pre-existing session with data
    Steps:
      1. Fetch session via API
      2. Generate a response
      3. Verify session is not empty, emotional_tone is not overwritten
    Expected Result: Session is intact, fix did not break existing data
    Evidence: .omo/evidence/phase-0-existing-session.txt

  Scenario [Boundary]: Column split handles null emotional_tone and null intent
    Tool: Bash (SQLite)
    Preconditions: scene_states row with NULL emotional_tone, NULL intent
    Steps:
      1. Insert a row with NULL in both old and new columns
      2. Read it back
      3. Verify no crash, both columns accept NULL
    Expected Result: NULL values are valid, no NOT NULL constraint violation
    Evidence: .omo/evidence/phase-0-null-values.txt
  ```

### WAVE 2 — PHASE 1: Wire Existing Infrastructure into Retrieval

> **TL;DR**: The biggest value-add in the entire plan. ~50% of the codebase's memory/embedding/importance/thread infrastructure is fully built but completely disconnected from the retrieval pipeline. This phase connects it — narrative_memories become a prompt section, vector search augments wiki scoring, importance scores drive ranking, message summaries replace dropped raw messages, narrative threads become visible to the LLM, and scene state updates appear in the UI in real-time.
>
> **Must NOT do in this wave**: No schema changes (Phase 0 handles that). No new DB tables. This is pure integration work.

- [x] 7. Extend RetrievedContext type for new data sources

  **What to do**:
  - Add new fields to `RetrievedContext` interface in `src/lib/retrieval.ts`:
    - `memories: { entries: { content: string; type: string; importance: number; created_at: string }[] }`
    - `narrativeThreads: { title: string; status: string; description?: string; escalation_level?: string }[]`
    - `messageSummaries: { summary: string; type: string }[]` (for when raw messages are truncated)
  - Update `SceneContext` to add `currentIntent` (if added in Task 1)
  - Keep all fields optional (`[]` or `null` default) — fail open when empty

  **Must NOT do**:
  - Don't remove existing fields
  - Don't break existing consumers of RetrievedContext

  **Recommended Agent Profile**: `quick`
  - Reason: Type definition changes only, no logic yet

  **Parallelization**: Wave 2 — blocks Tasks 8-15 (they need the type)

  **References**:
  - `src/lib/retrieval.ts:37-44` — existing RetrievedContext interface
  - `src/lib/retrieval.ts:17-23` — SceneContext

  **Acceptance Criteria**:
  - [ ] New fields present in RetrievedContext
  - [ ] All fields optional (no compile errors in existing code)
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: New types compile without errors
    Tool: Bash
    Preconditions: Codebase clean
    Steps:
      1. `npx next build 2>&1 | head -50`
    Expected Result: No type errors related to RetrievedContext changes
    Evidence: .omo/evidence/task-7-types-compile.txt
  ```

- [x] 8. Add narrative_memories retrieval → prompt section

  **What to do**:
  - Add `getMemoryContext(userId, sessionId, universeId, limit)` function in `retrieval.ts`
  - Query `narrative_memories` table: most recent N (configurable, default 10), ordered by importance DESC then created_at DESC
  - Filter by user_id and optionally by session_id / universe_id
  - Call from `getRetrievedContext()` — add to returned context
  - In `prompt-builder.ts`, add `[MEMORIES]` section before `[KNOWN WORLD]` section
  - Each memory rendered as: `[TYPE] content` with importance bracketed
  - Respect token budget — truncate low-importance entries first (use importance.ts sortByImportance)

  **Must NOT do**:
  - Don't query narrative_memories that are archived (importance='archived')
  - Don't break existing prompt structure — new section is additive

  **Recommended Agent Profile**: `deep`
  - Reason: Core retrieval integration — needs understanding of DB schema, prompt assembly, and token budgeting

  **Parallelization**: Wave 2 — after Task 7 (type change)

  **References**:
  - `src/lib/retrieval.ts:347-378` — getRetrievedContext() entry point
  - `src/lib/retrieval.ts:264-278` — getRecentMessages() pattern to follow
  - `src/lib/prompt-builder.ts:55-115` — assemblePrompt() section rendering
  - `src/lib/prompt-builder.ts:158-218` — applyContextBudget() token budgeting
  - `src/lib/importance.ts:182-188` — sortByImportance() for ranking
  - `scripts/init-db.ts:345-355` — narrative_memories schema

  **Acceptance Criteria**:
  - [ ] `narrative_memories` appear in generated prompts
  - [ ] New `[MEMORIES]` section is after [CHARACTER INSTRUCTIONS] and before [KNOWN WORLD]
  - [ ] Truncation respects token budget (lowest importance dropped first)
  - [ ] Empty memories → section omitted entirely
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: narrative_memories appear in prompt
    Tool: Bash (SQLite + curl)
    Preconditions: A user with at least 1 narrative memory exists
    Steps:
      1. `curl -s -X POST /api/generate/{id} -H "Content-Type: application/json" -d '{"userMessage":"test","debug":true}'` — trigger generation with debug
      2. Check prompt in generation debug output or server logs
    Expected Result: Generated prompt contains a `[MEMORIES]` section with memory content
    Evidence: .omo/evidence/task-8-memories-in-prompt.txt

  Scenario: Empty memories = no section
    Tool: Bash (SQLite)
    Preconditions: Fresh session with no narrative memories
    Steps:
      1. Verify no narrative_memories exist for this user
      2. Trigger generation
    Expected Result: No `[MEMORIES]` section in prompt (or empty section omitted)
    Evidence: .omo/evidence/task-8-no-memories-handled.txt
  ```

- [x] 9. Add message_summaries injection when budget truncates

  **What to do**:
  - In `applyContextBudget()` in `prompt-builder.ts`, when the token budget forces message truncation, inject the most relevant message summary(ies) to preserve context
  - Add `getMessageSummaries(sessionId, count)` function that queries `message_summaries` for the most recent N summaries
  - These summaries replace the dropped raw messages — append as `[MESSAGE SUMMARIES]` section right after `[MEMORIES]`
  - Prioritize summaries with `emotional_tone` data (non-'archived' summaries first)
  - If no summaries exist, gracefully omit

  **Must NOT do**:
  - Don't change the message truncation algorithm — just ADD summaries when truncation happens
  - Don't inject summaries AND full messages (duplicate context)

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Requires understanding of token budget mechanics + message_summaries table

  **Parallelization**: Wave 2 — after Task 7 (type)

  **References**:
  - `src/lib/prompt-builder.ts:158-218` — applyContextBudget() where truncation happens
  - `src/lib/message-summarizer.ts` — how summaries are created
  - `scripts/init-db.ts` — message_summaries schema

  **Acceptance Criteria**:
  - [ ] When budget truncates messages, summaries are injected
  - [ ] No duplicated context (don't have both full messages AND summaries)
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Message summaries appear when messages truncated
    Tool: Bash (SQLite + curl)
    Preconditions: Session with 30+ messages and at least 1 message_summary
    Steps:
      1. Trigger generation (will truncate with default 30-message budget)
      2. Capture generated prompt
    Expected Result: Prompt includes `[MESSAGE SUMMARIES]` or similar section
    Evidence: .omo/evidence/task-9-summaries-in-prompt.txt
  ```

- [x] 10. Add narrative_threads → [ACTIVE THREADS] prompt section

  **What to do**:
  - Add `getActiveThreads(sessionId, universeId)` function in `retrieval.ts`
  - Query `narrative_threads` for active/dormant threads in this universe/session
  - Include: title, status, description, key_entities
  - Add `activeThreads` to `RetrievedContext`
  - Add `[ACTIVE THREADS]` section to prompt-builder.ts, between `[INTENT]` and `[KNOWN WORLD]`
  - Each thread: `• {title} [{status}] — {description}`
  - Truncate to token budget (keep highest escalation_level first)

  **Must NOT do**:
  - Don't include resolved threads (status='resolved')

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Standard retrieval integration, follows pattern from Tasks 8-9

  **Parallelization**: Wave 2 — after Task 7 (type)

  **References**:
  - `scripts/init-db.ts` — narrative_threads schema
  - `src/lib/job-processor.ts:744-803` — handleThreadAnalysis() creates threads
  - `src/lib/prompt-builder.ts:55-115` — assemblePrompt() section order

  **Acceptance Criteria**:
  - [ ] Active narrative threads appear in prompt
  - [ ] Resolved threads excluded
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Active threads in prompt
    Tool: Bash (SQLite + curl)
    Preconditions: Session with at least 1 active narrative_thread
    Steps:
      1. `curl -s -X POST /api/generate/{id} -H "Content-Type: application/json" -d '{"userMessage":"test"}'` 
    Expected Result: Prompt contains `[ACTIVE THREADS]` section
    Evidence: .omo/evidence/task-10-threads-in-prompt.txt
  ```

- [x] 11. Wire vector search into wiki context scoring

  **What to do**:
  - In `getWikiContext()` in `retrieval.ts`, after the keyword-based `scoreWikiEntry()` pass, add a secondary vector search pass
  - For the top 10 keyword-scored results, generate an embedding for the scene query (location + goal + active NPCs) using `generateEmbedding()`
  - Compare against each candidate's stored embedding in `embedding_vectors`
  - Re-rank: final_score = 0.6 × keyword_score + 0.4 × vector_similarity
  - If vector search unavailable/fails, fall back to keyword-only scoring (graceful degradation)
  - Use `Task 6`'s fixed `vectorSearch()` or inline JS cosineSimilarity like `semantic-contradiction.ts` does

  **Must NOT do**:
  - Don't remove the keyword scoring path — vector search is an enhancement, not replacement
  - Don't make generation depend on vector search availability

  **Recommended Agent Profile**: `deep`
  - Reason: Requires integrating embedding generation + vector search into the existing keyword-scored wiki retrieval path

  **Parallelization**: Wave 2 — after Task 6 (vector search fix) + Task 7 (type)

  **References**:
  - `src/lib/retrieval.ts:165-233` — getWikiContext() current algorithm
  - `src/lib/wiki/index-utils.ts:85-110` — scoreWikiEntry() keyword scoring
  - `src/lib/semantic-contradiction.ts:31-46` — working JS cosineSimilarity() example
  - `src/lib/ollama.ts` — generateEmbedding() function

  **Acceptance Criteria**:
  - [ ] Wiki results re-ranked with hybrid score (keyword + vector)
  - [ ] Vector search failure gracefully falls back to keyword-only
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Hybrid wiki ranking produces different results than keyword-only
    Tool: Bash (bun)
    Preconditions: A universe with wiki pages and embeddings
    Steps:
      1. Write script that calls getWikiContext() and logs top 5 entries with scores
      2. Verify both keyword_score and vector_similarity are non-zero
    Expected Result: Results show hybrid scoring; vector component contributes to ranking
    Evidence: .omo/evidence/task-11-hybrid-ranking.json

  Scenario: Graceful degradation when vector unavailable
    Tool: Bash (bun)
    Preconditions: Vector search extension disabled
    Steps:
      1. Call getWikiContext() 
    Expected Result: Returns keyword-only results, no crash
    Evidence: .omo/evidence/task-11-fallback-works.txt
  ```

- [x] 12. Wire importance scores into memory ranking

  **What to do**:
  - In `getMemoryContext()` (from Task 8), use `importance.ts`'s `calculateImportance()` and `sortByImportance()` to rank narrative memories
  - The `narrative_memories.importance` column stores a JSON object with 4-axis scores — parse it and pass to `calculateImportance()`
  - High-importance memories (score 13-16) are always included (before budget)
  - Normal-importance (9-12) included after high
  - Low-importance (5-8) only if budget remains
  - Archived (≤4) never included
  - Apply recency decay via `decayRecency()` before ranking — memories not referenced in >7 days get lower priority

  **Must NOT do**:
  - Don't change memory-compression.ts or its independent logic — wire importance.ts INTO retrieval only

  **Recommended Agent Profile**: `deep`
  - Reason: Connects importance.ts scoring system to narrative_memories retrieval — requires understanding both

  **Parallelization**: Wave 2 — after Task 8 (getMemoryContext exists)

  **References**:
  - `src/lib/importance.ts:66-86` — calculateImportance()
  - `src/lib/importance.ts:182-188` — sortByImportance()
  - `src/lib/importance.ts:110-121` — decayRecency()
  - `src/lib/importance.ts:160-177` — getHighPriorityEntities(), getArchivalCandidates()

  **Acceptance Criteria**:
  - [ ] Memories returned from getMemoryContext() are sorted by importance descending
  - [ ] Archived memories (score ≤ 4) excluded
  - [ ] High-importance memories (score 13-16) always included
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Memories ranked by importance
    Tool: Bash (SQLite + bun)
    Preconditions: User has narrative_memories with varying importance scores
    Steps:
      1. Write script to call getMemoryContext() and log ordered memories with scores
    Expected Result: Memories sorted by importance descending; archived excluded
    Evidence: .omo/evidence/task-12-importance-ranked.json
  ```

- [x] 13. Extend prompt-builder.ts with new sections

  **What to do**:
  - Add rendering for all new context sections in `assemblePrompt()`:
    - `[MEMORIES]` (from Task 8) — between [CHARACTER INSTRUCTIONS] and [CURRENT SCENE]
    - `[MESSAGE SUMMARIES]` (from Task 9) — between [MEMORIES] and [CURRENT SCENE]
    - `[ACTIVE THREADS]` (from Task 10) — between [INTENT] and [KNOWN WORLD]
  - Each section should be conditionally rendered (only if data exists)
  - Wrap user-provided content in `<user_content>` tags (consistent with existing pattern)
  - Update `applyContextBudget()` to allocate tokens for new sections:
    - Reduce message budget from 60% to 45%
    - New allocation: memories 10%, threads 5%, summaries variable (carved from message budget when triggered)

  **Must NOT do**:
  - Don't remove existing sections or change their order relative to each other
  - Don't inject empty sections (omit if no data)

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Multiple new section renderers following existing patterns

  **Parallelization**: Wave 2 — after Tasks 8-10 (sections have data sources)

  **References**:
  - `src/lib/prompt-builder.ts:55-115` — assemblePrompt() rendering pattern
  - `src/lib/prompt-builder.ts:158-218` — applyContextBudget() budget allocation
  - `src/lib/prompt-builder.ts:43-45` — wrapUserContent() helper

  **Acceptance Criteria**:
  - [ ] All new sections render in correct order when data present
  - [ ] Sections omitted when data absent
  - [ ] User content wrapped in `<user_content>` tags
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: All new sections render in prompt
    Tool: Bash (curl + SQLite)
    Preconditions: User has memories, threads, and summaries
    Steps:
      1. Trigger generation with debug
      2. Capture full prompt
    Expected Result: Prompt contains [MEMORIES], [MESSAGE SUMMARIES], and [ACTIVE THREADS] sections in correct order
    Evidence: .omo/evidence/task-13-all-sections-render.txt

  Scenario: No data = no empty sections
    Tool: Bash (curl + SQLite)
    Preconditions: Fresh session with no memories/summaries/threads
    Steps:
      1. Trigger generation
      2. Capture prompt
    Expected Result: No empty sections, no `[MEMORIES]` header without content
    Evidence: .omo/evidence/task-13-no-empty-sections.txt
  ```

- [x] 14. Rebalance token budget in applyContextBudget()

  **What to do**:
  - Current allocation: 60% messages, 25% lore, 10% relationships, 500 overhead
  - New allocation:
    - Overhead: 500 tokens (unchanged)
    - Messages: 40% (reduced from 60% — new sections provide additional context)
    - Lore: 20% (reduced from 25%)
    - Relationships: 10% (unchanged)
    - Memories: 15% (new section, from narrative_memories)
    - Active Threads: 10% (new section)
    - Message Summaries: 5% (new section, only used when messages truncated)
  - Make these configurable via constants (not hardcoded magic numbers)
  - Log budget allocation stats for debugging

  **Must NOT do**:
  - Don't make the total exceed 6000 tokens
  - Don't hardcode budget percentages — use named constants

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Careful budget rebalancing — needs to ensure prompt quality doesn't degrade

  **Parallelization**: Wave 2 — after Tasks 8-13 (new sections exist)

  **References**:
  - `src/lib/prompt-builder.ts:158-218` — applyContextBudget() current hardcoded allocation
  - `src/lib/config.ts` — config constants pattern

  **Acceptance Criteria**:
  - [ ] New budget allocation compiles and works
  - [ ] Budget percentages configurable via constants
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Budget allocation produces valid prompt
    Tool: Bash (bun)
    Preconditions: User with full data (memories, threads, summaries)
    Steps:
      1. Call assemblePromptWithBudget() with test data
      2. Check total token count <= 6000
    Expected Result: Total tokens <= 5500 (within 6000 after overhead)
    Evidence: .omo/evidence/task-14-budget-respected.txt
  ```

- [x] 15. Fix useSession SSE subscription for SCENE_UPDATED

  **What to do**:
  - Find the `useSession` hook (likely in `src/hooks/use-session.ts` or similar)
  - The SSE stream emits `SCENE_UPDATED` events (from `scene-handler.ts:29` via event bus), and the stream route subscribes to `scene:updated` events
  - The page already has partial SSE subscription for `scene:updated` events calling `refreshSession()`. Verify the propagation chain (SSE → `refresh()` → scene state update in UI) works end-to-end — users shouldn't need a page refresh to see scene updates.
  - Add an SSE event listener in `useSession` for scene:updated / scene state change events
  - On event, update the local scene state via the existing `setScene` or equivalent state setter
  - Listen for `scene:updated` message type from the EventSource in the session page

  **Must NOT do**:
  - Don't rewrite the SSE infrastructure — just add the missing subscription
  - Don't change the scene-handler.ts event emission (already correct)

  **Recommended Agent Profile**: `visual-engineering`
  - Reason: Client-side React hook modification with SSE events

  **Parallelization**: Wave 2 — can run in parallel with Tasks 8-14

  **References**:
  - `src/hooks/use-session.ts` or equivalent — find the hook
  - `src/app/(app)/session/[id]/page.tsx` — SSE EventSource subscription
  - `src/lib/event-bus.ts` — event bus
  - `src/lib/jobs/scene-handler.ts:29` — SSE event emission
  - `src/app/api/sessions/[id]/stream/route.ts` — SSE stream route

  **Acceptance Criteria**:
  - [ ] Scene state in UI updates within 2 seconds of job completion
  - [ ] No page refresh needed to see auto-extracted scene changes
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Scene state updates in real-time
    Tool: Playwright
    Preconditions: Browser open on session page
    Steps:
      1. Send a message that triggers scene extraction
      2. Wait 5 seconds
      3. Check scene state panel for updated location/goal/tone
    Expected Result: Scene state panel shows new values without page refresh
    Evidence: .omo/evidence/task-15-scene-updates.png
  ```

  **Enhanced QA Coverage** (beyond per-task scenarios):
  ```
  Scenario [Null/Empty]: All new retrieval sources return empty gracefully
    Tool: Bash (curl)
    Preconditions: Fresh session with NO memories, threads, wiki entries, or summaries
    Steps:
      1. Trigger generation
      2. Capture prompt dump
      3. Search for [NARRATIVE MEMORIES], [ACTIVE THREADS], and summary sections
    Expected Result: Empty-data sections are OMITTED (not rendered as empty). No crash, no "undefined" or empty bullet lists in the prompt.
    Evidence: .omo/evidence/phase-1-empty-sources.txt

  Scenario [Boundary]: Token budget hard limit respected at maximum capacity
    Tool: Bash (curl)
    Preconditions: Session with enough memories, wiki entries, threads, and summaries to exceed 6000-token budget by 2x
    Steps:
      1. Trigger generation
      2. Capture full prompt dump
      3. Count approximate tokens (split on whitespace + divide by 0.75 for multi-byte)
    Expected Result: Total prompt tokens ≤ 6000 (budget). Sections truncated/omitted as needed, no over-budget generation.
    Evidence: .omo/evidence/phase-1-budget-limit.txt

  Scenario [Data Integrity]: All section types present with rich data
    Tool: Bash (curl + bun)
    Preconditions: Seasoned session with 50+ messages, wiki pages, relationships, memories, threads
    Steps:
      1. Trigger generation with full context
      2. Capture prompt dump
      3. Verify each expected section header is present
      4. Cross-reference 3 facts in the prompt against SQLite source data
    Expected Result: Prompt contains all sections. Facts in prompt match source data 1:1. No hallucinated facts in the context.
    Evidence: .omo/evidence/phase-1-rich-context.txt

  Scenario [Boundary]: Single message session (minimum viable data)
    Tool: Bash (curl)
    Preconditions: Brand new session, exactly 1 user message, 1 assistant response
    Steps:
      1. Trigger generation
      2. Capture prompt dump
    Expected Result: Generation works. Prompt is brief but valid. No crash from empty data arrays.
    Evidence: .omo/evidence/phase-1-minimal-session.txt

  Scenario [Race Condition]: Concurrent generation requests don't corrupt retrieval state
    Tool: Bash (curl)
    Preconditions: Session with moderate data
    Steps:
      1. Fire 3 concurrent generate requests (background with &)
      2. Wait for all to complete
      3. Verify all 3 return valid responses
      4. Check session state is not corrupted
    Expected Result: All 3 requests succeed. Session data intact. No "write conflict" or duplicate prompt sections.
    Evidence: .omo/evidence/phase-1-concurrent-generate.txt
  ```

### WAVE 3 — PHASE 2: Job Queue Hygiene

> **TL;DR**: The job queue has 4 critical problems: (1) zero deduplication — identical jobs pile up, (2) no reaping — completed jobs accumulate forever, (3) double-queuing — summarize_messages and generate_embeddings are queued from TWO routes per roundtrip, (4) a TypeScript gap — the `result` column exists in the DB schema but is missing from the QueuedJob interface. These are cheap fixes with high operational impact.
>
> **Must NOT do**: No changes to job HANDLERS (scene-handler.ts, wiki-handler.ts, etc.). Queue-level changes only.

- [x] 16. Add deduplication to queueJob()

  **What to do**:
  - In `src/lib/job-processor.ts`, in the `queueJob()` function, before INSERT, check if a pending/queued job of the same type already exists for the same session/entity context
  - Dedup scope: same `(type, user_id, session_id_if_applicable)` with status `queued` or `processing`
  - If a duplicate exists, skip the INSERT (return existing job ID)
  - Use a configurable dedup window: e.g., if the same job type was queued within the last 30 seconds
  - Add a `UNIQUE` index on `(type, user_id, session_id_if_applicable)` in init-db.ts (as migration)
  - Handle edges: `scene_state_extract` dedup by session, `generate_embeddings` dedup by messageId, `summarize_messages` dedup by messageId

  **Must NOT do**:
  - Don't deduplicate across different users (userId always in dedup key)
  - Don't make the dedup check too aggressive (some jobs legitimately re-run with different payloads)

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Queue-level change affecting all job types — needs careful dedup key design

  **Parallelization**: Wave 3 — can start after Wave 1 (clean schemas)

  **References**:
  - `src/lib/job-processor.ts:104-116` — `queueJob()` current INSERT
  - `src/lib/job-processor.ts:79-82` — JobPriority type
  - `scripts/init-db.ts:228-244` — job_queue schema

  **Acceptance Criteria**:
  - [ ] Identical jobs (same type + context) not duplicated
  - [ ] Different jobs with same type but different context still queued
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Duplicate job skipped
    Tool: Bash (SQLite + curl)
    Preconditions: Dev server running
    Steps:
      1. Send two identical generate requests rapidly
      2. `bun -e "const db=require('./src/lib/db').getDb(); const r=db.prepare('SELECT type, COUNT(*) as count FROM job_queue WHERE user_id=? AND status=\'queued\' GROUP BY type').all('{userId}'); console.log(JSON.stringify(r))"`
    Expected Result: Each job type appears once (no duplicates with same context)
    Evidence: .omo/evidence/task-16-no-duplicates.json

  Scenario: Different contexts still create separate jobs
    Tool: Bash (curl)
    Steps:
      1. Send two messages to different sessions
    Expected Result: Each gets its own set of jobs
    Evidence: .omo/evidence/task-16-different-contexts-work.txt
  ```

- [x] 17. Add job reaper (DELETE old completed/failed/cancelled)

  **What to do**:
  - Add a `reapOldJobs()` function in `job-processor.ts`
  - DELETE from `job_queue` WHERE status IN ('completed', 'failed', 'cancelled') AND updated_at < datetime('now', '-N days')
  - Default retention: 30 days (configurable via constant)
  - Wire into existing idle processing — add to Tier 4 (30-minute tier) alongside other maintenance
  - Also provide an API endpoint or call from `processIdleTier()`
  - Add logging: "Reaped N old jobs"

  **Must NOT do**:
  - Don't delete 'queued' or 'processing' jobs (still active)
  - Don't make reaping synchronous with generation (idle-time only)

  **Recommended Agent Profile**: `quick`
  - Reason: Simple DELETE query + idle processing integration

  **Parallelization**: Wave 3 — after Task 16 (or parallel)

  **References**:
  - `src/lib/job-processor.ts` — existing patterns
  - `src/lib/idle-processing.ts` — Tier 4 where to wire in
  - `scripts/init-db.ts:228-244` — job_queue schema (updated_at column)

  **Acceptance Criteria**:
  - [ ] Old completed/failed jobs deleted after configurable window
  - [ ] Active jobs (queued/processing) never deleted
  - [ ] Reaping logs how many were removed
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Old jobs reaped
    Tool: Bash (SQLite)
    Preconditions: Database has completed jobs older than retention window
    Steps:
      1. Call reapOldJobs() (or trigger idle processing)
      2. `bun -e "const db=require('./src/lib/db').getDb(); const count=db.prepare('SELECT COUNT(*) as c FROM job_queue').get(); console.log('Remaining jobs:', count.c)"`
    Expected Result: Old completed/failed jobs removed
    Evidence: .omo/evidence/task-17-jobs-reaped.txt
  ```

- [x] 18. Fix double-queuing (messages + generate routes)

  **What to do**:
  - `summarize_messages` is queued in BOTH `messages/route.ts` (line ~162) and `generate/[id]/route.ts` (line ~237)
  - `generate_embeddings` is queued in BOTH `messages/route.ts` (line ~168) and `generate/[id]/route.ts` (line ~244)
  - Determine which route should own which jobs:
    - Option A: Remove from messages/route.ts (generate route handles all post-generation jobs)
    - Option B: Messages route handles user message jobs, generate route handles AI message jobs (with different payloads — this IS legitimate if they reference different message IDs)
  - If payloads reference different messageIds (user message vs AI message), the double-queuing IS correct — just verify dedup handles this
  - If payloads are identical, remove the duplicate
  - Add a comment documenting the ownership convention

  **Must NOT do**:
  - Don't remove both — each message type needs its own summarization/embedding

  **Recommended Agent Profile**: `quick`
  - Reason: Investigate and fix — either remove or document

  **Parallelization**: Wave 3 — after Tasks 16-17 (context about queue behavior)

  **References**:
  - `src/app/api/sessions/[id]/messages/route.ts:161-175` — messages POST queue
  - `src/app/api/generate/[id]/route.ts:237-244` — generate POST queue
  - `src/lib/message-summarizer.ts` — check if payloads reference different messageIds

  **Acceptance Criteria**:
  - [ ] Each message type (user + AI) gets exactly one summarization and one embedding job
  - [ ] Ownership convention documented in code
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No double-queuing per message
    Tool: Bash (SQLite)
    Preconditions: Dev server running
    Steps:
      1. Send a user message + trigger generation
      2. `bun -e "const db=require('./src/lib/db').getDb(); const r=db.prepare('SELECT type, COUNT(*) as count FROM job_queue WHERE status=\'queued\' GROUP BY type').all(); console.log(JSON.stringify(r))"`
    Expected Result: Each job type appears reasonable count (no duplicates for same messageId)
    Evidence: .omo/evidence/task-18-no-double-queue.json
  ```

- [x] 19. Add debouncing for rapid-repeated job types

  **What to do**:
  - Some job types are burst-prone (e.g., during rapid message exchange, `analyze_relationships` or `wiki_extract_event` may fire many times in seconds)
  - Add a minimum interval check: if a job of the same type was created within N seconds for the same context, skip this one
  - Configurable per-job-type intervals (constants map):
    - `wiki_extract_event`: 60s minimum interval
    - `thread_analysis`: 60s minimum interval
    - `scene_state_extract`: 30s minimum interval
    - `analyze_relationships`: 30s minimum interval (enough to batch context)
  - Higher-priority jobs (summarize_messages, generate_embeddings) always fire
  - Add timestamp check in `queueJob()` — compare `created_at` of last queued job of same type

  **Must NOT do**:
  - Don't debounce high-priority jobs (summarize, embeddings)
  - Don't debounce across different sessions/universes

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Per-type interval configuration + queueJob() modification

  **Parallelization**: Wave 3 — after Task 16 (dedup first, debounce second)

  **References**:
  - `src/lib/job-processor.ts:104-116` — queueJob() (add interval check here)
  - `scripts/init-db.ts:228-244` — job_queue schema (created_at column)
  - `src/app/api/generate/[id]/route.ts:223-271` — all job queuing calls

  **Acceptance Criteria**:
  - [ ] Burst-repeated job types respect minimum intervals
  - [ ] High-priority jobs never debounced
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Debounced jobs skipped within interval
    Tool: Bash (SQLite + curl)
    Preconditions: Dev server running
    Steps:
      1. Send 3 rapid generate requests
      2. Check job_queue for wiki_extract_event count
    Expected Result: Fewer than 3 wiki_extract_event jobs (debounced)
    Evidence: .omo/evidence/task-19-debounced.txt
  ```

- [x] 20. Fix QueuedJob TypeScript type gap (missing `result` field)

  **What to do**:
  - The `job_queue` DB schema has a `result TEXT` column (created in init-db.ts)
  - The `QueuedJob` TypeScript interface is missing the `result` field — it returns `Record<string, unknown>` instead of properly typed `string | null`
  - Add `result: string | null` to the QueuedJob interface
  - Check all consumers that read job_queue rows and ensure `result` is properly typed
  - This prevents `as string` or `Record<string, any>` assertions downstream

  **Must NOT do**:
  - Don't change the DB schema — just fix the TypeScript type

  **Recommended Agent Profile**: `quick`
  - Reason: Simple type fix

  **Parallelization**: Wave 3 — independent of other Phase 2 tasks

  **References**:
  - `src/lib/job-processor.ts` — find QueuedJob interface, add `result` field
  - `scripts/init-db.ts:228-244` — job_queue DDL showing result column
  - `src/app/api/jobs/route.ts` — API route that returns job data (type correctness)

  **Acceptance Criteria**:
  - [ ] `result: string | null` present on QueuedJob interface
  - [ ] No new `as string` cast needed for result access
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: QueuedJob type includes result field
    Tool: Bash (grep)
    Preconditions: Codebase clean
    Steps:
      1. `grep -n "interface QueuedJob" src/lib/job-processor.ts -A 15 | grep result`
    Expected Result: Line showing `result: string | null`
    Evidence: .omo/evidence/task-20-type-fixed.txt
  ```

  **Enhanced QA Coverage** (beyond per-task scenarios):
  ```
  Scenario [Null/Empty]: Queue operations handle empty queue gracefully
    Tool: Bash (SQLite)
    Preconditions: Fresh DB with no job_queue entries, or all rows deleted
    Steps:
      1. Run reaper
      2. Try to deduplicate
      3. Try to debounce
    Expected Result: No errors on empty queue. Reaper deletes 0 rows (no crash). Dedup and debounce are no-ops.
    Evidence: .omo/evidence/phase-2-empty-queue.txt

  Scenario [Data Integrity]: Idempotent dedup — running twice produces same result
    Tool: Bash (SQLite)
    Preconditions: DB has 5 duplicate job pairs (same type + session_id + entity_id)
    Steps:
      1. Run dedup once
      2. Count remaining duplicates
      3. Run dedup again
      4. Count again
    Expected Result: After first pass, duplicates reduced. After second pass, count is identical (no further changes). Dedup is idempotent.
    Evidence: .omo/evidence/phase-2-dedup-idempotent.txt

  Scenario [Boundary]: Reaper respects retention threshold exactly
    Tool: Bash (SQLite)
    Preconditions: Jobs with known created_at timestamps straddling the threshold
    Steps:
      1. Manually verify 3 jobs just under threshold (should survive)
      2. Verify 3 jobs just over threshold (should be reaped)
      3. Run reaper
      4. Check which jobs exist
    Expected Result: Jobs within retention window survive. Jobs outside are reaped. Exact boundary respected.
    Evidence: .omo/evidence/phase-2-reaper-boundary.txt

  Scenario [Race Condition]: Concurrent queue operations don't corrupt
    Tool: Bash (bun)
    Preconditions: Queue has pending jobs
    Steps:
      1. Fire 3 parallel: dedup, reaper, queueJob
      2. Wait for all to complete
      3. Check job_queue count is consistent (no negative counts, no orphaned jobs)
      4. Verify no SQLITE_BUSY errors in logs
    Expected Result: All operations complete. Queue is consistent. No corruption.
    Evidence: .omo/evidence/phase-2-concurrent-queue.txt

  Scenario [Recovery]: Job status stuck in 'running' recovers after restart
    Tool: Bash (SQLite)
    Preconditions: Job with status='running' that was orphaned (crash during processing)
    Steps:
      1. Restart the server
      2. Check if startup handler resets stuck jobs to 'pending'
      3. Verify job re-runs on next idle cycle
    Expected Result: Stuck running jobs reset to pending on startup. No jobs permanently stuck.
    Evidence: .omo/evidence/phase-2-recovery-stuck.txt
  ```

### WAVE 4 — PHASE 3: Wiki Entity Resolution & Provenance

> **TL;DR**: Three critical gaps: (1) no entity resolution — if the LLM creates "Marcus Blackwood" and "Marcus (Blacksmith)" as separate pages, nothing detects the duplicate, (2) three parallel contradiction detection systems exist but none have a resolution step — contradictions are flagged but nothing happens, (3) three parallel provenance tracking systems exist — that's tech debt. This phase picks winners, adds resolution, and adds entity mention tracking.
>
> **Must NOT do**: No auto-resolution of contradictions (flag only). No new provenance system (pick existing). No global entity registry.

- [x] 21. Build entity mention extraction from memories/summaries

  **What to do**:
  - Add a function that extracts entity mentions from narrative_memories content and message summaries
  - Use simple regex/heuristic extraction: look for `[[wikilink]]` references in memory content, capitalized proper nouns that appear N+ times
  - For each extracted mention, record: `{ entity_name, source_table, source_id, frequency, last_seen_at }` 
  - Store in a new `entity_mentions` table (or existing `embedding_index` with entity_type='entity_mention')
  - This creates the data source for entity→wiki-page resolution (Task 22)
  - Run during idle processing (Tier 2, alongside other enrichment)

  **Must NOT do**:
  - Don't use LLM for entity extraction — regex/heuristic is sufficient and much cheaper
  - Don't change how narrative_memories or summaries are created (extract from existing data)

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Regex extraction + simple DB storage

  **Parallelization**: Wave 4 — depends on Wave 1 (clean schemas) + Wave 2 (memories/summaries in retrieval)

  **References**:
  - `src/lib/wiki/wikilinks.ts` — wikilink parsing pattern
  - `src/lib/idle-processing.ts` — Tier 2 enrichment tasks (pattern to follow)
  - `scripts/init-db.ts` — table creation pattern

  **Acceptance Criteria**:
  - [ ] Entity mentions extracted from narrative_memories and message summaries
  - [ ] Entity mentions stored in DB with frequency and last_seen_at
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Entity mentions extracted and stored
    Tool: Bash (bun + SQLite)
    Preconditions: User has narrative_memories with entity references
    Steps:
      1. Run entity mention extraction
      2. `bun -e "const db=require('./src/lib/db').getDb(); const r=db.prepare('SELECT entity_name, frequency, source_table FROM entity_mentions WHERE user_id=? ORDER BY frequency DESC LIMIT 10').all('{userId}'); console.log(JSON.stringify(r))"`
    Expected Result: Entity mentions with names, frequencies, and source table
    Evidence: .omo/evidence/task-21-entity-mentions.json
  ```

- [x] 22. Build name?wiki-page resolver

  **What to do**:
  - Build a function `resolveEntityToWikiPage(entityName, universeId)` that returns the best wiki page match
  - Leverage existing `backlinks.ts` for name-based entity resolution
  - Use fuzzy name matching: case-insensitive, substring, Levenshtein distance for close matches
  - Try exact match first, then lowercase match, then substring, then fuzzy
  - Return `{ pagePath, title, confidence }` or null if no match
  - Wire into `getWikiContext()` — when retrieving lore, also check if any entity mentions from Task 21 match wiki pages, and boost those pages' relevance scores

  **Must NOT do**:
  - Don't create a global entity registry (over-engineering)
  - Don't modify wiki page content — just resolve names to pages

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Fuzzy matching + wiki page resolution

  **Parallelization**: Wave 4 — after Task 21 (needs entity mentions)

  **References**:
  - `src/lib/wiki/wikilinks.ts` — wikilink resolution patterns
  - `src/lib/backlinks.ts` — existing name resolution
  - `src/lib/wiki/index-utils.ts` — resolveWikiPagePath()
  - `src/lib/retrieval.ts:165-233` — getWikiContext() where to wire in

  **Acceptance Criteria**:
  - [ ] Exact entity name → wiki page resolution works
  - [ ] Fuzzy name → wiki page resolution works (returns lower confidence)
  - [ ] Unknown entity name → null (no crash)
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Exact entity name resolves to wiki page
    Tool: Bash (bun)
    Preconditions: Wiki has a page titled "Marcus Blackwood"
    Steps:
      1. Call resolveEntityToWikiPage("Marcus Blackwood", universeId)
    Expected Result: Returns { pagePath, title: "Marcus Blackwood", confidence: 1.0 }
    Evidence: .omo/evidence/task-22-exact-resolve.json

  Scenario: Unknown entity returns null gracefully
    Tool: Bash (bun)
    Steps:
      1. Call resolveEntityToWikiPage("ZZZUnknownEntity123", universeId)
    Expected Result: null, no crash
    Evidence: .omo/evidence/task-22-unknown-handled.txt
  ```

- [x] 23. Add contradiction detection ? flag resolution step

  **What to do**:
  - Pick ONE of the three contradiction detection systems as canonical:
    - `wiki/lint.ts` (562 lines, rule-based + LLM pairwise comparison) — RECOMMENDED: most comprehensive
    - `contradiction-detector.ts` (rule-based: alive/dead, temporal, location)
    - `semantic-contradiction.ts` (embedding + LLM comparison)
  - Recommended: keep `wiki/lint.ts` as the primary, deprecate the other two
  - Add a `contradiction_flags` table: `{ id, entity_name, page_a, page_b, claim_a, claim_b, contradiction_type, severity, detected_at, resolved_at, resolution }`
  - When `detectContradictions()` finds a conflict, INSERT a row into `contradiction_flags` instead of just returning the array
  - Add a UI component to view unresolved contradictions
  - Add an idle-time job `resolve_contradictions` that re-checks flagged contradictions (re-run detection to see if still valid)

  **Must NOT do**:
  - Don't auto-resolve contradictions — flag for human decision only
  - Don't remove the other two detectors until migration verified
  - Don't block wiki writes on contradiction checking (async only)

  **Recommended Agent Profile**: `deep`
  - Reason: Building contradiction pipeline with persistence + UI

  **Parallelization**: Wave 4 — after Task 22 (entity resolution helps matching)

  **References**:
  - `src/lib/wiki/lint.ts:183-285` — detectContradictions() — primary candidate
  - `src/lib/contradiction-detector.ts` — to deprecate
  - `src/lib/semantic-contradiction.ts` — to deprecate
  - `scripts/init-db.ts` — new table pattern

  **Acceptance Criteria**:
  - [ ] Contradiction_flags table exists
  - [ ] lint.ts contradictions persisted to table
  - [ ] Deprecated detectors documented as deprecated in code
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Contradiction flagged and stored
    Tool: Bash (bun + SQLite)
    Preconditions: Two conflicting wiki pages exist
    Steps:
      1. Run wiki lint contradiction detection
      2. `bun -e "const db=require('./src/lib/db').getDb(); const r=db.prepare('SELECT * FROM contradiction_flags LIMIT 5').all(); console.log(JSON.stringify(r))"`
    Expected Result: Contradiction flags present in DB
    Evidence: .omo/evidence/task-23-contradictions-flagged.json
  ```

- [x] 24. Unify provenance tracking (pick ONE system)

  **What to do**:
  - Three parallel wiki provenance systems currently:
    1. SQLite `wiki_versions` table (via `wiki/history.ts`) — version numbers, file snapshots
    2. JSON revision files in `.revisions/{slug}/` (via `wiki/revisions.ts`)
    3. Append-only operation log `wiki-log.json` (via `wiki/logger.ts`)
  - Pick ONE to keep as canonical:
    - Recommended: **SQLite `wiki_versions` table** — most queryable, easiest to maintain, consistent with rest of app
  - Add deprecation notices to the other two systems' file headers
  - Update consumers that read provenance to use the canonical path
  - Migration: ensure all three are still functional during deprecation period (no breaking changes)

  **Must NOT do**:
  - Don't delete the deprecated files until a future cleanup phase
  - Don't migrate historical data from deprecated systems (read-only deprecation)

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Tech debt consolidation — picking winners, adding deprecation notices

  **Parallelization**: Wave 4 — can run parallel with Tasks 21-23

  **References**:
  - `src/lib/wiki/history.ts` — SQLite wiki_versions
  - `src/lib/wiki/revisions.ts` — JSON .revisions files
  - `src/lib/wiki/logger.ts` — append-only log
  - `scripts/init-db.ts:279-287` — wiki_versions DDL

  **Acceptance Criteria**:
  - [ ] One provenance system designated canonical in code comments
  - [ ] Deprecated files marked with deprecation notices
  - [ ] All existing consumers still work
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Provenance still writeable via canonical system
    Tool: Bash (bun + SQLite)
    Preconditions: Dev server running
    Steps:
      1. Create or edit a wiki page
      2. `bun -e "const db=require('./src/lib/db').getDb(); const r=db.prepare('SELECT COUNT(*) as c FROM wiki_versions').get(); console.log('Wiki versions count:', r.c)"`
    Expected Result: wiki_versions count increased
    Evidence: .omo/evidence/task-24-provenance-works.txt
  ```

- [x] 25. Add entity resolution to generation pipeline

  **What to do**:
  - Wire the entity resolver (Task 22) into `getWikiContext()`:
    - After keyword-scoring wiki entries, run entity resolution on entity mentions from current session's memories
    - Boost relevance score for wiki pages that match entity mentions the LLM has been using
    - Scoring: entity_match_boost = 0.2 if page matches a frequently-mentioned entity
    - Keep this lightweight — just a scoring pass, not a separate retrieval step
  - Also wire into `prompt-builder.ts` as a note: `The following entities have appeared in the narrative: entity1, entity2...`  
  - This helps the LLM maintain narrative continuity by surfacing which wiki entities are "active"

  **Must NOT do**:
  - Don't make entity resolution a blocking step in generation
  - Don't inject full entity mention list into prompt (too noisy)

  **Recommended Agent Profile**: `deep`
  - Reason: Integration across entity resolution + wiki retrieval + prompt assembly

  **Parallelization**: Wave 4 — after Tasks 21-22 (entity resolution exists)

  **References**:
  - `src/lib/retrieval.ts:165-233` — getWikiContext() scoring pass
  - `src/lib/prompt-builder.ts:55-115` — assemblePrompt() section to extend
  - Task 22 — resolveEntityToWikiPage() function

  **Acceptance Criteria**:
  - [ ] Entity resolution boosts wiki relevance scores in retrieval
  - [ ] Prompt includes mention of active entities
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Entity resolution boosts wiki page relevance
    Tool: Bash (bun)
    Preconditions: Wiki pages exist, entity mentions exist for current session
    Steps:
      1. Call getWikiContext() with scene context that includes entity mentions
      2. Check returned entries for boosted scores
    Expected Result: Wiki pages matching entity mentions have higher relevance scores
    Evidence: .omo/evidence/task-25-entity-boost.json
  ```

  **Enhanced QA Coverage** (beyond per-task scenarios):
  ```
  Scenario [Null/Empty]: No entities to resolve — graceful pass-through
    Tool: Bash (curl + bun)
    Preconditions: Session with no entity mentions extracted
    Steps:
      1. Run generation pipeline with empty entity_mentions table
      2. Check that retrieval still returns wiki context (unboosted)
      3. Verify no crash or empty cache
    Expected Result: No-entity case is a no-op. Wiki retrieval works normally without boost. No errors.
    Evidence: .omo/evidence/phase-3-no-entities.txt

  Scenario [Boundary]: Single entity mentioned repeatedly
    Tool: Bash (bun)
    Preconditions: One entity "Marcus Blackwood" mentioned 50 times across messages
    Steps:
      1. Run entity extraction
      2. Check entity_mentions count
      3. Verify entity resolution links to correct wiki page
    Expected Result: Entity resolved once, linked to correct page. Mention count = 50. No duplicate entity rows created.
    Evidence: .omo/evidence/phase-3-single-entity.txt

  Scenario [Data Integrity]: Provenance backfill preserves existing data
    Tool: Bash (SQLite)
    Preconditions: Wiki pages with existing revision data in the deprecated system
    Steps:
      1. Run provenance unification migration
      2. Compare old revision data with new unified format
      3. Verify no data loss: all old revisions present in new system
    Expected Result: All historical revisions survive the migration. Count matches between old and new stores.
    Evidence: .omo/evidence/phase-3-provenance-migration.txt

  Scenario [Regression]: Wiki pages without any provenance data still render
    Tool: Bash (curl)
    Preconditions: Wiki page with no revision history (manually created)
    Steps:
      1. Fetch wiki page via API
      2. Verify page content renders
      3. Check provenance section — should show "no revision history" or omit
    Expected Result: Page renders. No crash from missing provenance. Graceful degradation.
    Evidence: .omo/evidence/phase-3-no-provenance.txt

  Scenario [Edge Case]: Contradiction detected and dismissed correctly
    Tool: Bash (bun + SQLite)
    Preconditions: Wiki page with intentional contradiction (two paragraphs saying opposite things)
    Steps:
      1. Run contradiction detection
      2. Verify contradiction flagged with source references
      3. Execute "dismiss" action via entity resolution API
      4. Verify flag status changes to "dismissed"
    Expected Result: Full contradiction lifecycle works: detect → flag → dismiss. Dismissed contradictions are not re-detected on next lint run.
    Evidence: .omo/evidence/phase-3-contradiction-lifecycle.txt
  ```

### WAVE 5 — PHASE 4: Relationship Evolution

> **TL;DR**: The relationship_evolution table exists in TypeScript types but was never materialized in the DB schema. Additionally, relationships need "narrative anchors" — irreversible moments (betrayals, confessions, sacrifices) that resist decay. This phase creates the table, backfills any existing data, adds anchors, and wires evolution context into the prompt so the LLM understands relationship history.
>
> **Must NOT do**: No changes to relationship-decay.ts or relationship-analysis.ts unless directly related to evolution table.

- [x] 26. Materialize relationship_evolution table + backfill data

  **What to do**:
  - Add CREATE TABLE IF NOT EXISTS for `relationship_evolution` to `scripts/init-db.ts`:
    ```sql
    CREATE TABLE IF NOT EXISTS relationship_evolution (
      id TEXT PRIMARY KEY,
      relationship_id TEXT NOT NULL REFERENCES relationships(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      emotional_state TEXT,
      relationship_stage TEXT,
      trigger_event TEXT,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    ```
  - Add migration in `schema-migrations.ts` for existing databases (table was never created)
  - Backfill: iterate existing `relationships` rows, for each one create an initial evolution entry with current emotional_state and stage, trigger_event='initial_backfill'
  - Wire `recordEvolution()` calls into:
    - `handleAnalyzeRelationships()` in job-processor.ts (after each analysis)
    - `processRelationshipDecay()` in relationship-decay.ts (after each decay pass)
  - This captures the full history of relationship changes

  **Must NOT do**:
  - Don't change the existing relationship-analysis flow — just ADD evolution recording
  - Don't remove shared_history from relationships table (different purpose)

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Table creation + backfill + wire into existing handlers

  **Parallelization**: Wave 5 — depends on Wave 1 (clean tables) + Wave 4 (entity resolution helps anchor identification)

  **References**:
  - `src/lib/relationship-types.ts:63-84` — RelationshipEvolutionEntry/Row types
  - `src/lib/job-processor.ts:481-500` — handleAnalyzeRelationships() 
  - `src/lib/relationship-decay.ts:281-369` — applyDecayToAllRelationships()
  - `scripts/init-db.ts` — table creation pattern
  - `src/lib/schema-migrations.ts` — migration pattern

  **Acceptance Criteria**:
  - [ ] relationship_evolution table created in both init-db.ts and migration
  - [ ] Initial backfill populates evolution history for existing relationships
  - [ ] Every analysis and decay event records an evolution entry
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Evolution table exists and populated
    Tool: Bash (SQLite)
    Preconditions: Dev server running, existing relationships
    Steps:
      1. Run migration
      2. `bun -e "const db=require('./src/lib/db').getDb(); const r=db.prepare('SELECT COUNT(*) as c FROM relationship_evolution').get(); console.log('Evolution entries:', r.c); const sample=db.prepare('SELECT * FROM relationship_evolution LIMIT 3').all(); console.log(JSON.stringify(sample))"`
    Expected Result: Evolution table exists with entries (backfilled + new)
    Evidence: .omo/evidence/task-26-evolution-table.json

  Scenario: Analysis triggers evolution recording
    Tool: Bash (curl + SQLite)
    Steps:
      1. Trigger a generation that will run analyze_relationships
      2. Check evolution table for new entries after job completes
    Expected Result: New evolution entries with trigger_event from analysis
    Evidence: .omo/evidence/task-26-evolution-recording.txt
  ```

- [x] 27. Add narrative event anchors to relationships schema

  **What to do**:
  - Add a new table or extend `relationship_evolution` with a `is_anchor` boolean flag
  - `narrative_anchors`: `{ id, relationship_id, anchor_type (betrayal|confession|sacrifice|trauma|bonding|promise), description, emotional_impact, irreversible BOOLEAN DEFAULT TRUE, created_at }`
  - When the LLM analysis detects a significant narrative moment, record it as an anchor
  - Anchors resist decay: decayRecency() should skip or reduce decay for anchored relationships
  - Add `anchor_references` to the prompt context: `[NARRATIVE ANCHORS] {description} [{type}]`
  - Update `applyEmotionDecay()` to check for active anchors and reduce decay rate

  **Must NOT do**:
  - Don't make all analysis events anchors — only significant moments
  - Don't auto-detect anchors (analysis job must explicitly flag)

  **Recommended Agent Profile**: `deep`
  - Reason: New schema + decay modification + prompt integration

  **Parallelization**: Wave 5 — after Task 26 (evolution exists)

  **References**:
  - `src/lib/relationship-decay.ts:48-56` — applyEmotionDecay() — modify for anchors
  - `src/lib/job-processor.ts:481-500` — handleAnalyzeRelationships() — anchor detection
  - `src/lib/relationship-types.ts` — new types
  - `src/lib/prompt-builder.ts` — new prompt section

  **Acceptance Criteria**:
  - [ ] narrative_anchors table created
  - [ ] Anchors detected and stored during relationship analysis
  - [ ] Anchored relationships decay slower (or not at all)
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Narrative anchors stored and resist decay
    Tool: Bash (bun + SQLite)
    Preconditions: A relationship with an anchor exists
    Steps:
      1. Record an anchor for a relationship
      2. Apply decay
      3. Check if emotional_state for anchored relationship decayed less than un-anchored
    Expected Result: Anchored relationships decay less or not at all
    Evidence: .omo/evidence/task-27-anchors-work.json
  ```

- [x] 28. Wire relationship evolution into retrieval pipeline

  **What to do**:
  - Add `getRelationshipEvolution(userId, universeId, limit)` function in `retrieval.ts`
  - Query relationship_evolution for the most recent N entries per relationship, ordered by recorded_at DESC
  - Include: emotional_state changes, stage changes, trigger_event
  - Add to RetrievedContext as `relationshipEvolution` field
  - In `prompt-builder.ts`, add `[RELATIONSHIP HISTORY]` section after `[RELATIONSHIPS]`:
    - Show last 3 evolution events per relationship
    - Format: `{source} → {target}: {event} ({emotional_state})`
  - Respect token budget — truncate oldest events first

  **Must NOT do**:
  - Don't include all evolution events — only last N per relationship
  - Don't replace the existing [RELATIONSHIPS] section — add new section

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Standard retrieval integration following Phase 1 patterns

  **Parallelization**: Wave 5 — after Task 26 (evolution table exists)

  **References**:
  - `src/lib/retrieval.ts:238-259` — getRelationshipContext() pattern to follow
  - `src/lib/prompt-builder.ts:55-115` — assemblePrompt() section order
  - Task 7-10 — Phase 1 integration patterns

  **Acceptance Criteria**:
  - [ ] Relationship evolution data retrievable
  - [ ] Evolution section in prompt when data available
  - [ ] Respects token budget (truncates oldest)
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Relationship evolution in prompt
    Tool: Bash (curl + SQLite)
    Preconditions: Relationship has evolution history
    Steps:
      1. Trigger generation
      2. Check prompt for [RELATIONSHIP HISTORY] section
    Expected Result: Evolution events shown in prompt
    Evidence: .omo/evidence/task-28-evolution-in-prompt.txt
  ```

- [x] 29. Deepen relationship context in prompt (history + anchors)

  **What to do**:
  - Enhance the `[RELATIONSHIPS]` section to include richer data:
    - Current: `{source} → {target}: {state}`
    - New: `{source} → {target}: {stage}, emotional_state ({emotion1}: {val1}, {emotion2}: {val2})`
    - If relationship has narrative anchors, append: `⚓ {anchor_type}: {description}`
  - Include shared_history highlights: last 2 major events per relationship
  - Add decay indicator if relationship is decaying: "(decaying — last interacted N days ago)"
  - This gives the LLM much more nuanced relationship awareness

  **Must NOT do**:
  - Don't make the relationship section too verbose (token budget awareness)
  - Don't repeat information that's already in [RELATIONSHIP HISTORY]

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Richer prompt rendering + shared_history access

  **Parallelization**: Wave 5 — after Tasks 27-28 (anchors + evolution)

  **References**:
  - `src/lib/prompt-builder.ts:96-103` — current relationship rendering
  - `src/lib/relationship-types.ts` — SharedHistoryEntry type
  - `src/lib/relationship-decay.ts:48-56` — decay status

  **Acceptance Criteria**:
  - [ ] Relationship section shows: stage, per-emotion values, anchors, shared history highlights
  - [ ] Decay indicator present when relationship hasn't been interacted with recently
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Richer relationship context in prompt
    Tool: Bash (curl)
    Preconditions: Relationships with emotional_state vectors, anchors, shared_history
    Steps:
      1. Trigger generation
      2. Capture [RELATIONSHIPS] section
    Expected Result: Section includes emotional state values, anchors, and shared history highlights
    Evidence: .omo/evidence/task-29-rich-relationships.txt
  ```

  **Enhanced QA Coverage** (beyond per-task scenarios):
  ```
  Scenario [Null/Empty]: No relationship data — graceful handling
    Tool: Bash (curl)
    Preconditions: Fresh session with no relationship analysis run yet
    Steps:
      1. Trigger generation
      2. Check [RELATIONSHIPS] section in prompt
    Expected Result: Section is OMITTED (not empty). No "undefined" or crash.
    Evidence: .omo/evidence/phase-4-no-relationships.txt

  Scenario [Data Integrity]: Backfill preserves existing relationship data exactly
    Tool: Bash (SQLite)
    Preconditions: Pre-existing relationships in the old format
    Steps:
      1. Count relationships before migration
      2. Run relationship_evolution backfill
      3. Count after backfill
      4. Compare 3 relationships field-by-field (emotional_state, intimacy, trust)
    Expected Result: All old relationships migrated. Field values match 1:1. No data loss or truncation.
    Evidence: .omo/evidence/phase-4-backfill-integrity.txt

  Scenario [Boundary]: Single relationship with many evolution entries
    Tool: Bash (SQLite)
    Preconditions: One relationship with 100+ evolution entries across 50 sessions
    Steps:
      1. Query evolution entries for that relationship
      2. Verify all entries present and ordered by created_at
      3. Check prompt [RELATIONSHIPS] section includes evolution summary
    Expected Result: All 100+ entries preserved. Prompt summarizes (doesn't dump all 100). No truncation of the evolution history in DB.
    Evidence: .omo/evidence/phase-4-many-evolution-entries.txt

  Scenario [Edge Case]: Narrative anchor with missing event_type
    Tool: Bash (SQLite)
    Preconditions: Anchor row created without event_type (NULL)
    Steps:
      1. Query anchors for that relationship
      2. Check prompt rendering of anchor
    Expected Result: NULL event_type renders as fallback text (e.g. "unknown event"). No crash. Anchor still appears.
    Evidence: .omo/evidence/phase-4-null-anchor.txt
  ```

### WAVE 6 — PHASE 5: Narrative State Engine

> **TL;DR**: The system has no unified tracking of narrative tension, pacing, active goals, thematic direction, or decision points. Scene state tracks location and tone but not the narrative momentum. This phase adds minimal structured fields (tension curve, narrative phase, goals, active conflicts, decision points) and wires them into retrieval, giving the LLM awareness of story-level state beyond the current scene.
>
> **Must NOT do**: No over-engineering. The goal is MINIMAL structured state — enough for the LLM to understand narrative context, not a full game-state engine.

- [x] 30. Add tension/pacing/narrative_phase to sessions table

  **What to do**:
  - Add columns to `sessions` table (in init-db.ts + migration):
    - `narrative_tension REAL DEFAULT 0.5` — 0.0 (no tension) to 1.0 (maximum)
    - `pacing REAL DEFAULT 0.5` — 0.0 (slow/downtime) to 1.0 (rapid/action)
    - `narrative_phase TEXT DEFAULT 'setup'` — one of: `setup|rising_action|climax|falling_action|resolution|downtime`
    - `active_goals TEXT` — JSON array: `[{description, priority, status}]`
    - `active_conflicts TEXT` — JSON array: `[{description, parties, status}]`
  - Default values for new sessions (setup_tension=0.3, pacing=0.3, phase='setup')
  - These fields are updated by the scene extraction job (Task 32)

  **Must NOT do**:
  - Don't create a separate narrative_state table — add to existing sessions
  - Don't add more than these 5 fields (scope control)

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Schema migration + session table extension

  **Parallelization**: Wave 6 — depends on Wave 1 (clean schemas)

  **References**:
  - `scripts/init-db.ts` — sessions table DDL
  - `src/lib/schema-migrations.ts` — ALTER TABLE migration pattern
  - `src/app/api/generate/[id]/route.ts` — session access

  **Acceptance Criteria**:
  - [ ] New columns exist in sessions table
  - [ ] Default values set for new sessions
  - [ ] Migration runs without errors
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Sessions table has narrative state columns
    Tool: Bash (SQLite)
    Preconditions: Dev server running
    Steps:
      1. `bun -e "const db=require('./src/lib/db').getDb(); const r=db.prepare(\"PRAGMA table_info(sessions)\").all(); console.log(JSON.stringify(r.map(c=>c.name)))"`
    Expected Result: Columns include narrative_tension, pacing, narrative_phase, active_goals, active_conflicts
    Evidence: .omo/evidence/task-30-schema-columns.json

  Scenario: Default values set
    Tool: Bash (SQLite)
    Steps:
      1. Create a new session
      2. Check narrative_tension default
    Expected Result: narrative_tension = 0.3 (or configured default)
    Evidence: .omo/evidence/task-30-defaults.txt
  ```

- [x] 31. Add goals/conflicts to scene_states

  **What to do**:
  - Add columns to `scene_states` table:
    - `scene_type TEXT` — one of: `combat|exploration|dialogue|investigation|travel|downtime|ritual` (the missing scene-level type concept)
    - `scene_tension REAL DEFAULT 0.5` — current scene tension level
    - `scene_goal TEXT` — already exists as current_goal, alias/rename
    - `conflict_type TEXT` — `none|direct|indirect|internal|environmental`
    - `stakes TEXT` — what the characters stand to lose/gain
  - Keep existing columns (emotional_tone, location, etc.) — additive only
  - Update SceneContext type in retrieval.ts

  **Must NOT do**:
  - Don't remove existing scene_states columns
  - Don't make scene_type required (null if not classified)

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Schema migration + type update

  **Parallelization**: Wave 6 — after Task 30

  **References**:
  - `scripts/init-db.ts:111-121` — scene_states DDL
  - `src/lib/retrieval.ts:17-23` — SceneContext type
  - `src/lib/scene-extraction.ts` — LLM extraction prompt (modify in Task 32)

  **Acceptance Criteria**:
  - [ ] New scene_states columns exist
  - [ ] SceneContext type updated
  - [ ] Migration runs without errors
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Scene_states has rich narrative columns
    Tool: Bash (SQLite)
    Steps:
      1. `bun -e "const db=require('./src/lib/db').getDb(); const r=db.prepare(\"PRAGMA table_info(scene_states)\").all(); console.log(JSON.stringify(r.map(c=>c.name)))"`
    Expected Result: Columns include scene_type, scene_tension, conflict_type, stakes
    Evidence: .omo/evidence/task-31-scene-fields.json
  ```

- [x] 32. Extract narrative state fields during scene_extraction job

  **What to do**:
  - Modify the scene extraction LLM prompt in `src/lib/scene-extraction.ts` to output new fields:
    - `scene_type` (combat|exploration|dialogue|investigation|travel|downtime|ritual)
    - `scene_tension` (0.0 to 1.0)
    - `conflict_type` (none|direct|indirect|internal|environmental)
    - `stakes` (free text, what's at risk)
    - `narrative_tension` (overall session tension, 0-1)
    - `pacing` (overall session pacing, 0-1)
    - `narrative_phase` (setup|rising_action|climax|falling_action|resolution|downtime)
    - `active_goals` ([{goal, progress}])
    - `active_conflicts` ([{conflict, parties}])
  - Update `handleSceneStateExtract()` to write both scene_states fields AND session-level narrative state fields  
  - Keep temperature low (0.3) for consistent JSON extraction
  - Use the last 10-15 messages for analysis (increase from 10 for richer context)

  **Must NOT do**:
  - Don't break the existing scene extraction format — add fields, don't change existing ones
  - Don't make the LLM prompt too long (stay within reasonable context)

  **Recommended Agent Profile**: `deep`
  - Reason: LLM prompt modification affecting scene extraction job

  **Parallelization**: Wave 6 — after Tasks 30-31 (schema exists)

  **References**:
  - `src/lib/scene-extraction.ts` — current LLM extraction prompt
  - `src/lib/jobs/scene-handler.ts` — job handler
  - `src/app/api/generate/[id]/route.ts` — where scene state is used
  - `src/lib/prompts.ts` — centralized prompt templates

  **Acceptance Criteria**:
  - [ ] Scene extraction outputs new fields
  - [ ] Narrative state written to sessions table
  - [ ] Scene state written to scene_states table
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Scene extraction outputs narrative state
    Tool: Bash (SQLite)
    Preconditions: Dev server running, session with messages
    Steps:
      1. Trigger generation (queues scene_state_extract)
      2. Wait 5 seconds for job to process
      3. `bun -e "const db=require('./src/lib/db').getDb(); const s=db.prepare('SELECT scene_type, scene_tension, conflict_type, stakes FROM scene_states WHERE session_id=? LIMIT 1').get('{id}'); console.log(JSON.stringify(s)); const sess=db.prepare('SELECT narrative_tension, pacing, narrative_phase, active_goals, active_conflicts FROM sessions WHERE id=?').get('{id}'); console.log(JSON.stringify(sess))"`
    Expected Result: New fields populated with extracted values
    Evidence: .omo/evidence/task-32-narrative-state-extracted.json
  ```

- [x] 33. Wire narrative state into retrieval → prompt

  **What to do**:
  - Update `getSceneContext()` in retrieval.ts to return new fields (scene_type, scene_tension, conflict_type, stakes)
  - Update `getRetrievedContext()` to also fetch session-level narrative state from sessions table
  - Add to RetrievedContext: `narrativeState: { tension, pacing, narrativePhase, activeGoals, activeConflicts }`
  - In `prompt-builder.ts`, enhance `[CURRENT SCENE]` section:
    - Current: `Location: X, Goal: Y, Tone: Z, Present: NPCs`
    - New: `Location: X, Scene Type: combat, Tension: 0.7, Conflict: direct (guard confrontation), Stakes: passing through the gate`
    - Add session-level state: `Narrative Phase: rising_action, Overall Tension: 0.6, Pacing: 0.8`
  - Budget-aware: truncate stakes and active_goals if token budget is tight

  **Must NOT do**:
  - Don't create a separate [NARRATIVE STATE] section — fold into existing [CURRENT SCENE]
  - Don't make the scene section too verbose

  **Recommended Agent Profile**: `deep`
  - Reason: Integration across scene state, session state, and prompt rendering

  **Parallelization**: Wave 6 — after Tasks 30-32 (schema + extraction exist)

  **References**:
  - `src/lib/retrieval.ts:75-100` — getSceneContext()
  - `src/lib/retrieval.ts:347-378` — getRetrievedContext()
  - `src/lib/prompt-builder.ts:73-82` — current scene rendering

  **Acceptance Criteria**:
  - [ ] Scene context returns new fields (scene_type, tension, conflict_type, stakes)
  - [ ] Session-wide narrative state fetchable and in context
  - [ ] Enhanced scene section in prompt
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Enhanced scene context in prompt
    Tool: Bash (curl)
    Preconditions: Session with extracted narrative state
    Steps:
      1. Trigger generation
      2. Capture [CURRENT SCENE] section
    Expected Result: Section includes scene_type, tension, conflict, stakes, and session-level state
    Evidence: .omo/evidence/task-33-enhanced-scene.txt
  ```

- [x] 34. Add decision points tracking

  **What to do**:
  - Add `decision_points` table: `{ id, session_id, user_id, prompt (the choice presented), choices_made (JSON array of player choices), narrative_context, created_at }`
  - During scene extraction or thread analysis, identify decision points — moments where the player made a meaningful choice
  - Record: what the choice was, what options existed, what the player chose
  - In `prompt-builder.ts`, add a minimal `[DECISION POINTS]` section showing recent unresolved or significant decisions:
    - `• {choice} — led to {outcome}`
    - Limit to 3 most recent decisions
    - Only include decisions that are still narratively relevant (not every small choice)
  - This gives the LLM awareness of branching narrative consequences

  **Must NOT do**:
  - Don't track every message as a decision point — only meaningful narrative choices
  - Don't auto-detect decision points with complex LLM analysis (start simple)

  **Recommended Agent Profile**: `deep`
  - Reason: New table + detection + prompt integration

  **Parallelization**: Wave 6 — after Tasks 31-33 (narrative state pipeline exists)

  **References**:
  - `src/lib/scene-extraction.ts` — add decision point detection to extraction
  - `src/lib/job-processor.ts:744-803` — handleThreadAnalysis() — thread analysis context
  - `src/lib/prompt-builder.ts` — new [DECISION POINTS] section
  - `scripts/init-db.ts` — new table

  **Acceptance Criteria**:
  - [ ] decision_points table created
  - [ ] Decision points populated during scene extraction or thread analysis
  - [ ] Recent decisions injected into prompt
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Decision points tracked and in prompt
    Tool: Bash (SQLite + curl)
    Preconditions: Session with narrative decisions
    Steps:
      1. Trigger generation after decision was made
      2. Check prompt for [DECISION POINTS] section
      3. `bun -e "const db=require('./src/lib/db').getDb(); const r=db.prepare('SELECT prompt, choices_made FROM decision_points WHERE session_id=? ORDER BY created_at DESC LIMIT 3').all('{id}'); console.log(JSON.stringify(r))"`
    Expected Result: Decision points present in DB and in prompt
    Evidence: .omo/evidence/task-34-decision-points.json
  ```

  **Enhanced QA Coverage** (beyond per-task scenarios):
  ```
  Scenario [Null/Empty]: No narrative state — graceful defaults
    Tool: Bash (bun)
    Preconditions: Fresh session with no scene extraction run yet
    Steps:
      1. Query scene_states for the session
      2. Check narrative state fields (tension, pacing, phase)
      3. Trigger generation — check prompt
    Expected Result: Session without narrative state uses sensible defaults (tension: 0.5, phase: "setup"). No crash, no undefined in prompt.
    Evidence: .omo/evidence/phase-5-no-state.txt

  Scenario [Data Integrity]: State transitions are immutable (no overwrites)
    Tool: Bash (SQLite)
    Preconditions: Session with 10 scene state changes across 10 messages
    Steps:
      1. Query state_history table (all entries ordered by created_at)
      2. Verify each entry has unique timestamp
      3. Verify no entries have identical values (no duplicate transitions)
    Expected Result: Every state change creates a new history entry. No entries overwrite previous. History preserves full arc.
    Evidence: .omo/evidence/phase-5-state-immutability.txt

  Scenario [Boundary]: Very rapid state changes (10 messages in 5 seconds)
    Tool: Bash (curl + SQLite)
    Preconditions: Pre-seeded rapid-fire message sequence
    Steps:
      1. Send 10 messages rapidly (via API, not UI)
      2. Wait for all scene extraction jobs to complete
      3. Query state_history — count entries
      4. Check prompt for most recent state
    Expected Result: All 10 state changes captured. Prompt uses LATEST state (not earliest, not merged). No state loss from rapid changes.
    Evidence: .omo/evidence/phase-5-rapid-state.txt

  Scenario [Edge Case]: Narrative phase transition arc (setup→rising→climax→falling→resolution)
    Tool: Bash (SQLite + curl)
    Preconditions: Long session approximating a story arc
    Steps:
      1. Query narrative_phase values in chronological order
      2. Verify phase transitions follow expected sequence
      3. Check prompt doesn't hard-code phase-based behavior
    Expected Result: Phase values change naturally. Prompt uses phases descriptively, not prescriptively. No "if phase=climax then..." logic in generation.
    Evidence: .omo/evidence/phase-5-phase-transitions.txt

  Scenario [Recovery]: Decision points survive server restart
    Tool: Bash (curl + SQLite)
    Preconditions: Session with 3 decision points logged
    Steps:
      1. Capture pre-restart decision_points count
      2. Restart server
      3. Query decision_points again
      4. Trigger generation — check [DECISION POINTS] in prompt
    Expected Result: Decision points persist across restart. Count matches. Prompt still includes them.
    Evidence: .omo/evidence/phase-5-decision-points-persistence.txt
  ```

### WAVE 7 — PHASE 6: UI Layer

> **TL;DR**: 5 front-end surfaces that make the infrastructure changes visible and debuggable. Each surface corresponds to a Phase 1-5 deliverable — retrieval inspector shows what's being fetched, job admin shows queue state, entity browser shows resolution results, relationship timeline shows evolution history, narrative debug shows scene/narrative state. All are additive (no existing UI changed) and hidden behind dev-mode controls or dedicated routes.
>
> **Must NOT do in this wave**: Don't modify any back-end logic (retrieval, jobs, entity resolution, relationships, narrative state). These are read-only visual layers. Don't add authentication/access controls beyond what the session page already has. Don't create new API endpoints — use the ones built in Phases 1-5 or existing debug routes.

- [x] 35. Build Retrieval Inspector (session page debug overlay)

  **What to do**:
  - Create a collapsible debug panel component (`src/components/debug/retrieval-inspector.tsx`)
  - Show what context was retrieved for the most recent message: memories, wiki entries, relationships, threads, summaries — with importance scores
  - Show budget allocation breakdown (which sections consumed how many tokens)
  - Show what was omitted due to budget limits (and why)
  - Add a keyboard shortcut to toggle the panel (e.g. Ctrl+Shift+R)
  - Style as a fixed-position overlay, minimal but readable

  **Must NOT do**:
  - Don't modify the retrieval pipeline (Phase 1 delivers enriched retrieval)
  - Don't add to the default user view — debug-only

  **Recommended Agent Profile**: `visual-engineering`
  - Reason: Front-end React component with data fetching and overlay styling

  **Parallelization**: Wave 7 — can run in parallel with Tasks 36-39

  **References**:
  - `src/lib/retrieval.ts:37-44` — RetrievedContext type (what data to display)
  - `src/lib/prompt-builder.ts:158-218` — applyContextBudget() (budget allocation)
  - `src/hooks/use-session.ts` — how the session page fetches data
  - `src/app/(app)/session/[id]/page.tsx` — the session page layout

  **Acceptance Criteria**:
  - [ ] Panel toggles with keyboard shortcut
  - [ ] Shows all retrieved sections with scores and budget consumption
  - [ ] Shows omitted sections with reason
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Retrieval inspector shows context data
    Tool: Playwright
    Preconditions: Browser open on session page with existing messages
    Steps:
      1. Press Ctrl+Shift+R to open inspector
      2. Verify debug panel is visible with sections listed
      3. Send a new message
      4. Verify inspector updates with new retrieval data
    Expected Result: Debug panel shows memory/wiki/relationship sections with scores
    Evidence: .omo/evidence/task-35-retrieval-inspector.png

  Scenario: Budget omission visible
    Tool: Playwright
    Preconditions: Session with enough data to exceed token budget
    Steps:
      1. Open retrieval inspector
      2. Check for "omitted" or "truncated" section indicators
    Expected Result: Sections omitted due to budget are clearly marked
    Evidence: .omo/evidence/task-35-budget-omission.png
  ```

- [x] 36. Build Job Queue Admin Panel

  **What to do**:
  - Create a dedicated admin page at `/admin/jobs` (under appropriate route group)
  - Show a table of jobs: status, type, created_at, attempts, last_error
  - Filters: by status (pending/running/failed), by type, by date range
  - Actions: retry failed jobs, cancel pending/running jobs
  - Auto-refresh every 10 seconds
  - Show job count summary (X pending, Y running, Z failed, W completed today)

  **Must NOT do**:
  - Don't modify the job queue or processor logic (Phase 2 handles that)
  - Don't add job creation UI (admin panel is read-only + retry/cancel only)

  **Recommended Agent Profile**: `visual-engineering`
  - Reason: Admin dashboard component with table, filters, and polling

  **Parallelization**: Wave 7 — can run in parallel with Tasks 35, 37-39

  **References**:
  - `src/lib/job-processor.ts:75-87` — QueuedJob type (fields to display)
  - Existing admin patterns in the codebase (if any)
  - `src/app/api/sessions/[id]/messages/route.ts:161-175` — job queueing pattern

  **Acceptance Criteria**:
  - [ ] `/admin/jobs` renders a table of jobs with status/type/timing
  - [ ] Filters work (by status, by type)
  - [ ] Retry/cancel actions work via API calls
  - [ ] Auto-refresh updates the table
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Job admin panel renders and filters
    Tool: Playwright
    Preconditions: DB has some job queue entries
    Steps:
      1. Navigate to /admin/jobs
      2. Verify table shows jobs with status, type, created_at columns
      3. Click "failed" filter
      4. Verify only failed jobs shown
    Expected Result: Job table renders, filters correctly
    Evidence: .omo/evidence/task-36-job-admin.png

  Scenario: Retry action works
    Tool: Playwright
    Preconditions: At least one failed job exists
    Steps:
      1. Navigate to /admin/jobs
      2. Click "Retry" on a failed job
      3. Verify job status changes to "pending"
    Expected Result: Failed job is requeued
    Evidence: .omo/evidence/task-36-job-retry.png
  ```

- [x] 37. Build Entity Browser + Contradiction Review UI

  **What to do**:
  - Create entity browser page at `/admin/entities`: list resolved entities with their names, aliases, linked wiki pages, mention count
  - Click entity → detail view showing: all aliases/titles, wiki pages linked, source sessions
  - Create contradiction review page at `/admin/contradictions`: list flagged contradictions with status (open/resolved/dismissed)
  - Contradiction detail: what contradicts what, source evidence, auto-resolve vs manual dismiss buttons
  - Link entities to their wiki pages for easy navigation

  **Must NOT do**:
  - Don't modify entity resolution or contradiction detection logic (Phase 3 handles that)
  - Don't auto-resolve contradictions (keep as review workflow)

  **Recommended Agent Profile**: `visual-engineering`
  - Reason: Data browsing UI with detail views and action workflows

  **Parallelization**: Wave 7 — can run in parallel with Tasks 35-36, 38-39

  **References**:
  - `src/lib/backlinks.ts` — existing backlink patterns for entity→wiki linking
  - `src/lib/wiki/lint.ts:183-285` — contradiction detection output shape
  - `src/components/wiki/` — existing wiki UI component patterns
  - `src/lib/relationship-types.ts` — entity type definitions

  **Acceptance Criteria**:
  - [ ] `/admin/entities` lists resolved entities with aliases and linked pages
  - [ ] Entity detail view shows source sessions and linked wiki pages
  - [ ] `/admin/contradictions` lists contradictions with status
  - [ ] Contradictions can be dismissed/resolved from UI
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Entity browser lists resolved entities
    Tool: Playwright
    Preconditions: Some entity mentions have been resolved
    Steps:
      1. Navigate to /admin/entities
      2. Verify entity names and linked wiki pages are displayed
      3. Click an entity name → verify detail view opens
    Expected Result: Entity list and detail render correctly
    Evidence: .omo/evidence/task-37-entity-browser.png

  Scenario: Contradiction review workflow
    Tool: Playwright
    Preconditions: At least one contradiction exists
    Steps:
      1. Navigate to /admin/contradictions
      2. Verify contradiction is listed with source evidence
      3. Click "Dismiss" button
      4. Verify status changes to "dismissed"
    Expected Result: Contradiction status updated via UI
    Evidence: .omo/evidence/task-37-contradiction-review.png
  ```

- [x] 38. Build Relationship Timeline UI

  **What to do**:
  - Create a relationship timeline component for the session page or a dedicated `/session/[id]/relationships` view
  - Show relationship evolution over time: emotional state changes, anchors (betrayals, confessions, etc.)
  - Visual timeline: chronological list or simple graph showing state transitions
  - Each timeline event shows: what changed, which session/message triggered it, old vs new values
  - Integrate with existing relationship panel if one exists, or create standalone

  **Must NOT do**:
  - Don't modify relationship evolution logic (Phase 4 handles that)
  - Don't add relationship creation/editing UI (read-only timeline)

  **Recommended Agent Profile**: `visual-engineering`
  - Reason: Timeline visualization component with data fetching

  **Parallelization**: Wave 7 — can run in parallel with Tasks 35-37, 39

  **References**:
  - `src/lib/relationship-types.ts:63-84` — RelationshipEvolution types
  - `src/components/relationships/` or `src/components/relationship/` — existing relationship UI patterns
  - `src/app/(app)/session/[id]/page.tsx` — where to integrate

  **Acceptance Criteria**:
  - [ ] Timeline renders relationship state changes in chronological order
  - [ ] Each change shows previous and new values
  - [ ] Narrative anchors are visually distinct (e.g. different color/icon)
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Relationship timeline shows evolution
    Tool: Playwright
    Preconditions: Session with multiple relationship state changes
    Steps:
      1. Navigate to session page with relationship timeline
      2. Verify timeline shows chronological state changes
      3. Verify emotional state transitions are labeled (e.g. "friendly → hostile")
    Expected Result: Timeline renders correctly with state transitions
    Evidence: .omo/evidence/task-38-relationship-timeline.png

  Scenario: Narrative anchors displayed distinctly
    Tool: Playwright
    Preconditions: Session with at least one narrative anchor (betrayal/confession)
    Steps:
      1. View relationship timeline
      2. Check for anchor events with distinct visual treatment
    Expected Result: Anchors visually distinguishable from regular state changes
    Evidence: .omo/evidence/task-38-anchors.png
  ```

- [x] 39. Build Narrative State Debug Panel

  **What to do**:
  - Create a debug panel (similar to Task 35's retrieval inspector) for narrative state
  - Show current scene state: location, tone, emotional_tone, current_intent, time_of_day
  - Show narrative state: tension, pacing, narrative_phase, goals, active_conflicts
  - Show state history: last N state changes per session with timestamps
  - Show what narrative fields are being fed into the next prompt
  - Toggle with keyboard shortcut (or extend retrieval inspector)

  **Must NOT do**:
  - Don't modify narrative state extraction or injection (Phase 5 handles that)
  - Don't add to default user view — debug-only

  **Recommended Agent Profile**: `visual-engineering`
  - Reason: Live state display component, similar to retrieval inspector

  **Parallelization**: Wave 7 — can run in parallel with Tasks 35-38

  **References**:
  - `src/lib/retrieval.ts:17-23` — SceneContext type (scene state fields)
  - Phase 5 schema additions — narrative state fields (tension, pacing, phase, goals)
  - `src/lib/scene-extraction.ts` — scene extraction output shape
  - `src/hooks/use-session.ts` — how state arrives at the front-end

  **Acceptance Criteria**:
  - [ ] Panel toggles with keyboard shortcut
  - [ ] Shows current scene state and narrative state fields
  - [ ] Shows state history with timestamps
  - [ ] Shows which fields are injected into prompt
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Narrative state panel shows current values
    Tool: Playwright
    Preconditions: Browser open on session with active scene
    Steps:
      1. Open narrative state debug panel
      2. Verify scene state fields visible (tone, location, intent)
      3. Verify narrative state fields visible (tension, pacing, phase)
    Expected Result: All state fields displayed with current values
    Evidence: .omo/evidence/task-39-narrative-debug.png

  Scenario: State history visible
    Tool: Playwright
    Preconditions: Session with multiple scene state changes
    Steps:
      1. Open narrative state debug panel
      2. Toggle to "history" view
      3. Verify previous state values and timestamps shown
    Expected Result: State history renders chronologically
    Evidence: .omo/evidence/task-39-state-history.png
  ```

  **Enhanced QA Coverage** (beyond per-task scenarios):
  ```
  Scenario [Null/Empty]: All UI panels render with empty back-end data
    Tool: Playwright
    Preconditions: Fresh session with no data, no jobs, no entities, no relationships, no narrative state
    Steps:
      1. Open retrieval inspector → verify "no data" message, not crash
      2. Navigate to /admin/jobs → verify "no jobs" empty state
      3. Navigate to /admin/entities → verify "no entities" empty state
      4. Navigate to /admin/contradictions → verify "no contradictions" empty state
      5. Open relationship timeline → verify "no relationship data" message
      6. Open narrative state panel → verify shows default state
    Expected Result: Every panel handles empty data gracefully. No crashes, no infinite spinners, no "undefined" in the UI.
    Evidence: .omo/evidence/phase-6-ui-empty-states.png

  Scenario [Error State]: API failures display error messages, not crashes
    Tool: Playwright + in-browser network throttling
    Preconditions: Normal data exists, but simulate network failure
    Steps:
      1. Open retrieval inspector
      2. Use browser devtools to block API requests (offline mode)
      3. Verify error message displayed: "Failed to load retrieval data"
      4. Navigate to /admin/jobs with network offline
      5. Verify error state with retry button
    Expected Result: All 5 panels show user-friendly error messages. No white screen, no uncaught exceptions. Retry button present where applicable.
    Evidence: .omo/evidence/phase-6-ui-error-states.png

  Scenario [Loading State]: Panels show loading indicators during data fetch
    Tool: Playwright with slow network simulation
    Preconditions: Slow 3G throttling in browser devtools
    Steps:
      1. Navigate to /admin/jobs
      2. Verify loading spinner/skeleton appears before data renders
      3. Wait for data — verify transition from loading to loaded
    Expected Result: Every panel shows loading state. No flash-of-empty. Smooth transition to loaded data.
    Evidence: .omo/evidence/phase-6-ui-loading.png

  Scenario [Boundary]: Very long entity list (100+) renders without performance issues
    Tool: Playwright
    Preconditions: 100+ resolved entities in the DB
    Steps:
      1. Navigate to /admin/entities
      2. Verify full list renders
      3. Measure time from navigation to fully rendered list (< 2 seconds)
      4. Scroll to bottom — verify smooth scroll
    Expected Result: 100+ entities render within 2 seconds. No lag, no browser warnings.
    Evidence: .omo/evidence/phase-6-ui-large-list.txt

  Scenario [Regression]: UI panels don't break existing session page functionality
    Tool: Playwright
    Preconditions: Session page with chat functionality
    Steps:
      1. Open session page
      2. Verify chat input works (type message, send)
      3. Toggle retrieval inspector
      4. Verify chat still works (type another message, send)
      5. Close inspector
      6. Verify chat still works
    Expected Result: Chat functionality is completely unaffected by UI panel presence. Panels are true read-only overlays.
    Evidence: .omo/evidence/phase-6-ui-no-regression.png
  ```

  ### WAVE 8 — DEDICATED INTEGRATION & REGRESSION TESTS

> **TL;DR**: This wave runs after ALL implementation phases (0-6) but before the Final Verification Wave. It executes comprehensive cross-phase integration tests and a full regression sweep. Unlike per-phase Enhanced QA (which runs during each phase), this wave tests that EVERYTHING works together after all phases are complete.
>
> **Must NOT do**: No code changes. This is a test-only wave. If tests fail, file the bug and fix in a new task — don't modify implementation during testing.

- [x] 40. Run cross-phase integration test suite

  **What to do**:
  - Execute ALL 5 cross-phase integration scenarios defined in the Test Plan section above
  - For each: set up precondition state, run the flow, capture evidence
  - Integration-1: Full generate flow (Phases 1 + 3 + 4 + 5) — send message → scene extraction → entity extraction → relationship evolution → narrative state → retrieval → prompt → generation
  - Integration-2: Contradiction → UI review → dismiss (Phases 3 + 6)
  - Integration-3: Relationship evolution → timeline render (Phases 4 + 6)
  - Integration-4: Narrative state → debug panel → prompt bias (Phases 5 + 6)
  - Integration-5: Job failure → admin retry → success (Phases 2 + 6)

  **Must NOT do**:
  - Don't run per-task scenarios (those run during each phase). This is cross-phase only.

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Complex multi-step orchestration across API, SQLite, and Playwright

  **Parallelization**: Sequential — each integration scenario depends on prior steps

  **References**:
  - The 5 integration scenarios defined in the Test Plan section

  **Acceptance Criteria**:
  - [ ] Integration-1: Full generate flow produces prompt with all sections
  - [ ] Integration-2: Contradiction lifecycle (detect → flag → UI → dismiss) works
  - [ ] Integration-3: Relationship timeline renders correct evolution data
  - [ ] Integration-4: Narrative state changes propagate to UI and prompt
  - [ ] Integration-5: Job retry cycle succeeds end-to-end
  - [ ] All evidence captured to `.omo/evidence/wave-8/`

  **QA Scenarios**:
  ```
  Scenario: Integration-1 full generate flow
    Tool: curl + SQLite
    Preconditions: Seasoned session with all Phase 0-5 infrastructure active
    Steps:
      1. Send message → capture message ID
      2. Wait for scene extraction + entity extraction + relationship analysis jobs
      3. Trigger generation
      4. Capture full prompt dump
      5. Verify ALL expected sections present and populated
    Expected Result: Prompt contains: [SCENE STATE] + [NARRATIVE MEMORIES] + [ACTIVE THREADS] + [RELATIONSHIPS] + [WIKI CONTEXT] + [DECISION POINTS]. No empty sections. Budget respected.
    Evidence: .omo/evidence/wave-8/integration-1-prompt.txt

  Scenario: Integration-2 contradiction workflow
    Tool: Playwright + curl
    Preconditions: Wiki page with intentional contradiction
    Steps:
      1. Trigger contradiction detection (lint)
      2. Query contradiction_flags — verify entry exists
      3. Open /admin/contradictions in Playwright
      4. Verify contradiction visible with source evidence
      5. Click "Dismiss"
      6. Verify status changes to dismissed
    Expected Result: End-to-end contradiction lifecycle verified: detection → DB → UI → user action → status update.
    Evidence: .omo/evidence/wave-8/integration-2-contradiction.png

  Scenario: Integration-5 job retry cycle
    Tool: Playwright + SQLite
    Preconditions: A failed job exists in the queue
    Steps:
      1. Navigate to /admin/jobs
      2. Verify failed job shown with error details
      3. Click "Retry"
      4. Verify status changes to pending
      5. Wait for job to process
      6. Verify status changes to completed (or failed again)
    Expected Result: Retry cycle works: failed → pending → processing → completed. User can see the full lifecycle in the UI.
    Evidence: .omo/evidence/wave-8/integration-5-retry-cycle.png
  ```

- [x] 41. Run full regression sweep

  **What to do**:
  - Execute ALL acceptance criteria from ALL phases in sequential order
  - Start with Phase 0 AC-0.1 through AC-0.6
  - Then Phase 1 AC-1.1 through AC-1.9
  - Continue through Phase 6 AC-6.1 through AC-6.5
  - Each AC must pass. Log each result (pass/fail) to `.omo/evidence/wave-8/regression-results.json`
  - If ANY AC fails: log the failure with reproduction steps, stop the sweep, and report
  - Test count: ~35 acceptance criteria across 7 phases + 5 integration scenarios = ~40 total tests

  **Must NOT do**:
  - Don't skip any AC. All must be executed.
  - Don't modify code to fix failures during the sweep — log and report only.

  **Recommended Agent Profile**: `unspecified-high`
  - Reason: Systematic test execution across all phases

  **Parallelization**: Sequential — each phase's ACs build on previous phases

  **References**:
  - The full Acceptance Criteria Matrix in the Test Plan section

  **Acceptance Criteria**:
  - [ ] All Phase 0 ACs pass
  - [ ] All Phase 1 ACs pass
  - [ ] All Phase 2 ACs pass
  - [ ] All Phase 3 ACs pass
  - [ ] All Phase 4 ACs pass
  - [ ] All Phase 5 ACs pass
  - [ ] All Phase 6 ACs pass
  - [ ] Regression results logged to `.omo/evidence/wave-8/regression-results.json`

  **QA Scenarios**:
  ```
  Scenario: Full regression sweep passes
    Tool: Bash (curl + SQLite + bun + Playwright)
    Preconditions: All Phase 0-6 infrastructure active, data populated
    Steps:
      1. Start regression sweep script
      2. For each AC: run verification, log result
      3. After all ACs: print summary
      4. Save results JSON
    Expected Result: All ~35 ACs pass. Results file has pass/fail per AC with evidence paths.
    Evidence: .omo/evidence/wave-8/regression-results.json

  Scenario: Failed AC produces actionable output
    Tool: Bash
    Preconditions: Regression sweep with at least 1 intentional failure seeded
    Steps:
      1. Run regression sweep
      2. Check that failed AC includes: AC ID, expected value, actual value, reproduction command
    Expected Result: Failure output contains enough info to reproduce without re-reading the plan.
    Evidence: .omo/evidence/wave-8/regression-failure-example.json
  ```

---

## Final Verification Wave (MANDATORY — after ALL implementation waves)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx next build` + lint. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **End-to-End QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-phase integration (Phase 1 retrieval + Phase 3 entity resolution + Phase 5 narrative state + Phase 6 UI + Wave 8 integration tests all working together). Test edge cases: empty state, invalid data, rapid actions. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-phase contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

Will be determined per-wave during execution. Each wave should produce 1-2 meaningful commits.

---

## Success Criteria

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All QA scenarios pass
- [x] Phase-specific criteria verified independently

---

## Future Considerations (Architecture Roadmap)

> ⚠️ **Not implementation tasks.** These are architectural concerns identified during planning that are deliberately out of scope for the current 6-phase remediation.
>
> The plan is creating a **persistent semantic operating system** — a system that accumulates, interprets, and re-synthesizes narrative state across sessions. The long-term risk isn't feature incompleteness; it's that the system becomes a self-maintaining interpretation engine that silently drifts from reality.
>
> The guiding principle: **Don't build yourself into a corner.** Every task in Phases 0-6 should avoid design choices that make these futures impossible.

### 1. Stale Synthesis & Canonical Truth (Future Phase 7+)

**The problem**: Synthesized lore silently goes out of date. An LLM-generated wiki page from session 5 says "Jake is afraid of water." After session 50 — in which Jake swam across a river — the page remains unchanged. **Synthesis is append-only** in the current plan. No re-verification exists.

The current plan makes contradictions detectable (Phase 3 — wiki lint, flags) but stops short of resolving them. This is correct for now — resolution rules need real-world contradiction data.

**Eventual architecture:**
- **Stale-synthesis detection**: Flag wiki pages not re-verified against transcript within N sessions. Queue re-synthesis with context window of contradictory evidence.
- **Provenance-weighted precedence**: `transcript > extracted fact > wiki synthesis > inferred psychology`. Each data source carries a reliability tier annotation.
- **State reconciliation engine**: When two sources disagree, apply conflict-resolution rules: timestamp wins, provenance tier wins, or LLM-adjudicates with a dedicated prompt.
- **Confidence/entropy scores**: Every narrative state field gets a `confidence: 0-1` and `entropy: 0-1` score. Retrieval prefers high-confidence; contradiction detection flags high-entropy.

**Guardrail for current work**: All new tables/types should include a `source_tier TEXT` column (values: `transcript`, `extracted`, `synthesized`, `inferred`), a `last_verified_at TIMESTAMP`, and a `confidence REAL DEFAULT 1.0` column. Cheap to add now, expensive to migrate later.

### 2. Observational vs Operational Narrative State (Future Phase 8+)

**The problem**: Fields like `tension: 0.8` and `phase: climax` are useful for retrieval bias but dangerous if they start dictating narrative behavior. If a routing decision says "tension is 0.8, so the LLM must write a climax scene," the story becomes **mechanically paced, predictable, structurally repetitive**.

The current plan wires scene state fields into retrieval and prompts — treating them as **observational** (what the LLM reported). Risk: as more features depend on them, they'll gradually be treated as **operational**.

**Eventual safeguard:**
- **Observational layer**: LLM-reported state — used for retrieval bias, prompt context only
- **Operational layer**: Derived state — used for routing decisions, pacing logic, system behavior
- **Bridge rule**: Observational feeds operational, never the reverse. Jobs may *read* observational to derive operational, but must never *write* operational directly.

**Guardrail for current work**: Phase 5 (narrative state engine) should not write fields that control system behavior. Scene state fields are retrieval inputs only. If a routing decision needs a state field, create a separate derived type. Never let narrative state fields automatically trigger "scenes must be X" logic.

### 3. Entity Resolution & Ontology Fragmentation (Future Phase 9+)

**The problem**: Different jobs create slightly different entity categories over time. The extraction job calls it "NPC", the relationship tracker calls it "character", the wiki ingest calls it "subject". Cross-phase queries get progressively less reliable. Meanwhile, the entity resolution itself (regex on capitalized proper nouns + fuzzy name matching) breaks on pronouns, aliases, titles, and evolving identities.

Primary resolution is correct for the 80% case now. Ontology fragmentation is the more insidious risk.

**Eventual approach:**
- **Ontology registry**: Centralized mapping of entity categories used across jobs. Jobs declare "I produce category X" against known ontology rather than inventing new labels.
- **Co-reference resolution**: LLM call to link pronouns and descriptive references to canonical entities
- **Semantic clustering**: Lightweight embedding-based grouping of entity references across sessions
- **Entity registry**: A dedicated table mapping all aliases/titles/roles to canonical entity IDs (not a global registry — per-universe, namespaced)

**Guardrail for current work**: Phase 3 should store resolved entity IDs (UUIDs, not names) where possible, so a future registry can be retrofitted. All new job types should declare their entity category labels upfront rather than generating them ad-hoc.

### 4. Canonical Truth Hierarchy (Future Phase 10+)

**The problem**: The system is becoming a **persistent semantic operating system** — but it doesn't distinguish data reliability tiers. Raw transcripts, extracted facts, synthesized lore, and inferred psychology are all treated similarly by the retrieval and prompt layers. **Synthesized summaries eventually mutate canon** because the LLM can't tell which facts are authoritative.

Eventually you need explicit layers:

| Layer | Reliability | Source | Example |
|-------|------------|--------|---------|
| Transcript | Absolute | Raw message log | User said "I killed the dragon" |
| Extracted facts | High | Structured extraction | kill_events: dragon, 2026-05-24 |
| Wiki synthesis | Medium | LLM-generated lore | "Jake the Dragonslayer" |
| Inferred interpretation | Probabilistic | Behavioral analysis | "Jake prefers direct confrontation" |

**Architectural implication**: Every write path needs to tag which layer it operates at. Every read path needs layer awareness in ranking/retrieval. Prompts should explicitly tell the LLM which layer to prefer for which purpose — otherwise the synthesis layer's confident-sounding prose will always win over the transcript layer's messy ground truth.

**Guardrail for current work**: Add `data_tier TEXT` to all new fact/synthesis tables. Add an explicit "reliability hierarchy" comment block in `retrieval.ts` and `prompt-builder.ts` so implementers know which data to prefer. The column costs nothing now but enables the hierarchy later.

### 5. Semantic Accumulation & Retrieval Entropy (Future Phase 11+)

**The problem**: Phase 1 wires new data sources into retrieval. But adding more sources without a decay mechanism creates **semantic accumulation** — the system collects more narrative weight than it can discriminatively use. After 50 sessions, everything is "important" relative to the character. Embeddings become noisy. Prompts become repetitive. Retrieval loses discriminative value.

The plan relies on `applyContextBudget` (hard limits) and `calculateImportance` (relevance scoring) — but neither addresses **discriminative value**.

**Eventual mechanisms:**
- **Novelty weighting**: Boost facts that haven't been referenced in recent N prompts
- **Anti-repetition scoring**: Penalize facts used in the last 3-5 generations
- **Memory aging curves**: Decay importance over time unless re-verified by new transcript evidence. Older facts need stronger corroboration to be re-included.
- **Contextual suppression**: When fact A and fact B are consistently retrieved together, deduplicate their semantic weight — don't let both consume separate context budget.
- **Retrieval entropy reduction**: Track retrieval co-occurrence patterns. If retrieving X always also retrieves Y, they're not providing independent information.

**Guardrail for current work**: Phase 1's retrieval should include a `last_retrieved_at TIMESTAMP` column and `retrieval_count INTEGER DEFAULT 0` on memory/fact tables. Phase 5 (narrative state) should add a `last_referenced_at` for each state field. These enable novelty/entropy features later without backfill. Also: `applyContextBudget` should log which sections were *omitted* (not just which were included) — that data is essential future training signal for entropy reduction.
