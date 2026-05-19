# Wiki Graph Integration (Obsidian-Style)

## TL;DR

> **Quick Summary**: Merge the standalone `/wiki/graph` page into the main `/wiki` page as a tabbed view, matching Obsidian's pattern where graph, browse, and file tree coexist in one view.
>
> **Deliverables**:
> - Tabbed view toggle on wiki home (Browse | Graph)
> - Remove `/wiki/graph` route and sidebar link
> - GraphView component reused as-is (already accepts `pages` prop)
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — sequential (2 dependent tasks)
> **Critical Path**: Task 1 → Task 2 → commit

---

## Context

### Original Request
"can you combine the graph view with wiki as well so it works like obsidian"

### Current Architecture
- `/wiki` page: fetches `/api/wiki`, renders file tree sidebar + main content with page count cards
- `/wiki/graph` page: separate route, fetches same `/api/wiki`, renders `GraphView` component
- `GraphView` component (`src/components/wiki/graph-view.tsx`): accepts `pages: WikiPage[]`, `isLoading`, `error`, `onRetry` — fully self-contained
- Sidebar link: `{ href: "/wiki/graph", label: "Graph", icon: Network }`

### Key Insight
The `GraphView` component is already reusable — it takes `pages` as a prop and renders the full Cytoscape graph. No API changes needed. Just need to wire it into the wiki home page with a view toggle.

---

## Work Objectives

### Core Objective
Integrate graph view into wiki home page as a tabbed view, remove standalone `/wiki/graph` route.

### Concrete Deliverables
- `src/app/(app)/wiki/page.tsx` — modified with view toggle
- `src/app/(app)/app-layout-shell.tsx` — remove Graph sidebar link
- `src/app/(app)/wiki/graph/page.tsx` — deleted

### Definition of Done
- [ ] Wiki home page has Browse/Graph tabs
- [ ] Graph view renders correctly when selected
- [ ] `/wiki/graph` route removed
- [ ] `npx next build` passes

### Must Have
- View toggle matching Obsidian pattern (tab bar, not dropdown)
- GraphView component reused as-is (no modifications needed)
- Same data fetch (`/api/wiki`) shared between views

### Must NOT Have
- No new API endpoints
- No new dependencies
- No changes to GraphView component itself
- No new files (modify existing, delete graph route)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **Automated tests**: NO — no existing tests for wiki pages
- **Agent-Executed QA**: YES — build verification + visual inspection

### QA Policy
- Build: `npx next build` must pass
- No human intervention required

---

## Execution Strategy

### Sequential Tasks (2 tasks, dependent)

```
Wave 1:
├── Task 1: Add view toggle to wiki home page [quick]
└── Task 2: Remove /wiki/graph route + sidebar link [quick]

Wave FINAL:
└── Build verification
```

### Dependency Matrix
- **1**: - → 2
- **2**: 1 → FINAL
- **FINAL**: 1, 2

---

## TODOs

- [ ] 1. Add view toggle to wiki home page

  **What to do**:
  - Add `useState<"browse" | "graph">` to `WikiHomePage`
  - Add a tab bar at the top of the main content area (above current content)
  - Tab bar style: rounded-lg bg-bg-raised p-1 with two buttons (Browse, Graph)
  - Active tab: bg-accent text-white. Inactive: text-text-muted hover:text-text-primary
  - When "Browse" selected: render current content (file tree + page cards)
  - When "Graph" selected: render `<GraphView pages={pages} isLoading={loading} />` full-width
  - Import `GraphView` from `@/components/wiki/graph-view`
  - Import `BookOpen` and `Network` icons from lucide-react for tab labels

  **Must NOT do**:
  - Do not modify `GraphView` component
  - Do not change the API call or data fetching
  - Do not add new files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file modification, well-understood pattern
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — simple tab toggle, no complex UI design

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (blocks Task 2)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `src/app/(app)/wiki/page.tsx` — current wiki home page to modify
  - `src/components/wiki/graph-view.tsx` — GraphView component to import and use
  - `src/app/(app)/wiki/graph/page.tsx` — reference for how GraphView is currently used

  **Acceptance Criteria**:
  - [ ] Wiki page renders with Browse/Graph tab bar
  - [ ] Clicking "Graph" shows the Cytoscape graph
  - [ ] Clicking "Browse" returns to file tree view
  - [ ] `npx next build` passes

  **Evidence to Capture**:
  - [ ] Build output showing successful compilation

- [ ] 2. Remove /wiki/graph route and sidebar link

  **What to do**:
  - Delete `src/app/(app)/wiki/graph/page.tsx`
  - Remove Graph entry from `navItems` in `app-layout-shell.tsx`
  - Remove unused `Network` import from `app-layout-shell.tsx` (if no longer used)
  - Verify no other references to `/wiki/graph` exist in codebase

  **Must NOT do**:
  - Do not delete `src/components/wiki/graph-view.tsx` — still used by wiki home page

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File deletion + single line removal
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: FINAL
  - **Blocked By**: Task 1

  **References**:
  - `src/app/(app)/wiki/graph/page.tsx` — file to delete
  - `src/app/(app)/app-layout-shell.tsx` — remove Graph nav item

  **Acceptance Criteria**:
  - [ ] `src/app/(app)/wiki/graph/page.tsx` deleted
  - [ ] Graph removed from sidebar nav
  - [ ] No references to `/wiki/graph` in codebase
  - [ ] `npx next build` passes

  **Evidence to Capture**:
  - [ ] Build output showing successful compilation

---

## Final Verification Wave

- [ ] F1. **Build Verification** — `bash`
  Run `npx next build`. Verify clean compilation with no errors.
  Output: `Build [PASS/FAIL]`

---

## Commit Strategy

- **1**: `feat(wiki): integrate graph view as tabbed panel in wiki home`
  - `src/app/(app)/wiki/page.tsx` — added view toggle + GraphView integration
  - `src/app/(app)/wiki/graph/page.tsx` — deleted
  - `src/app/(app)/app-layout-shell.tsx` — removed Graph sidebar link
  - Pre-commit: `npx next build`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: ✓ Compiled successfully
```

### Final Checklist
- [ ] Wiki home has Browse/Graph tabs
- [ ] Graph renders correctly
- [ ] /wiki/graph route removed
- [ ] Sidebar link removed
- [ ] Build passes
