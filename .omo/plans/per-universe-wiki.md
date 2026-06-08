# Per-Universe Wiki Isolation

## TL;DR

> **Quick Summary**: Restructure the wiki system so each universe has its own isolated directory (`data/{userId}/wiki/{universeId}/`) with independent pages, index, log, and revisions. API routes use `?universe_id=` query parameter. Flat user-level wiki root is deleted entirely.
> 
> **Deliverables**:
> - 17 API route files updated to use `getWikiRoot(userId, universeId)` instead of hardcoded paths
> - 2 library files fixed (`retrieval.ts`, `auto-extract.ts`)
> - 4 frontend files updated to pass `universe_id` in wiki API fetches
> - Config dedup: `wiki-root.ts` imports from `APP_CONFIG.dataDir`
> - Universe lifecycle hook: DELETE universe → delete its wiki directory
> - Flat wiki dirs cleaned up (`data/*/wiki/` removed)
> 
> **Estimated Effort**: Medium (12 implementation tasks)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Config dedup → API routes → Frontend → Cleanup → QA

---

## Context

### Original Request
"can we make it that each universe has its own wiki"

### Interview Summary
**Key Discussions**:
- **Flat wiki**: Delete entirely — start fresh. No migration needed (stock content already wiped).
- **Universe routing**: Query parameter `?universe_id={id}` on all `/api/wiki/*` calls.
- **Index & Log**: Per-universe — each wiki dir gets its own `index.md` and `log.md`.
- **Null universe**: Return empty wiki (no pages).
- **Wiki revisions**: Per-universe.
- **Directory creation**: Lazy — first wiki write creates the dir.
- **Universe deletion**: Clean up wiki directory on universe DELETE.
- **Config dedup**: Yes — make `wiki-root.ts` import `APP_CONFIG.dataDir`.

**Research Findings**:
- **19 files MUST change**: 17 API route.ts files + `retrieval.ts` + `auto-extract.ts`
- **4 frontend files**: 2 page files + 2 component files already use universe context
- **`wiki/templates/route.ts`**: Uses app template dir, NOT wiki root — excluded
- **Background jobs** (wiki-handler, lore-extraction, idle-enrichments): Already use `getWikiRoot(userId, universeId)` — correct
- **Wiki library layer** (14 files in `src/lib/wiki/`): All accept `wikiRoot` as parameter — no changes needed
- **`getWikiRoot()`**: Already returns `data/{userId}/wiki/{universeId}` when given universeId
- **Frontend wiki page**: Already imports `activeUniverse` from `useApp()` context
- **4 routes already have universeId** in request body (query, file, ingest, lint) — just need to pass it to path
- **Wiki directory keyed by UUID** (not name) — renames don't affect directory path

### Metis Review
**Identified Gaps** (addressed):
- **Parameter naming**: Use `universe_id` (snake_case) to match 5 existing API routes
- **Hover/embed components**: Need `universeId` passed — added to plan
- **Config dedup**: `wiki-root.ts` + `ingest.ts` both re-read `DATA_DIR` from env — consolidate to `APP_CONFIG`
- **Delete on universe DELETE**: Add `fs.rmSync` to universe DELETE handler
- **Rename doesn't affect path**: Wiki dir uses UUID, not display name — no rename action needed

---

## Work Objectives

### Core Objective
Restructure wiki storage from flat `data/{userId}/wiki/` to per-universe `data/{userId}/wiki/{universeId}/` with complete isolation.

### Concrete Deliverables
- All 18 wiki API route files use `getWikiRoot(userId, universeId)` with query param extraction
- `src/lib/retrieval.ts` uses `getWikiRoot` instead of `process.cwd()`
- `src/lib/wiki/auto-extract.ts` passes universeId to `getWikiRoot`
- Wiki frontend passes `?universe_id=` in all `/api/wiki/*` fetches
- Universe DELETE handler removes the wiki directory
- `getWikiRoot()` imports `APP_CONFIG.dataDir` (no env re-read)
- Dead `DATA_DIR` constant removed from `ingest.ts`
- Flat wiki directories (`data/*/wiki/`) deleted

### Definition of Done
- [ ] Every wiki API route resolves to `data/{userId}/wiki/{universeId}/` per universe
- [ ] `GET /api/wiki?universe_id=abc` returns pages only from universe `abc`
- [ ] `GET /api/wiki` (no/unset universe_id) returns empty `{ pages: [] }`
- [ ] Pages in universe A never appear in universe B's results
- [ ] Creating a wiki page in a universe creates the universe directory lazily
- [ ] Deleting a universe removes its wiki directory
- [ ] Frontend wiki page shows only active universe's pages
- [ ] `npx next build` passes (zero errors)
- [ ] Flat `data/*/wiki/` directories are removed

### Must Have
- All API routes use `getWikiRoot(userId, universeId)` — no more hardcoded `path.join(dataDir, userId, "wiki")`
- Universe ID extracted from `searchParams.get("universe_id")` (GET) or `body.universeId` (POST)
- Missing/null universe → empty response (no crash)
- Lazy directory creation — routes handle non-existent wiki dir gracefully
- Frontend uses `activeUniverse` from context to pass in API fetches
- Universe DELETE handler removes wiki dir via `fs.rmSync`
- `wiki-root.ts` imports `APP_CONFIG.dataDir`

### Must NOT Have (Guardrails)
- NO changes to wiki library functions (14 files) — they already accept `wikiRoot`
- NO changes to `templates/route.ts` — app-level templates, not wiki content
- NO changes to background jobs — they already pass universeId correctly
- NO changes to database schema or SQLite
- NO changes to relationship system, sessions, chat, or scene extraction
- NO barrel exports
- NO eager wiki directory creation on universe creation (lazy only)
- NO changes to script files or init scripts

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO (no test framework in project)
- **Automated tests**: None
- **Agent-Executed QA**: Mandatory for all tasks

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API verification**: curl to modified endpoints, assert status + response
- **Build verification**: `npx next build` — zero errors, every phase
- **Isolation verification**: Create page in universe A, confirm universe B doesn't see it

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — all parallel, no deps):
├── T1: Config dedup (wiki-root.ts + ingest.ts)
├── T2: Library fixes (retrieval.ts + auto-extract.ts)

Wave 2 (API Routes — all parallel, no inter-deps):
├── T3: 4 routes with universeId already in body (query, file, ingest, lint)
├── T4: 5 GET-only routes (index, log, graph, recent, split-suggestions)
├── T5: wiki/[...slug] CRUD route (GET/PUT/DELETE — 1 file, 3 handlers)
├── T6: 3 wiki/[...slug] status routes (validate, reject, lock)
├── T7: 3 other routes (route.ts, history, sources/upload)
├── T8: wiki-revisions route (1 file, 2 handlers)

Wave 3 (Frontend + Lifecycle — independent tasks):
├── T9: Frontend page files (wiki/page.tsx + wiki/[...slug]/page.tsx)
├── T10: Frontend components (recent-changes, version-history, hover-preview, embed-transclusion)
├── T11: Universe DELETE -> wiki cleanup hook
├── T12: Flat wiki cleanup + full smoke test

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── F1: Plan Compliance Audit (oracle)
├── F2: Code Quality Review (unspecified-high)
├── F3: Real Manual QA (unspecified-high)
├── F4: Scope Fidelity Check (deep)
```

### Dependency Matrix
- T1 (config dedup) and T2 (library fixes) have no deps on each other — Wave 1 parallel
- All Wave 2 tasks (T3-T8) have no deps on each other — all parallel, after Wave 1
- T9 (frontend pages) depends on Wave 2 (API routes must be updated first)
- T10 (frontend components) depends on Wave 2 (same reason)
- T11 (universe lifecycle) depends on nothing — can run in Wave 3
- T12 (cleanup) depends on all Wave 1-3 tasks

### Agent Dispatch Summary
- **Wave 1**: 2 tasks — T1→`quick`, T2→`quick`
- **Wave 2**: 6 tasks — T3→`quick`, T4→`quick`, T5→`unspecified-high`, T6→`quick`, T7→`unspecified-high`, T8→`quick`
- **Wave 3**: 4 tasks — T9→`visual-engineering`, T10→`visual-engineering`, T11→`quick`, T12→`unspecified-high`
- **FINAL**: 4 reviews — F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`

---

## TODOs

- [x] 1. Config dedup — `wiki-root.ts` + `ingest.ts`

  **What to do**:
  - In `src/lib/wiki/wiki-root.ts`: Replace `const dataDir = process.env.DATA_DIR || "./data"` with `import { APP_CONFIG } from '@/lib/config'` and use `APP_CONFIG.dataDir`
  - In `src/lib/wiki/ingest.ts`: Remove the dead `const DATA_DIR = process.env.DATA_DIR || "./data"` at line 42 (unused constant)
  - Verify `getWikiRoot()` still returns correct paths after the change

  **Must NOT do**:
  - Do NOT change `getWikiRoot()` function signature — keep `(userId, universeId?)` with optional universe
  - Do NOT change any other files

  **Recommended Agent Profile**: `quick`
  **Parallelization**: Wave 1, with T2 | Blocks: nothing

  **Acceptance Criteria**:
  - [ ] `wiki-root.ts` imports `APP_CONFIG` from `@/lib/config`
  - [ ] `ingest.ts` has no `DATA_DIR` constant
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: wiki-root imports from APP_CONFIG
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/lib/wiki/wiki-root.ts — confirm import from @/lib/config
      2. Read src/lib/wiki/ingest.ts — confirm no DATA_DIR constant
      3. Run npx next build
    Expected Result: Build passes. No import errors.
    Evidence: .omo/evidence/task-1-config-dedup.txt
  ```

- [x] 2. Library fixes — `retrieval.ts` + `auto-extract.ts`

  **What to do**:
  **File 1: `src/lib/retrieval.ts` (line ~169)**
  - Change from: `const wikiRoot = path.join(process.cwd(), "data", userId, "wiki");`
  - Change to: `import { getWikiRoot } from '@/lib/wiki/wiki-root'; const wikiRoot = getWikiRoot(userId, universeId);`
  - The function already has `universeId` as a parameter — just needs to pass it

  **File 2: `src/lib/wiki/auto-extract.ts` (line ~87)**
  - Change from: `const wikiRoot = getWikiRoot(userId);`
  - Change to: `const wikiRoot = getWikiRoot(userId, universeId);`
  - The function already receives `universeId: string | null` — just needs to pass it through

  **Must NOT do**:
  - Do NOT change any function signatures
  - Do NOT modify behavior beyond path resolution

  **Recommended Agent Profile**: `quick`
  **Parallelization**: Wave 1, with T1 | Blocks: nothing

  **Acceptance Criteria**:
  - [ ] `retrieval.ts` uses `getWikiRoot(userId, universeId)` instead of `process.cwd()`
  - [ ] `auto-extract.ts` passes `universeId` to `getWikiRoot()`
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Library files use getWikiRoot
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/lib/retrieval.ts — confirm getWikiRoot import
      2. Read src/lib/wiki/auto-extract.ts — confirm getWikiRoot(userId, universeId)
      3. Run npx next build
    Expected Result: Build passes.
    Evidence: .omo/evidence/task-2-library-fixes.txt
  ```

- [x] 3. Update 4 routes that already accept universeId in body

  **What to do**:
  These 4 routes already extract `universeId` from the request body but don't pass it to the wiki root path. Fix them:
  
  1. **`src/app/api/wiki/query/route.ts`** (~line 35): `const wikiRoot = getWikiRoot(decoded.sub, body.universeId);` (replace `path.join(APP_CONFIG.dataDir, decoded.sub, "wiki")`)
  2. **`src/app/api/wiki/file/route.ts`** (~line 37): Same pattern — `getWikiRoot(decoded.sub, body.universeId)`
  3. **`src/app/api/wiki/ingest/route.ts`** (~line 32): Same pattern — `getWikiRoot(decoded.sub, body.universeId)`
  4. **`src/app/api/wiki/lint/route.ts`** (~line 23): Same pattern — `getWikiRoot(decoded.sub, body.universeId)`
  
  Also add `import { getWikiRoot } from '@/lib/wiki/wiki-root'` to each file (replace the existing `path.join` import or add alongside it).
  
  These routes accept POST (or POST-like) with JSON body. They already have `universeId` extraction — you're just changing the path resolution. Add `import { getWikiRoot } from '@/lib/wiki/wiki-root'`.

  **Must NOT do**:
  - Do NOT change how `universeId` is extracted from the body — it's already correct
  - Do NOT modify any other route files

  **Recommended Agent Profile**: `quick` — 4 mechanical import + path replacements
  **Parallelization**: Wave 2, with T4-T8 | Blocks: T9, T10 | Blocked By: T1

  **Acceptance Criteria**:
  - [ ] All 4 routes use `getWikiRoot(decoded.sub, universeId)` for path resolution
  - [ ] `getWikiRoot` imported in each file
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Routes use getWikiRoot
    Tool: Bash
    Preconditions: Wave 1 complete
    Steps:
      1. Read each file — confirm getWikiRoot import and usage
      2. Run npx next build
    Expected Result: Build passes for all 4 routes.
    Evidence: .omo/evidence/task-3-routes-body-universe.txt
  ```

- [x] 4. Update 5 GET-only wiki routes

  **What to do**:
  These 5 routes are GET-only — they need to extract `universe_id` from query params:
  
  1. **`src/app/api/wiki/index/route.ts`** (~line 21): `const universeId = request.nextUrl.searchParams.get("universe_id") || ""; const wikiRoot = getWikiRoot(decoded.sub, universeId || undefined);`
  2. **`src/app/api/wiki/log/route.ts`** (~line 20): Same pattern
  3. **`src/app/api/wiki/graph/route.ts`** (~line 22): Same pattern
  4. **`src/app/api/wiki/split-suggestions/[...slug]/route.ts`** (~line 26): Same pattern
  5. **`src/app/api/wiki/recent/route.ts`** (~line 23): Already uses `getWikiRoot(decoded.sub)` — change to `getWikiRoot(decoded.sub, universeId || undefined)`
  
  Add `import { getWikiRoot } from '@/lib/wiki/wiki-root'` to each file (replace existing `path.join` import where applicable).
  
  For each: extract `universe_id` from `request.nextUrl.searchParams`, pass to `getWikiRoot()`.
  If `universe_id` is missing/empty → wiki root resolves to non-existent path → `fs.existsSync` check returns false → empty/empty response.

  **Must NOT do**:
  - Do NOT change the response format
  - Do NOT modify any other route files

  **Recommended Agent Profile**: `quick` — 5 mechanical pattern replacements
  **Parallelization**: Wave 2, with T3, T5-T8 | Blocks: T9, T10 | Blocked By: T1

  **Acceptance Criteria**:
  - [ ] All 5 routes use `getWikiRoot(decoded.sub, universeId)`
  - [ ] `universe_id` extracted from `searchParams`
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: GET routes use query param universe
    Tool: Bash
    Preconditions: Wave 1 complete
    Steps:
      1. Read each file — confirm universe extraction and getWikiRoot
      2. Run npx next build
    Expected Result: Build passes for all 5 routes.
    Evidence: .omo/evidence/task-4-get-routes.txt
  ```

- [x] 5. Update `wiki/[...slug]/route.ts` (CRUD)

  **What to do**:
  This file has 3 handlers (GET, PUT, DELETE) that all hardcode the wiki root path. It's a dynamic catch-all route for individual wiki pages.
  
  The slug format is `entities/marcus_blackwood` — relative to the wiki root. With per-universe, the slug is relative to `data/{userId}/wiki/{universeId}/`.
  
  **Path extraction**: The universe_id should come from query param for GET (same as other GET routes), and from body for PUT (since PUT has a body). For consistency, use query param for GET and body for PUT/DELETE.
  
  Alternatively, for simplicity: **use query param for all 3** — `request.nextUrl.searchParams.get("universe_id")`. This is consistent across all routes.
  
  Implementation:
  - Add `import { getWikiRoot } from '@/lib/wiki/wiki-root'` (replace existing path construction)
  - Extract `universeId = request.nextUrl.searchParams.get("universe_id") || ""` once at the top
  - Replace all 3 instances of `path.join(APP_CONFIG.dataDir, decoded.sub, "wiki")` with `getWikiRoot(decoded.sub, universeId || undefined)`
  - The `slug` resolves page paths relative to wiki root — existing logic works unchanged because the root is now per-universe

  **Must NOT do**:
  - Do NOT change slug resolution logic — it's relative to wikiRoot
  - Do NOT change the response format or error handling

  **Recommended Agent Profile**: `unspecified-high` — 3 handlers in 1 file, needs careful editing
  **Parallelization**: Wave 2, with T3-T4, T6-T8 | Blocks: T9, T10 | Blocked By: T1

  **Acceptance Criteria**:
  - [ ] All 3 handlers use `getWikiRoot(decoded.sub, universeId)`
  - [ ] `universe_id` extracted from query params
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Catch-all route uses per-universe root
    Tool: Bash
    Preconditions: Wave 1 complete
    Steps:
      1. Read file — confirm 3 getWikiRoot replacements
      2. Run npx next build
    Expected Result: Build passes.
    Evidence: .omo/evidence/task-5-catchall-route.txt
  ```

- [x] 6. Update 3 wiki status routes

  **What to do**:
  These 3 routes operate on page status (validate, reject, lock) via PUT:
  
  1. **`src/app/api/wiki/validate/[...slug]/route.ts`** (~line 29): `const universeId = request.nextUrl.searchParams.get("universe_id") || ""; const wikiRoot = getWikiRoot(decoded.sub, universeId || undefined);`
  2. **`src/app/api/wiki/reject/[...slug]/route.ts`** (~line 29): Same pattern
  3. **`src/app/api/wiki/lock/[...slug]/route.ts`** (~line 28): Same pattern
  
  These are all PUT routes that operate on a page slug. Extract `universe_id` from query params. Replace `path.join(APP_CONFIG.dataDir, decoded.sub, "wiki")` with `getWikiRoot(decoded.sub, universeId || undefined)`.
  
  Add `import { getWikiRoot } from '@/lib/wiki/wiki-root'` to each.

  **Must NOT do**:
  - Do NOT change the status validation logic
  - Do NOT modify any other route files

  **Recommended Agent Profile**: `quick` — 3 mechanical pattern replacements
  **Parallelization**: Wave 2, with T3-T5, T7-T8 | Blocks: T9, T10 | Blocked By: T1

  **Acceptance Criteria**:
  - [ ] All 3 routes use `getWikiRoot(decoded.sub, universeId)`
  - [ ] `universe_id` extracted from query params
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Status routes use per-universe root
    Tool: Bash
    Preconditions: Wave 1 complete
    Steps:
      1. Read each file — confirm getWikiRoot usage
      2. Run npx next build
    Expected Result: Build passes.
    Evidence: .omo/evidence/task-6-status-routes.txt
  ```

- [x] 7. Update 3 other wiki routes

  **What to do**:
  1. **`src/app/api/wiki/route.ts`** — GET (~line 28) + POST (~line 71): 
     - GET: `const universeId = request.nextUrl.searchParams.get("universe_id") || ""; const wikiRoot = getWikiRoot(decoded.sub, universeId || undefined);`
     - POST: Extract `universeId` from body (`const { ..., universeId } = await request.json()`), pass to `getWikiRoot(decoded.sub, universeId)`
     - Replace both `path.join(APP_CONFIG.dataDir, decoded.sub, "wiki")` instances
  
  2. **`src/app/api/wiki/history/route.ts`** — GET (~line 36) + POST (~line 70):
     - GET: Query param extraction for `universe_id`
     - POST: Body extraction for `universeId`
     - Replace both path constructions
  
  3. **`src/app/api/wiki/sources/upload/route.ts`** — POST (~line 67):
     - Extract `universeId` from `formData` body (this is a file upload route)
     - Pass to `getWikiRoot(decoded.sub, universeId)`
  
  Add `import { getWikiRoot } from '@/lib/wiki/wiki-root'` to each file.

  **Must NOT do**:
  - Do NOT modify file upload logic in sources/upload — only change path resolution
  - Do NOT change response formats

  **Recommended Agent Profile**: `unspecified-high` — more complex patterns (GET+POST, formData)
  **Parallelization**: Wave 2, with T3-T6, T8 | Blocks: T9, T10 | Blocked By: T1

  **Acceptance Criteria**:
  - [ ] All 3 routes use `getWikiRoot()` for path resolution
  - [ ] sources/upload handles universeId from formData
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Remaining routes use per-universe root
    Tool: Bash
    Preconditions: Wave 1 complete
    Steps:
      1. Read each file — confirm getWikiRoot usage
      2. Run npx next build
    Expected Result: Build passes.
    Evidence: .omo/evidence/task-7-other-routes.txt
  ```

- [x] 8. Update `wiki-revisions/route.ts`

  **What to do**:
  **`src/app/api/wiki-revisions/route.ts`** — GET (~line 23) + POST (~line 68):
  - GET: `const universeId = request.nextUrl.searchParams.get("universe_id") || ""; const wikiRoot = getWikiRoot(decoded.sub, universeId || undefined);`
  - POST: Extract `universeId` from body, pass to `getWikiRoot(decoded.sub, universeId)`
  - Replace both `path.join(APP_CONFIG.dataDir, decoded.sub, "wiki")` instances
  - Add `import { getWikiRoot } from '@/lib/wiki/wiki-root'`

  **Must NOT do**:
  - Do NOT change the revision logic — only the wiki root path resolution

  **Recommended Agent Profile**: `quick` — 2 handler changes in 1 file
  **Parallelization**: Wave 2, with T3-T7 | Blocks: T9, T10 | Blocked By: T1

  **Acceptance Criteria**:
  - [ ] Both handlers use `getWikiRoot(decoded.sub, universeId)`
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Revisions route uses per-universe root
    Tool: Bash
    Preconditions: Wave 1 complete
    Steps:
      1. Read file — confirm getWikiRoot usage
      2. Run npx next build
    Expected Result: Build passes.
    Evidence: .omo/evidence/task-8-revisions-route.txt
  ```

- [x] 9. Update frontend wiki page files

  **What to do**:
  **File 1: `src/app/(app)/wiki/page.tsx`**
  - Already has `const { activeUniverse } = useApp()` at line 16
  - Change line 26: `fetch('/api/wiki')` → `fetch('/api/wiki?universe_id=${activeUniverse?.id || ''}')`
  - Change POST at line 51: `fetch('/api/wiki', { method: 'POST', body: JSON.stringify({...}) })` → Add `universeId: activeUniverse?.id` to the JSON body
  - Also update `handleTemplateSelect` POST (around line 51-65) to include universeId in the body

  **File 2: `src/app/(app)/wiki/[...slug]/page.tsx`**
  - Import `useApp` from `@/contexts/app-context` (or verify it already has universe access)
  - Add `const { activeUniverse } = useApp();` 
  - Update all fetch calls to include `?universe_id=${activeUniverse?.id || ''}`:
    - Page data fetch (~line 113)
    - Page update fetch (~line 154)
    - Page delete fetch (~line 176)
    - Any other wiki API fetch (~line 351)
  - For non-GET fetches, add `universeId` to the request body

  **Must NOT do**:
  - Do NOT add new npm dependencies
  - Do NOT change the UI structure or styling
  - Do NOT modify non-wiki API fetches

  **Recommended Agent Profile**: `visual-engineering` — frontend files with context integration
  **Parallelization**: Wave 3, with T10-T11 | Blocks: T12 | Blocked By: Wave 2

  **Acceptance Criteria**:
  - [ ] wiki/page.tsx passes `activeUniverse.id` in all wiki API fetches
  - [ ] wiki/[...slug]/page.tsx passes `activeUniverse.id` in all wiki API fetches
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Frontend passes universe_id in fetches
    Tool: Bash
    Preconditions: Wave 2 complete
    Steps:
      1. Read both page files — confirm universe_id in all wiki fetches
      2. Run npx next build
    Expected Result: Build passes.
    Evidence: .omo/evidence/task-9-frontend-pages.txt
  ```

- [x] 10. Update frontend wiki components

  **What to do**:
  **File 1: `src/components/wiki/recent-changes-widget.tsx`**
  - Needs universe context — import `useApp` from `@/contexts/app-context`
  - Add `const { activeUniverse } = useApp();`
  - Change line 24: `fetch('/api/wiki/recent?limit=8')` → `fetch('/api/wiki/recent?limit=8&universe_id=${activeUniverse?.id || ''}')`
  - Note: This may already be inside a component that doesn't have `useApp`. If it's a client component, `useApp` is available. If it's server, this may need to receive universeId as a prop. Check and adjust.

  **File 2: `src/components/wiki/version-history.tsx`**
  - Import `useApp` from `@/contexts/app-context` (if client component)
  - Add `const { activeUniverse } = useApp();`
  - Update GET (~line 34): Add `universe_id` query param
  - Update POST (~line 58): Add `universeId` to request body

  **File 3: `src/components/wiki/hover-preview.tsx`**
  - This component may not have access to app context. Check if it's a client component.
  - If it has access: import `useApp`, add `activeUniverse` context, update line 174 fetch
  - If it doesn't: accept `universeId` as a prop
  - Update fetch to include `?universe_id=${universeId}`

  **File 4: `src/components/wiki/embed-transclusion.tsx`**
  - This is an iframe/image src component. The src at line 105 points to `/api/wiki/file?name=...`
  - Needs `universe_id` added: `/api/wiki/file?name=${target}&universe_id=${universeId}`
  - Accept `universeId` as a prop (may not have context access)

  **Must NOT do**:
  - Do NOT add new npm dependencies
  - Do NOT change component UI structure or styling
  - Do NOT add new context providers

  **Recommended Agent Profile**: `visual-engineering` — 4 component integrations
  **Parallelization**: Wave 3, with T9, T11 | Blocks: T12 | Blocked By: Wave 2

  **Acceptance Criteria**:
  - [ ] recent-changes-widget passes `universe_id` in fetch
  - [ ] version-history passes `universe_id` in fetch
  - [ ] hover-preview passes `universe_id` in fetch (via context or prop)
  - [ ] embed-transclusion passes `universe_id` in iframe src
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Components pass universe_id
    Tool: Bash
    Preconditions: Wave 2 complete
    Steps:
      1. Read each component — confirm universe_id in API calls
      2. Run npx next build
    Expected Result: Build passes.
    Evidence: .omo/evidence/task-10-frontend-components.txt
  ```

- [x] 11. Add wiki cleanup on universe DELETE

  **What to do**:
  **`src/app/api/universes/[id]/route.ts`** — DELETE handler (~line 160-214):
  - Add import: `import { getWikiRoot } from '@/lib/wiki/wiki-root';` and `import fs from 'fs';` (or use existing fs if already imported)
  - Before the DB cleanup lines (lines 204-212), add:
    ```typescript
    // Clean up wiki directory for this universe
    const wikiRoot = getWikiRoot(decoded.sub, id);
    if (fs.existsSync(wikiRoot)) {
      fs.rmSync(wikiRoot, { recursive: true, force: true });
    }
    ```
  - This runs after ownership verification but before DB cleanup
  - The wiki root uses the universe's UUID (`id` parameter), which matches the `getWikiRoot` pattern
  
  **Note**: Universe RENAME does NOT need wiki directory changes — the wiki directory is keyed by UUID, not display name. The UUID never changes.

  **Must NOT do**:
  - Do NOT change the DB cleanup logic
  - Do NOT add wiki directory creation on universe creation (lazy creation only)
  - Do NOT modify the PUT handler (rename doesn't affect path)

  **Recommended Agent Profile**: `quick` — single handler addition
  **Parallelization**: Wave 3, with T9-T10 | Blocks: T12 | Blocked By: nothing

  **Acceptance Criteria**:
  - [ ] DELETE handler removes wiki directory via `fs.rmSync`
  - [ ] Handles non-existent wiki dir gracefully (already checked via `fs.existsSync`)
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Universe DELETE removes wiki dir
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read universes/[id]/route.ts — confirm fs.rmSync call
      2. Run npx next build
    Expected Result: Build passes. Wiki cleanup integrated.
    Evidence: .omo/evidence/task-11-universe-delete.txt

  Scenario: No wiki dir doesn't crash DELETE
    Tool: Bash
    Preconditions: Universe without wiki dir exists
    Steps:
      1. Read code — confirm fs.existsSync check before rmSync
    Expected Result: existsSync guard prevents crash on non-existent dir.
    Evidence: .omo/evidence/task-11-no-crash.txt
  ```

- [x] 12. Flat wiki cleanup + full smoke test

  **What to do**:
  **Flat wiki cleanup**:
  - Remove all flat `data/{userId}/wiki/` directories (no longer needed — each universe has its own)
  - Current state after stock content deletion: `data/51f6.../wiki/index.md` + `data/51f6.../wiki/log.md` exist (empty but present)
  - Run: `foreach ($dir in Get-ChildItem -Path "data" -Directory) { $wikiPath = Join-Path $dir.FullName "wiki"; if (Test-Path $wikiPath) { Remove-Item -Path $wikiPath -Recurse -Force } }`
  - This ensures no stale flat wiki dirs interfere with per-universe resolution

  **Full smoke test**:
  - `npx next build` — verify zero errors
  - `git diff --stat -- ':!node_modules' ':!.omo' ':!graphify-out'` — verify changed files in scope
  - Read all changed files — verify no stubs/TODOs/broken code
  - curl-based verification if dev server available:
    - `curl "http://localhost:3000/api/wiki?universe_id="` → `{"pages":[]}`
    - `curl "http://localhost:3000/api/wiki"` (no param) → `{"pages":[]}`

  **Must NOT do**:
  - Do NOT skip the flat wiki deletion
  - Do NOT skip `npx next build` verification
  - Do NOT skip reading changed files for stubs/bugs

  **Recommended Agent Profile**: `unspecified-high` — cleanup + comprehensive QA
  **Parallelization**: Wave 3 | Blocks: Final Wave | Blocked By: T1-T11

  **Acceptance Criteria**:
  - [ ] All `data/*/wiki/` flat directories removed
  - [ ] `npx next build` passes (zero errors)
  - [ ] All changed files are in scope
  - [ ] No stubs, TODOs, or broken code in changed files

  **QA Scenarios**:
  ```
  Scenario: Flat wiki dirs removed
    Tool: Bash
    Preconditions: All implementation tasks complete
    Steps:
      1. Get-ChildItem data/*/wiki -Directory | Measure-Object
      2. If any exist: Remove-Item them
    Expected Result: Zero flat wiki dirs remaining.
    Evidence: .omo/evidence/task-12-flat-wiki-removed.txt

  Scenario: Full build passes
    Tool: Bash
    Preconditions: All changes applied
    Steps:
      1. npx next build
    Expected Result: ✓ Compiled successfully. Zero errors.
    Evidence: .omo/evidence/task-12-build-passed.txt
  ```

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for violations. Check evidence files.
  
- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx next build`. Review for `as any`, `@ts-ignore`, empty catches, `console.log` in production code.
  
- [x] F3. **Real Manual QA** — `unspecified-high`
  Verify isolation: page in universe A not in universe B. Verify null universe returns empty. Verify DELETE removes wiki dir.
  
- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 mapping. Check "Must NOT do" compliance.

---

## Commit Strategy

- T1: `chore(wiki): consolidate data dir to APP_CONFIG, remove dead constant`
- T2: `fix(wiki): pass universeId to getWikiRoot in retrieval.ts and auto-extract.ts`
- T3-T8: `feat(wiki): use per-universe wiki root in [N] API route(s)`
- T9-T10: `feat(wiki): pass universe_id in frontend wiki API fetches`
- T11: `feat(wiki): clean up wiki directory on universe DELETE`
- T12: `chore(wiki): remove flat wiki dirs, final smoke test`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: ✓ Compiled successfully, zero errors
```

### Final Checklist
- [ ] All 18 wiki API routes resolve to per-universe directories
- [ ] `GET /api/wiki?universe_id=abc` returns universe abc's pages only
- [ ] `GET /api/wiki` (no universe) returns empty `{ pages: [] }`
- [ ] Page in universe A invisible to universe B
- [ ] Null universe results in empty wiki
- [ ] DELETE universe removes its wiki directory
- [ ] Frontend wiki shows only active universe's pages
- [ ] `getWikiRoot()` imports from `APP_CONFIG.dataDir`
- [ ] Flat `data/*/wiki/` directories removed
- [ ] `npx next build` passes
