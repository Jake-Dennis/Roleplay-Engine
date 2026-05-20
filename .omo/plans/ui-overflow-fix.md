# UI Overflow Fix — Session Page Fit to Screen

## TL;DR
> **Quick Summary**: Fix vertical overflow in session page so it fits within viewport without scrolling.
>
> **Deliverables**:
> - `app-layout-shell.tsx` — reduce padding, add overflow-hidden to main
> - `session/[id]/page.tsx` — change height from calc to h-full
>
> **Estimated Effort**: Quick (1 task)
> **Parallel Execution**: NO
> **Critical Path**: Layout shell → Session page

---

## Context

### Original Request
User said "can you make the ui fit inside the screen without need scrolling?"

Screenshot shows:
- Connection bar at top (Ollama, Kokoro status)
- Session header with persona dropdown, scene/participant/settings buttons
- Empty chat area
- Input area at bottom
- Scrollbar visible on right side (overflow)

### Root Cause
1. `app-layout-shell.tsx` main wrapper has `py-6` padding adding extra height
2. Session page uses `h-[calc(100vh-3rem)]` which doesn't account for parent flex layout
3. Main wrapper lacks `overflow-hidden`, allowing content to exceed viewport

---

## Work Objectives

### Core Objective
Make session page fit within viewport without vertical scrolling.

### Concrete Deliverables
- `src/app/(app)/app-layout-shell.tsx` — main wrapper changes
- `src/app/(app)/session/[id]/page.tsx` — height fix

### Definition of Done
- [ ] Session page fits within viewport (no scrollbar)
- [ ] Chat input visible at bottom without scrolling
- [ ] Header buttons accessible without scrolling
- [ ] `npx next build` passes

### Must Have
- No vertical scrollbar on session page
- All UI elements visible within viewport

### Must NOT Have (Guardrails)
- Do NOT break other pages (dashboard, wiki, etc.)
- Do NOT change sidebar layout
- Do NOT change connection indicator

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: NO
- **Agent-Executed QA**: ALWAYS

### QA Policy
- Playwright: Navigate to session page, verify no scrollbar, verify all elements visible

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Single task):
└── Task 1: Fix layout overflow (shell + session page) [visual-engineering]

Wave FINAL:
├── F1: Plan compliance (oracle)
── F2: Code quality (unspecified-high)
├── F3: Manual QA (unspecified-high + playwright)
└── F4: Scope fidelity (deep)
```

### Dependency Matrix
- **1**: - → -

### Agent Dispatch Summary
- **Wave 1**: `visual-engineering` (T1)
- **FINAL**: `oracle` (F1), `unspecified-high` (F2, F3), `deep` (F4)

---

## TODOs

- [x] 1. Fix Layout Overflow — Shell + Session Page

  **What to do**:
  - In `src/app/(app)/app-layout-shell.tsx`:
    - Change `<main className="relative flex-1">` to `<main className="relative flex-1 overflow-hidden">`
    - Change `<div className="mx-auto max-w-5xl px-6 py-6">` to `<div className="mx-auto h-full max-w-5xl px-6 py-3">`
  - In `src/app/(app)/session/[id]/page.tsx`:
    - Change `<div className="flex h-[calc(100vh-3rem)] flex-col">` to `<div className="flex h-full flex-col">`

  **Must NOT do**:
  - Do NOT change sidebar layout
  - Do NOT change other pages
  - Do NOT add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI layout fix, height/overflow adjustments
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 1)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/app/(app)/app-layout-shell.tsx:381-382` — main wrapper with py-6
  - `src/app/(app)/session/[id]/page.tsx:643` — h-[calc(100vh-3rem)]

  **Acceptance Criteria**:
  - [ ] No vertical scrollbar on session page
  - [ ] Chat input visible at bottom
  - [ ] Header buttons accessible
  - [ ] Other pages unaffected

  **QA Scenarios**:
  ```
  Scenario: Session page fits viewport without scroll
    Tool: Playwright
    Preconditions: npx next dev running, logged in, session exists
    Steps:
      1. Navigate to http://localhost:3000/session/[any-session-id]
      2. Wait for page load
      3. Assert: document.body.scrollHeight <= window.innerHeight (no overflow)
      4. Assert: chat input element is visible (boundingClientRect.bottom <= window.innerHeight)
      5. Assert: header buttons are visible (boundingClientRect.top >= 0)
    Expected Result: No scrollbar, all elements within viewport
    Evidence: .omo/evidence/task-1-no-scroll.png

  Scenario: Other pages unaffected
    Tool: Playwright
    Steps:
      1. Navigate to /dashboard — verify layout OK
      2. Navigate to /wiki — verify layout OK
      3. Navigate to /personas — verify layout OK
    Expected Result: All pages render correctly
    Evidence: .omo/evidence/task-1-other-pages.png
  ```

  **Commit**: YES
  - Message: `fix: make session page fit viewport without scrolling`
  - Files: `src/app/(app)/app-layout-shell.tsx`, `src/app/(app)/session/[id]/page.tsx`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE.

- [ ] F1. **Plan Compliance Audit** — `oracle`
- [ ] F2. **Code Quality Review** — `unspecified-high`
- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright`)
- [ ] F4. **Scope Fidelity Check** — `deep`

---

## Commit Strategy

- **1**: `fix: make session page fit viewport without scrolling` — `app-layout-shell.tsx`, `session/[id]/page.tsx`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: ✓ Compiled successfully
```

### Final Checklist
- [ ] No vertical scrollbar on session page
- [ ] All UI elements visible within viewport
- [ ] Other pages unaffected
- [ ] `npx next build` passes
