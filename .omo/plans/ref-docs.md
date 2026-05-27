# Ref-Docs Package — Schema + API Catalog + Event Registry

## TL;DR

> **Quick Summary**: Create 3 reference documentation files under `.omo/refs/` to help AI coding agents quickly understand the Roleplay-Engine codebase — SQLite schema, API endpoint catalog, and EventBus event registry.
>
> **Deliverables**:
> - `.omo/refs/schema.md` — Complete SQLite table reference (40 tables, columns, FKs, indexes)
> - `.omo/refs/api-catalog.md` — All 94 API route handlers with methods, params, responses, auth
> - `.omo/refs/events.md` — 20 EventBus events with emitters, listeners, payloads, dead-event annotations
>
> **Estimated Effort**: Quick (~30 min)
> **Parallel Execution**: YES — 3 tasks in 1 wave (all independent)
> **Critical Path**: Create `.omo/refs/` dir → write 3 files in parallel → verify

---

## Context

### Original Request
User asked "what's some things that will help you better?" — I identified 7 improvement areas ranked by pain relief. The top 3 were Schema Reference, API Catalog, and Event Registry. User responded "yes do it" then "do it all" when asked about dead events policy.

### Interview Summary
**Key Decisions**:
- Document everything — all 40 tables, all 94 routes, all 20 event types
- Dead events annotated with ⚠️ warning badges (never emitted, dead subscriptions)
- No diagrams, no code changes, no improvement suggestions
- Scope OUT explicitly: module doc blocks, route format standard, constants extraction, tests

**Research Findings** (3 parallel explore agents):
- Schema: 35 standard tables + 4 vec0 virtual + 1 FTS5 = 40 tables, 32 indexes, 3 triggers, full FK graph
- API: 94 route.ts files, ~88 use withAuth(), ~54 use withErrorHandler(), 3 SSE endpoints
- Events: 20 event types, 14 emitted+subscribed, 5 dead (declared never emitted), 1 SSE-synthetic

### Metis Review
**Identified Gaps** (addressed):
- Dead events policy → user confirmed "annotate with ⚠️"
- Scope OUT → added explicit exclusions to draft
- Test strategy → documented as "none (documentation-only)"
- Consistency across docs → same table format, same terminology

---

## Work Objectives

### Core Objective
Create 3 reference documentation files under `.omo/refs/` that comprehensively document the codebase's SQLite schema, API endpoints, and EventBus event system.

### Concrete Deliverables
- `.omo/refs/schema.md`
- `.omo/refs/api-catalog.md`
- `.omo/refs/events.md`

### Definition of Done
- [x] All 3 files exist under `.omo/refs/`
- [x] Counts verified: 40 tables in schema, 94 routes in catalog, 20 event types in events
- [x] Spot-check: 3 random routes verified against actual route.ts files
- [x] Dead events annotated with ⚠️ in events.md

### Must Have
- Pipe-table formatting consistent across all 3 docs
- Dynamic routes use `[param]` notation matching file paths
- Dead events explicitly marked with ⚠️ badges
- "Last Updated" timestamp at top of each file

### Must NOT Have (Guardrails)
- No code changes to `src/` or `data/` directories
- No architecture recommendations, improvement suggestions, TODOs, or diagrams
- No analysis beyond structural documentation
- No cross-referencing issues, bugs, or code quality findings
- No fourth "bonus" document

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Automated tests**: None (documentation-only deliverable)
- **Verification method**: Count checks + spot-checks + markdown validation

### QA Policy
Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.
- **Count verification**: Use `Get-ChildItem -Recurse -Filter "route.ts"` and `Select-String "CREATE TABLE"` to verify counts
- **Spot-check**: Use `Select-String` to verify 3 random route paths exist in both the doc and filesystem
- **Format check**: Ensure all tables have consistent column counts

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (All 3 docs in parallel — independent):
├── Task 1: Create .omo/refs/ dir + schema.md
├── Task 2: Create api-catalog.md
└── Task 3: Create events.md

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit
├── Task F2: Accuracy spot-check
├── Task F3: Format validation
└── Task F4: Scope fidelity check
-> Present results -> Get explicit user okay

Critical Path: Create .omo/refs/ → tasks 1-3 parallel → F1-F4 parallel → user okay
Parallel Speedup: ~67% faster than sequential
Max Concurrent: 3
```

### Dependency Matrix
- **1-3**: None (parallel) - F1-F4
- **F1-F4**: 1, 2, 3 - user okay
- **user okay**: F1-F4 - DONE

### Agent Dispatch Summary
- **Wave 1**: 3 — T1, T2, T3 → `writing`
- **Final Wave**: 4 — F1 → `oracle`, F2 → `unspecified-high`, F3 → `quick`, F4 → `deep`

---

## TODOs

- [x] 1. Create `.omo/refs/` directory and write `schema.md`

  **What to do**:
  - Create directory `.omo/refs/` (doesn't exist yet)
  - Write `.omo/refs/schema.md` documenting all 40 SQLite tables
  - Use data from the schema research agent (all tables, columns, types, constraints, indexes, triggers, FK graph)
  - Structure: per table → `## table_name` with pipe table of columns, then indexes, then triggers, then file references
  - Include cross-table FK graph at bottom
  - Markdown pipe tables: `| Column | Type | Constraints | Notes |`

  **Format details**:
  ```
  ## table_name
  | Column | Type | Constraints | Notes |
  |--------|------|-------------|-------|
  | id | TEXT | PK | UUID |

  **Created in**: scripts/init-db.ts:N
  **Added by**: src/lib/schema-migrations.ts:N (if from migration)
  **Indexes**: idx_name ON table(col1, col2)
  ```

  **Must NOT do**:
  - Do NOT modify any files outside `.omo/refs/`
  - Do NOT add improvement suggestions or TODO markers
  - Do NOT add Mermaid diagrams or visual elements
  - Do NOT abbreviate or truncate any columns

  **Recommended Agent Profile**:
  - **Category**: `writing` — documentation task requiring structured markdown
    - Reason: Creating comprehensive reference documentation with consistent formatting
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: None

  **References**:
  - Research data from schema explore agent (bg_594608a7) — complete table definitions for all 40 tables
  - `scripts/init-db.ts` — source of truth for CREATE TABLE statements
  - `src/lib/schema-migrations.ts` — migration ALTER TABLE additions
  - `src/lib/group-migrations.ts` — groups/group_members/personas tables + ALTER TABLE additions
  - `src/app/api/sessions/[id]/invite/route.ts` — ad-hoc invitations table

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Count verification — all tables documented
    Tool: Bash
    Preconditions: schema.md written at .omo/refs/schema.md
    Steps:
      1. Count "|" table headers in schema.md (each ## table_name should have a corresponding pipe table)
      2. Run: Get-ChildItem -Recurse -Filter "*.ts" | Select-String "(CREATE TABLE|CREATE VIRTUAL TABLE)" | Select-String -NotMatch -SimpleMatch "IF NOT EXISTS" | Measure-Object | Select-Object -ExpandProperty Count
      3. Compare schema.md table count vs actual CREATE TABLE count
    Expected Result: Counts match (40 tables documented = 40 CREATE TABLE statements)
    Failure Indicators: Missing tables, mismatched counts
    Evidence: .omo/evidence/task-1-count-check.txt

  Scenario: Spot-check 3 random tables for column accuracy
    Tool: Bash
    Preconditions: schema.md written
    Steps:
      1. Pick 3 tables (e.g., sessions, messages, events)
      2. For each: grep column names from schema.md section
      3. Compare with actual CREATE TABLE in init-db.ts
    Expected Result: All columns present and correctly typed
    Failure Indicators: Missing columns, wrong types
    Evidence: .omo/evidence/task-1-spot-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-1-count-check.txt`
  - [ ] `.omo/evidence/task-1-spot-check.txt`

  **Commit**: NO (groups with 2, 3)
  - Message: `docs(omo): add schema reference, API catalog, and event registry to .omo/refs/`
  - Files: `.omo/refs/schema.md`, `.omo/refs/api-catalog.md`, `.omo/refs/events.md`
  - Pre-commit: none

---

- [x] 2. Write `api-catalog.md`

  **What to do**:
  - Write `.omo/refs/api-catalog.md` documenting all 94 API route handlers
  - Use data from the API catalog research agent (route.ts files, methods, params, responses, auth)
  - Group routes by domain (## Sessions, ## Wiki, ## NPCs, ## TTS, etc.) matching directory structure under `src/app/api/`
  - Per route entry format:
  ```
  ### GET /api/sessions
  - **File**: src/app/api/sessions/route.ts
  - **Auth**: withAuth
  - **Query Params**: (none)
  - **Body**: `{ name: string, universe_id: string }`
  - **Response**: `{ session: Session }`
  - **Errors**: 400, 401, 403, 429
  - **Handler**: withErrorHandler
  ```
  - Dynamic path params use `[param]` notation: `/api/sessions/[id]/messages`

  **Must NOT do**:
  - Do NOT include curl examples (scope creep)
  - Do NOT add usage notes or best practices
  - Do NOT analyze response structures beyond what's returned

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: None

  **References**:
  - Research data from API catalog explore agent (bg_1f3e0eac) — all 94 routes cataloged
  - Directory structure: `src/app/api/**/route.ts`
  - Auth patterns: `src/lib/with-auth.ts` (withAuth)

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Count verification — all routes documented
    Tool: Bash
    Preconditions: api-catalog.md written
    Steps:
      1. Count route entries in api-catalog.md (count `### ` headers minus section headers)
      2. Run: Get-ChildItem -Recurse -Filter "route.ts" src/app/api/ | Measure-Object | Select-Object -ExpandProperty Count
      3. Compare counts
    Expected Result: Counts match (94 routes documented = 94 route.ts files)
    Failure Indicators: Missing routes, extra routes
    Evidence: .omo/evidence/task-2-count-check.txt

  Scenario: Spot-check 3 random routes for accuracy
    Tool: Bash
    Preconditions: api-catalog.md written
    Steps:
      1. Pick 3 routes from docs with different methods (e.g., GET /api/sessions, POST /api/sessions, DELETE /api/sessions)
      2. For each: verify the exported function name (GET/POST/DELETE) matches the actual route.ts file
      3. Use Select-String to check "export const GET", "export const POST" etc.
    Expected Result: Method matches for all 3
    Failure Indicators: Wrong method documented
    Evidence: .omo/evidence/task-2-spot-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-2-count-check.txt`
  - [ ] `.omo/evidence/task-2-spot-check.txt`

  **Commit**: NO (groups with 1, 3)

---

- [x] 3. Write `events.md`

  **What to do**:
  - Write `.omo/refs/events.md` documenting all 20 EventBus event types
  - Use data from the event registry research agent (events, emitters, listeners, payloads)
  - Structure: per event → `## event:name` with definition, emitter(s), listener(s), payload shape, status (live/dead)
  - Dead events annotated with ⚠️ badges:
    - ⚠️ **Never emitted** for declared-subscribed but never called
    - 🟡 **Unused declaration** for declared but no emitter and no listener
  - Include SSE connection lifecycle section (connected/heartbeat, polling fallback, cleanup)
  - Include summary table of dead events at bottom

  **Format per event**:
  ```
  ## MESSAGE_CREATED — `"message:created"`
  - **Constant**: `SessionEvents.MESSAGE_CREATED`
  - **Status**: ✅ Live
  - **Emitted by**: src/app/api/sessions/[id]/messages/route.ts:148 (POST)
  - **Payload**: `{ messageId: string, sessionId: string, senderId: string, content: string }`
  - **Server listeners**: sessions/[id]/stream/route.ts (SSE subscription)
  - **Client listeners**: session/[id]/page.tsx (refreshSession)
  ```

  **Must NOT do**:
  - Do NOT suggest fixes for dead events (documentation only)
  - Do NOT add architecture recommendations
  - Do NOT cross-reference issues

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: None

  **References**:
  - Research data from event registry explore agent (bg_6460019b) — complete event registry
  - `src/lib/event-bus.ts` — SessionEvents enum, EventBus class
  - `src/app/api/sessions/[id]/stream/route.ts` — SSE stream subscriptions
  - `src/app/api/jobs/stream/route.ts` — job SSE stream
  - `src/lib/jobs/queue.ts:updateJobProgress()` — JOB_PROGRESS emitter
  - `src/lib/jobs/wiki-handler.ts` — WIKI_PAGE_CREATED emitter
  - `src/lib/jobs/scene-handler.ts` — SCENE_UPDATED emitter

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Count verification — all events documented
    Tool: Bash
    Preconditions: events.md written
    Steps:
      1. Count event entries in events.md (count `## ` headers minus SSE lifecycle section)
      2. Run: Select-String "SessionEvents\.\w+" src/lib/event-bus.ts | Select-Object -ExpandProperty Matches | Select-Object -ExpandProperty Value | Sort-Object -Unique | Measure-Object | Select-Object -ExpandProperty Count
      3. Compare counts
    Expected Result: Counts match (20 events documented = 20 SessionEvents constants)
    Failure Indicators: Missing events, extra undocumented constants
    Evidence: .omo/evidence/task-3-count-check.txt

  Scenario: Verify dead event annotations present
    Tool: Bash
    Preconditions: events.md written
    Steps:
      1. Search events.md for ⚠️ characters
      2. Verify at least 5 dead events are annotated (job:completed, thread:updated, wiki:page_updated, tts:queued, tts:completed)
    Expected Result: 5+ ⚠️ annotations present
    Failure Indicators: Missing badges, wrong count
    Evidence: .omo/evidence/task-3-dead-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-3-count-check.txt`
  - [ ] `.omo/evidence/task-3-dead-check.txt`

  **Commit**: NO (groups with 1, 2)

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file). For each "Must NOT Have": search for forbidden patterns (code changes, diagrams, TODOs). Check evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Accuracy Spot-Check** — `unspecified-high`
  Verify 3 random route paths from api-catalog.md exist as actual route.ts files. Verify 3 random table names from schema.md exist in init-db.ts CREATE TABLE statements. Verify 3 random event names from events.md exist in event-bus.ts SessionEvents enum.
  Output: `Routes [N/N] | Tables [N/N] | Events [N/N] | VERDICT`

- [x] F3. **Format Validation** — `quick`
  Check all 3 .md files have consistent pipe-table formatting (same column count per table, no ragged rows). Check all pipe tables are properly aligned. Check no broken markdown syntax. Verify "Last Updated" timestamp present on each file.
  Output: `Schema [PASS/FAIL] | API [PASS/FAIL] | Events [PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual file content. Verify 1:1 — everything specified was included, nothing beyond scope was added. Check "Must NOT do" compliance. Flag any scope creep (diagrams, improvement suggestions, code changes outside .omo/refs/).
  Output: `Tasks [N/N compliant] | Scope Creep [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **1-3**: `docs(omo): add schema reference, API catalog, and event registry to .omo/refs/` — `.omo/refs/schema.md`, `.omo/refs/api-catalog.md`, `.omo/refs/events.md`

---

## Success Criteria

### Verification Commands
```bash
Get-ChildItem -Recurse -Filter "route.ts" src/app/api/ | Measure-Object | Select-Object -ExpandProperty Count
# Expected: 94

Select-String "CREATE TABLE" scripts/init-db.ts | Select-String -NotMatch "IF NOT EXISTS"
# Expected: 31+ CREATE TABLE statements

Select-String "SessionEvents\.\w+\s*=" src/lib/event-bus.ts | Measure-Object | Select-Object -ExpandProperty Count
# Expected: 20
```

### Final Checklist
- [x] All 3 files exist: `.omo/refs/schema.md`, `.omo/refs/api-catalog.md`, `.omo/refs/events.md`
- [x] Counts verified: 40 tables, 94 routes, 20 events
- [x] Dead events annotated with ⚠️
- [x] No files outside `.omo/refs/` modified
- [x] No diagrams, TODOs, or improvement suggestions added
