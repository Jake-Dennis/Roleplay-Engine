# Obsidian-Style Wiki Features

## TL;DR

> **Quick Summary**: Add 5 core Obsidian features to the wiki: callouts, embed transclusion, outline/TOC, hover page preview, and outgoing links panel. All hook into the existing `react-markdown` + `@flowershow/remark-wiki-link` rendering pipeline.
>
> **Deliverables**:
> - Callout rendering (`> [!info]`, `> [!warning]`, etc.) with 12 types, foldable, nested
> - Embed transclusion (`![[Page]]`, `![[Page#Heading]]`, `![[Page#^block-id]]`)
> - Outline/TOC sidebar panel (clickable heading list)
> - Hover page preview (popover on wikilink hover)
> - Outgoing links sidebar panel
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
"look through all these files and see what features we should add to our wiki" → Full plan for Obsidian-style features

### Current Architecture
- **Renderer**: `react-markdown` + `remark-gfm` + `@flowershow/remark-wiki-link` + `rehype-raw` + `rehype-sanitize`
- **File**: `src/components/wiki/markdown-renderer.tsx` (222 lines) — THE key file for all rendering plugins
- **Wikilink parser**: `src/lib/wiki/wikilinks.ts` — regex-based, captures `![[embed]]` but no rendering
- **Wiki page viewer**: `src/app/(app)/wiki/[...slug]/page.tsx` — fetches page, renders via `MarkdownRenderer`
- **Graph view**: Already integrated as tabbed view in wiki home
- **Backlinks**: Already implemented in `backlink-panel.tsx`
- **File tree**: Already implemented in `file-tree.tsx`
- **Search**: Already implemented in `search.tsx`
- **Revision history**: Already implemented in `revision-history.tsx`

### Key Gap: `existingPages` Never Wired
`MarkdownRenderer` accepts `existingPages` prop but `WikiPageView` never passes it. All wikilinks render as plain links regardless of target existence.

### Metis Review
**Identified Gaps** (addressed):
- Embed transclusion requires server-side content fetching — solved by adding inline content to API response
- Callout rendering must work with rehype-sanitize — solved by using CSS classes, not raw HTML
- Hover preview needs efficient loading — solved by pre-fetching page list and lazy-loading on hover
- Outline parsing must handle nested headings — solved by regex parsing of markdown headings

---

## Work Objectives

### Core Objective
Add 5 Obsidian-style features to the wiki: callouts, embeds, outline, hover preview, outgoing links.

### Concrete Deliverables
- `src/components/wiki/callout.tsx` — Callout component with 12 types, foldable, nested
- `src/lib/wiki/callout-remark-plugin.ts` — Remark plugin for `> [!type]` syntax
- `src/components/wiki/embed-transclusion.tsx` — Embed transclusion component
- `src/lib/wiki/embed-remark-plugin.ts` — Remark plugin for `![[...]]` syntax
- `src/components/wiki/outline-panel.tsx` — Outline/TOC sidebar component
- `src/components/wiki/hover-preview.tsx` — Hover page preview popover
- `src/components/wiki/outgoing-links-panel.tsx` — Outgoing links sidebar component
- `src/components/wiki/markdown-renderer.tsx` — Modified to integrate all new plugins
- `src/app/(app)/wiki/[...slug]/page.tsx` — Modified to wire up new panels and props
- `src/app/api/wiki/[...slug]/route.ts` — Modified to include inline embed content

### Definition of Done
- [x] All 5 features work in wiki page view
- [x] `npx next build` passes
- [x] No new external dependencies

### Must Have
- Callouts: 12 types (note, abstract, info, todo, tip, success, question, warning, failure, danger, bug, example, quote)
- Callouts: foldable (`+`/`-`), nested, custom titles
- Embeds: `![[Page]]`, `![[Page#Heading]]`, `![[Page#^block-id]]`
- Outline: clickable headings, auto-generated from page content
- Hover preview: popover on wikilink hover, shows page preview
- Outgoing links: list of all wikilinks from current page

### Must NOT Have
- No new npm dependencies
- No changes to wiki file format (.md)
- No database changes
- No changes to existing wiki pages (backward compatible)
- No AI slop: excessive comments, over-abstraction, generic names

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **Automated tests**: NO — no existing tests for wiki components
- **Agent-Executed QA**: YES — build verification + visual inspection

### QA Policy
- Build: `npx next build` must pass
- No human intervention required

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — independent setup tasks):
├── Task 1: Wire existingPages + aliases to MarkdownRenderer [quick]
├── Task 2: Callout remark plugin + component [deep]
└── Task 3: Outline panel component [quick]

Wave 2 (After Wave 1 — embed system):
├── Task 4: Embed transclusion remark plugin + component [deep]
└── Task 5: API route update for embed inline content [quick]

Wave 3 (After Wave 2 — interactive features):
├── Task 6: Hover page preview component [unspecified-high]
└── Task 7: Outgoing links panel component [quick]

Wave 4 (Integration — wire everything together):
└── Task 8: Integrate all features into wiki page view [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
```

### Dependency Matrix
- **1**: - → 3, 4, 8
- **2**: - → 8
- **3**: 1 → 8
- **4**: 1 → 5, 8
- **5**: 4 → 8
- **6**: 1 → 8
- **7**: 1 → 8
- **8**: 1, 2, 3, 4, 5, 6, 7 → FINAL
- **FINAL**: 8

### Agent Dispatch Summary
- **1**: **3** - T1 → `quick`, T2 → `deep`, T3 → `quick`
- **2**: **2** - T4 → `deep`, T5 → `quick`
- **3**: **2** - T6 → `unspecified-high`, T7 → `quick`
- **4**: **1** - T8 → `deep`
- **FINAL**: **4** - F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Wire existingPages + aliases to MarkdownRenderer

  **What to do**:
  - In `src/app/(app)/wiki/[...slug]/page.tsx`, find where `MarkdownRenderer` is rendered
  - Pass `existingPages={allPages?.map(p => p.path) || []}` prop
  - Pass `wikiRoute="/wiki"` prop explicitly
  - In `MarkdownRenderer.tsx`, update the `wikiLinkPlugin` config to use `existingPages` for link styling
  - Add alias support: when `[[Page|alias]]` is used, display "alias" text but link to "page"
  - The `@flowershow/remark-wiki-link` plugin natively supports `|alias` syntax — verify it works by checking the `children` prop in the `components.a` handler

  **Must NOT do**:
  - Do not change the wikilink regex
  - Do not modify the API route
  - Do not add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file modification, well-understood pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 3, 4, 5, 6, 7, 8
  - **Blocked By**: None

  **References**:
  - `src/components/wiki/markdown-renderer.tsx:191-218` — ReactMarkdown config to modify
  - `src/app/(app)/wiki/[...slug]/page.tsx` — WikiPageView component to pass props

  **Acceptance Criteria**:
  - [x] Wikilinks to existing pages render blue, non-existing render red
  - [x] `[[Page|alias]]` displays "alias" text, links to "page"
  - [x] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Wikilink to existing page renders blue
    Tool: Bash (curl)
    Steps:
      1. Create a test wiki page with `[[Test]]` link
      2. Fetch the page via API
      3. Verify the link has `class="internal"` (not `class="internal new"`)
    Expected: Link class contains "internal" but not "new"
    Evidence: .omo/evidence/task-1-existing-link.txt

  Scenario: Wikilink to non-existing page renders red
    Tool: Bash (curl)
    Steps:
      1. Create a test wiki page with `[[NonExistentPage]]` link
      2. Verify the link has `class="internal new"`
    Expected: Link class contains "internal new"
    Evidence: .omo/evidence/task-1-new-link.txt
  ```

- [x] 2. Callout remark plugin + component

  **What to do**:
  - Create `src/lib/wiki/callout-remark-plugin.ts` — a remark plugin that transforms `> [!type]` blockquotes into callout AST nodes
  - Create `src/components/wiki/callout.tsx` — React component rendering callouts with:
    - 12 types: note, abstract, info, todo, tip, success, question, warning, failure, danger, bug, example, quote
    - Each type has a default color (CSS variable) and icon (lucide-react)
    - Foldable: `> [!type]+` (expanded) or `> [!type]-` (collapsed)
    - Custom title: `> [!type] Custom Title`
    - Nested callouts (recursive rendering)
    - Markdown content inside callouts (bold, links, lists, code blocks)
  - Register the plugin in `MarkdownRenderer.tsx` remarkPlugins array
  - Add a custom rehype component for callout rendering
  - CSS: use Tailwind classes for callout styling (border-left, background tint, icon)

  **Must NOT do**:
  - Do not use raw HTML in callouts (rehype-sanitize will strip it)
  - Do not add new npm dependencies
  - Do not modify existing wiki pages

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex remark plugin + component with multiple features
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  - `src/components/wiki/markdown-renderer.tsx:191-218` — where to register the plugin
  - `obsidian-docs/en/Editing and formatting/Callouts.md` — Obsidian callout spec (12 types, foldable, nested)
  - `obsidian-docs/en/Reference/CSS variables/Editor/Callout.md` — CSS variable reference

  **Acceptance Criteria**:
  - [x] `> [!info] Title` renders as styled callout with info icon
  - [x] `> [!warning]- Collapsed` renders as collapsed callout
  - [x] Nested callouts render correctly
  - [x] Markdown inside callouts renders (bold, links, lists)
  - [x] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Basic callout renders with correct styling
    Tool: Bash (curl)
    Steps:
      1. Create wiki page with `> [!info] Test callout`
      2. Verify the rendered HTML contains callout styling classes
    Expected: Callout div with info icon and blue border
    Evidence: .omo/evidence/task-2-basic-callout.txt

  Scenario: Foldable callout collapses/expands
    Tool: Bash (curl)
    Steps:
      1. Create wiki page with `> [!tip]- Folded callout`
      2. Verify the rendered HTML contains collapse/expand mechanism
    Expected: Callout with collapsed state indicator
    Evidence: .omo/evidence/task-2-foldable-callout.txt
  ```

- [x] 3. Outline panel component

  **What to do**:
  - Create `src/components/wiki/outline-panel.tsx` — sidebar component listing all headings in the current page
  - Parse headings from markdown content (regex: `/^(#{1,6})\s+(.+)$/gm`)
  - Render as nested list with indentation based on heading level (h1 → h6)
  - Click-to-navigate: clicking a heading scrolls to that section
  - Highlight current section based on scroll position (IntersectionObserver)
  - Integrate into wiki page layout as a right sidebar panel (or collapsible panel)
  - Show/hide toggle button in the wiki page header

  **Must NOT do**:
  - Do not modify the markdown rendering pipeline
  - Do not add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single component, straightforward heading parsing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:
  - `src/app/(app)/wiki/[...slug]/page.tsx` — where to integrate the panel
  - `obsidian-docs/en/Plugins/Outline.md` — Obsidian outline spec

  **Acceptance Criteria**:
  - [x] Outline panel shows all headings from current page
  - [x] Headings are nested by level (h1 > h2 > h3)
  - [x] Clicking a heading scrolls to that section
  - [x] Current section is highlighted
  - [x] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Outline shows headings from page
    Tool: Bash (curl)
    Steps:
      1. Create wiki page with 3 headings (## Heading 1, ### Subheading, ## Heading 2)
      2. Verify outline panel shows 3 items with correct nesting
    Expected: Outline with 3 items, subheading indented under Heading 1
    Evidence: .omo/evidence/task-3-outline-headings.txt
  ```

- [x] 4. Embed transclusion remark plugin + component

  **What to do**:
  - Create `src/lib/wiki/embed-remark-plugin.ts` — a remark plugin that transforms `![[...]]` syntax into embed AST nodes
  - Create `src/components/wiki/embed-transclusion.tsx` — React component that renders embedded content:
    - `![[Page]]` — full page content
    - `![[Page#Heading]]` — content from heading to next heading
    - `![[Page#^block-id]]` — specific block (paragraph, list, code block)
    - `![[Image.png]]` — image embed (already works via markdown, but ensure it renders)
    - `![[Image.png|100x200]]` — image with dimensions
  - For note embeds: fetch content from API or use inline data from page response
  - Handle circular embeds (A embeds B, B embeds A) — detect and show "circular embed" placeholder
  - Render embedded content with reduced styling (smaller font, border, background)

  **Must NOT do**:
  - Do not modify the API route for basic embeds (use inline data)
  - Do not add new dependencies
  - Do not break existing image embeds

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex remark plugin + component with multiple embed types
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Task 5, 8
  - **Blocked By**: Task 1

  **References**:
  - `src/lib/wiki/wikilinks.ts:31-32` — existing `isEmbed` flag in wikilink parser
  - `src/components/wiki/markdown-renderer.tsx:191-218` — where to register the plugin
  - `obsidian-docs/en/Linking notes and files/Embed files.md` — Obsidian embed spec

  **Acceptance Criteria**:
  - [x] `![[Page]]` renders full page content inline
  - [x] `![[Page#Heading]]` renders section content
  - [x] `![[Page#^block-id]]` renders specific block
  - [x] Circular embeds show placeholder (not infinite loop)
  - [x] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Full page embed renders inline
    Tool: Bash (curl)
    Steps:
      1. Create wiki page "Source" with content "Hello world"
      2. Create wiki page "Target" with `![[Source]]`
      3. Verify "Target" renders "Hello world" inline
    Expected: Embedded content visible within Target page
    Evidence: .omo/evidence/task-4-full-embed.txt

  Scenario: Circular embed shows placeholder
    Tool: Bash (curl)
    Steps:
      1. Create page A with `![[B]]`
      2. Create page B with `![[A]]`
      3. Verify no infinite loop, placeholder shown
    Expected: "Circular embed detected" placeholder
    Evidence: .omo/evidence/task-4-circular-embed.txt
  ```

- [x] 5. API route update for embed inline content

  **What to do**:
  - Modify `src/app/api/wiki/[...slug]/route.ts` GET handler
  - Add `embeds` field to response: for each `![[...]]` in the page, fetch the target page content and include it
  - Response shape: `{ page: {...}, embeds: { "Page": { content: "...", frontmatter: {...} }, ... } }`
  - This enables client-side embed rendering without additional API calls
  - Handle missing embed targets gracefully (return null content)

  **Must NOT do**:
  - Do not change the page response shape for existing fields
  - Do not break existing API consumers

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single API route modification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 4

  **References**:
  - `src/app/api/wiki/[...slug]/route.ts` — API route to modify
  - `src/lib/wiki/file-io.ts` — readWikiPage function to fetch embed targets

  **Acceptance Criteria**:
  - [x] API response includes `embeds` field with target page content
  - [x] Missing embed targets return null content
  - [x] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: API returns embed content
    Tool: Bash (curl)
    Steps:
      1. Create wiki page "Source" with content "Hello"
      2. Create wiki page "Target" with `![[Source]]`
      3. Fetch /api/wiki/Target via curl
      4. Verify response has embeds.Source.content = "Hello"
    Expected: embeds field present with Source content
    Evidence: .omo/evidence/task-5-api-embeds.txt
  ```

- [x] 6. Hover page preview component

  **What to do**:
  - Create `src/components/wiki/hover-preview.tsx` — popover component that shows page preview on wikilink hover
  - On wikilink hover: fetch page content via API (or use pre-fetched data)
  - Show preview in a floating popover (positioned near the link)
  - Preview content: first 200 chars of page, title, type badge
  - Loading state: spinner while fetching
  - Error state: "Page not found" if target doesn't exist
  - Debounce hover (300ms) to avoid excessive API calls
  - Close popover on mouse leave or click outside

  **Must NOT do**:
  - Do not modify the markdown rendering pipeline
  - Do not add new dependencies
  - Do not fetch on every hover (use debounce + caching)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex component with async loading, positioning, debouncing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:
  - `src/components/wiki/markdown-renderer.tsx:201-214` — where to integrate hover handler
  - `obsidian-docs/en/Plugins/Page preview.md` — Obsidian page preview spec

  **Acceptance Criteria**:
  - [x] Hovering wikilink shows preview popover after 300ms
  - [x] Preview shows page title, first 200 chars, type badge
  - [x] Loading state shows spinner
  - [x] Error state shows "Page not found"
  - [x] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Hover preview shows page content
    Tool: Bash (curl)
    Steps:
      1. Create wiki page "Target" with content "Hello world, this is a test page"
      2. Create wiki page "Source" with `[[Target]]`
      3. Hover over the link in Source page
      4. Verify preview popover shows "Target" title and first 200 chars
    Expected: Preview popover with title and content preview
    Evidence: .omo/evidence/task-6-hover-preview.txt
  ```

- [x] 7. Outgoing links panel component

  **What to do**:
  - Create `src/components/wiki/outgoing-links-panel.tsx` — sidebar component listing all wikilinks from the current page
  - Parse wikilinks from markdown content using existing `parseWikilinks()` from `src/lib/wiki/wikilinks.ts`
  - Render as list of links with:
    - Link text (alias or page name)
    - Status indicator: exists (blue) or doesn't exist (red)
    - Click to navigate to the linked page
  - Show count of outgoing links in panel header
  - Group by section (optional — links under each heading)

  **Must NOT do**:
  - Do not modify the wikilink parser
  - Do not add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single component, reuses existing parser
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:
  - `src/lib/wiki/wikilinks.ts` — parseWikilinks function to reuse
  - `src/components/wiki/backlink-panel.tsx` — similar panel pattern to follow
  - `obsidian-docs/en/Plugins/Outgoing links.md` — Obsidian outgoing links spec

  **Acceptance Criteria**:
  - [x] Panel shows all wikilinks from current page
  - [x] Existing links render blue, non-existing render red
  - [x] Clicking a link navigates to the page
  - [x] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Outgoing links panel shows all links
    Tool: Bash (curl)
    Steps:
      1. Create wiki page with 3 wikilinks: [[A]], [[B]], [[C]]
      2. Verify panel shows 3 links
    Expected: Panel with 3 links, correct status colors
    Evidence: .omo/evidence/task-7-outgoing-links.txt
  ```

- [x] 8. Integrate all features into wiki page view

  **What to do**:
  - Modify `src/app/(app)/wiki/[...slug]/page.tsx` to integrate all new features:
    - Pass `existingPages` to `MarkdownRenderer` (from Task 1)
    - Add outline panel as right sidebar (or collapsible panel)
    - Add outgoing links panel as sidebar section
    - Wire hover preview to wikilinks in `MarkdownRenderer`
    - Ensure callouts and embeds render correctly in `MarkdownRenderer`
  - Update wiki page layout to accommodate new panels:
    - Left sidebar: file tree + search (existing)
    - Main content: markdown content with callouts + embeds
    - Right sidebar: outline + outgoing links (new)
  - Add toggle buttons to show/hide right sidebar panels
  - Update `MarkdownRenderer.tsx` to register all new remark/rehype plugins:
    - Callout remark plugin
    - Embed remark plugin
    - Custom components for callout and embed rendering

  **Must NOT do**:
  - Do not break existing wiki functionality
  - Do not change the API response shape
  - Do not add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex integration of 7 previous tasks into a single page
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential after all previous tasks)
  - **Blocks**: FINAL
  - **Blocked By**: Tasks 1, 2, 3, 4, 5, 6, 7

  **References**:
  - `src/app/(app)/wiki/[...slug]/page.tsx` — main page to modify
  - `src/components/wiki/markdown-renderer.tsx` — renderer to update
  - All previous task files

  **Acceptance Criteria**:
  - [x] Wiki page renders with all 5 features working
  - [x] Callouts render correctly in page content
  - [x] Embeds render inline content
  - [x] Outline panel shows headings
  - [x] Hover preview works on wikilinks
  - [x] Outgoing links panel shows all links
  - [x] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Full wiki page with all features
    Tool: Bash (curl)
    Steps:
      1. Create wiki page with callouts, embeds, wikilinks, headings
      2. Verify all features render correctly
    Expected: Page with callouts, embedded content, outline, hover preview, outgoing links
    Evidence: .omo/evidence/task-8-full-page.txt
  ```

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx next build` + lint. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-feature integration. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **1**: `feat(wiki): wire existingPages + aliases to MarkdownRenderer`
  - `src/app/(app)/wiki/[...slug]/page.tsx` — pass existingPages prop
  - `src/components/wiki/markdown-renderer.tsx` — update wikilink plugin config
  - Pre-commit: `npx next build`

- **2**: `feat(wiki): add callout rendering with 12 types, foldable, nested`
  - `src/lib/wiki/callout-remark-plugin.ts` — new remark plugin
  - `src/components/wiki/callout.tsx` — new callout component
  - `src/components/wiki/markdown-renderer.tsx` — register callout plugin
  - Pre-commit: `npx next build`

- **3**: `feat(wiki): add outline/TOC sidebar panel`
  - `src/components/wiki/outline-panel.tsx` — new component
  - `src/app/(app)/wiki/[...slug]/page.tsx` — integrate panel
  - Pre-commit: `npx next build`

- **4**: `feat(wiki): add embed transclusion (![[Page]])`
  - `src/lib/wiki/embed-remark-plugin.ts` — new remark plugin
  - `src/components/wiki/embed-transclusion.tsx` — new embed component
  - `src/components/wiki/markdown-renderer.tsx` — register embed plugin
  - Pre-commit: `npx next build`

- **5**: `feat(wiki): API route returns inline embed content`
  - `src/app/api/wiki/[...slug]/route.ts` — add embeds field to response
  - Pre-commit: `npx next build`

- **6**: `feat(wiki): add hover page preview on wikilink hover`
  - `src/components/wiki/hover-preview.tsx` — new component
  - `src/components/wiki/markdown-renderer.tsx` — wire hover handler
  - Pre-commit: `npx next build`

- **7**: `feat(wiki): add outgoing links sidebar panel`
  - `src/components/wiki/outgoing-links-panel.tsx` — new component
  - `src/app/(app)/wiki/[...slug]/page.tsx` — integrate panel
  - Pre-commit: `npx next build`

- **8**: `feat(wiki): integrate all Obsidian features into wiki page view`
  - `src/app/(app)/wiki/[...slug]/page.tsx` — full integration
  - `src/components/wiki/markdown-renderer.tsx` — all plugins registered
  - Pre-commit: `npx next build`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: ✓ Compiled successfully
```

### Final Checklist
- [x] All "Must Have" present (callouts, embeds, outline, hover preview, outgoing links)
- [x] All "Must NOT Have" absent (no new deps, no file format changes, no DB changes)
- [x] All builds pass
- [x] All QA scenarios pass
