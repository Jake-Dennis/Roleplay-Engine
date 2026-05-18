# Wiki Schema Reference

Conventions for wiki markdown pages, frontmatter fields, wikilinks, and validation workflow.

## File Structure

```
data/{userId}/wiki/
  index.md              # Auto-generated, do not edit manually
  log.md                # Append-only operation log
  entities/             # Characters, locations, objects, factions
  concepts/             # Themes, rules, mechanics, ideas
  sources/              # Ingested source material
  synthesis/            # LLM-generated answers and analyses
  _review/              # Review artifacts
    conflicts/          # Concurrent edit diff files (.diff)
```

Every wiki page is a markdown file with YAML frontmatter. Files are readable without the application.

## Frontmatter Fields

### Required Fields

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `title` | string | Any | Human-readable page title. Used for wikilink resolution and display. |
| `type` | string | `entity`, `concept`, `source`, `synthesis` | Determines which folder the page belongs to and its color in the graph view. |
| `status` | string | `draft`, `reviewed`, `locked`, `rejected` | Validation state. Controls LLM modification permissions. |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `universe` | string | Universe scope identifier. Used for cross-universe wikilink resolution. |
| `tags` | string[] | Array of lowercase keyword tags. Used for orphan suggestions and cross-reference detection. |
| `created` | string | ISO 8601 timestamp. Auto-set on first write. |
| `updated` | string | ISO 8601 timestamp. Auto-set on every write. Used for conflict detection. |

### Example Frontmatter

```yaml
---
title: Haleth
type: entity
status: reviewed
universe: arda
tags:
  - human
  - first-age
  - house-of-hador
created: 2025-01-15T10:30:00.000Z
updated: 2025-02-20T14:45:00.000Z
---
```

## Page Types

### Entity (`entities/`)

Characters, locations, objects, factions. The primary building blocks of the wiki.

```yaml
title: Minas Tirith
type: entity
status: locked
universe: arda
tags:
  - location
  - gondor
  - city
```

### Concept (`concepts/`)

Themes, rules, mechanics, ideas. Abstract knowledge that doesn't map to a specific entity.

```yaml
title: Magic System
type: concept
status: reviewed
universe: custom-world
tags:
  - mechanics
  - magic
```

### Source (`sources/`)

Ingested source material. Created automatically when a source file is processed by the ingest pipeline.

```yaml
title: chapter-3-draft
type: source
status: draft
universe: arda
tags:
  - source-material
```

### Synthesis (`synthesis/`)

LLM-generated answers, analyses, and compound query results. Created when a user opts to file a query answer back into the wiki.

```yaml
title: What is the relationship between Aragorn and Arwen?
type: synthesis
status: draft
universe: arda
tags:
  - synthesis
  - auto-filed
```

## Status Flow

Pages move through a validation workflow controlled by frontmatter status:

```
draft -> reviewed -> locked (immutable)
  |
  v
rejected (can be re-requested as draft)
```

### draft

LLM-generated content pending human review. New pages from ingest start as `draft`. LLM enrichment jobs can modify draft pages.

### reviewed

Human-approved content. The page has been verified and is considered reliable. LLM enrichment can still update reviewed pages.

### locked

Immutable content. Cannot be modified by LLM operations. Only manual edits via the API can change a locked page. Use for source material and canon facts that must not be altered.

### rejected

Content that failed review. Includes `rejection_reason` and `rejected_at` fields in frontmatter. Can be re-requested as a new draft later.

### Status Transitions

The validation module (`src/lib/wiki/validation.ts`) enforces these transitions:

- `validatePage(path)` - Moves `draft` to `reviewed`. Returns `false` if not in draft state.
- `rejectPage(path, reason)` - Moves `draft` to `rejected`, records reason and timestamp. Returns `false` if not in draft state.
- `lockPage(path)` - Moves any non-locked status to `locked`. Returns `false` if already locked.
- `isLocked(path)` - Returns `true` if status is `locked`.

## Wikilink Conventions

### Syntax

```
[[Page Name]]           # Link to page by title
[[Page Name|alias]]     # Link with custom display text
![[Page Name]]          # Embed link (parsed but skipped in validation)
```

### Resolution

Wikilinks are resolved case-insensitively. The resolution process:

1. Normalize the link name: trim, lowercase, convert whitespace to hyphens
2. Check for cross-universe format: `[[Universe::Page Name]]`
3. First pass: exact title match, preferring same-universe pages
4. Second pass: exact title match across any universe
5. Third pass: filename match (without `.md` extension)

### Cross-Universe Links

When the same page title exists in multiple universes, use the namespace format:

```
[[Arda::Minas Tirith]]     # Explicitly link to Arda's Minas Tirith
[[Morrowind::Minas Tirith]] # Link to Morrowind's version
```

The `resolveWithNamespace()` function returns resolution metadata:
- `resolved` - the target page path, or null
- `isCrossUniverse` - whether the resolved page is in a different universe than the context
- `collision` - whether the page name exists in multiple universes

### Collision Detection

The `detectCollisions(pages)` function identifies page titles that exist in multiple universes. Collisions are included in the link graph and flagged during lint checks.

## Backlinks

Backlinks are derived dynamically from wikilinks. There is no separate backlink storage.

The `buildLinkGraph(pages)` function in `src/lib/wiki/wikilinks.ts` builds an adjacency map:

```typescript
interface LinkGraph {
  nodes: Map<string, string[]>;  // pagePath -> [targetPagePaths]
  edges: Array<{ source: string; target: string; linkType: string }>;
  collisions: Array<{ name: string; pages: string[] }>;
}
```

The `BacklinkPanel` component uses `parseWikilinks()` and `resolveWikilink()` to find all pages that link to the current page, displaying context snippets (40 characters before and after the wikilink).

## Orphan Pages

A page is an orphan when it has **no inbound AND no outbound** wikilinks. Pages with only inbound or only outbound links are not orphans.

The `findOrphans(wikiRoot)` function in `src/lib/wiki/orphans.ts` returns relative paths of orphan pages. The `getOrphanSuggestions(orphans, pages)` function suggests related pages based on shared tags.

Orphan pages are flagged in the file tree with an "orphan" badge.

## Page Size Limits

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `WIKI_MAX_PAGE_SIZE` | 10000 | Maximum characters per page |
| `NEXT_PUBLIC_WIKI_MAX_PAGE_SIZE` | 10000 | Client-accessible override |

### Warning Threshold

A warning banner displays when page content reaches 80% of the limit. The banner shows the current size and maximum size.

### Split Logic

The `suggestSplit(pagePath, content)` function analyzes H2 (`## `) headings and suggests subpage structure:

```typescript
interface SplitSuggestion {
  subpages: SuggestedSubpage[];  // Each H2 section becomes a subpage
  originalContent: string;       // Original content preserved
}

interface SuggestedSubpage {
  filename: string;   // Safe filename (e.g., "my_heading.md")
  title: string;      // Human-readable heading text
  content: string;    // Section content
}
```

The preamble (content before the first H2) becomes an "Introduction" subpage. Callers should present the suggestion to the user before splitting. Do not auto-split.

## Concurrent Edit Protection

### File Locking

An in-memory lock map prevents concurrent writes within a single process:

```typescript
lockFile(filePath)    // Throws if already locked
unlockFile(filePath)  // Release lock
isFileLocked(filePath) // Check lock status
```

### Conflict Detection

When writing with `expectedLastModified`, the system compares the expected timestamp against the actual `updated` field on disk:

```typescript
writeWikiPage(filePath, content, frontmatter, {
  expectedLastModified: "2025-01-15T10:30:00.000Z",
  onConflict: "fail"  // or "save-diff"
});
```

If the file has been modified since the expected timestamp:
- `onConflict: "fail"` (default) throws `ConflictError` with full diff
- `onConflict: "save-diff"` saves the diff to `_review/conflicts/{timestamp}-{filename}.diff` and proceeds with the write

### ConflictError

```typescript
class ConflictError extends Error {
  filePath: string;
  existingLastModified: string;
  expectedLastModified: string;
  diff: string;  // Unified diff format
}
```

## Lint Checks

The `lintWiki(wikiRoot, universeId?)` function runs a comprehensive health check:

### Contradictions

LLM-powered comparison of pages about the same entity. Detects:
- Factual conflicts (alive vs dead, different dates)
- Temporal conflicts (event order impossibilities)
- Location conflicts (entity in two places at once)
- Character trait conflicts
- Relationship conflicts

### Stale Claims

- Draft pages older than 90 days without updates
- Pages not updated in 30+ days with potentially stale wikilinks
- Pages missing `updated` timestamp

### Orphan Pages

Pages with no inbound AND no outbound wikilinks.

### Missing Pages

Wikilink targets that don't exist as wiki pages.

### Missing Cross-References

Pages that share tags but don't link to each other. Capped at 10 suggestions.

### Report Structure

```typescript
interface LintReport {
  contradictions: Contradiction[];
  staleClaims: StaleClaim[];
  orphans: string[];
  missingPages: MissingPage[];
  suggestions: string[];
}
```

## API Endpoints

### List Pages

```
GET /api/wiki
```

Returns all wiki pages with frontmatter and orphan paths. Requires `auth-token` cookie.

Response:
```json
{
  "pages": [
    { "path": "entities/haleth.md", "frontmatter": { ... } }
  ],
  "orphanPaths": ["concepts/orphan-page.md"]
}
```

### Create Page

```
POST /api/wiki
```

Body: `{ path, content, frontmatter }`

- `path` is relative (e.g., `entities/haleth.md`)
- Filename is sanitized automatically
- Path traversal is blocked

### Read Page

```
GET /api/wiki/entities/haleth
```

Returns page content, frontmatter, all wiki pages (for backlink resolution), and orphan paths.

### Update Page

```
PUT /api/wiki/entities/haleth
```

Body: `{ content?, frontmatter? }`

At least one of `content` or `frontmatter` is required. Existing page is read and fields are merged.

### Delete Page

```
DELETE /api/wiki/entities/haleth
```

Deletes the page and regenerates the index.

## Filename Sanitization

The `sanitizeWikiFilename(name)` function converts titles to safe filenames:

1. Remove invalid characters: `< > : " / \ | ? *` and control chars
2. Replace whitespace with underscores
3. Truncate to 100 characters
4. Remove trailing dots and spaces
5. Convert to lowercase kebab-case
6. Append `.md` extension
7. Fall back to `page_{timestamp}.md` if result is empty

Example: `"Haleth, Son of Húrin"` -> `haleth-son-of-h-rin.md`

## Operation Log

The `log.md` file is append-only. Entries are never modified or deleted.

Format:
```markdown
# Wiki Operation Log

<!-- Append-only log. Format: ## [YYYY-MM-DD] operation | Title -->

## [2025-01-15] ingest | chapter-3-draft

Source: data/user1/sources/chapter-3.md
Created: 5 pages
Updated: 2 pages
Errors: 0
```

Supported operations: `ingest`, `query`, `lint`, `create`, `update`, `delete`, `migrate`, `validate`, `lock`, `reject`.

## Index File

The `index.md` file is auto-generated by `generateIndex(wikiRoot)`. It groups pages by type and lists each as a wikilink with summary and status:

```markdown
<!-- AUTO-GENERATED, DO NOT EDIT -->

# Wiki Index

## Entities

- [[Haleth]] — Haleth was a leader of the Edain... (status: reviewed)
- [[Minas Tirith]] — The White City of Gondor... (status: locked)

## Concepts

- [[Magic System]] — The rules governing magical abilities... (status: draft)

## Sources

*(No sources pages yet)*

## Synthesis

- [[What is the relationship between Aragorn and Arwen?]] — Aragorn and Arwen share... (status: draft)
```

The index is regenerated automatically after every page create, update, or delete operation via the API.

## Viewer Components

### MarkdownRenderer

Renders wiki markdown with:
- GFM extensions (tables, strikethrough, task lists)
- Wikilink rendering via `@flowershow/remark-wiki-link`
- Frontmatter badge bar (title, type, status, tags)
- Page size warning banners (yellow at 80%, red at 100%)
- Loading skeleton and error states
- "Page not found" with "Create this page" CTA

Wikilink styling:
- Blue links (`text-blue-400`) for existing pages
- Red links (`text-red-400`) for non-existent pages

Props:
```typescript
interface MarkdownRendererProps {
  content: string;
  frontmatter?: Record<string, any>;
  existingPages?: string[];  // For wikilink exists detection
  wikiRoute?: string;        // Default: '/wiki'
  isLoading?: boolean;
  error?: string | null;
  pageTitle?: string;
  onCreatePage?: (title?: string) => void;
}
```

### FileTree

Expandable folder tree showing wiki structure. Folders: entities, concepts, sources, synthesis, _review.

- Type icons: entity (Users), concept (BookOpen), source (FileText), synthesis (GitBranch)
- Current page highlighted
- Orphan badge on orphan pages
- Empty state with "Create your first page" CTA
- Loading skeleton and error states

### BacklinkPanel

Shows incoming links to the current page. Uses `parseWikilinks()` and `resolveWikilink()` to find all pages linking to the current page.

- Displays backlink count
- Shows context snippet (40 chars before/after wikilink)
- Click to navigate to source page
- Empty state: "No pages link to this yet"

### GraphView

Cytoscape.js force-directed graph (cose algorithm).

- Node colors by type: entity (blue #3b82f6), concept (green #22c55e), source (orange #f97316), synthesis (purple #a855f7)
- Edges represent wikilinks
- Click node to navigate to page
- Zoom and pan enabled
- Loading progress bar, empty state, error state

### Search

FlexSearch full-text search with autocomplete dropdown.

- Indexes `content` and `title` fields
- Forward tokenization
- Keyboard navigation: ArrowUp/ArrowDown, Enter to select, Escape to close
- Results show title, type, and filename
- No results state with tips
- Error state
