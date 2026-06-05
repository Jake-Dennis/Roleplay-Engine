# Chat UX Overhaul — Animations, Layout, Streaming Polish

## TL;DR

> **Quick Summary**: Fix chat layout so input stays pinned at bottom with scrollable history, add fade-in + slide-up entrance animations for messages, remove redundant typing indicator during streaming, add streaming progress indicator, and clean up dead code.
> 
> **Deliverables**:
> - `globals.css` — custom `@keyframes` for message entrance
> - `chat-window.tsx` — flex layout restructure, message animation classes, remove dead duplicate "use client"
> - `session/[id]/page.tsx` — hide typing indicator during streaming, delete dead scrollToBottom, smooth auto-scroll
> - `streaming-text.tsx` — add word count + elapsed time progress indicator
> - Delete `message-bubble.tsx` and `message-input.tsx` (dead code)
> 
> **Estimated Effort**: Medium (7 tasks)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (keyframes) → T2 (layout + animations) → T3 (streaming polish) → T4-T6 (cleanup) → F1-F4

---

## Context

### Original Request
User said "yes plan it all i also want the chat input to stay at the bottom and make the chat history scoll"

### Investigation Summary
Full chat flow mapped via explore agents:
- Message pipeline: user send → DB save → SSE broadcast → AI generation stream → client renders
- SSE architecture: EventBus singleton, EventSource client, 13 event types, 30s heartbeat
- Animations: `animate-bounce` (typing dots), `animate-spin` (loaders), custom 30fps cursor blink, `transition-opacity` (hover-reveal buttons)
- No custom `@keyframes` exist — all Tailwind built-ins

### Issues Found
1. No message entrance animations
2. Auto-scroll is instant (`behavior: "auto"`), smooth variant is dead code
3. Typing indicator + streaming cursor shown simultaneously (redundant)
4. No streaming progress indicator
5. Chat input not fixed at bottom — whole page scrolls
6. Dead code: `message-bubble.tsx`, `message-input.tsx`
7. Duplicate `"use client"` in `chat-window.tsx` (lines 1 and 23)

### Metis Review
**Identified Gaps** (addressed):
- Progress indicator undefined → Default: word count + elapsed time
- Typing indicator timing → Hide entirely during streaming
- `scrollToBottom` fate → Delete dead function, use render-loop with smooth behavior
- Animation scope → Only new messages, not initial load
- SSE refresh + animation → Final DB message should NOT animate
- Dead code list → Explicitly enumerate all deletions

---

## Work Objectives

### Core Objective
Polish chat UX: proper scrollable layout, smooth message animations, clean streaming experience, remove dead code.

### Concrete Deliverables
- `src/app/globals.css` — `@keyframes messageSlideIn`
- `src/components/chat/chat-window.tsx` — layout restructure + animation classes
- `src/app/(app)/session/[id]/page.tsx` — typing indicator logic + smooth scroll
- `src/components/chat/streaming-text.tsx` — progress indicator
- Delete `src/components/chat/message-bubble.tsx`
- Delete `src/components/chat/message-input.tsx`

### Definition of Done
- [ ] Chat input pinned at bottom, message history scrolls independently
- [ ] New messages fade-in + slide-up on appearance
- [ ] Typing indicator hidden during streaming
- [ ] Streaming shows word count + elapsed time
- [ ] Dead code files deleted, build passes
- [ ] `npx next build` passes

### Must Have
- Input always visible at bottom of viewport
- Smooth message entrance animations
- Clean streaming experience (no redundant indicators)
- Zero build errors after dead code removal

### Must NOT Have (Guardrails)
- Do NOT change ChatWindow prop interface
- Do NOT break render-loop auto-scroll (messagesEndRef must work)
- Do NOT modify streaming-text.tsx cursor DOM manipulation
- Do NOT change spacing, padding, colors, or responsive breakpoints
- Do NOT add `tailwind.config.*` — use `globals.css` only
- Do NOT animate messages on initial page load
- Do NOT animate final message from SSE refresh (replaces streaming placeholder)

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
- Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — keyframes + layout):
├── T1: Add @keyframes to globals.css [quick]
└── T2: Restructure ChatWindow layout + message animations [visual-engineering]

Wave 2 (Streaming polish — depends: T2):
├── T3: Hide typing indicator during streaming [quick]
├── T4: Add streaming progress indicator [quick]
└── T5: Fix auto-scroll to smooth behavior [quick]

Wave 3 (Cleanup — independent):
├── T6: Delete dead code files [quick]
└── T7: Fix duplicate "use client" in chat-window.tsx [quick]

Wave FINAL (4 parallel reviews):
├── F1: Plan compliance (oracle)
├── F2: Code quality (unspecified-high)
├── F3: Manual QA (unspecified-high + playwright)
└── F4: Scope fidelity (deep)
```

### Dependency Matrix
- **T1**: - → T2
- **T2**: T1 → T3, T4, T5
- **T3**: T2 → -
- **T4**: T2 → -
- **T5**: T2 → -
- **T6**: - → -
- **T7**: - → -

### Agent Dispatch Summary
- **Wave 1**: `quick` (T1), `visual-engineering` (T2)
- **Wave 2**: `quick` (T3, T4, T5)
- **Wave 3**: `quick` (T6, T7)
- **FINAL**: `oracle` (F1), `unspecified-high` (F2, F3), `deep` (F4)

---

## TODOs

- [x] 1. Add `@keyframes` Message Entrance Animation to `globals.css`

  **What to do**:
  - In `src/app/globals.css`, add a `@keyframes messageSlideIn` animation:
    ```css
    @keyframes messageSlideIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    ```
  - Add a utility class `.animate-message-slide` that uses this keyframe with `200ms` duration and `ease-out` timing.

  **Must NOT do**:
  - Do NOT create `tailwind.config.*` — use CSS-first approach
  - Do NOT add other animations

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple CSS addition, no complex logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T2, T6, T7)
  - **Parallel Group**: Wave 1 (with T2)
  - **Blocks**: T2 (needs the keyframe to reference)
  - **Blocked By**: None

  **References**:
  - `src/app/globals.css` — Tailwind v4 `@theme` block, add `@keyframes` after theme section
  - No custom `@keyframes` currently exist — this will be the first

  **Acceptance Criteria**:
  - [ ] `@keyframes messageSlideIn` defined in globals.css
  - [ ] `.animate-message-slide` utility class available
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Keyframes defined and build passes
    Tool: Bash (grep + build)
    Steps:
      1. Grep for "@keyframes messageSlideIn" in globals.css
      2. Run: npx next build
    Expected Result: Keyframe found, build exits 0
    Evidence: .omo/evidence/task-1-build-pass.txt
  ```

  **Commit**: NO (groups with T2)

- [x] 2. Restructure ChatWindow Layout + Message Entrance Animations

  **What to do**:
  - In `src/components/chat/chat-window.tsx`:
    - Wrap the fragment `<>...</>` return in a `<div className="flex flex-col h-full">` container so that `flex-1` on the messages area actually works
    - The messages div (`flex-1 overflow-y-auto py-4`) should scroll independently
    - The input area div (`border-t border-border-default pt-3`) stays pinned at bottom
    - Add `animate-message-slide` class to each message wrapper (MessageItem and streaming message div)
    - Use a `Set` of `seenMessageIds` ref to track which messages have already animated — only apply animation to NEW messages (not on initial load)
    - Remove the duplicate `"use client"` directive (lines 1 and 23 — keep only line 1)

  **Must NOT do**:
  - Do NOT change any ChatWindow props
  - Do NOT modify spacing, padding, or colors
  - Do NOT change the MessageItem component structure beyond adding animation class

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI layout restructure, flex container, CSS animation integration
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T1 for keyframe)
  - **Parallel Group**: Wave 1 (after T1)
  - **Blocks**: T3, T4, T5
  - **Blocked By**: T1

  **References**:
  - `src/components/chat/chat-window.tsx:243-360` — current fragment return, needs flex wrapper
  - `src/components/chat/chat-window.tsx:246` — messages div with `flex-1 overflow-y-auto`
  - `src/components/chat/chat-window.tsx:313` — input area div
  - `src/components/chat/chat-window.tsx:1-23` — duplicate "use client" to remove
  - `src/app/globals.css` — T1 adds the keyframe

  **Acceptance Criteria**:
  - [ ] ChatWindow wraps content in `flex flex-col h-full` div
  - [ ] Messages area scrolls independently (`overflow-y-auto`)
  - [ ] Input area pinned at bottom (not scrollable)
  - [ ] New messages have `animate-message-slide` class
  - [ ] Messages on initial load do NOT animate (seenMessageIds ref tracks this)
  - [ ] Duplicate "use client" removed
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Layout — input pinned at bottom, messages scroll
    Tool: Playwright
    Preconditions: npx next dev running, logged in, session with 20+ messages exists
    Steps:
      1. Navigate to session page with many messages
      2. Assert: input textarea boundingClientRect.bottom <= window.innerHeight
      3. Assert: messages container has overflow-y: auto (or scroll)
      4. Scroll messages container up, assert input stays visible
    Expected Result: Input always visible at bottom, messages scroll independently
    Evidence: .omo/evidence/task-2-layout.png

  Scenario: Message entrance animation on new message
    Tool: Playwright
    Steps:
      1. Navigate to session page
      2. Send a test message
      3. Assert: new message element has animation applied (check computed style or class)
      4. Wait 250ms, assert animation completed (opacity=1, transform=none)
    Expected Result: Message fades in and slides up over ~200ms
    Evidence: .omo/evidence/task-2-animation.png

  Scenario: No animation on initial page load
    Tool: Playwright
    Steps:
      1. Navigate to session page with existing messages
      2. Assert: no message elements have animation class or running animation
    Expected Result: Existing messages appear instantly without animation
    Evidence: .omo/evidence/task-2-no-initial-animation.png
  ```

  **Commit**: YES
  - Message: `feat(chat): restructure layout, add message entrance animations, remove duplicate use client`
  - Files: `src/components/chat/chat-window.tsx`, `src/app/globals.css`

- [x] 3. Hide Typing Indicator During Streaming

  **What to do**:
  - In `src/app/(app)/session/[id]/page.tsx`:
    - The `TypingIndicator` currently renders when `streaming` is true (line 838)
    - Change condition: only show TypingIndicator when `streaming` is true AND `streamContent` is empty (waiting for first token)
    - Once streaming content appears, hide the typing indicator — the cursor in StreamingText is sufficient
    - Condition: `{streaming && !streamContent && <TypingIndicator />}`

  **Must NOT do**:
  - Do NOT modify TypingIndicator component itself
  - Do NOT change streaming behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line condition change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T4, T5 — all depend on T2 but not each other)
  - **Parallel Group**: Wave 2 (with T4, T5)
  - **Blocks**: None
  - **Blocked By**: T2

  **References**:
  - `src/app/(app)/session/[id]/page.tsx:838` — `{streaming && <TypingIndicator />}`
  - `src/app/(app)/session/[id]/page.tsx:106` — `streamContent` state variable
  - `src/components/chat/typing-indicator.tsx` — component to keep unchanged

  **Acceptance Criteria**:
  - [ ] TypingIndicator hidden when streamContent has content
  - [ ] TypingIndicator still shows during initial wait (streaming=true, streamContent="")
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Typing indicator hidden during active streaming
    Tool: Playwright
    Steps:
      1. Navigate to session page
      2. Send a message
      3. Wait for streaming to start (streamContent non-empty)
      4. Assert: "Narrator is thinking..." text is NOT visible
      5. Assert: streaming cursor IS visible
    Expected Result: Only streaming cursor visible, no typing dots
    Evidence: .omo/evidence/task-3-no-typing-during-stream.png
  ```

  **Commit**: NO (groups with T4, T5)

- [x] 4. Add Streaming Progress Indicator

  **What to do**:
  - In `src/components/chat/streaming-text.tsx`:
    - Add a progress indicator below the streaming content showing word count and elapsed time
    - Track elapsed time with a `useRef` for start time and `useState` for display
    - Use `useRenderLoop` to update elapsed time display every frame (or use `setInterval` for simplicity at 1s)
    - Display format: `{wordCount} words · {elapsed}s` (e.g., "47 words · 2.3s")
    - Only show while `isStreaming` is true
    - Style: small text, muted color, below the content area

  **Must NOT do**:
  - Do NOT modify the cursor blink logic (direct DOM manipulation at cursorRef)
  - Do NOT change the text rendering

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small addition to existing component
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T3, T5)
  - **Parallel Group**: Wave 2 (with T3, T5)
  - **Blocks**: None
  - **Blocked By**: T2 (StreamingText is rendered inside ChatWindow)

  **References**:
  - `src/components/chat/streaming-text.tsx` — existing component with cursor logic
  - `src/hooks/use-render-loop.ts` — available for time updates (or use setInterval)
  - `src/app/(app)/session/[id]/page.tsx:106` — streamContent state

  **Acceptance Criteria**:
  - [ ] Progress indicator visible during streaming
  - [ ] Shows word count (split by whitespace, filter empty)
  - [ ] Shows elapsed time in seconds (1 decimal place)
  - [ ] Hidden when not streaming
  - [ ] Does not interfere with cursor blink
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Progress indicator visible during streaming
    Tool: Playwright
    Steps:
      1. Navigate to session page
      2. Send a message that triggers streaming
      3. Wait for streaming content to appear
      4. Assert: element matching pattern "[0-9]+ words · [0-9]+\.[0-9]s" is visible
    Expected Result: Progress indicator shows word count and elapsed time
    Evidence: .omo/evidence/task-4-progress-indicator.png
  ```

  **Commit**: NO (groups with T3, T5)

- [x] 5. Fix Auto-Scroll to Smooth Behavior

  **What to do**:
  - In `src/app/(app)/session/[id]/page.tsx`:
    - Change the render-loop auto-scroll from `behavior: "auto"` to `behavior: "smooth"` (line 215)
    - Delete the dead `scrollToBottom` function (lines 201-203) — it's never called
    - The `useRenderLoop` + `shouldScrollRef` pattern stays, just change scroll behavior

  **Must NOT do**:
  - Do NOT change the render-loop subscription pattern
  - Do NOT change shouldScrollRef logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two-line change (delete + modify)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T3, T4)
  - **Parallel Group**: Wave 2 (with T3, T4)
  - **Blocks**: None
  - **Blocked By**: T2

  **References**:
  - `src/app/(app)/session/[id]/page.tsx:201-203` — dead scrollToBottom function to delete
  - `src/app/(app)/session/[id]/page.tsx:215` — `scrollIntoView({ behavior: "auto" })` → `"smooth"`
  - `src/app/(app)/session/[id]/page.tsx:206-220` — render-loop auto-scroll logic

  **Acceptance Criteria**:
  - [ ] `scrollToBottom` function removed
  - [ ] Auto-scroll uses `behavior: "smooth"`
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Smooth auto-scroll on new message
    Tool: Playwright
    Steps:
      1. Navigate to session page
      2. Send a message
      3. Observe scroll behavior — should be smooth, not instant jump
      4. Assert: scroll position moves to bottom smoothly
    Expected Result: Page scrolls smoothly to new message
    Evidence: .omo/evidence/task-5-smooth-scroll.png
  ```

  **Commit**: NO (groups with T3, T5)

- [x] 6. Delete Dead Code Files

  **What to do**:
  - Verify zero imports: `grep -r "message-bubble\|message-input" src/` returns zero results
  - Delete `src/components/chat/message-bubble.tsx`
  - Delete `src/components/chat/message-input.tsx`

  **Must NOT do**:
  - Do NOT delete any other files
  - Do NOT modify any other files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File deletion after verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T7, independent)
  - **Parallel Group**: Wave 3 (with T7)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/components/chat/message-bubble.tsx` — unused alternate implementation
  - `src/components/chat/message-input.tsx` — unused alternate implementation

  **Acceptance Criteria**:
  - [ ] Both files deleted
  - [ ] `npx next build` passes with no import errors
  - [ ] `grep -r "message-bubble\|message-input" src/` returns zero results

  **QA Scenarios**:
  ```
  Scenario: Dead code deleted, build passes
    Tool: Bash
    Steps:
      1. Verify files don't exist: test ! -f src/components/chat/message-bubble.tsx
      2. Verify files don't exist: test ! -f src/components/chat/message-input.tsx
      3. Run: npx next build
    Expected Result: Files deleted, build exits 0
    Evidence: .omo/evidence/task-6-build-pass.txt
  ```

  **Commit**: YES
  - Message: `chore(chat): delete unused message-bubble and message-input components`
  - Files: `src/components/chat/message-bubble.tsx` (deleted), `src/components/chat/message-input.tsx` (deleted)

- [x] 7. Fix Duplicate "use client" in chat-window.tsx

  **What to do**:
  - In `src/components/chat/chat-window.tsx`:
    - Remove the duplicate `"use client"` at line 23 (keep the one at line 1)
    - Note: If T2 already handles this (as part of layout restructure), skip this task

  **Must NOT do**:
  - Do NOT change any other code

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line removal
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6)
  - **Parallel Group**: Wave 3 (with T6)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/components/chat/chat-window.tsx:1` — first "use client" (keep)
  - `src/components/chat/chat-window.tsx:23` — duplicate "use client" (remove)

  **Acceptance Criteria**:
  - [ ] Only one "use client" directive in file
  - [ ] `npx next build` passes

  **Commit**: NO (groups with T6)

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

- **1**: `feat(chat): restructure layout, add message entrance animations, remove duplicate use client` — `chat-window.tsx`, `globals.css`
- **2**: `chore(chat): delete unused message-bubble and message-input components` — `message-bubble.tsx` (deleted), `message-input.tsx` (deleted)
- **3**: `feat(chat): hide typing indicator during streaming, add progress indicator, smooth auto-scroll` — `page.tsx`, `streaming-text.tsx`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: ✓ Compiled successfully
```

### Final Checklist
- [ ] Chat input pinned at bottom, messages scroll independently
- [ ] New messages fade-in + slide-up on appearance
- [ ] Typing indicator hidden during streaming
- [ ] Streaming shows word count + elapsed time
- [ ] Dead code files deleted
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `npx next build` passes
