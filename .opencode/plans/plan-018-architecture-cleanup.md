# Plan 018: Architecture Cleanup

## Goal
Regenerate the stale AGENTS.md documentation, migrate remaining `active-universe.tsx` compat shim imports, extract shared types from API routes, move `syntax-highlighter.ts` to the proper lib directory, and document new subdirectories.

## Tasks

### Layer 1 (parallel, no deps)

- [ ] **1a: Migrate 6 active-universe.tsx imports to app-context.tsx** (assigned: @refactor)
  Files that import from `@/contexts/active-universe`:
  - `src/app/(app)/jobs/page.tsx:24`
  - `src/app/(app)/voice-combiner/page.tsx:5`
  - `src/app/(app)/narrative-threads/page.tsx:9`
  - `src/app/(app)/relationships/page.tsx:11`
  - `src/app/(app)/timeline/page.tsx:9`
  - `src/hooks/use-idle-tracker.ts:74` — uses raw `localStorage.getItem("active-universe-id")`

  For each:
  - Change import to `@/contexts/app-context`
  - Verify `useActiveUniverse` is re-exported from `app-context.tsx` (it's already a compat shim)
  - For `use-idle-tracker.ts`: replace raw localStorage key with a constant reference

- [ ] **1b: Extract shared types from API route** (assigned: @architect)
  - Read `src/components/debug/retrieval-inspector.tsx` — find imported types from API route
  - Read `src/app/api/sessions/[id]/retrieval-context/route.ts` — find `RetrievalInspectorResponse`, `BudgetBreakdown`, `SectionBudget`
  - Extract these types into `src/lib/retrieval.ts` (or a dedicated `src/lib/types.ts`)
  - Update both the API route and the component to import from the shared location
  - Verify: `npm run build` compiles clean

- [ ] **1c: Move syntax-highlighter.ts to lib/wiki/** (assigned: @refactor)
  - Move `src/components/wiki/editor/syntax-highlighter.ts` → `src/lib/wiki/syntax-highlighter.ts`
  - Update all imports:
    - `src/components/wiki/editor/markdown-editor.tsx`
    - `src/lib/__tests__/syntax-highlighter.test.ts`
  - Verify: `npm run build` + `npm test` pass

- [ ] **1d: Delete unused `tailwind.config.ts`** (assigned: @builder)
  - Already covered in Plan 013 — skip if done

- [ ] **1e: Document new lib subdirectories** (assigned: @docs)
  - Read `src/lib/AGENTS.md` (or create if missing)
  - Add documentation for:
    - `src/lib/benchmark/` — benchmark system modules
    - `src/lib/idle/` — idle-time processing tasks
    - `src/lib/validation/` — validation utilities
    - `src/lib/__tests__/` — flat test files
  - Describe each subdirectory: purpose, key files, entry points

### Layer 2 (depends on Layer 1)

- [ ] **2a: Regenerate AGENTS.md files** (assigned: @docs, depends on 1e)
  - Read `src/app/(app)/AGENTS.md`, `src/app/api/AGENTS.md`, `src/lib/AGENTS.md`, `src/components/AGENTS.md` if they exist
  - Update all file counts to match actual:
    - Actual: 107 route handlers (AGENTS.md claims 94)
    - Actual: 98 component .tsx files (claims 71)
    - Actual: 12 subdirectories in components/ (claims 7)
    - Actual: 61 lib flat utilities (claims 37)
  - Run a file count scan to get accurate numbers:
    ```bash
    Get-ChildItem -Recurse -File -Path "src/app/api" -Filter "route.ts" | Measure-Object
    Get-ChildItem -Recurse -File -Path "src/components" -Filter "*.tsx" | Measure-Object
    Get-ChildItem -Recurse -Directory -Path "src/components" | Measure-Object
    ```

## Verification
- [ ] 1a: 6 active-universe.tsx imports migrated — no files import from `@/contexts/active-universe`
- [ ] 1b: Shared types extracted to `lib/retrieval.ts` — `npm run build` passes
- [ ] 1c: syntax-highlighter.ts moved to `lib/wiki/` — all imports updated
- [ ] 1e: `lib/AGENTS.md` updated with new subdirectory docs
- [ ] 2a: All AGENTS.md file counts match reality
- [ ] Full: `npm test` passes, `npm run build` compiles
