# WIKI SUBSYSTEM — src/lib/wiki/

## OVERVIEW
33-file wiki subsystem (43 including tests). Markdown-first content management: file I/O, wikilink parsing, LLM ingest/query/lint, validation workflow, concurrent edit protection, bulk operations, type system, configuration.

## MODULES
| File | Purpose | Key Exports |
|------|---------|-------------|
| `file-io.ts` (367L) | CRUD, conflict detection, file locking | `readWikiPage`, `writeWikiPage`, `deleteWikiPage`, `listWikiPages`, `sanitizeWikiFilename`, `lockFile/unlockFile`, `ConflictError`, `lineDiff` |
| `wikilinks.ts` | Obsidian `[[link]]` parsing, 3-pass resolution | `parseWikilinks`, `resolveWikilink`, `resolveWithNamespace`, `detectCollisions`, `buildLinkGraph`, `validateWikilinks` |
| `validation.ts` | Status workflow: draft → reviewed → locked | `validatePage`, `rejectPage`, `lockPage`, `isLocked` |
| `ingest.ts` | LLM source extraction → wiki pages | `ingestSource` (reads file → LLM extracts → creates pages) |
| `query.ts` (496L) | Natural language query with LLM synthesis | `queryWiki` (index scoring → FlexSearch → LLM synthesis) |
| `lint.ts` (487L) | Wiki health checks, contradiction detection | `lintWiki` (contradictions, stale claims, orphans, missing pages) |
| `frontmatter.ts` | YAML frontmatter parsing & serialization | `parseFrontmatter`, `serializeFrontmatter`, `EMPTY_FRONTMATTER` |
| `index-generator.ts` | Auto-generates `index.md` from all pages | `generateIndex`, `updateIndexEntry`, `removeIndexEntry` |
| `index-utils.ts` | Index helper utilities | `buildIndexTree`, `rebuildIndex` |
| `orphans.ts` | Find pages with no inbound/outbound links | `findOrphans`, `getOrphanSuggestions` |
| `filing.ts` | File LLM answers as synthesis pages | `fileAnswer` (creates synthesis page + cross-references) |
| `revisions.ts` | Page revision snapshots as JSON | `saveRevision`, `listRevisions`, `getRevision` |
| `history.ts` | Page history tracking | `getPageHistory` |
| `page-split.ts` | Page size limits, H2-based split suggestions | `checkPageSize`, `suggestSplit` |
| `logger.ts` | Append-only operation log | `appendLog`, `getRecentLogs`, `parseLog` |
| `callout-remark-plugin.ts` | Remark plugin for `> [!type]` callouts | `remarkCallout` (13 types with aliases) |
| `embed-remark-plugin.ts` | Remark plugin for `![[embed]]` syntax | `remarkEmbed` (page, section, block, image) |
| `config.ts` | Wiki subsystem configuration | `getWikiConfig` |
| `config-types.ts` | Wiki config type definitions | `WikiConfig` interface |
| `config-migration.ts` | Config schema migration helpers | `migrateConfig`, `getConfigVersion` |
| `types.ts` | Core wiki type definitions | `WikiPage`, `WikiFrontmatter`, `PageMeta` |
| `syntax-highlighter.ts` | Markdown syntax highlighting | `highlightSyntax`, `SyntaxToken` |
| `type-registry.ts` | Page type registry & validation | `registerType`, `isValidType` |
| `prompt-subtypes.ts` | Subtype prompt templates | `getSubtypePrompt` |
| `subtype-folders.ts` | Subtype → folder mapping | `getFolderForSubtype` |
| `auto-extract.ts` | Automatic entity/lore extraction | `autoExtractFromContent` |
| `bulk-move.ts` | Bulk page moves | `bulkMovePages` |
| `bulk-recategorize.ts` | Bulk page recategorization | `bulkRecategorizePages` |
| `merge.ts` | Page merging | `mergePages` |
| `merge-suggester.ts` | Merge suggestion engine | `suggestMerges` |
| `move-page.ts` | Single page move with link rewrites | `movePage` |
| `path-guard.ts` | Path traversal protection | `sanitizePath`, `isPathAllowed` |
| `wiki-root.ts` | Wiki root directory resolution | `getWikiRoot`, `ensureWikiRoot` |

## FRONTMATTER SCHEMA
```yaml
title: string              # Required — wikilink resolution
type: entity|concept|source|synthesis   # Required — folder placement
status: draft|reviewed|locked|rejected  # Required — validation state
universe: string           # Optional — cross-universe namespace
tags: string[]             # Optional — orphan suggestions, cross-refs
created: ISO 8601          # Auto-set on first write
updated: ISO 8601          # Auto-set on every write, conflict detection
```

## WIKILINK RESOLUTION (3-PASS)
1. Normalize: trim, lowercase, whitespace → hyphens
2. Cross-universe: `[[Universe::Page]]` format parsed
3. Pass 1: exact title match, prefer same-universe
4. Pass 2: exact title match, any universe
5. Pass 3: filename match (without `.md`)

## CONCURRENT EDIT PROTECTION
- In-memory file locks (single-process)
- Timestamp-based conflict detection via `updated` frontmatter
- Conflict resolution: `fail` (throw) or `save-diff` (save to `_review/conflicts/`)

## ANTI-PATTERNS
- **Do NOT store wiki content in SQLite** — markdown files on disk.
- **Do NOT edit `index.md` manually** — auto-generated, regenerated on changes.
- **Do NOT bypass validation workflow** — draft → reviewed → locked is enforced.
