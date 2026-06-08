# Chat Flow Audit Fix

## TL;DR

> **Quick Summary**: Fix 7 categories of defects from the chat-flow audit: redundant refreshSession calls, loading flicker, empty AI placeholders on stream failure, missing SSE event on scene PUT, wrong event type on role change, dead response-handler code, and SCENE_UPDATED emit placement.
>
> **Deliverables**:
> - In-flight guard in `useSession` (prevents concurrent fetches)
> - Empty AI placeholder deleted on stream failure in generate route
> - `scene:updated` SSE event emitted from scene PUT route
> - `PARTICIPANT_ROLE_CHANGED` event type added, role route fixed
> - 6 redundant manual `refreshSession()` calls removed from page.tsx
> - `response-handler.ts` + `generate_response` job type removed
> - `SCENE_UPDATED` emit moved outside try/catch in generate route
>
> **Estimated Effort**: Small (9 tasks, all straightforward)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T8 (manual refresh removal) depends on T1 (in-flight guard) being in place first

---

## Context

### Original Request
"can you do a full audit on the chat and flow" → "make a full plan"

### Audit Summary
The chat-flow audit identified 11 issues across the message pipeline. Key findings:
- **4-5x redundant refreshSession()** per exchange — each fetching ALL session data
- **loading=true flashes** on every refresh, compounded by concurrent calls
- **Empty AI message placeholders** persist if Ollama stream fails mid-generation
- **Scene PUT route** updates DB silently — no SSE event emitted to other clients
- **Role change route** emits `PARTICIPANT_INVITED` instead of a role-specific event
- **response-handler.ts** is dead code — `generate_response` job never queued in normal flow
- **SCENE_UPDATED emit** is inside a try/catch — swallowed if extraction fails

### Metis Review
**Additional findings incorporated**:
- A1: refreshAll() (app-context) fires 3 extra concurrent API calls — IN SCOPE
- A2: SCENE_UPDATED emit swallowed by try/catch — IN SCOPE
- A3: handleRegenerate cascade — IN SCOPE (mitigated by in-flight guard + batch fix)
- A4: handleSend cascade — IN SCOPE (mitigated by in-flight guard)

---

## Work Objectives

### Core Objective
Fix the 7 redundant-refresh, missing-event, error-handling, and loading-flicker defects identified in the chat-flow audit, and nothing else.

### Concrete Deliverables
- In-flight guard added to `useSession.refresh()` — prevents concurrent fetches
- Empty AI placeholder message deleted in generate route catch block
- `scene:updated` event emitted from scene PUT route
- `PARTICIPANT_ROLE_CHANGED` event added to `SessionEvents` enum, role route fixed, SSE listener added
- 6 redundant `refreshSession()` calls removed from page.tsx
- `response-handler.ts` removed, `generate_response` removed from job-processor
- `SCENE_UPDATED` emit moved outside try/catch in generate route

### Definition of Done
- [ ] `npx next build` passes (zero errors)
- [ ] Sending a message triggers exactly 1-2 `refreshSession()` calls (not 4-5)
- [ ] Loading state does not flash during message exchange
- [ ] Failed Ollama stream does not leave empty AI messages in DB
- [ ] Saving scene state emits `scene:updated` SSE event
- [ ] Changing a participant's role emits correct event type
- [ ] No `generate_response` references remain in job-processor

### Must Have
- In-flight guard in useSession hook
- Empty placeholder cleanup on stream failure
- Scene PUT route emits SSE event
- Role change route emits correct event
- Redundant manual refreshSession calls removed
- SCENE_UPDATED emit outside try/catch

### Must NOT Have (Guardrails)
- NO new features or architectural changes
- NO DB schema changes
- NO new npm dependencies
- NO heartbeat constant rename
- NO batch delete event changes (per-message events remain)
- NO new SSE listener types for thread/job/progress events

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None
- **Agent-Executed QA**: Mandatory for all tasks

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Hook changes**: Read the modified file, verify in-flight guard logic
- **Route changes**: Build check + curl-based behavior verification if dev server available
- **SSE events**: Build check + read the route to confirm event emission
- **Removal tasks**: Grep for removed code, verify zero references remain

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Internal-only fixes — no user-facing change, all parallel):
├── T1: In-flight guard in useSession [quick]
├── T2: Empty AI placeholder cleanup on stream failure [quick]
├── T3: Move SCENE_UPDATED emit outside try/catch [quick]
└── T4: Remove response-handler.ts + generate_response job type [quick]

Wave 2 (SSE/event fixes — all parallel):
├── T5: Add SSE event emission to scene PUT route [quick]
├── T6: Fix role route event type + add new event to enum [quick]
└── T7: Add PARTICIPANT_ROLE_CHANGED to SSE listener in stream route [quick]

Wave 3 (Refresh reduction — depends on T1, T4):
├── T8: Remove 6 redundant manual refreshSession() calls from page.tsx [unspecified-high]
└── T9: Build + smoke test [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── F1: Plan Compliance Audit (oracle)
├── F2: Code Quality Review (unspecified-high)
├── F3: Real Manual QA (unspecified-high)
└── F4: Scope Fidelity Check (deep)
```

### Dependency Matrix
- T1-T4: No deps on each other — Wave 1 parallel
- T5-T7: No deps on each other — Wave 2 parallel, blocked by nothing
- T8: Blocked by T1 (in-flight guard must exist before removing manual refreshes)
- T9: Blocked by T8 + T1-T7 (all changes must be in place)

### Agent Dispatch Summary
- **Wave 1**: 4 tasks — T1→`quick`, T2→`quick`, T3→`quick`, T4→`quick`
- **Wave 2**: 3 tasks — T5→`quick`, T6→`quick`, T7→`quick`
- **Wave 3**: 2 tasks — T8→`unspecified-high`, T9→`unspecified-high`
- **FINAL**: 4 reviews — F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`

---

## TODOs

- [x] 1. Add in-flight guard to `useSession.refresh()`

  **What to do**:
  - In `src/hooks/use-session.ts`, add a `useRef<boolean>` to track whether a refresh is in-flight
  - In the `refresh()` callback: if `pending.current` is true, return early (skip the redundant call)
  - Set `pending.current = true` at the start of the fetch, set to `false` in the `finally` block
  - The ref prevents concurrent refresh calls from stacking — the first one runs, subsequent ones are silently dropped

  **Must NOT do**:
  - Do NOT add any debouncing or setTimeout logic
  - Do NOT change the refresh function signature
  - Do NOT remove the existing `setLoading(true)` call (it still runs for the first fetch)

  **Recommended Agent Profile**: `quick` — single hook modification
  **Parallelization**: Wave 1, with T2-T4 | Blocks: T8 | Blocked By: None

  **Acceptance Criteria**:
  - [ ] `useRef<boolean>` added to `useSession`
  - [ ] `refresh()` skips if `pending.current` is true
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: In-flight guard prevents concurrent refreshes
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/hooks/use-session.ts — confirm useRef<boolean> and guard logic
      2. Run npx next build
    Expected Result: Build passes. Guard logic is correct.
    Evidence: .omo/evidence/task-1-inflight-guard.txt
  ```

- [x] 2. Clean up empty AI message placeholder on stream failure

  **What to do**:
  - In `src/app/api/generate/[id]/route.ts`, in the `catch` block of the stream's `start()` method (lines 288-298):
  - Before the error response, add: `db.prepare("DELETE FROM messages WHERE id = ?").run(aiMessageId);`
  - This ensures that if the Ollama stream fails after the placeholder was inserted but before any content was written, the empty message is cleaned up
  - Also ensure the controller is closed properly (already done)

  **Must NOT do**:
  - Do NOT change the success flow — only the catch block
  - Do NOT emit any SSE events for the deletion (the message was never visible)

  **Recommended Agent Profile**: `quick` — single line addition in catch block
  **Parallelization**: Wave 1, with T1, T3-T4 | Blocks: T9 | Blocked By: None

  **Acceptance Criteria**:
  - [ ] `DELETE FROM messages` is called in the catch block
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Failed stream cleans up placeholder
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/app/api/generate/[id]/route.ts — confirm DELETE in catch block
      2. Run npx next build
    Expected Result: Build passes. Cleanup logic present.
    Evidence: .omo/evidence/task-2-empty-placeholder-cleanup.txt
  ```

- [x] 3. Move SCENE_UPDATED emit outside try/catch in generate route

  **What to do**:
  - In `src/app/api/generate/[id]/route.ts`, lines 222-229:
  - The `extractAndApplySceneState` call is wrapped in try/catch, but the `eventBus.emit(SCENE_UPDATED)` is inside the try block
  - Move the emit outside the try/catch so it always fires after extraction attempt:
  ```typescript
  try {
    await extractAndApplySceneState(sessionId, decoded.sub);
  } catch (err: unknown) {
    // Extraction failure should not break generation flow
  }
  eventBus.emit(`${SessionEvents.SCENE_UPDATED}:${sessionId}`, { sessionId });
  ```

  **Must NOT do**:
  - Do NOT remove the try/catch around the extraction call
  - Do NOT change the extraction logic itself

  **Recommended Agent Profile**: `quick` — move emit statement outside try/catch
  **Parallelization**: Wave 1, with T1-T2, T4 | Blocks: T9 | Blocked By: None

  **Acceptance Criteria**:
  - [ ] `SCENE_UPDATED` emit is outside the try/catch block
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: SCENE_UPDATED emit fires regardless of extraction result
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/app/api/generate/[id]/route.ts around line 222-229
      2. Confirm emit is after the closing brace of try/catch
      3. Run npx next build
    Expected Result: Build passes. Emit is unconditional.
    Evidence: .omo/evidence/task-3-scene-updated-emit.txt
  ```

- [x] 4. Remove dead response-handler.ts + generate_response job type

  **What to do**:
  **File 1: `src/lib/jobs/response-handler.ts`** — Delete the entire file
  **File 2: `src/lib/job-processor.ts`**:
    - Remove `"generate_response"` from the `JobType` union (line 41)
    - Remove the `case "generate_response":` block (line 313)
  **File 3: `src/lib/idle-processing.ts`** — Remove line 179: `processJobsByType(userId, "generate_response", 5);`
  **File 4: `src/app/api/jobs/route.ts`** — Remove `"generate_response"` from job type list (line 67)
  **File 5: `src/app/(app)/jobs/page.tsx`** — Remove `"generate_response"` from job type display (line 29)

  **Must NOT do**:
  - Do NOT remove other job types from any of these files
  - Do NOT modify the generate job handler for other job types

  **Recommended Agent Profile**: `quick` — 5 file modifications, all mechanical
  **Parallelization**: Wave 1, with T1-T3 | Blocks: T8 (safe to remove refreshes knowing no duplicate generation path exists) | Blocked By: None

  **Acceptance Criteria**:
  - [ ] `response-handler.ts` file deleted
  - [ ] No `generate_response` references in job-processor.ts
  - [ ] No `generate_response` references in idle-processing.ts
  - [ ] No `generate_response` references in jobs/route.ts or jobs/page.tsx
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: generate_response removed
    Tool: Bash
    Preconditions: None
    Steps:
      1. Confirm src/lib/jobs/response-handler.ts does not exist
      2. grep -rn "generate_response" src/ — confirm zero references
      3. Run npx next build
    Expected Result: Build passes. Zero generate_response references.
    Evidence: .omo/evidence/task-4-response-handler-removed.txt
  ```

- [x] 5. Add SSE event emission to scene PUT route

  **What to do**:
  - In `src/app/api/sessions/[id]/scene/route.ts`, after the DB update succeeds (around line 120), add:
  ```typescript
  import { eventBus, SessionEvents } from "@/lib/event-bus";
  // After successful DB update:
  eventBus.emit(`${SessionEvents.SCENE_UPDATED}:${sessionId}`, { sessionId });
  ```
  - This emits a `scene:updated` event after the scene state is saved, so all connected clients receive the update in real-time.
  - Check if `eventBus` and `SessionEvents` are already imported in this file.

  **Must NOT do**:
  - Do NOT change the scene save logic.
  - Do NOT emit the event if the DB update fails.

  **Recommended Agent Profile**: `quick` — single event emission added
  **Parallelization**: Wave 2, with T6-T7 | Blocks: T9 | Blocked By: None

  **Acceptance Criteria**:
  - [ ] `eventBus.emit(SCENE_UPDATED)` is called after successful DB update
  - [ ] Required imports are present
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Scene PUT emits SSE event
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/app/api/sessions/[id]/scene/route.ts
      2. Confirm eventBus.emit is called after DB update
      3. Run npx next build
    Expected Result: Build passes. Scene event emitted.
    Evidence: .omo/evidence/task-5-scene-event.txt
  ```

- [x] 6. Fix role route event type + add new event to enum

  **What to do**:
  **File 1: `src/lib/event-bus.ts`** — Add to `SessionEvents`:
  ```typescript
  PARTICIPANT_ROLE_CHANGED: "participant:role_changed",
  ```

  **File 2: `src/app/api/sessions/[id]/participants/role/route.ts`** — Change the event type from `PARTICIPANT_INVITED` to `PARTICIPANT_ROLE_CHANGED`.

  **Must NOT do**:
  - Do NOT change any other event types.
  - Do NOT remove `PARTICIPANT_INVITED` from the enum (still used by invite route).

  **Recommended Agent Profile**: `quick` — consistent enum pattern
  **Parallelization**: Wave 2, with T5, T7 | Blocks: T9 | Blocked By: None

  **Acceptance Criteria**:
  - [ ] `PARTICIPANT_ROLE_CHANGED` added to `SessionEvents` in event-bus.ts
  - [ ] Role route emits `PARTICIPANT_ROLE_CHANGED` instead of `PARTICIPANT_INVITED`
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Role change emits correct event
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/lib/event-bus.ts — confirm PARTICIPANT_ROLE_CHANGED in SessionEvents
      2. Read src/app/api/sessions/[id]/participants/role/route.ts — confirm new event type
      3. Run npx next build
    Expected Result: Build passes. Correct event emitted.
    Evidence: .omo/evidence/task-6-role-event.txt
  ```

- [x] 7. Add PARTICIPANT_ROLE_CHANGED to SSE listener in stream route

  **What to do**:
  - In `src/app/api/sessions/[id]/stream/route.ts`, add `SessionEvents.PARTICIPANT_ROLE_CHANGED` to the `eventTypes` array (near the other participant events).

  **Must NOT do**:
  - Do NOT remove any existing event types from the array.
  - Do NOT add event types not yet in scope.

  **Recommended Agent Profile**: `quick` — add one entry to existing array
  **Parallelization**: Wave 2, with T5-T6 | Blocks: T9 | Blocked By: None

  **Acceptance Criteria**:
  - [ ] `SessionEvents.PARTICIPANT_ROLE_CHANGED` is in the eventTypes array
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: SSE forwards role change events
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/app/api/sessions/[id]/stream/route.ts
      2. Confirm PARTICIPANT_ROLE_CHANGED in eventTypes array
      3. Run npx next build
    Expected Result: Build passes. Event forwarded via SSE.
    Evidence: .omo/evidence/task-7-sse-role-event.txt
  ```

- [x] 8. Remove 6 redundant manual refreshSession() calls from page.tsx

  **What to do**:
  - In `src/app/(app)/session/[id]/page.tsx`, remove the following `await refreshSession()` calls (each is redundant because the corresponding server action already emits an SSE event that triggers refreshSession via the listener at line 259):
    - Line 313: `handleKick()` — covered by SSE `participant:kicked`
    - Line 330: `handleSetTurnMode()` — covered by SSE `turn:updated`
    - Line 349: `handleRoleChange()` — covered by SSE `participant:role_changed` (after T6 fix)
    - Line 505: `handleDelete()` — covered by SSE `message:deleted`
    - Line 524: `handleRegenerate()` fallback — covered by SSE `message:deleted`
    - Line 948: Character declaration modal `onJoin` — covered by SSE `participant:joined`
  - Keep `triggerGeneration` calls at lines 358 and 406/419 (pre-fetch for LLM context, and stream done fallback)
  - Keep `handleSceneSave` at line 658 (scene PUT emits no SSE event until T5 fix — once T5 is done, this can also be removed, but keep for safety until verified)

  **Must NOT do**:
  - Do NOT remove `handleSceneSave` refresh (line 658) — not covered by SSE until T5 is verified
  - Do NOT remove the initial `useEffect` mount refresh in useSession.ts:120

  **Recommended Agent Profile**: `unspecified-high` — careful removals, need to verify each is safe
  **Parallelization**: Wave 3, with T9 | Blocks: T9 | Blocked By: T1 (in-flight guard must be in place before removing manual refreshes)

  **Acceptance Criteria**:
  - [ ] 6 `refreshSession()` calls removed from `page.tsx`
  - [ ] `handleSceneSave` call (line 658) remains
  - [ ] `triggerGeneration` calls (lines 358, 406, 419) remain
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Redundant refreshes removed, essential ones remain
    Tool: Bash
    Preconditions: T1 (in-flight guard) complete
    Steps:
      1. Read src/app/(app)/session/[id]/page.tsx
      2. Confirm lines 313, 330, 349, 505, 524, 948 no longer have refreshSession()
      3. Confirm line 658 (handleSceneSave) still has refreshSession()
      4. Confirm lines 358, 406, 419 (triggerGeneration) still have refreshSession()
      5. Run npx next build
    Expected Result: Build passes. Only 4 essential refreshSession calls remain.
    Evidence: .omo/evidence/task-8-refresh-calls-removed.txt
  ```

- [x] 9. Build verification + smoke test

  **What to do**:
  - Run `npx next build` and confirm zero errors
  - Verify all 9 tasks are complete and all changed files compile
  - Quick sanity check:
    - `grep -rn "generate_response" src/` — expect zero matches
    - `grep -rn "pending.current" src/hooks/use-session.ts` — expect 1+ matches (in-flight guard)
    - `grep -rn "PARTICIPANT_ROLE_CHANGED" src/lib/event-bus.ts` — expect 1 match (new event type)
    - `grep -rn "PARTICIPANT_ROLE_CHANGED" src/app/api/sessions/` — expect 1+ matches (emitted in role route, listened in stream route)

  **Must NOT do**:
  - Do NOT skip the build verification
  - Do NOT modify any files during this task

  **Recommended Agent Profile**: `unspecified-high` — build verification + grep checks
  **Parallelization**: Wave 3 | Blocks: Final Wave | Blocked By: T1-T8

  **Acceptance Criteria**:
  - [ ] `npx next build` passes (zero errors)
  - [ ] Zero `generate_response` references exist
  - [ ] In-flight guard present in use-session.ts
  - [ ] PARTICIPANT_ROLE_CHANGED defined in event-bus.ts and used in routes

  **QA Scenarios**:
  ```
  Scenario: Full build passes after all fixes
    Tool: Bash
    Preconditions: All T1-T8 complete
    Steps:
      1. npx next build 2>&1 | Select-String "Compiled successfully"
      2. grep -rn "generate_response" src/
      3. grep -rn "pending.current" src/hooks/use-session.ts
      4. grep -rn "PARTICIPANT_ROLE_CHANGED" src/lib/event-bus.ts
    Expected Result: ✓ Compiled successfully. Zero generate_response references.
    Evidence: .omo/evidence/task-9-build-passed.txt
  ```

---

## Final Verification Wave (MANDATORY)

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for violations. Check evidence files exist.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx next build`. Review for `as any`, `@ts-ignore`, empty catches, `console.log` in production code.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Verify: message send triggers correct number of refreshes, loading doesn't flash, empty AI placeholders cleaned up, scene updates propagate via SSE, role changes emit correct event.
  Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 mapping. Check "Must NOT do" compliance.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- T1: `fix(chat): add in-flight guard to useSession.refresh()`
- T2: `fix(chat): delete empty AI message placeholder on stream failure`
- T3: `fix(chat): move SCENE_UPDATED emit outside try/catch`
- T4: `chore(chat): remove dead response-handler.ts and generate_response job type`
- T5: `fix(chat): emit scene:updated from scene PUT route`
- T6: `fix(chat): emit PARTICIPANT_ROLE_CHANGED from role change route`
- T7: `fix(chat): add PARTICIPANT_ROLE_CHANGED to SSE listener`
- T8: `fix(chat): remove 6 redundant manual refreshSession calls`
- T9: `chore(chat): build verification + smoke test`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: ✓ Compiled successfully, zero errors
```

### Final Checklist
- [ ] In-flight guard prevents concurrent refresh fetches
- [ ] Failed Ollama stream cleans up empty placeholder
- [ ] Scene PUT route emits `scene:updated` SSE event
- [ ] Role change route emits `PARTICIPANT_ROLE_CHANGED` event
- [ ] 6 redundant refreshSession() calls removed
- [ ] No `generate_response` references remain
- [ ] `SCENE_UPDATED` emit outside try/catch
- [ ] `npx next build` passes
