# Plan 010: Wiki Evolution Tooling (Bulk Operations, Merge, Dormancy)

## Goal
When the wiki grows, the user needs tools to restructure it without page-by-page work. This plan adds: bulk move / re-categorize, merge-duplicate suggestions, dormancy/deprecation, an admin panel for global operations, and a new background job that scans for inconsistencies. Built on Plans 008 and 009.

**Depends on:** Plan 008 (type registry), Plan 009 (subtype folder structure).

## Tasks

### Layer 1 (parallel, no deps)
- [ ] T1: Add dormancy frontmatter support (assigned: @builder)
  - Extend `WikiFrontmatter['status']` to include `'dormant'` in `src/lib/wiki/types.ts`
  - Update `validateWikiFrontmatter` to accept dormant (valid status)
  - `listWikiPages(wikiRoot, { includeDormant: false })` — option to exclude
  - File tree "Show dormant" toggle (default hidden)
  - `findOrphans` excludes dormant pages
  - LLM retrieval pipeline (`src/lib/retrieval.ts`) excludes dormant from default context
  - Dormant pages still resolve wikilinks (don't 404)
  - Tests in `src/lib/__tests__/frontmatter.test.ts` and `src/lib/wiki/__tests__/file-io.test.ts`
- [ ] T2: Build bulk-move operation (assigned: @builder)
  - `src/lib/wiki/bulk-move.ts`: `bulkMovePages(moves, wikiRoot)`
  - Input: `{ moves: Array<{oldPath, newPath, newSubtype?}>, dryRun: boolean }`
  - For each: calls existing `moveWikiPage` (already tested for single moves)
  - After all moves: runs `rewriteLinksForPageMove` once per affected file (batched — single wiki scan)
  - Returns: `{ moved: string[], failed: Array<{path, reason}>, linksUpdated: number }`
  - API: `POST /api/wiki/bulk-move` with the moves payload
  - Tests in `src/lib/wiki/__tests__/bulk-move.test.ts` (50-page move, all links updated)
- [ ] T3: Build bulk-re-categorize operation (assigned: @builder)
  - `src/lib/wiki/bulk-recategorize.ts`: `bulkRecategorize(filter, changes, wikiRoot)`
  - Filter: `{ type?, subtype?, tag?, status?, folder? }`
  - Changes: `{ newSubtype?, newTags?, newType?, newStatus? }`
  - If changes include `newSubtype`, also moves the file to the new subtype folder
  - Returns: list of affected pages + their proposed new state
  - API: `POST /api/wiki/bulk-recategorize` with `{filter, changes, dryRun}`
  - Use case: "Re-tag all my NPCs with `importance:high` to subtype `companion`"
  - Tests in `src/lib/wiki/__tests__/bulk-recategorize.test.ts`
- [ ] T4: Build merge-duplicates scanner (assigned: @builder)
  - `src/lib/wiki/merge-suggester.ts`: `findMergeCandidates(wikiRoot, options)`
  - Strategy A (cheap): same title (case-insensitive), different files
  - Strategy B (medium): high wikilink overlap (≥80% of links are the same)
  - Strategy C (expensive, LLM): "are these two pages about the same thing?" — calls Ollama for top 20 candidates
  - Returns: `Array<{pageA, pageB, confidence: 0-1, reason: string, strategy: 'A'|'B'|'C'}>`
  - API: `GET /api/wiki/merge-suggestions?strategy=A|B|C&limit=20`
  - Tests in `src/lib/wiki/__tests__/merge-suggestions.test.ts` — uses fixture wiki with known duplicates

### Layer 2 (depends on T1, T2, T3, T4)
- [ ] T5: Add `mergePages(keepPath, mergePath, wikiRoot)` (assigned: @builder, depends on T4)
  - Combines content from `mergePath` into `keepPath` (appends with `## Merged from <title> (<date>)` section)
  - Merges frontmatter: union of tags, concatenates summaries
  - Sets `mergePath.frontmatter.superseded_by = keepPath` and `superseded_at = <now>`
  - If `redirect: true`: creates `_review/redirects/<oldname>.md` (a stub with `superseded_by: keepPath`)
  - Rewrites all wikilinks pointing to `mergePath` → `keepPath`
  - Returns: `{ mergedFrom, kept, linksUpdated, redirectCreated: boolean }`
  - API: `POST /api/wiki/merge` with `{keepPath, mergePath, redirect: boolean}`
  - Tests in `src/lib/wiki/__tests__/merge.test.ts`
- [ ] T6: Build "Restructure" admin page (assigned: @builder, depends on T2, T3, T4, T5)
  - `src/app/(app)/admin/restructure/page.tsx`
  - **Tab 1: Bulk Move** — pick source folder, drag pages to destination folder, preview moves, "Apply" button
  - **Tab 2: Bulk Re-categorize** — filter builder (type/subtype/tag/folder), preview changes, "Apply" button
  - **Tab 3: Merge Suggestions** — list of pairs with confidence + reason, "Merge" / "Dismiss" buttons per row
  - **Tab 4: Dormancy** — list dormant pages, "Wake" / "Keep dormant" / "Delete permanently" buttons
  - All actions are dry-run by default, require explicit "Apply" click
- [ ] T7: Add "Mark as dormant" UI in page view (assigned: @builder, depends on T1)
  - In `src/components/wiki/frontmatter-properties-panel.tsx`, add a "Status" dropdown with "dormant" option
  - On save, sets `status: dormant` and `deprecated_at: <now>`
  - Confirmation dialog: "This page will be hidden from default views. Continue?"
  - Wake up: change status back to `draft`/`reviewed`/`locked`, clears `deprecated_at`

### Layer 3 (depends on T5, T6, T7)
- [ ] T8: Add LLM-powered restructuring job (assigned: @builder, depends on T4)
  - New job type: `wiki_suggest_restructure` registered in `src/lib/jobs/types.ts`
  - Handler in `src/lib/jobs/wiki-restructure-suggestions.ts`
  - Scans wiki, finds pages with inconsistent categorization:
    - Type in frontmatter doesn't match the folder it's in
    - Subtype not in the registry
    - Tags that suggest a different subtype
    - Wikilinks pointing to wrong folder
  - Returns: `Array<{page, issue, suggestion, confidence}>`
  - Stores suggestions in `wiki_restructure_suggestions` DB table
  - API trigger: `POST /api/jobs` with `{type: 'wiki_suggest_restructure'}`
  - UI in `/admin/restructure` Tab 5: shows suggestions
- [ ] T9: Add `superseded_by` resolution (assigned: @builder, depends on T5)
  - Frontmatter fields: `superseded_by: string` (path), `superseded_at: ISO date`
  - Wikilink resolver: if the target has `superseded_by`, follow the chain (one hop)
  - `resolveWikilink` in `src/lib/wiki/wikilinks.ts` updated
  - Hover-preview shows "this page was merged into X" if superseded
  - Tests in `src/lib/wiki/__tests__/wikilinks-rewrite.test.ts`
- [ ] T10: Documentation (assigned: @docs, depends on T6, T7, T8, T9)
  - `docs/wiki-evolution-tooling.md` — full guide
  - `docs/wiki-merge-workflow.md` — step-by-step merge guide
  - `docs/wiki-dormancy.md` — when and how to use dormant
  - `docs/wiki-bulk-operations.md` — bulk-move and bulk-recategorize guide
  - README updates: "Restructuring" section, "When to deprecate" section

## Verification
- [ ] T1: `bun test src/lib/__tests__/frontmatter.test.ts` — accepts 'dormant' status
- [ ] T2: `bun test src/lib/wiki/__tests__/bulk-move.test.ts` — moves 50 pages, all wikilinks updated, linksUpdated > 0
- [ ] T3: `bun test src/lib/wiki/__tests__/bulk-recategorize.test.ts` — filter + change + dry-run works
- [ ] T4: `bun test src/lib/wiki/__tests__/merge-suggestions.test.ts` — finds known duplicates with confidence > 0.8
- [ ] T5: `bun test src/lib/wiki/__tests__/merge.test.ts` — content combines, links redirect, superseded_by set
- [ ] T6: `curl -s http://localhost:3000/admin/restructure` returns 200 (manual test, but smoke-test the route exists)
- [ ] T7: Manual test — mark a page dormant, verify it disappears from file tree, wake it up, verify it returns
- [ ] T8: `curl -X POST -H "Content-Type: application/json" -d '{"type":"wiki_suggest_restructure"}' http://localhost:3000/api/jobs` returns 200 with `jobId`
- [ ] T9: `bun test src/lib/wiki/__tests__/wikilinks-rewrite.test.ts` — superseded link resolves to new path
- [ ] T10: `python -c "import os; assert all(os.path.getsize(f'docs/{n}') > 500 for n in ['wiki-evolution-tooling.md','wiki-merge-workflow.md','wiki-dormancy.md','wiki-bulk-operations.md'])"` exits 0
- [ ] Build: `npm run build` exits 0
- [ ] All tests: `bun test` reports 89+ existing + 35+ new = 124+ pass
