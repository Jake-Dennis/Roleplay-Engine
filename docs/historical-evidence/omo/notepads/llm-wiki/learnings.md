# LLM Wiki — Learnings

## Task 1: Wiki Directory Structure + WIKI_SCHEMA.md

### Completed: 2026-05-18

### What was done
- Created `src/lib/wiki/` (empty) — for subsequent wiki operation libraries
- Created `src/components/wiki/` (empty) — for subsequent wiki viewer components
- Added wiki constants to `src/lib/entity-constants.ts`:
  - `WIKI_FOLDERS` — ['entities', 'concepts', 'sources', 'synthesis', '_review']
  - `WIKI_STATUS_COLORS` — draft/reviewed/locked/rejected tailwind classes
  - `WIKI_PAGE_TYPE_ICONS` — entity/concept/source/synthesis mapped to lucide icon names
- Created `scripts/init-wiki.ts`:
  - Takes `userId` as CLI argument
  - Creates `data/{userId}/wiki/` with 5 subfolders
  - Creates `WIKI_SCHEMA.md` with full schema (page types, frontmatter, wikilinks, folder org, validation workflow, lint rules)
  - Creates `index.md` with AUTO-GENERATED header and empty category sections
  - Creates `log.md` with format documentation
  - Idempotent: skips existing files (safe for re-running)
  - Uses same DATA_DIR pattern as `src/lib/config.ts` (`process.env.DATA_DIR || "./data"`)

### Key decisions
- Used `string[]` for `tags` frontmatter field (comma-separated in YAML, array in type)
- Used lucide icon *names* (strings) rather than components in WIKI_PAGE_TYPE_ICONS for universal import compatibility
- Script is idempotent — uses `writeFileIfMissing` to avoid overwriting existing wiki data
- WIKI_SCHEMA.md stored as template string directly in the script (not read from external file) for portability

### Dependencies
- Depends on: nothing (Task 1 is the root of Wave 1)
- Blocks: Tasks 12-21 (LLM operations + migration scripts)

### Deviations from plan
- None. All acceptance criteria met.

### Notes for future tasks
- `index.md` auto-generation will be handled by Task 4 (`src/lib/wiki/index-generator.ts`)
- `log.md` append operations will be handled by Task 5 (`src/lib/wiki/logger.ts`)
- The `WIKI_FOLDERS` constant in entity-constants.ts uses `as const` for literal type inference

## Task: Wiki Ingest (ingest.ts)

### Completed: 2026-05-18

### What was done
- Created `src/lib/wiki/ingest.ts` with `ingestSource(sourcePath, wikiRoot, universeId)`
- Flow: read source → LLM extract entities/concepts → create wiki pages → regenerate index → append log
- Uses `generateText` from `ollama.ts` for LLM extraction (JSON-structured prompt)
- Creates source page in `sources/`, entity pages in `entities/`, concept pages in `concepts/`
- All new pages get `status: draft` in frontmatter
- Frontmatter includes: title, type, status, universe, tags, created, source_ref (via tags)
- Updates existing pages by appending new content + merging tags (never overwrites)
- Regenerates index via `generateIndex` from index-generator.ts
- Appends log via `appendLog` from logger.ts
- Returns `IngestResult { created: string[], updated: string[], errors: string[] }`
- Handles errors gracefully — no throws, all errors collected in result.errors array
- Source content truncated to 12000 chars for LLM context, 5000 chars for source page body

### Key decisions
- LLM prompt returns strict JSON with `entities[]` and `concepts[]` arrays
- Temperature set to 0.3 for deterministic extraction
- Existing pages are updated (appended) rather than overwritten — preserves user edits
- Source page stores truncated preview, not full content (avoids duplication)
- Tags include `auto-generated` and `source:<name>` for traceability
- No new dependencies added — uses existing gray-matter, ollama, file-io, index-generator, logger

### Dependencies
- Depends on: file-io.ts, index-generator.ts, logger.ts, ollama.ts
- Blocks: Task 25 (API routes for wiki viewer)

## Task: Wiki Query (query.ts)

### Completed: 2026-05-18

### What was done
- Created `src/lib/wiki/query.ts` with `queryWiki(query, wikiRoot, universeId)`
- Flow: read index.md → score entries by relevance → read full pages → LLM synthesis → return answer with citations
- FlexSearch full-text fallback when index has no matches or doesn't exist
- Returns `QueryResult { answer: string, citations: [{ pagePath, relevantSection }], usedFallback: boolean }`
- Index parsing: extracts `[[Title]] — summary (status: X)` entries grouped by section
- Relevance scoring: keyword overlap with bonus for title match and reviewed/locked status
- Page resolution: 3-pass (exact+universe → exact any → filename match)
- Section extraction: splits by markdown headings, scores by query term overlap
- LLM prompt: structured synthesis with strict "only use provided pages" constraint
- Citation extraction: parses inline references from LLM response, falls back to citing all used pages
- Graceful LLM failure: returns page list with manual review suggestion
- Temperature 0.3, num_ctx 16384 for deterministic synthesis

### Key decisions
- Index-first approach: parse index.md before reading full pages (avoids loading entire wiki)
- FlexSearch uses same Document API pattern as search.tsx (`tokenize: 'forward'`)
- Universe filtering applied at both index scoring and FlexSearch hit levels
- Status preference: locked > reviewed > draft (bonus scores in relevance)
- No new dependencies — uses existing flexsearch, ollama, file-io, wikilinks
- Empty query returns early with "no relevant information" answer
- LLM errors don't throw — return fallback answer with page references

### Dependencies
- Depends on: file-io.ts, wikilinks.ts, ollama.ts, flexsearch
- Blocks: API routes for wiki query endpoint
