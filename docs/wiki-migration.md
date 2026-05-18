# LLM Wiki Migration Guide

Replacing the legacy lore database with a markdown-first wiki system.

## Architecture Overview

The LLM Wiki replaces 12 database tables and 38 files with a file-based wiki stored as markdown. The system uses YAML frontmatter for metadata, wikilinks for navigation, and an LLM-driven pipeline for ingest, query, and lint operations.

### Before (Legacy Lore System)

```
Database Tables (12):
  locations, npcs, events, relationships
  narrative_memories, lore_validations, lore_edits
  backlinks, embedding_index, embedding_vectors
  + operational tables (users, sessions, job_queue, etc.)

File Structure:
  data/{userId}/locations/*.md
  data/{userId}/npcs/*.md
  data/{userId}/events/*.md
  data/{userId}/relationships/*.md
```

### After (Wiki System)

```
File Structure:
  data/{userId}/wiki/
    index.md              # Auto-generated index of all pages
    log.md                # Append-only operation log
    WIKI_SCHEMA.md        # Schema conventions (this file)
    entities/             # Characters, locations, objects, factions
    concepts/             # Themes, rules, mechanics, ideas
    sources/              # Ingested source material
    synthesis/            # LLM-generated answers and analyses
    _review/              # Conflict diffs and review artifacts
      conflicts/          # Concurrent edit diff files

Library Structure:
  src/lib/wiki/
    file-io.ts            # CRUD operations with conflict detection
    wikilinks.ts          # Parsing, resolution, link graph, collision detection
    orphans.ts            # Orphan page detection
    page-split.ts         # Page size limits and split suggestions
    ingest.ts             # LLM source ingestion
    query.ts              # Index-first retrieval with LLM synthesis
    lint.ts               # Health checks: contradictions, orphans, stale claims
    validation.ts         # Status workflow: draft -> reviewed -> locked
    index-generator.ts    # Auto-generated index.md
    logger.ts             # Append-only operation log
    filing.ts             # Save query answers as synthesis pages

API Routes:
  GET  /api/wiki                    # List all pages + orphans
  POST /api/wiki                    # Create new page
  GET  /api/wiki/[...slug]          # Read page by path
  PUT  /api/wiki/[...slug]          # Update page (merge frontmatter)
  DELETE /api/wiki/[...slug]        # Delete page

Components:
  src/components/wiki/
    markdown-renderer.tsx   # React-markdown + wikilink plugin + size warnings
    file-tree.tsx           # Expandable folder tree with orphan badges
    backlink-panel.tsx      # Dynamic backlinks from wikilink graph
    graph-view.tsx          # Cytoscape.js force-directed graph
    search.tsx              # FlexSearch full-text with keyboard navigation
```

### Feature Flags

Two environment variables control wiki-first routing:

| Flag | Value | Effect |
|------|-------|--------|
| `WIKI_FIRST` | `"true"` | Use wiki as primary source in retrieval pipeline |
| `WIKI_JOBS` | `"true"` | Route lore-related jobs to wiki handlers instead of DB handlers |

When `WIKI_JOBS` is set, these job types switch to wiki handlers:
- `expand_lore` -> `wiki_ingest`
- `enrich_npc` -> `wiki_enrich_entity`
- `expand_rumors` -> `wiki_generate_rumors`
- `lore_deepening` -> `wiki_deepen_page`
- `expand_location_lore` -> `wiki_deepen_location`
- `extract_event` -> `wiki_extract_event`

The legacy handlers remain as fallback when the flag is not set.

## Migration Steps

### Prerequisites

1. Ensure the wiki directory structure exists for each user:
   ```
   data/{userId}/wiki/entities/
   data/{userId}/wiki/concepts/
   data/{userId}/wiki/sources/
   data/{userId}/wiki/synthesis/
   data/{userId}/wiki/_review/
   ```

2. Verify the database is accessible at `data/global.db`.

3. Back up the database and all lore markdown files before running any migration.

### Step 1: Dry Run All Migrations

Run each migration script with `--dry-run` to preview what will be created:

```bash
npx tsx scripts/migrate-locations-to-wiki.ts --dry-run
npx tsx scripts/migrate-npcs-to-wiki.ts --dry-run
npx tsx scripts/migrate-events-to-wiki.ts --dry-run
npx tsx scripts/migrate-relationships-to-wiki.ts --dry-run
npx tsx scripts/migrate-backlinks-validations.ts --dry-run
```

Review the output. Each script shows:
- Pages that would be created (prefixed with `+` in live mode, `·` in dry-run)
- Pages that already exist (prefixed with `~`)
- Frontmatter mapping (status, tags, universe)
- Any errors encountered

### Step 2: Migrate Specific Users (Optional)

To migrate a single user:

```bash
npx tsx scripts/migrate-locations-to-wiki.ts --userId <user-id>
```

### Step 3: Run Live Migrations

Run each migration without `--dry-run`:

```bash
npx tsx scripts/migrate-locations-to-wiki.ts
npx tsx scripts/migrate-npcs-to-wiki.ts
npx tsx scripts/migrate-events-to-wiki.ts
npx tsx scripts/migrate-relationships-to-wiki.ts
npx tsx scripts/migrate-backlinks-validations.ts
```

Each script:
- Reads data from the database and existing markdown files
- Creates wiki pages with proper frontmatter
- Preserves wikilinks in content verbatim
- Regenerates `index.md` after completion
- Skips pages that already exist (idempotent)

### Step 4: Verify Migration

Check that wiki pages were created:

```bash
# Count wiki pages per user
find data/{userId}/wiki -name "*.md" | wc -l

# Verify index.md was generated
cat data/{userId}/wiki/index.md

# Check the operation log
cat data/{userId}/wiki/log.md
```

### Step 5: Enable Wiki-First Mode

Set environment variables to switch to wiki-first routing:

```env
WIKI_FIRST=true
WIKI_JOBS=true
```

Restart the application. The retrieval pipeline now reads from wiki files first, falling back to the database if the wiki is unavailable.

### Step 6: Clean Up Old Lore (Optional)

After verifying the wiki contains all migrated data:

```bash
# Preview cleanup
npx tsx scripts/cleanup-old-lore-tables.ts --dry-run

# Run cleanup (requires confirmation)
npx tsx scripts/cleanup-old-lore-tables.ts

# Skip confirmation prompt
npx tsx scripts/cleanup-old-lore-tables.ts --force
```

The cleanup script performs three phases:
1. **Verification** - Confirms wiki pages exist before proceeding
2. **Archiving** - Moves old lore markdown files to `data/{userId}/lore-archive/`
3. **Drop Tables** - Drops deprecated content tables from the database

Tables dropped:
- `locations`, `npcs`, `events`, `relationships`
- `narrative_memories`, `lore_validations`, `lore_edits`
- `backlinks`, `embedding_index`, `embedding_vectors`

Tables preserved (operational):
- `users`, `sessions`, `job_queue`, `universes`, `scene_states`, `personas`

## Migration Script Reference

All migration scripts share the same CLI interface:

```
Usage: npx tsx scripts/migrate-{type}-to-wiki.ts [options]

Options:
  --dry-run         Preview changes without writing files
  --userId <id>     Only migrate data for this specific user
  --help, -h        Show help message
```

### Locations Migration

Maps DB fields to wiki frontmatter:

| DB Field | Wiki Frontmatter | Notes |
|----------|-----------------|-------|
| `name` | `title` | |
| `canon_tier` | `status` | `immutable_canon` -> `locked`, `soft_canon` -> `reviewed`, others -> `draft` |
| `importance` | `tags` | As `importance:high` |
| `file_path` | `tags` | As `source:filename` |
| `universe_id` | `universe` | |

Content comes from the original markdown file (stripped of frontmatter) or falls back to `known_info` / `hidden_info` from the database.

### NPCs Migration

Same pattern as locations. `location_id` is converted to a wikilink `[[Location Name]]` in the page body.

### Events Migration

`location_id` and `participants` are converted to wikilinks. `occurred_at` is added as a date tag.

### Relationships Migration

`source_entity` and `target_entity` become wikilinks. `emotional_state` and `relationship_stage` are preserved as tags. Shared history becomes the page body.

### Backlinks and Validations Migration

Backlinks are not migrated directly. They are derived dynamically from wikilinks via `buildLinkGraph()`. Validation states are converted to frontmatter status:
- `generated_unverified` -> `draft`
- `under_review` -> `draft`
- `validated` -> `reviewed`
- `rejected` -> `rejected` (or page deleted)

## Rollback

If migration needs to be reversed:

1. Disable feature flags (`WIKI_FIRST`, `WIKI_JOBS`)
2. The system falls back to the legacy DB handlers
3. Wiki pages can be deleted without affecting the database (migration is one-way copy, not move)
4. If cleanup was run, restore from the `lore-archive/` directory and database backup

## Performance Benchmarks

Run the benchmark script to verify wiki performance:

```bash
npx tsx scripts/benchmark-wiki.ts
```

This creates 100 test pages and measures:

| Operation | Target | Description |
|-----------|--------|-------------|
| `readWikiPage` | < 200ms | Single page read and parse |
| `writeWikiPage` | < 200ms | Single page write with frontmatter |
| `listWikiPages` | < 1000ms | Scan all folders (graph load) |
| `buildLinkGraph` | < 1000ms | Build full adjacency map |
| `parseWikilinks` | < 100ms | Parse content with 20 wikilinks |
| `resolveWikilink` | < 100ms | Resolve a link from 100 pages |

## Troubleshooting

### Wiki pages not appearing after migration

- Check that the wiki directory structure exists (`data/{userId}/wiki/entities/`, etc.)
- Verify the database path is correct (`data/global.db`)
- Run with `--dry-run` first to see what the script would do
- Check for errors in the migration output

### Concurrent edit conflicts

When two processes write to the same page simultaneously, a `ConflictError` is thrown. The error includes:
- `filePath` - which file conflicted
- `existingLastModified` - the actual timestamp on disk
- `expectedLastModified` - what the writer expected
- `diff` - a unified diff of the changes

With `onConflict: "save-diff"`, the diff is saved to `_review/conflicts/{timestamp}-{filename}.diff` and the write proceeds. With `onConflict: "fail"` (default), the error is thrown and the caller must handle it.

### Page size warnings

Pages approaching the size limit show a warning banner in the markdown renderer. The default limit is 10,000 characters, configurable via `WIKI_MAX_PAGE_SIZE` or `NEXT_PUBLIC_WIKI_MAX_PAGE_SIZE` environment variables. The warning triggers at 80% of the limit.

To split a large page, use `suggestSplit(pagePath, content)` from `src/lib/wiki/page-split.ts`. It analyzes H2 headings and suggests subpage structure. Do not auto-split without user confirmation.

### Broken wikilinks

Run the lint check to find broken links:

```typescript
import { lintWiki } from "@/lib/wiki/lint";
const report = await lintWiki(wikiRoot, universeId);
console.log(report.missingPages);
```

The `missingPages` array lists every wikilink whose target page does not exist.

### Orphan pages

Orphan pages have no inbound AND no outbound wikilinks. They are flagged in the file tree with an "orphan" badge. Use `getOrphanSuggestions(orphans, pages)` from `src/lib/wiki/orphans.ts` to find related pages based on shared tags.

### LLM extraction failures

If the LLM fails during ingest, the function returns an empty extraction result. The caller should handle this gracefully. Check that Ollama is running and the model is available.

### Search not returning results

The search component builds a FlexSearch index from all wiki pages on mount. If pages were added after the component mounted, refresh the page. The index is rebuilt automatically when pages are created or updated via the API.

### Index out of sync

The `index.md` file is auto-generated and should never be edited manually. If it becomes out of sync, call `generateIndex(wikiRoot)` from `src/lib/wiki/index-generator.ts` to rebuild it from all wiki pages.
