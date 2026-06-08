# Wiki Subsystem Architecture

**Last Updated**: 2026-05-27

## Table of Contents

1. [Overview](#overview)
2. [File Roles Matrix](#file-roles-matrix)
3. [Internal Dependency Graph](#internal-dependency-graph)
4. [Call Chains](#call-chains)
   - [READ Operation](#read-operation)
   - [WRITE Operation](#write-operation)
   - [QUERY Operation](#query-operation)
   - [INGEST Operation](#ingest-operation)
   - [LINT Operation](#lint-operation)
   - [VALIDATE Operation](#validate-operation)
   - [WIKILINK RESOLUTION](#wikilink-resolution)
   - [AUTO-EXTRACT Operation](#auto-extract-operation)
5. [Concurrent Edit Protection](#concurrent-edit-protection)
6. [Data Storage Reference](#data-storage-reference)
7. [Wiki API Routes](#wiki-api-routes)
8. [Wiki Components](#wiki-components)
9. [Remark Plugins](#remark-plugins)
10. [External Consumers](#external-consumers)
11. [Deprecated Systems](#deprecated-systems)
12. [Key Patterns](#key-patterns)

---

## Overview

The wiki subsystem is a markdown-first knowledge base for AI-assisted roleplay worldbuilding. Pages are stored as `.md` files with YAML frontmatter on disk at `data/{userId}/wiki/`. The subsystem provides CRUD, full-text search, LLM-powered query and ingest, wikilink resolution (including cross-universe `[[Universe::Page]]` syntax), a draft/reviewed/locked validation workflow, two coexisting versioning systems, and concurrency-safe edit protection via in-memory file locks plus timestamp conflict detection.

---

## File Roles Matrix

### Core Library (`src/lib/wiki/`)

| File | Lines | Exports | Imports From | Purpose |
|------|-------|---------|-------------|---------|
| `types.ts` | 157 | `WikiFrontmatter`, `WikiPage`, `WikiRevision`, `QueryResult`, `Wikilink`, `LinkGraph`, `CollisionInfo`, `WriteWikiPageOptions`, `ConflictError` | (none, dependency-free) | Shared interfaces and the `ConflictError` class used across the entire subsystem |
| `file-io.ts` | 376 | `readWikiPage`, `writeWikiPage`, `deleteWikiPage`, `listWikiPages`, `sanitizeWikiFilename`, `lockFile`, `unlockFile`, `isFileLocked`, `cleanupStaleLocks`, `getWikiPageLastModified`, `lineDiff`, `ConflictError` | `types`, `path-guard` | Core CRUD operations, file locking, and timestamp-based conflict detection. Central hub consumed by every other wiki file and 9 external consumers |
| `path-guard.ts` | 23 | `isPathWithinRoot` | (none) | Validates that a candidate path falls within an allowed root directory. Guards against path traversal |
| `wiki-root.ts` | 29 | `getWikiRoot` | `path-guard` | Resolves `data/{userId}/wiki/{universeId?}` path. Consumed by 15 API routes and 4 external files |
| `wikilinks.ts` | 241 | `parseWikilinks`, `resolveWikilink`, `resolveWithNamespace`, `detectCollisions`, `buildLinkGraph`, `validateWikilinks` | (none) | Parses `[[wikilink]]` syntax, resolves via 3-pass strategy, builds Cytoscape-ready link graphs, detects name collisions |
| `query.ts` | 409 | `queryWiki` | `index-utils`, `file-io`, `wikilinks` | LLM-powered query with FlexSearch fallback. Builds synthesis prompts and extracts structured citations |
| `ingest.ts` | 368 | `ingestSource` | `file-io`, `validation`, `index-generator`, `logger` | Ingests external source material. Uses Ollama to extract structured wiki content, validates, and indexes |
| `auto-extract.ts` | 211 | `extractAndCreateWikiEntities` | `file-io`, `wiki-root`, `index-generator`, `validation`, `logger` | Scans AI responses for potential wiki entities and auto-creates draft pages (max 3 per call). Skips pages already in reviewed or locked status |
| `validation.ts` | 127 | `validatePage`, `rejectPage`, `lockPage`, `isLocked` | `file-io` | Implements the draft/reviewed/locked validation workflow by reading/writing frontmatter status fields |
| `index-generator.ts` | 119 | `generateIndex`, `generateIndexDebounced`, `updateIndexEntry`, `removeIndexEntry` | `file-io`, `index-utils` | Manages `index.md` files — regenerates on content changes, supports debounced updates |
| `index-utils.ts` | 171 | `parseWikiIndex`, `scoreWikiEntry`, `resolveWikiPagePath` | `file-io` | Parses `index.md` line format, scores entries by TF-IDF-like relevance, resolves entry paths to absolute paths |
| `filing.ts` | 275 | `fileAnswer` | `file-io`, `index-generator`, `logger` | Files LLM-generated answers as synthesis wiki pages with citations. Creates structured synthesis documents |
| `revisions.ts` | 109 | `saveRevision`, `listRevisions`, `getRevision` | `file-io`, `path-guard` | **DEPRECATED**. File-based revision snapshots written to `.revisions/{slug}/{timestamp}.json`. Superseded by `history.ts` |
| `orphans.ts` | 92 | `findOrphans`, `getOrphanSuggestions` | `file-io`, `wikilinks` | Scans for pages not linked by any other page. Suggests placement candidates |
| `page-split.ts` | 169 | `checkPageSize`, `suggestSplit` | (none) | Standalone utility that checks page size and suggests where to split large pages |
| `history.ts` | 134 | `recordVersion`, `getPageVersions`, `getNextVersionNumber`, `restoreVersion`, `createSnapshotFile` | `path-guard` | DB-backed versioning system (canonical). Stores versions in SQLite `wiki_versions` table with snapshot files |
| `logger.ts` | 74 | `appendLog`, `getRecentLogs`, `parseLog` | (none) | **DEPRECATED**. File-based append-only logging. Superseded by `history.ts` |
| `embed-remark-plugin.ts` | 203 | (remark plugin) | (none) | unified remark plugin for `![[embed]]` syntax. Handles section extraction (`![[Page#section]]`) and block extraction (`![[Page#^blockId]]`) with max depth=2 |
| `callout-remark-plugin.ts` | 279 | (remark plugin) | (none) | unified remark plugin for 12 callout types (note, tip, warning, danger, info, abstract, question, success, failure, bug, example, quote). Supports foldable callouts with `+`/`-` syntax |

### Component Library (`src/components/wiki/`)

| Component | Renders | Hooks Used | API Calls | Purpose |
|-----------|---------|------------|-----------|---------|
| `markdown-renderer.tsx` | ReactMarkdown pipeline with remark plugins (embeds, callouts, wikilinks), hover previews | `HoverPreview` (hook) | (none, client-side only) | Central markdown-to-JSX renderer. Wraps remark-embed, remark-callout, and custom wikilink plugin |
| `backlink-panel.tsx` | List of inbound links with page title and excerpt | — | GET `/api/wiki/...slug` (via parents) | Displays pages that link to the current page |
| `file-tree.tsx` | Collapsible tree of wiki files, orphan badges | — | (reads from props or context) | Navigation sidebar showing wiki file hierarchy with orphan indicators |
| `graph-view.tsx` | Interactive Cytoscape.js graph | — | GET `/api/wiki/graph` | Renders the link graph as an interactive node/edge visualization |
| `search.tsx` | Search input + results dropdown, keyboard navigation | — | (client-side FlexSearch) | Inline wiki search with arrow-key navigation and result previews |
| `hover-preview.tsx` | Portal popover with page preview | — | GET `/api/wiki/{slug}` (lazy fetch on hover) | Shows a popover preview when hovering over wikilinks |
| `outline-panel.tsx` | Heading-based table of contents | `IntersectionObserver` | (none, client-side only) | Renders a TOC from headings in the current page, highlights active section |
| `outgoing-links-panel.tsx` | List of wikilinks in the current page | — | (uses `parseWikilinks` directly) | Shows all outgoing wikilinks from the current page |
| `callout.tsx` | Renders callout blocks with icon + styling, foldable | — | (none, client-side only) | Client-side callout rendering matching the 12 types from `callout-remark-plugin.ts` |
| `embed-transclusion.tsx` | Image embeds + recursive note embeds (max depth=2) | — | (fetches embedded pages recursively) | Renders `![[embed]]` content with depth limiting and circular reference detection |
| `revision-history.tsx` | List of file-based revisions with restore | — | GET `/api/wiki-revisions` (legacy) | Displays the deprecated file-based revision history |
| `version-history.tsx` | List of DB-backed versions with restore button | `useApp` | GET `/api/wiki/history`, POST `/api/wiki/history` | Displays the canonical DB-backed version history with restore capability |
| `template-selector.tsx` | Dropdown of available templates | — | GET `/api/wiki/templates` | Template selector for new page creation |
| `lore-extraction-trigger.tsx` | Button + progress indicator for lore extraction | — | POST `/api/jobs`, SSE `/api/jobs/stream` | Triggers lore extraction jobs and shows real-time progress |
| `recent-changes-widget.tsx` | List of recently modified pages | `useApp` | GET `/api/wiki/recent` | Dashboard widget showing recently changed wiki pages |

---

## Internal Dependency Graph

```
types.ts  ←  (dependency-free, used by ALL other files)
    ↑
    |
path-guard.ts  ───→  wiki-root.ts  ───→  auto-extract.ts
    ↑                       ↑
    |                       |
    +──── revisions.ts      +──── 15 API routes
    +──── history.ts              4 external consumers
    |
    ↓
file-io.ts  (hub — the central dependency)
    ↑
    |
    +───→  validation.ts
    +───→  orphans.ts ──→ wikilinks.ts
    +───→  index-utils.ts ──→  query.ts
    |                         retrieval.ts (external)
    +───→  index-generator.ts ──→  filing.ts
    |                             ingest.ts
    |                             auto-extract.ts
    |                             wiki-handler.ts (external)
    |                             wiki-tasks.ts (external)
    |                             lore-extraction.ts (external)
    +───→  revisions.ts (deprecated)
    +───→  lint.ts
    |
wikilinks.ts  ───→  orphans.ts
                     graph-view.tsx
                     outgoing-links-panel.tsx
                     2 API routes
    |
    ↓
query.ts  ───→  ollama.generateText (external)
                FlexSearch (external)
    |
index-utils.ts  ───→  query.ts
                        retrieval.ts (external)
    |
embed-remark-plugin.ts  (standalone, no internal deps)
callout-remark-plugin.ts  (standalone, no internal deps)
page-split.ts  (standalone, no internal deps)
logger.ts  (standalone, deprecated)
```

---

## Call Chains

### READ Operation

```
GET /api/wiki/[...slug]
  → withAuth
    → getWikiRoot(userId, universeId)
      → isPathWithinRoot (via path-guard)
    → file-io.readWikiPage(absolutePath)
      → read .md file from disk
      → parse YAML frontmatter via gray-matter
      → return WikiPage { content, frontmatter, path, updated }
    → parseWikilinks(content) [find all [[links]] for embed processing]
      → for each [[Universe::Page]] embed:
        → findPageByName(pageName, allPages)
          → file-io.listWikiPages(wikiRoot)
    → file-io.listWikiPages(wikiRoot) [find backlinks]
      → for each page in list:
        → parseWikilinks(page.content) [check if current page is linked]
        → resolveWikilink(link, allPages, universeId) [match backlinks to current]
    → return { wikiPage, backlinks[], embeds[] }
```

### WRITE Operation

```
PUT /api/wiki/[...slug]
  → withAuth
    → getWikiRoot(userId, universeId)
      → isPathWithinRoot
    → file-io.readWikiPage(absolutePath) [read existing content for comparison]
    → lockFile(pagePath) [acquire in-memory lock]
      → check isFileLocked — fail if lock held > 30s
    → try:
      → revisions.saveRevision(pagePath, content) [DEPRECATED path — snapshot to .revisions/]
      → file-io.writeWikiPage(path, options)
        → check expectedLastModified vs existing.updated [timestamp conflict detection]
        → on mismatch + force=false: throw ConflictError
        → on mismatch + force=true: save diff to _review/conflicts/{timestamp}-{name}.diff
        → write file to disk
        → update in-memory lock timestamp
      → history.createSnapshotFile(pageSlug, content) [write to .snapshots/]
      → history.recordVersion(pageId, version, content, userId) [INSERT into wiki_versions]
      → index-generator.generateIndex(wikiRoot) [regenerate index.md]
    → finally:
      → unlockFile(pagePath) [release in-memory lock]
    → return updated WikiPage
```

### QUERY Operation

```
POST /api/wiki/query
  → withAuth
    → getWikiRoot(userId, universeId)
    → query.queryWiki(queryText, wikiRoot, universeId)
      → index-utils.parseWikiIndex(wikiRoot) [read and parse index.md]
      → scoreWikiEntry(entry, queryTokens) [TF-IDF-like relevance scoring]
      → select top N candidates
      → file-io.readWikiPage(candidatePath) [for each top candidate, read content]
      → buildSynthesisPrompt(candidates, query) [construct LLM prompt]
      → ollama.generateText(prompt) [send to Ollama for synthesis]
      → extractCitationsFromResponse(llmResponse) [parse structured citations]
      → fallback: if Ollama unavailable, use FlexSearch on candidate content
    → return QueryResult { answer, citations[], sources[] }
```

### INGEST Operation

```
POST /api/wiki/ingest
  → withAuth
    → getWikiRoot(userId, universeId)
    → ingest.ingestSource(sourcePath, wikiRoot, universeId)
      → read source file from disk
      → ollama.generateText(ingestPrompt) [extract structured content]
      → safe-json.parse(llmResponse) [parse into frontmatter + body]
      → gray-matter.stringify(body, frontmatter) [build .md with YAML]
      → file-io.writeWikiPage(targetPath, { content }) [write to disk]
      → validation.validatePage(pagePath) [mark as draft]
      → index-generator.updateIndexEntry(wikiRoot, entry) [update index.md]
      → logger.appendLog(entry) [DEPRECATED]
    → return IngestResult { page, warnings[] }
```

### LINT Operation

```
POST /api/wiki/lint
  → withAuth
    → getWikiRoot(userId, universeId)
    → file-io.listWikiPages(wikiRoot) [get all pages]
    → for each page:
      → check frontmatter validity (required fields, types)
      → check wikilinks validity via validateWikilinks
      → check orphan status via orphans.findOrphans
      → check page size via page-split.checkPageSize
      → check for broken embeddings
    → return LintResult[] { page, severity, message, type }
```

### VALIDATE Operation

```
PUT /api/wiki/validate/[...slug]   (draft → reviewed)
PUT /api/wiki/reject/[...slug]    (draft → rejected)
PUT /api/wiki/lock/[...slug]      (any → locked)

Each follows the same pattern:
  → withAuth
    → getWikiRoot(userId, universeId)
    → file-io.readWikiPage(absolutePath) [read current]
    → validation.validatePage(pagePath) / rejectPage / lockPage
      → read frontmatter
      → update frontmatter.status field
      → file-io.writeWikiPage(path, { content, frontmatter }) [write updated status]
    → index-generator.generateIndex(wikiRoot) [regenerate index.md]
    → return { status: "reviewed"|"rejected"|"locked" }
```

### WIKILINK RESOLUTION

3-pass resolution strategy in `wikilinks.ts`:

```
resolveWikilink(targetPageName, allPages, contextUniverse):
  Pass 1: Same-universe exact match
    → filter allPages where page.universe === contextUniverse
    → exact match on targetPageName
    → if hit, return page.path

  Pass 2: Any-universe exact match
    → search all pages across all universes
    → exact match on targetPageName
    → if hit, return page.path

  Pass 3: Filename match (fuzzy)
    → for each page, extract filename from path (no extension)
    → case-insensitive comparison with targetPageName
    → if hit, return page.path

Cross-universe syntax: [[Universe::PageName]]
  → split on "::" → universe=Universe, page=PageName
  → resolve page within specified universe only
  → skip passes 1-3, go directly to universe-scoped search

Collision detection in detectCollisions(pages):
  → group pages by normalized name (lowercase, no spaces)
  → return groups where count > 1 as CollisionInfo[]
```

### AUTO-EXTRACT Operation

```
extractAndCreateWikiEntities(sessionId, userId, universeId, aiResponse):
  → ollama.generateText(extractionPrompt + aiResponse) [identify entities]
  → parse entities from LLM response (max 3)
  → for each entity:
    → getWikiRoot(userId, universeId) [resolve target path]
    → file-io.readWikiPage(suggestedPath) [check if exists]
    → if exists:
      → check validation.isLocked(page) [skip if reviewed or locked]
      → if locked, skip entity
    → file-io.writeWikiPage(targetPath, { content }) [create draft page]
    → validation.validatePage(pagePath) [set status=draft]
    → index-generator.updateIndexEntry(wikiRoot, entry) [add to index]
  → return AutoExtractResult { created[], skipped[], errors[] }
```

---

## Concurrent Edit Protection

### In-Memory File Locks

Single-process design (sufficient for Next.js server model):

| Mechanism | Detail |
|-----------|--------|
| Data structure | `Map<string, { locked: boolean, timestamp: number }>` (in-memory) |
| Lock acquisition | `lockFile(filePath)` — checks `isFileLocked`, sets `true` + `Date.now()` |
| Lock release | `unlockFile(filePath)` — sets `locked: false` |
| Stale cleanup | `cleanupStaleLocks(maxAge = 30000ms)` — releases locks held > 30 seconds |
| Scope | Per-process. Does not extend across multiple server instances |

### Timestamp Conflict Detection

| Mechanism | Detail |
|-----------|--------|
| Check | `writeWikiPage` compares `expectedLastModified` against file's actual `mtime` |
| On match | Write proceeds normally |
| On mismatch (force=false) | Throws `ConflictError` — caller receives HTTP 409 |
| On mismatch (force=true) | Writes diff to `_review/conflicts/{timestamp}-{name}.diff`, proceeds with write |
| Diff format | Generated by `lineDiff(currentContent, newContent)` — line-by-line diff |

### Conflict Handling in API Route

```
PUT /api/wiki/[...slug]:
  → try:
    → file-io.writeWikiPage(...)
  → catch ConflictError:
    → return NextResponse.json({
        error: "CONFLICT",
        message: "...",
        diff: lineDiff(old, new)
      }, { status: 409 })
```

---

## Data Storage Reference

### Disk Paths

| Storage | Path Pattern | Format | Purpose |
|---------|-------------|--------|---------|
| Page content | `data/{userId}/wiki/{universeId?}/{category}/{page}.md` | Markdown + YAML frontmatter (gray-matter) | Primary page storage. Markdown-first design — NOT in SQLite |
| Index | `data/{userId}/wiki/{universeId?}/index.md` | One entry per line: `- [[PageName]]: brief description` | Search index and page listing. Rebuilt on content changes |
| Revisions (deprecated) | `.revisions/{slug}/{timestamp}.json` | JSON (full page snapshot) | Superseded by history.ts. File-based snapshots |
| Snapshots | `.snapshots/{slug}/{version}.md` | Markdown (full page copy) | Written by `history.createSnapshotFile` |
| Conflicts | `_review/conflicts/{timestamp}-{name}.diff` | Unified diff format | Saved when force=true conflict resolution is used |
| Templates | `src/lib/wiki/templates/` | 5 `.md` files with YAML frontmatter | Page creation templates (character, location, event, item, custom) |

### SQLite Tables

| Table | Schema (columns) | Purpose |
|-------|------------------|---------|
| `wiki_versions` | `id, page_id, version_number, content, frontmatter, user_id, created_at, snapshot_path` | DB-backed version history (canonical system) |
| `contradiction_flags` | (defined in `init-db.ts`) | Tracks contradictions detected during wiki ingest |

### Key File Format: `index.md`

```
- [[Character/Aragorn]]: The ranger from the North, heir of Isildur
- [[Character/Gandalf]]: The Grey Wizard, Istari order
- [[Location/Rivendell]]: The Last Homely House east of the Sea
```

Each line: `- [[{category}/{page-name}]]: {description}`
Parsed by `parseWikiIndex()` in `index-utils.ts`.

---

## Wiki API Routes

17 files under `src/app/api/wiki/`, all using `withAuth` + rate limiting + path traversal checks:

| Route | Method | Purpose | Key Dependencies |
|-------|--------|---------|-----------------|
| `/api/wiki` | GET | List all pages + orphan count | `wiki-root`, `file-io`, `orphans` |
| `/api/wiki` | POST | Create new page | `wiki-root`, `file-io`, `index-generator` |
| `/api/wiki/[...slug]` | GET | Read page + backlinks + embeds | `wiki-root`, `file-io`, `wikilinks` |
| `/api/wiki/[...slug]` | PUT | Update page + conflict detection + version | `wiki-root`, `file-io`, `revisions`, `history`, `index-generator` |
| `/api/wiki/[...slug]` | DELETE | Remove page + regen index | `wiki-root`, `file-io`, `index-generator` |
| `/api/wiki/file` | POST | File LLM answer as synthesis page | `wiki-root`, `filing`, `index-generator` |
| `/api/wiki/query` | POST | LLM-powered query | `wiki-root`, `query`, `index-utils` |
| `/api/wiki/ingest` | POST | Ingest external source | `wiki-root`, `ingest`, `index-generator` |
| `/api/wiki/lint` | POST | Health scan all pages | `wiki-root`, `file-io`, `orphans`, `wikilinks`, `page-split` |
| `/api/wiki/validate/[...slug]` | PUT | Draft to reviewed | `wiki-root`, `file-io`, `validation`, `index-generator` |
| `/api/wiki/reject/[...slug]` | PUT | Draft to rejected | `wiki-root`, `file-io`, `validation`, `index-generator` |
| `/api/wiki/lock/[...slug]` | PUT | Any status to locked | `wiki-root`, `file-io`, `validation`, `index-generator` |
| `/api/wiki/history` | GET | List versions for a page | `wiki-root`, `history` |
| `/api/wiki/history` | POST | Restore a version | `wiki-root`, `history`, `file-io`, `index-generator` |
| `/api/wiki/graph` | GET | Cytoscape-ready link graph | `wiki-root`, `file-io`, `wikilinks` |
| `/api/wiki/index` | GET | Read or regenerate index.md | `wiki-root`, `index-generator` |
| `/api/wiki/templates` | GET | List available templates | (reads `templates/` directory) |
| `/api/wiki/log` | GET | Recent log entries (deprecated) | `logger` |
| `/api/wiki/recent` | GET | Recently modified pages | `wiki-root`, `file-io` |
| `/api/wiki/split-suggestions/[...slug]` | GET | Page size check + split suggestions | `wiki-root`, `page-split` |
| `/api/wiki/sources/upload` | POST | Upload raw source for ingest | `wiki-root` |

---

## Wiki Components

15 client components in `src/components/wiki/`:

| Component | Renders | Hooks Used | API Calls |
|-----------|---------|------------|-----------|
| `markdown-renderer.tsx` | ReactMarkdown with remark-embed, remark-callout, wikilink plugin | `HoverPreview` | None (client-side) |
| `backlink-panel.tsx` | Inbound link list with excerpts | None | Via parent (GET wiki page data) |
| `file-tree.tsx` | Collapsible tree, orphan badges | None | Props/context |
| `graph-view.tsx` | Cytoscape.js interactive graph | None | `GET /api/wiki/graph` |
| `search.tsx` | Search input + results, keyboard nav | None | FlexSearch (client) |
| `hover-preview.tsx` | Portal popover preview | None | `GET /api/wiki/{slug}` (lazy) |
| `outline-panel.tsx` | Heading TOC, active highlight | `IntersectionObserver` | None (client-side) |
| `outgoing-links-panel.tsx` | Wikilink list from current page | None | `parseWikilinks` (direct) |
| `callout.tsx` | Callout blocks, 12 types, foldable | None | None (client-side) |
| `embed-transclusion.tsx` | Image + note embeds, depth<=2 | None | Recursive page fetches |
| `revision-history.tsx` | File-based revision list (deprecated) | None | `GET /api/wiki-revisions` |
| `version-history.tsx` | DB-backed version list, restore | `useApp` | `GET/POST /api/wiki/history` |
| `template-selector.tsx` | Template dropdown | None | `GET /api/wiki/templates` |
| `lore-extraction-trigger.tsx` | Extract button + progress | None | `POST /api/jobs`, `SSE /api/jobs/stream` |
| `recent-changes-widget.tsx` | Recent changes list | `useApp` | `GET /api/wiki/recent` |

---

## Remark Plugins

### `embed-remark-plugin.ts` (203 lines)

- **Syntax**: `![[PageName]]`, `![[Page#section]]`, `![[Page#^blockId]]`
- **Processing**: unified remark plugin (transforms mdast nodes)
- **Features**:
  - Section extraction via `#section-name` anchor
  - Block extraction via `#^blockId` reference
  - Recursive embedding with max depth = 2 (prevents infinite loops)
  - Image embedding detection (delegates to `embed-transclusion.tsx` for rendering)
- **Runs before**: wikilink plugin in the ReactMarkdown pipeline

### `callout-remark-plugin.ts` (279 lines)

- **Syntax**: `> [!type] Title` followed by blockquote content
- **12 callout types**: note, tip, warning, danger, info, abstract, question, success, failure, bug, example, quote
- **Features**:
  - Foldable callouts: `> [!type+]` (expanded by default) and `> [!type-]` (collapsed by default)
  - Icon + color per type
  - Nested content support
- **Processing**: Transforms blockquote nodes into custom callout nodes in the mdast

---

## External Consumers

Files outside `src/lib/wiki/` that import wiki subsystem modules:

| File | Imports | Purpose |
|------|---------|---------|
| `src/lib/retrieval.ts` | `file-io`, `index-utils`, `wiki-root` | `getWikiContext()` — collects relevant wiki pages as context for LLM prompts |
| `src/lib/entity-resolution.ts` | `wiki-root`, `file-io` | `resolveEntityToWikiPage(entityName, userId, universeId)` — 3-pass fuzzy resolution (exact → substring → Levenshtein <= 3) |
| `src/lib/backlinks.ts` | (none from wiki) | **Legacy** DB-backed backlink system. Separate from wiki-internal backlinks computed in readWikiPage |
| `src/lib/jobs/wiki-handler.ts` | `ingest`, `auto-extract`, `wiki-root`, `file-io`, `index-generator`, `logger` | 8 job types for background wiki operations (ingest source, auto-extract entities, regenerate index, etc.) |
| `src/lib/jobs/lore-extraction.ts` | `wiki-root`, `file-io`, `index-generator`, `logger` | Comprehensive lore extraction — scans session history and creates/updates wiki pages |
| `src/lib/idle/wiki-tasks.ts` | `wiki-root`, `file-io`, `index-generator`, `logger` | 7 idle-tier tasks (stale lock cleanup, index regeneration, orphan detection, log rotation, etc.) |
| 15 API routes | `wiki-root` | Various wiki API endpoints |
| 4 additional API route files | `wiki-root` | Additional wiki-related endpoints |

---

## Deprecated Systems

### `revisions.ts` (file-based versioning)

- **Status**: DEPRECATED — superseded by `history.ts`
- **Storage**: `.revisions/{slug}/{timestamp}.json` on disk
- **Why deprecated**: File-based storage doesn't support efficient querying, restore operations, or metadata tracking
- **Still referenced by**: `revision-history.tsx` component and some API routes

### `logger.ts` (file-based logging)

- **Status**: DEPRECATED — superseded by `history.ts`
- **Storage**: Append-only log file on disk
- **Why deprecated**: Inefficient for querying; history.ts provides structured DB-backed logging
- **Still referenced by**: `ingest.ts`, `auto-extract.ts`, `filing.ts`, `wiki-handler.ts`, `lore-extraction.ts`, `wiki-tasks.ts`

### Dual System Warning

Two coexisting versioning systems exist side by side:

| Aspect | `revisions.ts` (deprecated) | `history.ts` (canonical) |
|--------|---------------------------|-------------------------|
| Storage | File-based (`.revisions/`) | DB-backed (`wiki_versions` table) + snapshot files (`.snapshots/`) |
| REST API | `/api/wiki-revisions` | `/api/wiki/history` |
| UI Component | `revision-history.tsx` | `version-history.tsx` |
| Write path | Called in `PUT /api/wiki/[...slug]` before history.ts | Called in `PUT /api/wiki/[...slug]` after revisions.ts |

Both `revisions.ts` and `history.ts` write to disk during the WRITE call chain. The deprecated path runs first, then the canonical path.

Similarly, two backlink systems exist:

| Aspect | Wiki-internal (file-io) | Legacy (backlinks.ts) |
|--------|-------------------------|----------------------|
| Computation | On read, via `listWikiPages` + `parseWikilinks` | DB-backed, updated on write |
| Scope | Per-page, computed live | Persistent in SQLite |
| Status | Active, preferred | Legacy, still referenced |

---

## Key Patterns

- **No barrel exports**: Zero `index.ts` re-export files. All imports use explicit file paths (e.g., `import { readWikiPage } from "@/lib/wiki/file-io"`)
- **Markdown-first**: Wiki content is NOT stored in SQLite. Pages are `.md` files on disk with YAML frontmatter via gray-matter
- **Gray-matter for metadata**: Each `.md` file has `---` frontmatter containing `title, status (draft/reviewed/locked), tags[], created, updated, universe`
- **In-memory locks**: Single-process file locking via `Map<string, LockState>`. Sufficient because Next.js runs as a single server process
- **Index-first query**: Search works by parsing `index.md`, scoring entries with TF-IDF-like relevance, resolving top candidates to full page paths, then reading their content
- **3-pass wikilink resolution**: Pass 1 = same-universe exact match, Pass 2 = any-universe exact match, Pass 3 = filename match (case-insensitive)
- **3-pass entity resolution** (in `entity-resolution.ts`, not `wikilinks.ts`): Pass 1 = exact match, Pass 2 = substring match, Pass 3 = Levenshtein distance <= 3
- **Validation workflow**: `draft` (LLM-created, needs review) → `reviewed` (human-approved) → `locked` (immutable, requires explicit unlock)
- **2 coexisting versioning systems**: File-based `revisions.ts` (deprecated) runs alongside DB-backed `history.ts` (canonical) during write operations
- **2 coexisting logging systems**: File-based `logger.ts` (deprecated) alongside `history.ts` (canonical)
- **2 coexisting backlink systems**: Wiki-internal (computed live on read via `listWikiPages`) and legacy DB-backed (`backlinks.ts`)
- **Remark plugins run before wikilink plugin**: The ReactMarkdown pipeline processes `![[embed]]` and `> [!callout]` syntax before `[[wikilink]]` syntax
- **LLM integration via Ollama**: Self-hosted Ollama (default model `qwen3.5:4b`) powers query synthesis, source ingest, and auto-extraction. Fallback to FlexSearch keyword search when Ollama is unavailable
- **Validation on write**: Auto-extract skips pages with status `reviewed` or `locked`. Ingest marks new pages as `draft`
