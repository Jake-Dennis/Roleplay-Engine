# Per-Session Persona Selection

## TL;DR

> **Quick Summary**: Fix the broken persona dropdown in session chat and make persona selection persist per session. The selected persona affects both message attribution (name/avatar) and LLM context (character card, personality, scenario).
>
> **Deliverables**:
> - Personas table guaranteed on startup (schema-migrations.ts)
> - `sessions.persona_id` column with FK to personas
> - `PUT /api/sessions/[id]/persona` endpoint
> - Inline persona dropdown in session header (moved from chat input)
> - LLM generation route uses session persona instead of global active
> - Click-outside handler, empty state, loading state for dropdown
>
> **Estimated Effort**: Short (3 tasks, 2 waves)
> **Parallel Execution**: YES - Wave 1 (schema + API), Wave 2 (UI + LLM)
> **Critical Path**: Schema → API → UI + LLM

---

## Context

### Original Request
User said "We need the ability to select the active Persona" and confirmed the existing dropdown is "broken."

### Interview Summary
**Key Discussions**:
- **Scope**: Per-session persistence — each session remembers its selected persona
- **UI**: Inline dropdown in session header (not chat input area)
- **Behavior**: Selected persona represents the USER's avatar/identity
- **LLM**: Selected persona's character card, personality, scenario sent to LLM
- **Persistence**: Save to database, survives page refresh/re-entry

**Research Findings**:
- Personas table created via `ensureGroupSupport()` in `group-migrations.ts` — NOT on startup
- Chat window dropdown (`chat-window.tsx:334-368`) hidden when `personas.length === 0`
- No click-outside handler to close dropdown
- Selection is local React state — resets on navigation/refresh
- `getActivePersonaContext(userId)` queries `WHERE is_active = 1` (user-global, not session-scoped)
- `buildPersonaPrompt()` already supports persona context for LLM

### Metis Review
**Identified Gaps** (addressed):
- Dropdown location clarified: move from chat input to session header
- LLM impact confirmed: generate route must use session persona
- Fallback chain defined: session persona → user global active → no persona
- Group sessions excluded from scope
- Test strategy added: agent QA via Playwright + curl

---

## Work Objectives

### Core Objective
Each session persists a user-selected persona to the DB and uses it (instead of the global `is_active=1` persona) for LLM context and message attribution.

### Concrete Deliverables
- `schema-migrations.ts` — personas table + sessions.persona_id column
- `src/app/api/sessions/[id]/persona/route.ts` — PUT endpoint
- `src/app/(app)/session/[id]/page.tsx` — header dropdown + persistence wiring
- `src/app/api/generate/[id]/route.ts` — session-aware persona context
- `src/components/chat/chat-window.tsx` — remove old dropdown

### Definition of Done
- [ ] `npx next build` passes
- [ ] Persona selection persists across page refresh
- [ ] Different sessions can have different personas selected
- [ ] LLM uses session persona for character context
- [ ] Dropdown shows empty state with "Create persona" link
- [ ] Click-outside closes dropdown

### Must Have
- Per-session persona persistence
- Session header dropdown (not chat input)
- LLM context uses session persona
- Fallback to global active persona when session has none
- "No persona" option (NULL)

### Must NOT Have (Guardrails)
- Do NOT change persona CRUD pages or APIs
- Do NOT change session list page
- Do NOT add SSE broadcast for persona changes
- Do NOT handle group session persona coordination
- Do NOT add ORM or query builder
- Do NOT break existing `is_active` user-global system

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (no test framework)
- **Automated tests**: NO
- **Agent-Executed QA**: ALWAYS (mandatory)

### QA Policy
Every task MUST include agent-executed QA scenarios.
- **Frontend/UI**: Playwright navigates, interacts, asserts DOM, screenshots
- **API/Backend**: curl sends requests, asserts status + response fields
- **Database**: Direct SQLite query to verify column values

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — schema + API + LLM):
├── Task 1: Schema migrations (personas table + sessions.persona_id) [quick]
├── Task 2: PUT /api/sessions/[id]/persona endpoint [quick]
└── Task 4: LLM route uses session persona [quick]

Wave 2 (After Wave 1 — UI):
└── Task 3: Session header dropdown + persistence wiring [visual-engineering]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix
- **1**: - → 2, 3, 4
- **2**: 1 → 3
- **3**: 1, 2 → -
- **4**: 1 → - (can run parallel with 2 after 1)

### Agent Dispatch Summary
- **Wave 1**: `quick` (T1 schema → T2 API + T4 LLM parallel)
- **Wave 2**: `visual-engineering` (T3 UI)
- **FINAL**: `oracle` (F1), `unspecified-high` (F2, F3), `deep` (F4)

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Schema Migrations — Personas Table + sessions.persona_id

  **What to do**:
  - Add personas table creation to `src/lib/schema-migrations.ts` (copy from `group-migrations.ts` ensureGroupSupport)
  - Add `ALTER TABLE sessions ADD COLUMN persona_id TEXT REFERENCES personas(id) ON DELETE SET NULL` to schema-migrations.ts
  - Also add to `scripts/init-db.ts` sessions table definition for fresh databases
  - Ensure idempotent (IF NOT EXISTS / try-catch)

  **Must NOT do**:
  - Do NOT remove personas table from group-migrations.ts (backward compat)
  - Do NOT change any other tables

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple schema additions, well-understood pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (blocks Task 2 and Task 3)
  - **Parallel Group**: Sequential (Wave 1, first)
  - **Blocks**: Task 2, Task 3
  - **Blocked By**: None

  **References**:
  - `src/lib/schema-migrations.ts` — existing migration pattern (try-catch idempotency)
  - `src/lib/group-migrations.ts:65-84` — personas table DDL to copy
  - `scripts/init-db.ts:38-47` — sessions table DDL to add persona_id column

  **Acceptance Criteria**:
  - [ ] `npm run dev` on clean `data/` directory → personas table exists, sessions has persona_id column
  - [ ] Calling migration on existing DB → no error (idempotent)

  **QA Scenarios**:
  ```
  Scenario: Fresh database has personas table and sessions.persona_id
    Tool: Bash (PowerShell)
    Preconditions: Clean data/ directory
    Steps:
      1. Rename existing DB: Move-Item "data/app.db" "data/app.db.bak"
      2. Run: npx next dev (triggers instrumentation.ts → runSchemaMigrations)
      3. Wait 10s for startup
      4. Query: node -e "const d=require('better-sqlite3')('data/app.db'); console.log(d.prepare('SELECT name FROM sqlite_master WHERE type=\"table\" AND name=\"personas\"').get()); console.log(d.prepare('PRAGMA table_info(sessions)').all().filter(r=>r.name==='persona_id'))"
    Expected Result: personas table listed, sessions.persona_id column present with type TEXT
    Evidence: .omo/evidence/task-1-fresh-db.txt

  Scenario: Migration is idempotent on existing DB
    Tool: Bash (PowerShell)
    Preconditions: Existing data/app.db
    Steps:
      1. Run: npx next dev
      2. Check server output for errors
      3. Query: node -e "const d=require('better-sqlite3')('data/app.db'); console.log(d.prepare('PRAGMA table_info(sessions)').all().filter(r=>r.name==='persona_id'))"
    Expected Result: No startup errors, persona_id column present (not duplicated)
    Evidence: .omo/evidence/task-1-idempotent.txt
  ```

  **Commit**: YES
  - Message: `feat: add personas table and sessions.persona_id to schema migrations`
  - Files: `src/lib/schema-migrations.ts`, `scripts/init-db.ts`

- [x] 2. PUT /api/sessions/[id]/persona Endpoint

  **What to do**:
  - Create `src/app/api/sessions/[id]/persona/route.ts`
  - PUT handler: accepts `{ persona_id: string | null }`, validates persona belongs to user, updates sessions.persona_id
  - Returns 200 with updated session
  - Follow existing auth pattern: `getAuthToken` + `verifyToken`
  - Follow existing error pattern: `NextResponse.json({ error: "..." }, { status: N })`

  **Must NOT do**:
  - Do NOT add GET handler
  - Do NOT change other session endpoints

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard CRUD endpoint, follows established patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 schema)
  - **Parallel Group**: Wave 1 (after Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `src/app/api/sessions/[id]/settings/route.ts` — similar nested resource pattern
  - `src/app/api/sessions/[id]/participants/route.ts` — auth + validation pattern
  - `src/lib/auth-token.ts` — `getAuthToken` utility
  - `src/lib/auth.ts` — `verifyToken` function
  - `src/lib/db.ts` — `getDb` singleton

  **Acceptance Criteria**:
  - [ ] PUT with valid persona_id → 200, DB updated
  - [ ] PUT with persona_id belonging to different user → 400
  - [ ] PUT with persona_id = null → 200, DB set to NULL
  - [ ] PUT without auth token → 401

  **QA Scenarios**:
  ```
  Scenario: Set session persona to valid persona
    Tool: Bash (curl)
    Preconditions: Auth token, valid session ID, valid persona ID
    Steps:
      1. PUT: curl -s -X PUT http://localhost:3000/api/sessions/SESSION_ID/persona -H "Cookie: auth-token=TOKEN" -H "Content-Type: application/json" -d '{"persona_id":"PERSONA_ID"}'
    Expected Result: 200 response with { session: { persona_id: "PERSONA_ID" } }
    Evidence: .omo/evidence/task-2-set-persona.json

  Scenario: Set session persona to NULL
    Tool: Bash (curl)
    Steps:
      1. PUT: curl -s -X PUT http://localhost:3000/api/sessions/SESSION_ID/persona -H "Cookie: auth-token=TOKEN" -H "Content-Type: application/json" -d '{"persona_id":null}'
    Expected Result: 200 response with { session: { persona_id: null } }
    Evidence: .omo/evidence/task-2-null-persona.json

  Scenario: Unauthorized access
    Tool: Bash (curl)
    Steps:
      1. PUT without token: curl -s -X PUT http://localhost:3000/api/sessions/SESSION_ID/persona -H "Content-Type: application/json" -d '{"persona_id":"fake"}'
    Expected Result: 401 response with { error: "Unauthorized" }
    Evidence: .omo/evidence/task-2-unauthorized.json
  ```

  **Commit**: YES (groups with 1)
  - Message: `feat: add PUT /api/sessions/[id]/persona endpoint`
  - Files: `src/app/api/sessions/[id]/persona/route.ts`

- [x] 3. Session Header Dropdown + Persistence Wiring

  **What to do**:
  - Move persona dropdown from `chat-window.tsx` (input area) to session header in `src/app/(app)/session/[id]/page.tsx`
  - On session page mount: fetch session data, read `session.persona_id`, set `activePersonaId` from it
  - On persona change: call `PUT /api/sessions/[id]/persona` to persist, then update local state
  - Add click-outside handler to close dropdown
  - Add empty state: when `personas.length === 0`, show "No personas" with link to `/personas` page
  - Add loading state while personas are fetching
  - Remove old dropdown from `chat-window.tsx` (lines 334-368) and related props

  **Must NOT do**:
  - Do NOT change persona CRUD UI at `/personas`
  - Do NOT change chat message rendering
  - Do NOT add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component work — dropdown, positioning, click-outside, empty/loading states
  - **Skills**: [`/frontend-ui-ux`]
    - `/frontend-ui-ux`: UI/UX guidance for dropdown styling, empty state design

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 schema + Task 2 API)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 4
  - **Blocked By**: Task 1, Task 2

  **References**:
  - `src/app/(app)/session/[id]/page.tsx:600-672` — session header area (where dropdown goes)
  - `src/app/(app)/session/[id]/page.tsx:82-93` — existing persona loading logic (to modify)
  - `src/app/(app)/session/[id]/page.tsx:120-122` — persona state declarations
  - `src/components/chat/chat-window.tsx:334-368` — existing dropdown to REMOVE
  - `src/components/chat/chat-window.tsx:215-217` — persona props to REMOVE from interface
  - `src/app/(app)/personas/page.tsx` — reference for persona list styling

  **Acceptance Criteria**:
  - [ ] Dropdown visible in session header (not chat input)
  - [ ] Dropdown shows current persona name, opens on click
  - [ ] Click outside closes dropdown
  - [ ] Empty state shows "No personas" with link to /personas
  - [ ] Selecting persona persists via PUT API
  - [ ] Refreshing page restores selected persona
  - [ ] Old dropdown removed from chat-window.tsx

  **QA Scenarios**:
  ```
  Scenario: Dropdown renders in session header with personas
    Tool: Playwright
    Preconditions: Logged in, session with 2+ personas, npx next dev running
    Steps:
      1. Navigate to http://localhost:3000/session/[any-session-id]
      2. Wait for page load
      3. Assert: element with persona name exists in header area (not in chat input area)
      4. Click the persona dropdown button
      5. Assert: dropdown menu is visible with persona names listed
      6. Click outside the dropdown
      7. Assert: dropdown menu is no longer visible
    Expected Result: Dropdown in header, opens/closes correctly
    Evidence: .omo/evidence/task-3-dropdown-render.png

  Scenario: Empty state when no personas exist
    Tool: Playwright
    Preconditions: Logged in, user has 0 personas
    Steps:
      1. Navigate to session page
      2. Assert: element with text "No personas" exists
      3. Assert: link to /personas page exists
    Expected Result: Empty state with create persona link
    Evidence: .omo/evidence/task-3-empty-state.png

  Scenario: Persona selection persists across refresh
    Tool: Playwright
    Preconditions: Logged in, session exists, 2+ personas exist
    Steps:
      1. Navigate to session page
      2. Open dropdown, select persona B (not the default)
      3. Wait for selection to complete
      4. Refresh page
      5. Assert: dropdown shows persona B as selected
    Expected Result: Persona B still selected after refresh
    Evidence: .omo/evidence/task-3-persist-refresh.png

  Scenario: Different sessions have different personas
    Tool: Playwright
    Preconditions: Logged in, 2 sessions exist, 2+ personas exist
    Steps:
      1. Navigate to session 1, select persona A
      2. Navigate to session 2, select persona B
      3. Navigate back to session 1
      4. Assert: dropdown shows persona A (not B)
    Expected Result: Each session remembers its own persona
    Evidence: .omo/evidence/task-3-session-isolation.png
  ```

  **Commit**: YES
  - Message: `feat: add session header persona dropdown with persistence`
  - Files: `src/app/(app)/session/[id]/page.tsx`, `src/components/chat/chat-window.tsx`

- [x] 4. LLM Route Uses Session Persona

  **What to do**:
  - Modify `src/app/api/generate/[id]/route.ts` line ~85 where `getActivePersonaContext(decoded.sub)` is called
  - Replace with session-aware lookup:
    1. Get session's `persona_id` from sessions table
    2. If set, fetch that specific persona
    3. If NULL, fall back to `getActivePersonaContext(decoded.sub)` (global active)
    4. If no global active, use default system prompt
  - Keep existing model resolution logic intact
  - Keep `buildPersonaPrompt()` call unchanged

  **Must NOT do**:
  - Do NOT change `getActivePersonaContext()` function
  - Do NOT change `buildPersonaPrompt()` function
  - Do NOT change streaming logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted change to one call site with fallback logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2, both need Task 1)
  - **Parallel Group**: Wave 1 (with Task 2, after Task 1)
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:
  - `src/app/api/generate/[id]/route.ts:85-134` — persona context + model resolution
  - `src/lib/ollama.ts:106-151` — `getActivePersonaContext()` and `buildPersonaPrompt()`
  - `src/lib/db.ts` — `getDb` singleton

  **Acceptance Criteria**:
  - [ ] Session with persona_id → LLM uses that persona's context
  - [ ] Session with NULL persona_id → LLM uses global active persona
  - [ ] Session with NULL persona_id + no global active → LLM uses default prompt

  **QA Scenarios**:
  ```
  Scenario: LLM uses session persona context
    Tool: Bash (curl)
    Preconditions: Session with persona_id set, Ollama running
    Steps:
      1. Set session persona via PUT endpoint
      2. Send message, trigger generation
      3. Check response reflects session's selected persona context
    Expected Result: AI response uses session persona
    Evidence: .omo/evidence/task-4-session-persona-llm.txt

  Scenario: LLM falls back to global active when session has no persona
    Tool: Bash (curl)
    Steps:
      1. Clear session persona (persona_id = null)
      2. Send message, trigger generation
      3. Check response uses global active persona context
    Expected Result: AI response uses global active persona (is_active=1)
    Evidence: .omo/evidence/task-4-fallback-global.txt
  ```

  **Commit**: YES (groups with 3)
  - Message: `feat: LLM generation uses session persona with fallback chain`
  - Files: `src/app/api/generate/[id]/route.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle` — APPROVE
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist in .omo/evidence/.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high` — APPROVE
  Run `npx next build` + linter. Review all changed files for: `as any`, `@ts-ignore`, empty catches, console.log in prod. Check AI slop patterns.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Execute EVERY QA scenario from EVERY task. Test cross-task integration. Test edge cases: empty state, invalid input, rapid actions. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **1**: `feat: add personas table and sessions.persona_id to schema migrations` — `src/lib/schema-migrations.ts`, `scripts/init-db.ts`
- **2**: `feat: add PUT /api/sessions/[id]/persona endpoint` — `src/app/api/sessions/[id]/persona/route.ts`
- **3**: `feat: add session header persona dropdown with persistence` — `src/app/(app)/session/[id]/page.tsx`, `src/components/chat/chat-window.tsx`
- **4**: `feat: LLM generation uses session persona with fallback chain` — `src/app/api/generate/[id]/route.ts`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: ✓ Compiled successfully
```

### Final Checklist
- [ ] All "Must Have" present (per-session persistence, header dropdown, LLM context, fallback chain, "No persona" option)
- [ ] All "Must NOT Have" absent (no CRUD changes, no session list changes, no SSE, no group handling)
- [ ] `npx next build` passes
- [ ] Persona selection persists across page refresh
- [ ] Different sessions have different personas
- [ ] LLM uses session persona for character context
