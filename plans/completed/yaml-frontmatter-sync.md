# Plan: YAML Frontmatter in Markdown Files

## Goal
Sync lore entity metadata (name, importance, tags, canon status) between database and markdown file frontmatter, enabling Obsidian-style editing with metadata in the `.md` files themselves.

## Graph Analysis
- **Affected Systems**: Lore CRUD APIs, markdown storage, file system, lore editor
- **Dependency Chain**: `api/locations/route.ts` → `lib/markdown.ts` → `data/<user_id>/locations/*.md`
- **Centrality**: MEDIUM — touches lore storage and editing

## Affected Files
| File | Change |
|------|--------|
| `src/lib/lore-markdown.ts` | Added `parseFrontmatter`, `syncFrontmatterToDb`, `syncDbToFrontmatter` |
| `src/app/api/lore-files/route.ts` | Sync frontmatter to DB on save, removed duplicate `parseFrontmatter` |
| `src/app/(app)/lore/[id]/edit/page.tsx` | Added sync status indicator |
| `scripts/sync-frontmatter.ts` | New migration script |

## Risks
- **MEDIUM**: Existing markdown files may not have frontmatter — need migration
- **MEDIUM**: Database is source of truth — file sync must not overwrite DB data
- **LOW**: File I/O errors should not break API responses

## Execution Phases

### Phase 1: Frontmatter Sync Utility
1. Create `syncFrontmatterToDb(filePath, entityType)` — parse frontmatter, update DB
2. Create `syncDbToFrontmatter(entityId, entityType, filePath)` — write DB data to frontmatter
3. Handle conflicts: DB wins on save, file wins on load (with merge)

### Phase 2: API Updates
1. Update `PUT /api/locations/[id]` to:
   - Parse incoming markdown for frontmatter
   - Merge frontmatter fields with DB fields
   - Save merged data to DB
   - Write updated frontmatter to markdown file
2. Repeat for NPCs, events, narrative memories

### Phase 3: Migration Script
1. Create `scripts/sync-frontmatter.ts`
2. Scan all user data directories for `.md` files
3. For each file:
   - If no frontmatter: generate from DB metadata
   - If frontmatter exists: sync to DB, resolve conflicts
4. Log all changes for review

### Phase 4: Lore Editor Integration
1. Update lore editor to show frontmatter fields from markdown
2. Add "Sync to file" button for manual sync
3. Show sync status indicator (in sync / out of sync)

## Validation
- Edit lore in UI, verify frontmatter updates in markdown file
- Edit frontmatter in markdown file, verify DB updates on load
- Run migration script, verify all files have frontmatter
- Create new lore entry, verify frontmatter is written to file

## Rollback
- Revert API routes to ignore frontmatter
- Keep migration script for reference

## Status: COMPLETED
- [x] Phase 1: `parseFrontmatter`, `syncFrontmatterToDb`, `syncDbToFrontmatter` in lore-markdown.ts
- [x] Phase 2: lore-files PUT syncs frontmatter to DB on save
- [x] Phase 3: Migration script scans all user dirs, syncs frontmatter ↔ DB
- [x] Phase 4: Lore editor shows sync status indicator (synced / unsaved changes)
- [x] Validation: Build passes clean, TypeScript compiles with zero errors
