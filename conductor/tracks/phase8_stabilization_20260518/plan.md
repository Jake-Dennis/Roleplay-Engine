# Implementation Plan: Phase 8 Stabilization

## Phase 1: Assessment & Diagnostics
- [ ] Task: Audit uncommitted changes for Phase 8 files
    - [ ] Review git diff for all Phase 8 related files (8a-8e plans)
    - [ ] Categorize changes: bugfixes, incomplete features, refactors, accidental
    - [ ] Document any breaking changes or regressions
- [ ] Task: Run full diagnostic suite
    - [ ] Run `npm run lint` and capture all errors
    - [ ] Run TypeScript compilation check and capture all errors
    - [ ] Run `npm run build` and capture all errors
    - [ ] Start dev server and check for runtime errors in console
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Assessment & Diagnostics' (Protocol in workflow.md)

## Phase 2: 8A - 30fps Render Loop Stabilization
- [ ] Task: Verify render loop implementation
    - [ ] Check `src/lib/render-loop.ts` exists and functions correctly
    - [ ] Check `src/hooks/use-render-loop.ts` exists and subscribes properly
    - [ ] Check `src/components/ui/fps-counter.tsx` exists and displays correctly
    - [ ] Verify render loop starts/stops on app mount/unmount in `src/app/(app)/layout.tsx`
- [ ] Task: Fix any render loop issues
    - [ ] Address TypeScript errors in render loop files
    - [ ] Ensure cleanup on unmount (no memory leaks)
    - [ ] Verify FPS counter toggle works (Ctrl+Shift+F)
- [ ] Task: Write tests for render loop
    - [ ] Unit test: RenderLoop class starts, ticks, and stops
    - [ ] Unit test: useRenderLoop hook subscribes and unsubscribes
    - [ ] Integration test: FPS counter renders with correct values
- [ ] Task: Conductor - User Manual Verification 'Phase 2: 8A - 30fps Render Loop Stabilization' (Protocol in workflow.md)

## Phase 3: 8B - Automatic Idle Detection Stabilization
- [ ] Task: Verify idle detection implementation
    - [ ] Check `src/hooks/use-idle-tracker.ts` exists and tracks events correctly
    - [ ] Check `src/lib/idle-processing.ts` has `processIdleTier` function
    - [ ] Check idle heartbeat API route exists (if created)
    - [ ] Verify idle indicator shows in layout footer
- [ ] Task: Fix any idle detection issues
    - [ ] Address TypeScript errors in idle tracking files
    - [ ] Ensure heartbeat fires at correct intervals
    - [ ] Verify tier calculation is correct (5/10/15/30 min)
- [ ] Task: Write tests for idle detection
    - [ ] Unit test: useIdleTracker hook calculates idle time correctly
    - [ ] Unit test: Idle tier calculation matches thresholds
    - [ ] Unit test: processIdleTier queues correct jobs per tier
- [ ] Task: Conductor - User Manual Verification 'Phase 3: 8B - Automatic Idle Detection Stabilization' (Protocol in workflow.md)

## Phase 4: 8C - Narrative Threads UI Stabilization
- [ ] Task: Verify narrative threads implementation
    - [ ] Check API routes: `src/app/api/narrative-threads/route.ts` and `[id]/route.ts`
    - [ ] Check pages: `src/app/(app)/narrative-threads/page.tsx` and `[id]/page.tsx`
    - [ ] Verify sidebar nav item exists in layout
    - [ ] Check thread CRUD operations work (create, read, update, delete)
- [ ] Task: Fix any narrative threads issues
    - [ ] Address TypeScript errors in thread files
    - [ ] Ensure API routes enforce user_id isolation
    - [ ] Verify unresolved items list works (add/edit/delete/check)
- [ ] Task: Write tests for narrative threads
    - [ ] Integration test: Thread CRUD API endpoints
    - [ ] Integration test: Filter by status and session
    - [ ] Unit test: Unresolved items management
- [ ] Task: Conductor - User Manual Verification 'Phase 4: 8C - Narrative Threads UI Stabilization' (Protocol in workflow.md)

## Phase 5: 8D - Timeline Management Stabilization
- [ ] Task: Verify timeline management implementation
    - [ ] Check API routes: `src/app/api/timelines/route.ts` and `[id]/route.ts`
    - [ ] Check pages: `src/app/(app)/timeline/page.tsx` and `[id]/page.tsx`
    - [ ] Verify sidebar nav item exists in layout
    - [ ] Check timeline CRUD operations work
- [ ] Task: Fix any timeline management issues
    - [ ] Address TypeScript errors in timeline files
    - [ ] Ensure year validation (integer)
    - [ ] Verify universe required validation
    - [ ] Check restrictions/factions stored as JSON arrays
- [ ] Task: Write tests for timeline management
    - [ ] Integration test: Timeline CRUD API endpoints
    - [ ] Unit test: Year and universe validation
    - [ ] Unit test: JSON array handling for restrictions/factions
- [ ] Task: Conductor - User Manual Verification 'Phase 5: 8D - Timeline Management Stabilization' (Protocol in workflow.md)

## Phase 6: 8E - Markdown Lore Editor Stabilization
- [ ] Task: Verify markdown lore editor implementation
    - [ ] Check `src/components/lore/lore-editor.tsx` exists
    - [ ] Check `src/components/lore/wikilink-autocomplete.tsx` exists
    - [ ] Check `src/components/lore/lore-browser.tsx` exists
    - [ ] Check `src/components/backlinks/backlink-panel.tsx` exists
    - [ ] Check `src/lib/backlinks.ts` exists with parsing functions
    - [ ] Verify edit page: `src/app/(app)/lore/[id]/edit/page.tsx`
    - [ ] Verify lore browser page: `src/app/(app)/lore/page.tsx`
- [ ] Task: Fix any lore editor issues
    - [ ] Address TypeScript errors in lore editor files
    - [ ] Ensure wikilink autocomplete positions correctly
    - [ ] Verify backlink parsing on save
    - [ ] Check canon layer selector works
    - [ ] Verify validation badge displays correct state
- [ ] Task: Write tests for lore editor
    - [ ] Unit test: Wikilink parsing regex
    - [ ] Unit test: Backlink inference from context
    - [ ] Integration test: Lore editor save writes markdown file
    - [ ] Integration test: Backlink panel shows correct links
- [ ] Task: Conductor - User Manual Verification 'Phase 6: 8E - Markdown Lore Editor Stabilization' (Protocol in workflow.md)

## Phase 7: Integration & Final Verification
- [ ] Task: Run full test suite
    - [ ] All unit tests pass
    - [ ] All integration tests pass
    - [ ] Coverage meets 80% threshold
- [ ] Task: Run quality gates
    - [ ] `npm run lint` passes with zero errors
    - [ ] TypeScript compilation succeeds
    - [ ] `npm run build` succeeds
- [ ] Task: Commit all Phase 8 changes
    - [ ] Atomic commits per task completed
    - [ ] Commit messages follow `type(scope): description` format
- [ ] Task: Conductor - User Manual Verification 'Phase 7: Integration & Final Verification' (Protocol in workflow.md)
