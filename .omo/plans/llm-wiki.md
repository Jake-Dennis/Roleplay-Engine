# LLM Wiki Implementation — Lore System Replacement

## TL;DR

> **Quick Summary**: Replace the existing lore system (38 files, 12 DB tables) with an LLM Wiki pattern — a persistent, compounding markdown wiki with a custom Obsidian-like viewer, schema-driven LLM operations, and phased migration to avoid breaking changes.
> 
> **Deliverables**: 
> - Custom wiki viewer (graph view, backlinks, file tree, search, markdown rendering)
> - WIKI_SCHEMA.md + LLM operations (ingest/query/lint)
> - Index.md retrieval system + compound query answer filing
> - Phased migration from old lore system with rollback capability
> 
> **Estimated Effort**: Large (7 waves, 28 tasks)
> **Parallel Execution**: YES — 7 waves with 3-7 tasks each
> **Critical Path**: Scaffolding → Wiki Core → Viewer → LLM Operations → Migration → Integration → Review

---

## Context

### Original Request
User wants to implement the LLM Wiki pattern into their Roleplay-Engine, replacing the existing lore system entirely. They want a custom Obsidian-like viewer (not relying on external Obsidian), with LLM operations (ingest/query/lint) as the highest priority outcome.

### Interview Summary
**Key Discussions**:
- **Scope**: All 4 improvements (WIKI_SCHEMA.md, compound query answers, index file, Obsidian-like viewer)
- **Integration**: Replace lore system entirely (not enhance or run parallel)
- **Priority**: LLM operations (ingest/query/lint) as highest priority
- **Migration**: Phased approach (Metis recommendation) — build alongside, then switch, then cleanup

**Research Findings**:
- **Current system**: 38 files, 12 DB tables, 16 lib files, 11 API routes, 10+ UI files, 17 job types
- **Wiki viewer stack**: react-markdown + @flowershow/remark-wiki-link + Cytoscape.js + gray-matter + FlexSearch
- **Reference projects**: Quartz v4 (gold standard, 12k stars), Flowershow (Next.js native)

### Metis Review
**Identified Gaps** (addressed):
- **Migration strategy**: Added phased approach — build wiki alongside old system, redirect retrieval, then cleanup
- **DB table handling**: Operational tables (job_queue, users, sessions) stay; content tables migrate to wiki files
- **Viewer scope lock**: Explicitly scoped to graph view, backlinks, file tree, search, markdown rendering — no Kanban, calendar, mind maps
- **Validation workflow**: Frontmatter-based status (draft/reviewed/locked) replaces separate lore_validations table
- **Edge cases**: Added tasks for wikilink collision handling, orphan detection, concurrent edit protection, page size limits

---

## Work Objectives

### Core Objective
Build a persistent, LLM-maintained wiki system that replaces the current lore database, with a custom in-app viewer that provides Obsidian-like navigation (graph view, backlinks, wikilinks, file tree, search).

### Concrete Deliverables
- `src/components/wiki/` — Wiki viewer components (markdown renderer, graph view, backlinks, file tree, search)
- `src/lib/wiki/` — Wiki operations (ingest, query, lint, index management, wikilink resolution)
- `data/{userId}/wiki/` — Wiki file structure with WIKI_SCHEMA.md, index.md, log.md
- Updated job processor — Wiki enrichment jobs replace old lore expansion jobs
- Updated retrieval pipeline — Uses wiki index + pages instead of DB queries
- Migration scripts — Convert existing lore files to wiki pages

### Definition of Done
- [ ] All existing lore content migrated to wiki files and viewable in new wiki viewer
- [ ] `npm run build` passes with zero errors
- [ ] `npm test` passes (existing tests updated for new system)
- [ ] Wiki viewer renders markdown with wikilinks, shows graph view, displays backlinks, supports search
- [ ] LLM ingest job processes a new source and creates/updates wiki pages
- [ ] LLM query retrieves from wiki and synthesizes answers
- [ ] LLM lint pass detects contradictions, orphan pages, stale claims
- [ ] Old lore API routes return 410 Gone or redirect to wiki equivalents

### Must Have
- Markdown-first wiki files (readable without app, valid markdown)
- Wikilink parsing and rendering (`[[link]]`, `[[link|alias]]`)
- Graph visualization of wiki connections
- Backlink panel showing incoming links
- File tree navigation
- Full-text search
- WIKI_SCHEMA.md defining conventions
- Index.md for retrieval first-pass filtering
- LLM operations: ingest, query, lint
- Phased migration with rollback capability
- Validation workflow (LLM proposes, user reviews)

### Must NOT Have (Guardrails)
- No Kanban boards, calendar views, mind maps, canvas mode in wiki viewer
- No big-bang replacement — phased cutover only
- No data loss — every existing lore entry must be convertible
- No breaking changes to retrieval API shape during migration
- No proprietary binary formats — all wiki content is markdown
- No immediate deletion of old DB tables — keep for N days after migration
- No wiki page size unbounded growth — enforce split-into-subpages logic
- No cross-universe wikilinks without explicit namespace (`[[Universe::Page]]`)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (existing test infrastructure)
- **Automated tests**: Tests-after (add test tasks after implementation tasks)
- **Framework**: Existing test framework (vitest/jest as configured)
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks regardless of test choice)

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Playwright — navigate, interact, assert DOM, screenshot
- **API/Backend**: Bash (curl) — send requests, assert status + response fields
- **Library/Module**: Bash (node REPL) — import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — scaffolding + foundation):
├── Task 1: Wiki directory structure + WIKI_SCHEMA.md [quick]
├── Task 2: Wiki file I/O library (read/write/frontmatter) [quick]
├── Task 3: Wikilink parsing + resolution library [quick]
├── Task 4: Index.md generator + maintainer [quick]
├── Task 5: Log.md append-only logger [quick]
└── Task 6: Markdown renderer component (react-markdown + wikilinks) [quick]

Wave 2 (After Wave 1 — wiki viewer core):
├── Task 7: File tree navigation component [quick]
├── Task 8: Backlink panel component [quick]
├── Task 9: Graph visualization (Cytoscape.js) [unspecified-high]
├── Task 10: Full-text search (FlexSearch) [quick]
└── Task 11: Wiki page layout + routing [quick]

Wave 3 (After Wave 2 — LLM operations):
├── Task 12: Ingest job — process new source into wiki [deep]
├── Task 13: Query pipeline — retrieve from wiki + synthesize [deep]
├── Task 14: Lint pass — contradiction detection + health check [deep]
├── Task 15: Compound answer filing — save query answers as wiki pages [unspecified-high]
└── Task 16: Validation workflow — draft/reviewed/locked frontmatter [quick]

Wave 4 (After Wave 3 — migration):
├── Task 17: Migration script — locations → wiki pages [quick]
├── Task 18: Migration script — NPCs → wiki pages [quick]
├── Task 19: Migration script — events → wiki pages [quick]
├── Task 20: Migration script — relationships → wiki pages [quick]
└── Task 21: Migration script — backlinks + validations → wiki [quick]

Wave 5 (After Wave 4 — integration):
├── Task 22: Updated retrieval pipeline — wiki-first context [deep]
├── Task 23: Updated job processor — wiki enrichment jobs [deep]
├── Task 24: Updated idle-time processing — wiki enrichment tiers [unspecified-high]
├── Task 25: API route updates — wiki CRUD, lore route deprecation [quick]
└── Task 26: Nav updates — wiki replaces lore in app shell [quick]

Wave 6 (After Wave 5 — edge cases + polish):
├── Task 27: Wikilink collision handling + namespace resolution [quick]
├── Task 28: Orphan page detection + flagging [quick]
├── Task 29: Concurrent edit protection (last-writer-wins + diff) [unspecified-high]
├── Task 30: Page size limits + split-into-subpages logic [quick]
└── Task 31: Empty states + error states + loading states [visual-engineering]

Wave 7 (After Wave 6 — cleanup + final):
├── Task 32: Old DB table deprecation plan + cleanup script [quick]
├── Task 33: Performance benchmark + optimization [unspecified-high]
└── Task 34: Documentation + migration guide [writing]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix
- **1-6**: — (all independent, start immediately)
- **7-11**: 6 (viewer components depend on markdown renderer)
- **12-16**: 1-5 (LLM operations depend on wiki I/O, wikilinks, index, log)
- **17-21**: 1-3 (migration depends on wiki structure, file I/O, wikilinks)
- **22-26**: 12-16, 17-21 (integration depends on LLM ops + migration)
- **27-31**: 7-11, 12-16 (edge cases depend on viewer + LLM ops)
- **32-34**: 22-26, 27-31 (cleanup depends on integration + edge cases)
- **F1-F4**: ALL tasks (final review depends on everything)

### Agent Dispatch Summary
- **Wave 1**: 6 tasks — T1-T5 → `quick`, T6 → `quick`
- **Wave 2**: 5 tasks — T7-T8 → `quick`, T9 → `unspecified-high`, T10 → `quick`, T11 → `quick`
- **Wave 3**: 5 tasks — T12-T14 → `deep`, T15 → `unspecified-high`, T16 → `quick`
- **Wave 4**: 5 tasks — T17-T21 → `quick`
- **Wave 5**: 5 tasks — T22-T23 → `deep`, T24 → `unspecified-high`, T25-T26 → `quick`
- **Wave 6**: 5 tasks — T27-T28 → `quick`, T29 → `unspecified-high`, T30 → `quick`, T31 → `visual-engineering`
- **Wave 7**: 3 tasks — T32 → `quick`, T33 → `unspecified-high`, T34 → `writing`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Wiki Directory Structure + WIKI_SCHEMA.md

  **What to do**:
  - Create `data/{userId}/wiki/` directory structure with subfolders: `entities/`, `concepts/`, `sources/`, `synthesis/`, `_review/`
  - Create `WIKI_SCHEMA.md` defining: page types, frontmatter structure, wikilink conventions, folder rules, validation workflow, lint rules
  - Create `index.md` template (auto-generated) and `log.md` template (append-only)
  - Update `src/lib/entity-constants.ts` with wiki path constants

  **Must NOT do**: Modify existing lore directories, create wiki content, change API routes

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 1 (with Tasks 2-6), Blocks: 12-21, Blocked By: None

  **References**: `src/lib/entity-constants.ts`, `data/` directory structure, LLM Wiki pattern doc

  **Acceptance Criteria**:
  - [ ] `data/{userId}/wiki/` created with all subfolders
  - [ ] `WIKI_SCHEMA.md`, `index.md`, `log.md` templates exist
  - [ ] `entity-constants.ts` updated

  **QA Scenarios**:
  ```
  Scenario: Wiki directory structure exists
    Tool: Bash
    Steps: Test-Path for each subfolder (entities, concepts, sources, synthesis, _review)
    Expected: All return True
    Evidence: .omo/evidence/task-1-dir.txt
  ```

  **Commit**: YES (groups with 2-6)
  - Message: `feat(wiki): add wiki directory structure and WIKI_SCHEMA.md`

- [x] 2. Wiki File I/O Library

  **What to do**: Create `src/lib/wiki/file-io.ts` with readWikiPage, writeWikiPage, deleteWikiPage, listWikiPages, sanitizeWikiFilename. Use gray-matter for frontmatter. Add file locking and frontmatter validation.

  **Must NOT do**: Modify lore-markdown.ts, add wikilink parsing, add DB operations

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 1 (with Tasks 1, 3-6), Blocks: 12-21, Blocked By: None

  **References**: `src/lib/lore-markdown.ts`, gray-matter package

  **Acceptance Criteria**:
  - [ ] readWikiPage returns { content, frontmatter }
  - [ ] writeWikiPage creates markdown with frontmatter
  - [ ] deleteWikiPage removes file
  - [ ] listWikiPages returns array of { path, frontmatter }
  - [ ] sanitizeWikiFilename handles Windows-invalid chars, truncates to 100
  - [ ] File locking prevents concurrent writes

  **QA Scenarios**:
  ```
  Scenario: Write/read roundtrip
    Tool: Bash (node REPL)
    Steps: Write page with frontmatter, read it back, assert content and frontmatter match
    Evidence: .omo/evidence/task-2-roundtrip.txt
  ```

  **Commit**: YES (groups with 1, 3-6)

- [x] 3. Wikilink Parsing + Resolution Library

  **What to do**: Create `src/lib/wiki/wikilinks.ts` with parseWikilinks, resolveWikilink, buildLinkGraph, validateWikilinks. Parse [[link]], [[link|alias]], ![[embed]]. Build adjacency map for graph. Detect broken links.

  **Must NOT do**: Render wikilinks as HTML, store backlinks in DB, modify backlinks.ts

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 1 (with Tasks 1-2, 4-6), Blocks: 7-16, Blocked By: None

  **References**: `src/lib/backlinks.ts`, regex `/\[\[([^\[\]]+?)(?:\|([^\[\]]+))?\]\]/g`

  **Acceptance Criteria**:
  - [ ] parseWikilinks extracts all [[links]] and [[links|aliases]]
  - [ ] resolveWikilink returns full path for valid link
  - [ ] buildLinkGraph returns adjacency map
  - [ ] validateWikilinks returns broken links with context
  - [ ] Handles ![[embed]] syntax

  **QA Scenarios**:
  ```
  Scenario: Parse wikilinks from content
    Tool: Bash (node REPL)
    Steps: parseWikilinks('See [[Haleth]] and [[River|the river]]') → ['Haleth', 'River']
    Evidence: .omo/evidence/task-3-parse.txt
  ```

  **Commit**: YES (groups with 1-2, 4-6)

- [x] 4. Index.md Generator + Maintainer

- [x] 5. Log.md Append-Only Logger

- [x] 6. Markdown Renderer Component

  **What to do**: Create `src/components/wiki/markdown-renderer.tsx` using react-markdown + remark-gfm + @flowershow/remark-wiki-link. Configure wikilink plugin for wiki routes. Style wikilinks (blue=exists, red=broken). Show frontmatter metadata panel. Add loading/error states.

  **Must NOT do**: Build full wiki page layout, add graph visualization, add search

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 1 (with Tasks 1-5), Blocks: 7-11, Blocked By: None

  **References**: react-markdown, @flowershow/remark-wiki-link, remark-gfm, gray-matter, `src/lib/markdown-renderer.ts`

  **Acceptance Criteria**:
  - [ ] Renders markdown with GFM extensions
  - [ ] Wikilinks styled as internal links (blue=exists, red=broken)
  - [ ] [[link|alias]] renders alias text with correct href
  - [ ] ![[embed]] renders as embedded file link
  - [ ] Frontmatter metadata displayed above content
  - [ ] Loading/error states present

  **QA Scenarios**:
  ```
  Scenario: Render markdown with wikilinks
    Tool: Playwright
    Steps: Render page with [[Haleth]] and [[Nonexistent|missing]], assert link classes and alias text
    Evidence: .omo/evidence/task-6-render.png
  ```

  **Commit**: YES (groups with 1-5)
  - Pre-commit: `npm run build`

- [x] 7. File Tree Navigation Component

  **What to do**: Create `src/components/wiki/file-tree.tsx` — recursive tree component showing wiki folder structure. Expandable/collapsible folders. Click to navigate to page. Highlight current page. Show file type icons (entity, concept, source, synthesis). Filter by universe.

  **Must NOT do**: Add search functionality (Task 10), add graph view (Task 9)

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 2 (with Tasks 8-11), Blocks: 11 (wiki page layout), Blocked By: 6 (markdown renderer)

  **References**: `src/lib/wiki/file-io.ts` (listWikiPages), existing file tree patterns in codebase

  **Acceptance Criteria**:
  - [ ] Tree renders folder structure from wiki directory
  - [ ] Folders expand/collapse on click
  - [ ] Clicking file navigates to wiki page route
  - [ ] Current page highlighted in tree
  - [ ] File type icons shown based on frontmatter type

  **QA Scenarios**:
  ```
  Scenario: File tree renders and navigates
    Tool: Playwright
    Steps: Render tree with test wiki pages, click folder to expand, click file to navigate
    Evidence: .omo/evidence/task-7-tree.png
  ```

  **Commit**: YES (groups with 8-11)

- [x] 8. Backlink Panel Component

  **What to do**: Create `src/components/wiki/backlink-panel.tsx` — shows incoming links to current page. Uses wikilinks.ts buildLinkGraph to find pages linking to current page. Show link context snippet (200 chars around wikilink). Click to navigate to source page. Show count of backlinks.

  **Must NOT do**: Store backlinks in DB, modify existing backlinks.ts

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 2 (with Tasks 7, 9-11), Blocks: 11, Blocked By: 3, 6

  **References**: `src/lib/wiki/wikilinks.ts`, `src/lib/backlinks.ts` (for reference only)

  **Acceptance Criteria**:
  - [ ] Panel shows all pages linking to current page
  - [ ] Each backlink shows context snippet
  - [ ] Click backlink navigates to source page
  - [ ] Backlink count displayed

  **QA Scenarios**:
  ```
  Scenario: Backlink panel shows incoming links
    Tool: Playwright
    Steps: Create page A with [[B]], page C with [[B]], open page B, verify backlinks from A and C shown
    Evidence: .omo/evidence/task-8-backlinks.png
  ```

  **Commit**: YES (groups with 7, 9-11)

- [x] 9. Graph Visualization (Cytoscape.js)

  **What to do**: Create `src/components/wiki/graph-view.tsx` using Cytoscape.js. Force-directed layout (cose algorithm). Nodes = wiki pages (colored by type: entity=blue, concept=green, source=orange, synthesis=purple). Edges = wikilinks. Click node to navigate. Zoom/pan controls. Filter by universe.

  **Must NOT do**: Add drag physics customization, animation controls, relationship strength visualization (v1 scope)

  **Recommended Agent Profile**: `unspecified-high`
    - Reason: Cytoscape.js integration requires careful configuration for performance and UX

  **Parallelization**: Wave 2 (with Tasks 7-8, 10-11), Blocks: 11, Blocked By: 3, 6

  **References**: Cytoscape.js docs, react-cytoscapejs wrapper, `src/lib/wiki/wikilinks.ts` (buildLinkGraph)

  **Acceptance Criteria**:
  - [ ] Graph renders with force-directed layout
  - [ ] Nodes colored by page type
  - [ ] Edges represent wikilinks
  - [ ] Click node navigates to page
  - [ ] Zoom/pan works
  - [ ] Filter by universe hides unrelated nodes

  **QA Scenarios**:
  ```
  Scenario: Graph renders and navigates
    Tool: Playwright
    Steps: Create 5 interconnected wiki pages, open graph view, verify nodes and edges render, click node to navigate
    Evidence: .omo/evidence/task-9-graph.png
  ```

  **Commit**: YES (groups with 7-8, 10-11)
  - Pre-commit: `npm run build`

- [x] 10. Full-Text Search (FlexSearch)

  **What to do**: Create `src/components/wiki/search.tsx` using FlexSearch. Build index from all wiki pages (title, content, tags). Search bar with autocomplete. Results show: page title, matching snippet with highlight, type badge. Click result to navigate. Keyboard navigation (arrow keys, Enter to select).

  **Must NOT do**: Use SQLite FTS5, build dedicated search engine, add vector search

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 2 (with Tasks 7-9, 11), Blocks: 11, Blocked By: 1, 2

  **References**: FlexSearch docs, `src/lib/wiki/file-io.ts` (listWikiPages for index building)

  **Acceptance Criteria**:
  - [ ] Search bar renders with autocomplete
  - [ ] Index built from all wiki pages (title, content, tags)
  - [ ] Results show title, snippet with highlight, type badge
  - [ ] Click result navigates to page
  - [ ] Keyboard navigation works (arrows, Enter, Escape)

  **QA Scenarios**:
  ```
  Scenario: Search finds wiki pages
    Tool: Playwright
    Steps: Create pages with known content, type search query, verify results appear with highlights
    Evidence: .omo/evidence/task-10-search.png
  ```

  **Commit**: YES (groups with 7-9, 11)

- [x] 11. Wiki Page Layout + Routing

  **What to do**: Create `src/app/(app)/wiki/page.tsx` (wiki home with file tree) and `src/app/(app)/wiki/[...slug]/page.tsx` (individual wiki page). Layout: left sidebar (file tree), main content (markdown renderer), right sidebar (backlinks, metadata). Add wiki nav item to app shell. Update navigation.

  **Must NOT do**: Add graph view to page (separate route), add search to page (component in sidebar)

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 2 (with Tasks 7-10), Blocks: 27-31 (edge cases), Blocked By: 6, 7, 8, 9, 10

  **References**: `src/components/wiki/markdown-renderer.tsx`, `src/components/wiki/file-tree.tsx`, `src/components/wiki/backlink-panel.tsx`, existing app layout patterns

  **Acceptance Criteria**:
  - [ ] /wiki route shows wiki home with file tree
  - [ ] /wiki/[...slug] renders individual wiki page
  - [ ] Layout: left sidebar (tree), main (content), right (backlinks)
  - [ ] Wiki nav item in app shell
  - [ ] Wikilinks in content navigate to other wiki pages

  **QA Scenarios**:
  ```
  Scenario: Wiki page layout renders correctly
    Tool: Playwright
    Steps: Navigate to /wiki, verify file tree shows, click page, verify 3-column layout renders
    Evidence: .omo/evidence/task-11-layout.png
  ```

  **Commit**: YES (groups with 7-10)

- [x] 12. Ingest Job — Process New Source into Wiki

  **What to do**: Create `src/lib/wiki/ingest.ts` with ingestSource(sourcePath, wikiRoot, universeId). Flow: read source → extract key entities/concepts → create/update wiki pages → update index → update relevant entity pages → append to log. Use LLM to extract structured data from source. Create validation entries for new pages (status: draft).

  **Must NOT do**: Modify existing lore expansion jobs, batch ingest without supervision (v1 is single-source)

  **Recommended Agent Profile**: `deep`
    - Reason: Complex LLM integration with structured extraction, page creation, and cross-referencing

  **Parallelization**: Wave 3 (with Tasks 13-16), Blocks: 22-24 (integration), Blocked By: 1-5

  **References**: `src/lib/wiki/file-io.ts`, `src/lib/wiki/index-generator.ts`, `src/lib/wiki/logger.ts`, `src/lib/wiki/wikilinks.ts`, existing job processor patterns

  **Acceptance Criteria**:
  - [ ] ingestSource reads source file and extracts entities/concepts
  - [ ] Creates new wiki pages for extracted entities
  - [ ] Updates existing pages with new information
  - [ ] Updates index.md after ingest
  - [ ] Appends ingest entry to log.md
  - [ ] New pages have status: draft (pending review)

  **QA Scenarios**:
  ```
  Scenario: Ingest article creates wiki pages
    Tool: Bash (node REPL)
    Steps: Create test article markdown, run ingestSource, verify wiki pages created, index updated, log appended
    Evidence: .omo/evidence/task-12-ingest.txt
  ```

  **Commit**: YES (groups with 13-16)

- [x] 13. Query Pipeline — Retrieve from Wiki + Synthesize

  **What to do**: Create `src/lib/wiki/query.ts` with queryWiki(query, wikiRoot, universeId). Flow: read index.md for first-pass filtering → read relevant full pages → send to LLM for synthesis → return answer with citations. Use FlexSearch for full-text search as fallback. Return structured answer: { answer, citations: [pagePath, relevantSection] }.

  **Must NOT do**: Replace existing retrieval pipeline yet (parallel during migration), use embedding-based search

  **Recommended Agent Profile**: `deep`
    - Reason: Requires careful prompt engineering for synthesis and citation accuracy

  **Parallelization**: Wave 3 (with Tasks 12, 14-16), Blocks: 22 (retrieval update), Blocked By: 1, 2, 4, 10

  **References**: `src/lib/wiki/index-generator.ts`, `src/lib/wiki/file-io.ts`, `src/components/wiki/search.tsx` (FlexSearch integration), existing retrieval.ts patterns

  **Acceptance Criteria**:
  - [ ] queryWiki reads index for first-pass filtering
  - [ ] Reads full pages for relevant entries
  - [ ] LLM synthesizes answer with citations
  - [ ] Returns { answer, citations } structure
  - [ ] FlexSearch fallback when index doesn't match

  **QA Scenarios**:
  ```
  Scenario: Query wiki and get synthesized answer
    Tool: Bash (node REPL)
    Steps: Create wiki with known content, run queryWiki, verify answer cites correct pages
    Evidence: .omo/evidence/task-13-query.txt
  ```

  **Commit**: YES (groups with 12, 14-16)

- [x] 14. Lint Pass — Contradiction Detection + Health Check

  **What to do**: Create `src/lib/wiki/lint.ts` with lintWiki(wikiRoot, universeId). Checks: contradictions between pages (same entity, conflicting claims), stale claims (newer source supersedes older), orphan pages (no inbound links), missing pages (wikilink targets don't exist), missing cross-references (related concepts not linked). Return structured report: { contradictions, staleClaims, orphans, missingPages, suggestions }.

  **Must NOT do**: Replace existing contradiction-detector.ts yet, auto-fix issues (v1 is report-only)

  **Recommended Agent Profile**: `deep`
    - Reason: Complex analysis across multiple pages, LLM-based contradiction detection

  **Parallelization**: Wave 3 (with Tasks 12-13, 15-16), Blocks: 24 (idle-time update), Blocked By: 1-3

  **References**: `src/lib/contradiction-detector.ts`, `src/lib/semantic-contradiction.ts`, `src/lib/wiki/wikilinks.ts`, `src/lib/wiki/file-io.ts`

  **Acceptance Criteria**:
  - [ ] lintWiki scans all wiki pages
  - [ ] Detects contradictions between pages
  - [ ] Identifies orphan pages (no backlinks)
  - [ ] Finds broken wikilinks
  - [ ] Returns structured report with suggestions

  **QA Scenarios**:
  ```
  Scenario: Lint detects contradictions
    Tool: Bash (node REPL)
    Steps: Create two pages with conflicting claims about same entity, run lintWiki, verify contradiction reported
    Evidence: .omo/evidence/task-14-lint.txt
  ```

  **Commit**: YES (groups with 12-13, 15-16)

- [x] 15. Compound Answer Filing — Save Query Answers as Wiki Pages

  **What to do**: Extend query pipeline to optionally file answers back into wiki. After queryWiki returns answer, offer to create new wiki page: `synthesis/{query-slug}.md` with answer content, citations, and links to source pages. Update index.md. Append to log.md. Create cross-references from source pages to new synthesis page.

  **Must NOT do**: Auto-file every answer (user must opt-in), file answers without citations

  **Recommended Agent Profile**: `unspecified-high`

  **Parallelization**: Wave 3 (with Tasks 12-14, 16), Blocks: 22, Blocked By: 12, 13

  **References**: `src/lib/wiki/query.ts`, `src/lib/wiki/file-io.ts`, `src/lib/wiki/index-generator.ts`, `src/lib/wiki/logger.ts`

  **Acceptance Criteria**:
  - [ ] fileAnswer creates synthesis page with answer content
  - [ ] Page includes citations and links to source pages
  - [ ] Index.md updated
  - [ ] Log.md appended
  - [ ] Cross-references added from source pages

  **QA Scenarios**:
  ```
  Scenario: File query answer as wiki page
    Tool: Bash (node REPL)
    Steps: Run query, file answer, verify synthesis page created with citations and cross-references
    Evidence: .omo/evidence/task-15-file.txt
  ```

  **Commit**: YES (groups with 12-14, 16)

- [x] 16. Validation Workflow — Draft/Reviewed/Locked Frontmatter

  **What to do**: Implement validation workflow using frontmatter status field. States: draft (LLM-generated, pending review) → reviewed (user-approved) → locked (immutable, cannot be modified by LLM). Create `src/lib/wiki/validation.ts` with: validatePage(path), rejectPage(path, reason), lockPage(path). UI: show validation status badge in markdown renderer. Filter wiki by status.

  **Must NOT do**: Use separate DB table for validations (file-only), auto-validate LLM-generated pages

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 3 (with Tasks 12-15), Blocks: 22-24, Blocked By: 1, 2

  **References**: `src/lib/wiki/file-io.ts`, existing lore_validations table patterns, `src/components/wiki/markdown-renderer.tsx`

  **Acceptance Criteria**:
  - [ ] validatePage changes status from draft to reviewed
  - [ ] rejectPage changes status and records reason
  - [ ] lockPage prevents LLM modifications
  - [ ] Validation status badge shown in renderer
  - [ ] Wiki can be filtered by status

  **QA Scenarios**:
  ```
  Scenario: Validate and lock wiki page
    Tool: Bash (node REPL)
    Steps: Create draft page, validate it, lock it, verify status changes and lock prevents modification
    Evidence: .omo/evidence/task-16-validation.txt
  ```

  **Commit**: YES (groups with 12-15)

- [x] 17. Migration Script — Locations → Wiki Pages

  **What to do**: Create `scripts/migrate-locations-to-wiki.ts`. Read all locations from DB + markdown files. Convert to wiki page format: entities/{location-name}.md. Map frontmatter: name→title, canon_tier→status (immutable_canon→locked, generated_lore→draft, etc.), importance→tags, file_path→source_ref. Preserve wikilinks in content. Update index.md. Run in dry-run mode first.

  **Must NOT do**: Delete old location files or DB entries, modify content during migration

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 4 (with Tasks 18-21), Blocks: 22-26, Blocked By: 1-3

  **References**: `src/lib/wiki/file-io.ts`, `src/lib/wiki/wikilinks.ts`, `src/lib/wiki/index-generator.ts`, `src/lib/lore-markdown.ts`, locations DB schema

  **Acceptance Criteria**:
  - [ ] Script reads all locations from DB
  - [ ] Creates wiki pages in entities/ folder
  - [ ] Frontmatter mapped correctly (canon_tier→status, etc.)
  - [ ] Wikilinks preserved in content
  - [ ] Dry-run mode shows what would be created
  - [ ] Old files/DB entries untouched

  **QA Scenarios**:
  ```
  Scenario: Migrate locations to wiki pages
    Tool: Bash
    Steps: Run migration script in dry-run mode, verify output, run for real, verify wiki pages created
    Evidence: .omo/evidence/task-17-migrate.txt
  ```

  **Commit**: YES (groups with 18-21)

- [x] 18. Migration Script — NPCs → Wiki Pages

  **What to do**: Create `scripts/migrate-npcs-to-wiki.ts`. Same pattern as locations: read NPCs from DB + files, convert to entities/{npc-name}.md. Map frontmatter: name→title, canon_tier→status, location_id→wikilink to location, tags→tags, importance→tags. Preserve wikilinks. Update index.

  **Must NOT do**: Delete old NPC files or DB entries

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 4 (with Tasks 17, 19-21), Blocks: 22-26, Blocked By: 1-3

  **References**: `src/lib/wiki/file-io.ts`, `src/lib/wiki/wikilinks.ts`, `src/lib/wiki/index-generator.ts`, NPCs DB schema

  **Acceptance Criteria**:
  - [ ] Script reads all NPCs from DB
  - [ ] Creates wiki pages in entities/ folder
  - [ ] location_id converted to [[wikilink]] to location page
  - [ ] Frontmatter mapped correctly
  - [ ] Old files/DB entries untouched

  **QA Scenarios**:
  ```
  Scenario: Migrate NPCs to wiki pages
    Tool: Bash
    Steps: Run migration, verify NPC pages created with location wikilinks
    Evidence: .omo/evidence/task-18-migrate.txt
  ```

  **Commit**: YES (groups with 17, 19-21)

- [x] 19. Migration Script — Events → Wiki Pages

  **What to do**: Create `scripts/migrate-events-to-wiki.ts`. Read events from DB, convert to entities/{event-title}.md. Map frontmatter: title→title, event_type→tags, location_id→wikilink, participants→wikilinks, occurred_at→date tag. Preserve outcome/consequences in content. Update index.

  **Must NOT do**: Delete old event files or DB entries

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 4 (with Tasks 17-18, 20-21), Blocks: 22-26, Blocked By: 1-3

  **References**: `src/lib/wiki/file-io.ts`, `src/lib/wiki/wikilinks.ts`, events DB schema

  **Acceptance Criteria**:
  - [ ] Script reads all events from DB
  - [ ] Creates wiki pages in entities/ folder
  - [ ] location_id, participants converted to wikilinks
  - [ ] occurred_at mapped to date tag
  - [ ] Old files/DB entries untouched

  **QA Scenarios**:
  ```
  Scenario: Migrate events to wiki pages
    Tool: Bash
    Steps: Run migration, verify event pages created with wikilinks to locations and participants
    Evidence: .omo/evidence/task-19-migrate.txt
  ```

  **Commit**: YES (groups with 17-18, 20-21)

- [x] 20. Migration Script — Relationships → Wiki Pages

  **What to do**: Create `scripts/migrate-relationships-to-wiki.ts`. Read relationships from DB, convert to entities/{source}-{target}-relationship.md. Map frontmatter: source_entity→wikilink, target_entity→wikilink, emotional_state→tags, relationship_stage→tags. Store shared_history as content. Update index.

  **Must NOT do**: Delete old relationship files or DB entries, lose emotional state data

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 4 (with Tasks 17-19, 21), Blocks: 22-26, Blocked By: 1-3

  **References**: `src/lib/wiki/file-io.ts`, `src/lib/wiki/wikilinks.ts`, relationships DB schema

  **Acceptance Criteria**:
  - [ ] Script reads all relationships from DB
  - [ ] Creates wiki pages in entities/ folder
  - [ ] source/target entities converted to wikilinks
  - [ ] Emotional state and stage preserved in frontmatter
  - [ ] Old files/DB entries untouched

  **QA Scenarios**:
  ```
  Scenario: Migrate relationships to wiki pages
    Tool: Bash
    Steps: Run migration, verify relationship pages created with entity wikilinks and emotional state
    Evidence: .omo/evidence/task-20-migrate.txt
  ```

  **Commit**: YES (groups with 17-19, 21)

- [x] 21. Migration Script — Backlinks + Validations → Wiki

  **What to do**: Create `scripts/migrate-backlinks-validations.ts`. Backlinks: rebuild from wiki pages using wikilinks.ts (no need to migrate DB backlinks — they're derived from content). Validations: convert lore_validations to wiki page frontmatter status (generated_unverified→draft, under_review→draft, validated→reviewed, rejected→delete page or mark status:rejected). Update index.

  **Must NOT do**: Keep separate backlink storage, lose validation history

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 4 (with Tasks 17-20), Blocks: 22-26, Blocked By: 1-3

  **References**: `src/lib/wiki/wikilinks.ts`, `src/lib/wiki/index-generator.ts`, backlinks DB schema, lore_validations DB schema

  **Acceptance Criteria**:
  - [ ] Backlinks rebuilt from wiki page content
  - [ ] Validation states converted to frontmatter status
  - [ ] Rejected pages marked or removed
  - [ ] Index updated
  - [ ] Old DB entries untouched

  **QA Scenarios**:
  ```
  Scenario: Rebuild backlinks from wiki pages
    Tool: Bash
    Steps: Run migration, verify backlinks match wikilinks in wiki pages
    Evidence: .omo/evidence/task-21-migrate.txt
  ```

  **Commit**: YES (groups with 17-20)

- [x] 22. Updated Retrieval Pipeline — Wiki-First Context

  **What to do**: Update `src/lib/retrieval.ts` to use wiki as primary context source. Replace getLoreContext() with getWikiContext(): read index.md for first-pass filtering → read relevant full pages → assemble context. Keep DB as fallback during migration period. Maintain same return shape as existing function to avoid breaking callers.

  **Must NOT do**: Break existing retrieval API shape, remove DB fallback immediately

  **Recommended Agent Profile**: `deep`
    - Reason: Critical path function — must maintain backward compatibility while switching data source

  **Parallelization**: Wave 5 (with Tasks 23-26), Blocks: 32-34, Blocked By: 12-16, 17-21

  **References**: `src/lib/retrieval.ts`, `src/lib/wiki/query.ts`, `src/lib/wiki/index-generator.ts`, `src/lib/wiki/file-io.ts`, `src/lib/prompt-builder.ts`

  **Acceptance Criteria**:
  - [ ] getWikiContext returns same shape as getLoreContext
  - [ ] Uses index.md for first-pass filtering
  - [ ] Reads full pages for relevant entries
  - [ ] DB fallback works if wiki not available
  - [ ] Token budget respected (same as existing)

  **QA Scenarios**:
  ```
  Scenario: Wiki retrieval returns same shape as DB retrieval
    Tool: Bash (node REPL)
    Steps: Call getWikiContext and getLoreContext with same params, compare return shapes
    Evidence: .omo/evidence/task-22-shape.txt
  ```

  **Commit**: YES (groups with 23-26)

- [x] 23. Updated Job Processor — Wiki Enrichment Jobs

  **What to do**: Update `src/lib/job-processor.ts` to replace lore expansion jobs with wiki enrichment jobs. Replace: expand_lore → wiki_ingest, enrich_npc → wiki_enrich_entity, expand_rumors → wiki_generate_rumors, lore_deepening → wiki_deepen_page, expand_location_lore → wiki_deepen_location, extract_event → wiki_extract_event. Update job handlers to use wiki I/O instead of DB.

  **Must NOT do**: Remove old job handlers immediately (keep as fallback), change job queue schema

  **Recommended Agent Profile**: `deep`
    - Reason: 17 job types need remapping, careful handling of job queue compatibility

  **Parallelization**: Wave 5 (with Tasks 22, 24-26), Blocks: 32-34, Blocked By: 12-16

  **References**: `src/lib/job-processor.ts`, `src/lib/wiki/ingest.ts`, `src/lib/wiki/file-io.ts`, existing job handler patterns

  **Acceptance Criteria**:
  - [ ] All lore-related job types remapped to wiki equivalents
  - [ ] Job handlers use wiki I/O instead of DB
  - [ ] Old job handlers kept as fallback
  - [ ] Job queue schema unchanged
  - [ ] Progress reporting still works

  **QA Scenarios**:
  ```
  Scenario: Wiki enrichment job processes correctly
    Tool: Bash
    Steps: Queue wiki_ingest job, process it, verify wiki page created
    Evidence: .omo/evidence/task-23-job.txt
  ```

  **Commit**: YES (groups with 22, 24-26)

- [x] 24. Updated Idle-Time Processing — Wiki Enrichment Tiers

  **What to do**: Update `src/lib/idle-processing.ts` and `src/lib/idle-enrichment.ts` to use wiki enrichment. Tier 1: wiki compress summaries. Tier 2: wiki deepen pages, wiki enrich entities. Tier 3: wiki generate rumors, wiki archive. Tier 4: wiki decay relationships. All tiers use wiki I/O instead of DB operations.

  **Must NOT do**: Remove old idle enrichment functions, change tier thresholds

  **Recommended Agent Profile**: `unspecified-high`

  **Parallelization**: Wave 5 (with Tasks 22-23, 25-26), Blocks: 32-34, Blocked By: 12-16, 23

  **References**: `src/lib/idle-processing.ts`, `src/lib/idle-enrichment.ts`, `src/lib/wiki/ingest.ts`, `src/lib/wiki/lint.ts`

  **Acceptance Criteria**:
  - [ ] All idle tiers use wiki enrichment functions
  - [ ] Tier thresholds unchanged (5/10/15/30 min)
  - [ ] Old functions kept as fallback
  - [ ] No DB writes during idle processing (wiki-only)

  **QA Scenarios**:
  ```
  Scenario: Idle processing enriches wiki pages
    Tool: Bash
    Steps: Simulate idle time, trigger tier 2 processing, verify wiki pages enriched
    Evidence: .omo/evidence/task-24-idle.txt
  ```

  **Commit**: YES (groups with 22-23, 25-26)

- [x] 25. API Route Updates — Wiki CRUD, Lore Route Deprecation

  **What to do**: Create `src/app/api/wiki/[...slug]/route.ts` for wiki CRUD (GET read page, PUT update page, DELETE delete page, POST create page). Deprecate old lore routes: return 410 Gone with migration guide link for /api/locations, /api/npcs, /api/events. Keep /api/lore-files working during migration period.

  **Must NOT do**: Delete old lore routes immediately, break existing API consumers

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 5 (with Tasks 22-24, 26), Blocks: 32-34, Blocked By: 1-2, 17-21

  **References**: `src/lib/wiki/file-io.ts`, existing API route patterns, `src/app/api/lore-files/route.ts`

  **Acceptance Criteria**:
  - [ ] GET /api/wiki/[slug] returns wiki page content + frontmatter
  - [ ] PUT /api/wiki/[slug] updates wiki page
  - [ ] DELETE /api/wiki/[slug] deletes wiki page
  - [ ] POST /api/wiki creates new wiki page
  - [ ] Old lore routes return 410 Gone with migration guide

  **QA Scenarios**:
  ```
  Scenario: Wiki API CRUD works
    Tool: Bash (curl)
    Steps: POST create page, GET read it, PUT update it, DELETE it, verify each step
    Evidence: .omo/evidence/task-25-api.txt
  ```

  **Commit**: YES (groups with 22-24, 26)

- [ ] 26. Nav Updates — Wiki Replaces Lore in App Shell

  **What to do**: Update `app-layout-shell.tsx` to replace Lore nav item with Wiki. Update nav links: Lore → Wiki (/wiki), Canon → Wiki (/wiki?filter=locked), Validations → Wiki (/wiki?filter=draft), Backlinks → Wiki Graph (/wiki/graph). Remove old nav items. Update any hardcoded lore references in layout.

  **Must NOT do**: Remove old lore pages (keep accessible during migration), break existing bookmarks

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 5 (with Tasks 22-25), Blocks: 32-34, Blocked By: 11

  **References**: `app-layout-shell.tsx`, `src/app/(app)/wiki/page.tsx`, existing nav patterns

  **Acceptance Criteria**:
  - [ ] Wiki nav item in app shell
  - [ ] Old lore nav items removed or renamed
  - [ ] Nav links point to wiki routes
  - [ ] Old lore pages still accessible via direct URL

  **QA Scenarios**:
  ```
  Scenario: Nav shows wiki, not lore
    Tool: Playwright
    Steps: Load app, verify wiki nav item present, click it, verify wiki page loads
    Evidence: .omo/evidence/task-26-nav.png
  ```

  **Commit**: YES (groups with 22-25)

- [x] 27. Wikilink Collision Handling + Namespace Resolution

  **What to do**: Handle wikilink collisions when two pages have the same name (e.g., "River" in two universes). Implement namespace resolution: `[[Universe::Page]]` format for cross-universe links. Update `src/lib/wiki/wikilinks.ts` resolveWikilink to accept universeId and prefer same-universe matches. Add collision detection: warn when creating page with name that exists in another universe.

  **Must NOT do**: Allow silent overwrites, break existing single-universe wikilinks

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 6 (with Tasks 28-31), Blocks: 32-34, Blocked By: 3, 11

  **References**: `src/lib/wiki/wikilinks.ts`, `src/lib/wiki/file-io.ts`, existing universe scoping patterns

  **Acceptance Criteria**:
  - [ ] resolveWikilink prefers same-universe matches
  - [ ] `[[Universe::Page]]` format resolves cross-universe links
  - [ ] Collision detection warns on duplicate names
  - [ ] Existing single-universe wikilinks unchanged

  **QA Scenarios**:
  ```
  Scenario: Resolve wikilink with universe preference
    Tool: Bash (node REPL)
    Steps: Create "River" in universe A and B, resolve [[River]] from universe A context, verify A's River returned
    Evidence: .omo/evidence/task-27-collision.txt
  ```

  **Commit**: YES (groups with 28-31)

- [x] 28. Orphan Page Detection + Flagging

  **What to do**: Create `src/lib/wiki/orphans.ts` with findOrphans(wikiRoot). Orphan = page with no inbound wikilinks AND no outbound wikilinks. Flag orphans in lint report. Show orphan badge in file tree. Suggest actions: link to related page, delete, or mark as standalone. Run orphan detection as part of lint pass.

  **Must NOT do**: Auto-delete orphan pages, flag pages with only inbound or only outbound links

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 6 (with Tasks 27, 29-31), Blocks: 32-34, Blocked By: 3, 14

  **References**: `src/lib/wiki/wikilinks.ts`, `src/lib/wiki/lint.ts`, `src/lib/wiki/file-io.ts`

  **Acceptance Criteria**:
  - [ ] findOrphans returns pages with no inbound AND no outbound links
  - [ ] Orphans flagged in lint report
  - [ ] Orphan badge shown in file tree
  - [ ] Suggested actions provided for each orphan

  **QA Scenarios**:
  ```
  Scenario: Detect orphan pages
    Tool: Bash (node REPL)
    Steps: Create page with no links, create page with links, run findOrphans, verify only orphan returned
    Evidence: .omo/evidence/task-28-orphans.txt
  ```

  **Commit**: YES (groups with 27, 29-31)

- [x] 29. Concurrent Edit Protection (Last-Writer-Wins + Diff)

  **What to do**: Implement file locking in `src/lib/wiki/file-io.ts`. When writing: check if file is locked by another process, if so wait or fail with conflict error. On conflict: save diff of changes, return conflict response to caller. Add `lastModified` timestamp to frontmatter for conflict detection. UI: show conflict dialog when user tries to save a page that was modified by LLM enrichment.

  **Must NOT do**: Silent overwrites, lose user edits, block all concurrent reads

  **Recommended Agent Profile**: `unspecified-high`
    - Reason: File locking and conflict resolution require careful handling of race conditions

  **Parallelization**: Wave 6 (with Tasks 27-28, 30-31), Blocks: 32-34, Blocked By: 2

  **References**: `src/lib/wiki/file-io.ts`, existing lore edit history patterns

  **Acceptance Criteria**:
  - [ ] File locking prevents concurrent writes
  - [ ] Conflict detected via lastModified timestamp
  - [ ] Diff saved on conflict
  - [ ] UI shows conflict dialog with merge options
  - [ ] Concurrent reads not blocked

  **QA Scenarios**:
  ```
  Scenario: Concurrent edit conflict detected
    Tool: Bash
    Steps: Start write operation, start second write to same file, verify conflict error returned
    Evidence: .omo/evidence/task-29-conflict.txt
  ```

  **Commit**: YES (groups with 27-28, 30-31)

- [x] 30. Page Size Limits + Split-Into-Subpages Logic

  **What to do**: Enforce max page size (e.g., 10,000 characters). When page exceeds limit during LLM enrichment: suggest split into subpages (e.g., "Haleth" → "Haleth/Background", "Haleth/Relationships", "Haleth/Events"). Create `src/lib/wiki/page-split.ts` with suggestSplit(pagePath). Add warning in markdown renderer when page approaches limit.

  **Must NOT do**: Auto-split pages without user confirmation, truncate content silently

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 6 (with Tasks 27-29, 31), Blocks: 32-34, Blocked By: 2

  **References**: `src/lib/wiki/file-io.ts`, `src/lib/wiki/wikilinks.ts` (for creating subpage links)

  **Acceptance Criteria**:
  - [ ] Max page size enforced (configurable)
  - [ ] suggestSplit returns subpage structure suggestion
  - [ ] Warning shown when page approaches limit
  - [ ] No auto-split without user confirmation

  **QA Scenarios**:
  ```
  Scenario: Page size limit enforced
    Tool: Bash (node REPL)
    Steps: Create page exceeding limit, verify warning returned, run suggestSplit, verify subpage structure
    Evidence: .omo/evidence/task-30-split.txt
  ```

  **Commit**: YES (groups with 27-29, 31)

- [x] 31. Empty States + Error States + Loading States

  **What to do**: Add polished empty/error/loading states to all wiki components. File tree: "No wiki pages yet — create your first page" with CTA. Backlink panel: "No pages link to this yet" with suggestion. Search: "No results for X" with tips. Graph view: "No connections yet" with empty graph. Markdown renderer: loading spinner, "Page not found" error, "File system error" toast.

  **Must NOT do**: Leave components blank on empty/error, use generic error messages

  **Recommended Agent Profile**: `visual-engineering`
    - Reason: UI/UX polish requires design sensibility and attention to empty/error state details

  **Parallelization**: Wave 6 (with Tasks 27-30), Blocks: 32-34, Blocked By: 6, 7, 8, 9, 10, 11

  **References**: `src/components/wiki/` all components, existing empty state patterns in codebase

  **Acceptance Criteria**:
  - [ ] All wiki components have empty states with helpful messages
  - [ ] All wiki components have error states with actionable messages
  - [ ] All wiki components have loading states (spinners/skeletons)
  - [ ] Empty states include CTAs where appropriate

  **QA Scenarios**:
  ```
  Scenario: Empty states render correctly
    Tool: Playwright
    Steps: Load wiki with no pages, verify empty state with CTA, verify all components show empty states
    Evidence: .omo/evidence/task-31-empty.png
  ```

  **Commit**: YES (groups with 27-30)

- [x] 32. Old DB Table Deprecation Plan + Cleanup Script

  **What to do**: Create `scripts/cleanup-old-lore-tables.ts`. After migration verified: drop old DB tables (locations, npcs, events, relationships, narrative_memories, lore_validations, lore_edits, backlinks, embedding_index, embedding_vectors). Keep operational tables (users, sessions, job_queue, universes, scene_states). Archive old lore markdown files to `data/{userId}/lore-archive/`. Update spec.md to reflect new architecture.

  **Must NOT do**: Drop tables before migration verified, delete old files without archiving

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 7 (with Tasks 33-34), Blocks: None, Blocked By: 22-31

  **References**: DB schema, `src/lib/wiki/file-io.ts`, existing migration patterns

  **Acceptance Criteria**:
  - [ ] Script verifies all wiki pages exist before dropping tables
  - [ ] Old tables dropped (content tables only)
  - [ ] Old lore files archived to lore-archive/
  - [ ] Operational tables untouched
  - [ ] spec.md updated

  **QA Scenarios**:
  ```
  Scenario: Cleanup script verifies before dropping
    Tool: Bash
    Steps: Run cleanup script, verify tables dropped, verify archive created, verify operational tables intact
    Evidence: .omo/evidence/task-32-cleanup.txt
  ```

  **Commit**: YES (groups with 33-34)

- [x] 33. Performance Benchmark + Optimization

  **What to do**: Benchmark wiki operations: page render time, graph view load time, search response time, index regeneration time. Target: page render < 200ms, graph load < 1s, search < 100ms, index regen < 500ms for 100 pages. Optimize: cache index in memory, lazy-load graph nodes, debounce search, batch file reads.

  **Must NOT do**: Optimize before measuring, sacrifice correctness for speed

  **Recommended Agent Profile**: `unspecified-high`

  **Parallelization**: Wave 7 (with Tasks 32, 34), Blocks: None, Blocked By: 1-11

  **References**: `src/lib/wiki/` all files, existing performance patterns in codebase

  **Acceptance Criteria**:
  - [ ] Benchmarks measured for all wiki operations
  - [ ] All targets met (render < 200ms, graph < 1s, search < 100ms, index < 500ms)
  - [ ] Optimizations documented
  - [ ] No correctness regressions

  **QA Scenarios**:
  ```
  Scenario: Performance targets met
    Tool: Bash
    Steps: Run benchmark script, verify all targets met
    Evidence: .omo/evidence/task-33-benchmark.txt
  ```

  **Commit**: YES (groups with 32, 34)

- [x] 34. Documentation + Migration Guide

  **What to do**: Create `docs/wiki-migration.md` with: architecture overview, migration steps, wiki schema reference, LLM operations guide (ingest/query/lint), troubleshooting. Update `README.md` with wiki system description. Create `docs/wiki-schema-reference.md` with frontmatter fields, page types, wikilink conventions.

  **Must NOT do**: Write documentation before implementation complete, use outdated screenshots

  **Recommended Agent Profile**: `writing`

  **Parallelization**: Wave 7 (with Tasks 32-33), Blocks: None, Blocked By: ALL implementation tasks

  **References**: All wiki files, LLM Wiki pattern document, existing docs patterns

  **Acceptance Criteria**:
  - [ ] Migration guide covers all steps
  - [ ] Wiki schema reference complete
  - [ ] LLM operations guide covers ingest/query/lint
  - [ ] README updated
  - [ ] Troubleshooting section included

  **QA Scenarios**:
  ```
  Scenario: Documentation is complete and accurate
    Tool: Bash
    Steps: Read all docs, verify they match implementation, verify all sections present
    Evidence: .omo/evidence/task-34-docs.txt
  ```

  **Commit**: YES (groups with 32-33)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `npm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(wiki): add wiki foundation (structure, I/O, wikilinks, index, log, renderer)`
- **Wave 2**: `feat(wiki): add wiki viewer components (tree, backlinks, graph, search, layout)`
- **Wave 3**: `feat(wiki): add LLM operations (ingest, query, lint, filing, validation)`
- **Wave 4**: `feat(wiki): add migration scripts (locations, npcs, events, relationships, backlinks)`
- **Wave 5**: `feat(wiki): integrate wiki into app (retrieval, jobs, idle, API, nav)`
- **Wave 6**: `feat(wiki): add edge case handling (collisions, orphans, conflicts, limits, states)`
- **Wave 7**: `feat(wiki): cleanup, benchmark, documentation`

## Success Criteria

### Verification Commands
```bash
npm run build  # Expected: no errors
npm test       # Expected: all tests pass
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] All QA scenarios executed with evidence files
- [ ] Migration verified — no data loss
- [ ] Performance targets met
- [ ] Documentation complete
