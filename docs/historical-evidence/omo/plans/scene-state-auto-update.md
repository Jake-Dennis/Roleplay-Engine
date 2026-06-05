# Scene State Auto-Update — Inline LLM Extraction After AI Response

## TL;DR

> **Quick Summary**: After each AI response, automatically extract all scene state fields (location, goal, NPCs, threads, summary) from recent messages using an inline LLM call, keeping the `[CURRENT SCENE]` prompt context fresh without manual intervention.
> 
> **Deliverables**:
> - `src/lib/scene-extraction.ts` — standalone extraction function with LLM prompt
> - `src/app/api/generate/[id]/route.ts` — inline trigger after AI response
> - `src/app/(app)/session/[id]/page.tsx` — add `"scene:updated"` to SSE event list
> - `src/lib/event-bus.ts` — emit `SCENE_UPDATED` event after extraction
> 
> **Estimated Effort**: Short (5 tasks)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1 (extraction module) → T2 (generate route integration) → T3 (SSE wiring) → T4-T5 (QA + build) → F1-F4

---

## Context

### Original Request
User said "we need a way for the scene state to update its information as it goes"

### Interview Summary
**Key Discussions**:
- Scene state already exists in `scene_states` table but only `emotional_tone` auto-updates
- User wants ALL fields (location, goal, NPCs, threads, summary) to auto-update
- Inline extraction after every AI response (~1-2s added to generation)
- Auto-apply immediately, no review/draft mode

**Research Findings**:
- `scene_states` table: `active_location_id`, `current_goal`, `emotional_tone`, `active_npcs` (JSON), `active_threads` (JSON), `scene_summary`
- `SCENE_UPDATED` SSE event defined in `event-bus.ts` but never emitted
- Session page SSE listener at line 230 does NOT include `"scene:updated"` in `allEvents` array
- Existing pattern: inline LLM calls in `generate/[id]/route.ts` for intent classification

### Metis Review
**Identified Gaps** (addressed):
- `active_npcs` format bug in `retrieval.ts` — reads as comma-separated but API writes JSON arrays → Fixed in T1
- Job-vs-inline contradiction → Using standalone function, not job queue
- SSE wiring gap → Adding event to session page's `allEvents` array
- LLM failure behavior → Keep existing values, no retry, no partial updates

---

## Work Objectives

### Core Objective
Automatically extract and persist all scene state fields from recent messages after each AI response, keeping the `[CURRENT SCENE]` prompt context fresh without manual intervention.

### Concrete Deliverables
- `src/lib/scene-extraction.ts` — `extractAndApplySceneState(sessionId, userId)` function
- `src/app/api/generate/[id]/route.ts` — inline call after AI response completes
- `src/app/(app)/session/[id]/page.tsx` — `"scene:updated"` in SSE event list
- `src/lib/event-bus.ts` — emit `SCENE_UPDATED` after successful extraction

### Definition of Done
- [ ] Scene state updates automatically after each AI response
- [ ] All 5 fields (location, goal, NPCs, threads, summary) extracted
- [ ] SSE event triggers client refresh
- [ ] SceneStatePanel shows updated values without manual refresh
- [ ] `npx next build` passes

### Must Have
- Inline extraction after every AI response
- All fields extracted and applied atomically
- SSE event emitted for client refresh
- Graceful failure (keep existing values on LLM error)

### Must NOT Have (Guardrails)
- Do NOT use the job queue — this is inline execution
- Do NOT add partial updates — all-or-nothing per extraction
- Do NOT add UI loading states or toast notifications
- Do NOT change the scene_states table schema
- Do NOT break existing manual editing via SceneStatePanel
- Do NOT add retry logic on LLM failure

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: NO
- **Agent-Executed QA**: ALWAYS

### QA Policy
Every task MUST include agent-executed QA scenarios.
- **Frontend/UI**: Playwright — navigate, interact, assert DOM, screenshot
- **API/Backend**: Bash (curl) — send requests, assert status + response fields
- Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — extraction module + fix):
├── T1: Create scene-extraction.ts module [unspecified-high]
└── T2: Fix active_npcs format bug in retrieval.ts [quick]

Wave 2 (Integration — depends: T1, T2):
├── T3: Integrate extraction into generate route [unspecified-high]
├── T4: Wire SSE event for client refresh [quick]
└── T5: Build verification + smoke test [quick] (depends: T3, T4)

Wave FINAL (4 parallel reviews):
├── F1: Plan compliance (oracle)
├── F2: Code quality (unspecified-high)
├── F3: Manual QA (unspecified-high + playwright)
└── F4: Scope fidelity (deep)
```

### Dependency Matrix
- **T1**: - → T3
- **T2**: - → T3
- **T3**: T1, T2 → T5
- **T4**: - → T5
- **T5**: T3, T4 → -

### Agent Dispatch Summary
- **Wave 1**: `unspecified-high` (T1), `quick` (T2) — 2 parallel
- **Wave 2**: `unspecified-high` (T3), `quick` (T4) parallel → `quick` (T5) after both — 2 parallel + 1 sequential
- **FINAL**: `oracle` (F1), `unspecified-high` (F2, F3), `deep` (F4) — 4 parallel

---

## TODOs

- [x] 1. Create `scene-extraction.ts` Module

  **What to do**:
  - Create `src/lib/scene-extraction.ts` with `extractAndApplySceneState(sessionId: string, userId: string): Promise<void>`
  - Function flow:
    1. Fetch last 10 messages from session via `db.prepare("SELECT content, sender_id FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 10").all(sessionId)`
    2. Fetch current scene state via `db.prepare("SELECT * FROM scene_states WHERE session_id = ?").get(sessionId)`
    3. Build LLM prompt with messages + current scene state for continuity
    4. Call Ollama via `generateText()` with extraction prompt
    5. Parse JSON response, validate fields
    6. Upsert scene state via `db.prepare("INSERT INTO scene_states ... ON CONFLICT(session_id) DO UPDATE SET ...")`
  - LLM prompt structure:
    ```
    Extract the current scene state from these recent messages.
    Return JSON with: location, goal, emotional_tone, active_npcs (array), active_threads (array), scene_summary.
    
    Current scene state (for continuity, only update if messages indicate change):
    {current_scene_json}
    
    Recent messages:
    {messages_formatted}
    
    Return ONLY valid JSON, no markdown, no explanation.
    ```
  - Error handling: try/catch around LLM call — on failure, log warning and return without updating
  - No partial updates: if JSON parsing fails, keep existing values

  **Must NOT do**:
  - Do NOT use the job queue — this is inline execution
  - Do NOT add retry logic on LLM failure
  - Do NOT change the scene_states table schema
  - Do NOT add partial update logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New module with LLM integration, prompt engineering, DB operations, error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T2)
  - **Parallel Group**: Wave 1 (with T2)
  - **Blocks**: T3
  - **Blocked By**: None

  **References**:
  - `src/lib/ollama.ts:generateText()` — Ollama client function to call
  - `src/lib/retrieval.ts:getSceneContext()` — existing scene reading pattern (has format bug to fix in T2)
  - `src/app/api/sessions/[id]/scene/route.ts` — existing scene upsert pattern with COALESCE
  - `scripts/init-db.ts:110-120` — scene_states table schema
  - `src/lib/config.ts` — Ollama model config (use same model as generation)

  **Acceptance Criteria**:
  - [ ] `src/lib/scene-extraction.ts` created with `extractAndApplySceneState` function
  - [ ] Function fetches messages, calls LLM, parses JSON, upserts scene state
  - [ ] Error handling: LLM failure logs warning, no update applied
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Extraction module builds and exports correctly
    Tool: Bash
    Steps:
      1. Verify file exists: test -f src/lib/scene-extraction.ts
      2. Run: npx next build
    Expected Result: File exists, build exits 0
    Evidence: .omo/evidence/task-1-build-pass.txt

  Scenario: LLM failure handled gracefully
    Tool: Bash (mock test)
    Steps:
      1. Read extraction module source
      2. Verify try/catch around LLM call
      3. Verify catch block logs warning and returns without throwing
    Expected Result: Error handling present, no uncaught exceptions
    Evidence: .omo/evidence/task-1-error-handling.txt
  ```

  **Commit**: NO (groups with T3)

- [x] 2. Fix `active_npcs` Format Bug in `retrieval.ts`

  **What to do**:
  - In `src/lib/retrieval.ts` around line 80, `getSceneContext()` reads `active_npcs` as comma-separated string
  - But the API (`/api/sessions/[id]/scene`) writes it as JSON array
  - Fix: parse `active_npcs` as JSON if it starts with `[`, otherwise split by comma for backwards compatibility
  - Same fix for `active_threads` field
  - Code pattern:
    ```typescript
    const parseJsonOrSplit = (val: string | null): string[] => {
      if (!val) return [];
      if (val.startsWith("[")) {
        try { return JSON.parse(val); } catch { return []; }
      }
      return val.split(",").map(s => s.trim()).filter(Boolean);
    };
    ```

  **Must NOT do**:
  - Do NOT change the API write format (keep JSON arrays)
  - Do NOT break backwards compatibility with any existing comma-separated data

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single function fix with backwards compatibility
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T1)
  - **Parallel Group**: Wave 1 (with T1)
  - **Blocks**: T3 (needs correct scene reading for prompt assembly)
  - **Blocked By**: None

  **References**:
  - `src/lib/retrieval.ts:70-90` — `getSceneContext()` function with format bug
  - `src/app/api/sessions/[id]/scene/route.ts` — API writes JSON arrays

  **Acceptance Criteria**:
  - [ ] `active_npcs` parsed correctly as JSON array
  - [ ] `active_threads` parsed correctly as JSON array
  - [ ] Backwards compatible with comma-separated format
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: JSON array parsing works
    Tool: Bash
    Steps:
      1. Read retrieval.ts source
      2. Verify parseJsonOrSplit handles JSON arrays
      3. Verify parseJsonOrSplit handles comma-separated fallback
    Expected Result: Both formats handled correctly
    Evidence: .omo/evidence/task-2-parse-fix.txt
  ```

  **Commit**: NO (groups with T3)

- [x] 3. Integrate Extraction into Generate Route

  **What to do**:
  - In `src/app/api/generate/[id]/route.ts`, after AI response completes and message is saved:
    1. Import `extractAndApplySceneState` from `@/lib/scene-extraction`
    2. Call `await extractAndApplySceneState(sessionId, userId)` inline (not queued)
    3. On success, emit SSE event: `eventBus.emit(SessionEvents.SCENE_UPDATED, { sessionId })`
    4. On failure, log warning but continue (don't block response)
  - Place the call after the message content is fully saved but before the `generation:done` SSE event
  - Wrap in try/catch so LLM extraction failure doesn't break the generation flow

  **Must NOT do**:
  - Do NOT use `queueJob()` — this is inline execution
  - Do NOT block the response if extraction fails
  - Do NOT add extraction to the job queue

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration into critical generation flow, SSE event emission, error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T1 and T2)
  - **Parallel Group**: Wave 2 (after T1, T2)
  - **Blocks**: T5
  - **Blocked By**: T1, T2

  **References**:
  - `src/app/api/generate/[id]/route.ts:150-180` — end of generation flow, where to insert extraction call
  - `src/lib/event-bus.ts:251` — `SessionEvents.SCENE_UPDATED` definition
  - `src/lib/scene-extraction.ts` — T1 creates this module
  - `src/lib/retrieval.ts` — T2 fixes the format bug here

  **Acceptance Criteria**:
  - [ ] `extractAndApplySceneState` called inline after AI response
  - [ ] `SCENE_UPDATED` SSE event emitted on success
  - [ ] Extraction failure logged but doesn't break generation
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Extraction triggered after AI response
    Tool: Bash (code review)
    Steps:
      1. Read generate/[id]/route.ts
      2. Verify extractAndApplySceneState is called after message save
      3. Verify eventBus.emit(SessionEvents.SCENE_UPDATED, ...) is called
      4. Verify try/catch around extraction call
    Expected Result: Integration correct, error handling present
    Evidence: .omo/evidence/task-3-integration.txt
  ```

  **Commit**: NO (groups with T4, T5)

- [x] 4. Wire SSE Event for Client Refresh

  **What to do**:
  - In `src/app/(app)/session/[id]/page.tsx` around line 230, add `"scene:updated"` to the `allEvents` array
  - Current pattern (line 230):
    ```typescript
    const allEvents = ["message:created", "message:updated", ..., "generation:done"];
    ```
  - Add `"scene:updated"` to this array so the SSE listener triggers `refreshSession()` when scene state changes
  - No other changes needed — `refreshSession()` already re-fetches scene state via `GET /api/sessions/[id]`

  **Must NOT do**:
  - Do NOT change the `refreshSession()` function
  - Do NOT add separate scene state polling
  - Do NOT modify the `useSession` hook

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line addition to event array
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T3 — only needs event name which already exists)
  - **Parallel Group**: Wave 2 (with T3)
  - **Blocks**: T5
  - **Blocked By**: None

  **References**:
  - `src/app/(app)/session/[id]/page.tsx:225-235` — SSE listener and `allEvents` array
  - `src/lib/event-bus.ts:251` — `SCENE_UPDATED` event definition

  **Acceptance Criteria**:
  - [ ] `"scene:updated"` added to `allEvents` array
  - [ ] SSE listener triggers refresh on scene update
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: SSE event wiring correct
    Tool: Bash (code review)
    Steps:
      1. Read session/[id]/page.tsx
      2. Verify "scene:updated" in allEvents array
      3. Verify refreshSession() is called on this event
    Expected Result: Event wiring correct
    Evidence: .omo/evidence/task-4-sse-wiring.txt
  ```

  **Commit**: NO (groups with T3, T5)

- [x] 5. Build Verification + Smoke Test

  **What to do**:
  - Run `npx next build` and verify it passes
  - Verify all changed files compile without errors
  - Verify no TypeScript errors in extraction module
  - Verify SSE event import is correct in generate route

  **Must NOT do**:
  - Do NOT modify any code in this task — only verify

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Build verification only
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T3, T4)
  - **Parallel Group**: Wave 2 (after T3, T4)
  - **Blocks**: None
  - **Blocked By**: T3, T4

  **References**:
  - All changed files from T1-T4

  **Acceptance Criteria**:
  - [ ] `npx next build` passes with zero errors
  - [ ] No TypeScript errors in any changed file

  **QA Scenarios**:
  ```
  Scenario: Build passes
    Tool: Bash
    Steps:
      1. Run: npx next build
    Expected Result: Build exits 0, no errors
    Evidence: .omo/evidence/task-5-build-pass.txt
  ```

  **Commit**: YES
  - Message: `feat(scene): auto-extract scene state after AI response`
  - Files: `src/lib/scene-extraction.ts`, `src/app/api/generate/[id]/route.ts`, `src/app/(app)/session/[id]/page.tsx`, `src/lib/event-bus.ts`, `src/lib/retrieval.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [x] F1. **Plan Compliance Audit** — `oracle` — APPROVE
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high` — APPROVE
  Run `npx next build` + linter. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI) — APPROVE
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep` — APPROVE
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `feat(scene): auto-extract scene state after AI response` — `scene-extraction.ts`, `generate/[id]/route.ts`, `session/[id]/page.tsx`, `event-bus.ts`, `retrieval.ts`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: ✓ Compiled successfully
```

### Final Checklist
- [ ] Scene state updates automatically after each AI response
- [ ] All 5 fields extracted and applied
- [ ] SSE event triggers client refresh
- [ ] SceneStatePanel shows updated values
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `npx next build` passes
