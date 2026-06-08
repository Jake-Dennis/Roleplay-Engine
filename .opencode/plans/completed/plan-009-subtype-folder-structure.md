# Plan 009: Subtype Folder Structure (2-Level Mapping)

## Goal
Each subtype gets its own subfolder under the type-level folder: `entities/characters/`, `entities/locations/`, `entities/items/`, `concepts/events/`, etc. The server resolves the folder from the type registry (Plan 008), and a one-time migration script moves existing files. The wikilink rewriter updates all cross-references. Result: the file tree shows 12 browsable subfolders instead of 4 mega-folders, and the AI gets faster retrieval at scale.

**Depends on:** Plan 008 (type registry provides the subtype → folder mapping).

## Tasks

### Layer 1 (parallel, no deps)
- [ ] T1: Build folder resolver from registry (assigned: @builder)
  - `src/lib/wiki/subtype-folders.ts`:
    - `folderForSubtype(subtype: string, registry): string` — looks up `registry.subtypeFolders[subtype]`, falls back to `registry.fallbackFolder`
    - `folderForType(type: string, registry): string` — returns `registry.types[type].folder`
    - `folderForPage(frontmatter: WikiFrontmatter, registry): string` — picks subtype if present, else type
    - `subtypeFromFolder(folderPath: string, registry): string | null` — reverse lookup, used by file discovery
  - Unit tests in `src/lib/wiki/__tests__/subtype-folders.test.ts`
- [ ] T2: Update all write paths to use the resolver (assigned: @builder)
  - `src/lib/wiki/ingest.ts`: write to `folderForPage(frontmatter, registry)`
  - `src/lib/jobs/lore-extraction.ts`: same
  - `src/lib/jobs/wiki-handler.ts`: same
  - `src/lib/wiki/filing.ts`: same
  - `src/app/api/wiki/route.ts` (POST handler): same
  - Update `src/components/wiki/template-selector.tsx` POST flow to send the right path

### Layer 2 (depends on T1, T2)
- [ ] T3: Update `listWikiPages` to scan subfolders (assigned: @builder)
  - Recursively scan all subfolders under each top-level type folder
  - Skip `_review/conflicts/`, `_archive/`, `node_modules/`, hidden files
  - Sort by: top-level folder → subtype folder → `order` field → title
  - Returns paths like `entities/characters/gandalf.md`
  - Tests in `src/lib/wiki/__tests__/file-io.test.ts`
- [ ] T4: Update file tree to render 2-level structure (assigned: @builder)
  - Top level: 4 type folders (entity/concept/source/synthesis)
  - Second level: subtype subfolders under entity and concept
  - Subfolders collapsible/expandable
  - "Create page" button: type picker → subtype picker → title input (3-step flow)
  - Drag-and-drop works between any subfolders (already supported by dnd-kit; verify)
  - Update `src/components/wiki/file-tree.tsx`
  - Update `src/components/wiki/new-folder-modal.tsx` to suggest subtype folder names
- [ ] T5: Extend wikilink rewriter for subfolder moves (assigned: @builder)
  - `rewriteLinksForPageMove` in `src/lib/wiki/wikilinks.ts` already handles arbitrary path changes; verify it handles:
    - Move from `entities/gandalf.md` to `entities/characters/gandalf.md` (parent prefix added)
    - Move from `entities/characters/gandalf.md` to `entities/locations/gandalf.md` (subtype folder change)
    - Move from `concepts/event-acknowledgment.md` to `concepts/events/event-acknowledgment.md`
  - Add 6 new test cases in `src/lib/wiki/__tests__/wikilinks-rewrite.test.ts`
  - Existing 11 tests + 6 new = 17 total

### Layer 3 (depends on T3, T4, T5)
- [ ] T6: Write migration script (assigned: @builder)
  - `scripts/migrate-wiki-to-subtype-folders.ts`
  - Usage: `python scripts/migrate-wiki-to-subtype-folders.ts [--dry-run|--apply|--backup] [--user <userId>] [--universe <universeId>]`
  - Steps:
    1. Walk all `data/*/wiki/*/entities/*.md` and `data/*/wiki/*/concepts/*.md` files
    2. For each, read frontmatter, look up subtype → subfolder
    3. If no subtype: move to `<type>/misc/` (catch-all)
    4. Create the subfolder if missing
    5. Move the file
    6. After all moves, run `rewriteLinksForPageMove` for each affected path across all OTHER pages
    7. Print a summary: `{moved: N, linksUpdated: M, errors: K}`
  - `--backup` mode: copy `data/` to `data/_backup_<timestamp>/` first
  - `--dry-run` (default): print what would happen, don't move anything
  - Idempotent: running twice is a no-op (subfolders already exist)
- [ ] T7: Run migration on user's data (assigned: @git)
  - 1. Backup first (`--backup`)
  - 2. Dry-run on user's data, show user the plan
  - 3. Apply (`--apply`)
  - 4. Verify: `npm run build`, `npm test`, manual click-through of file tree
  - 5. If any wikilinks are broken, log them for manual review
- [ ] T8: Documentation (assigned: @docs)
  - `docs/wiki-folder-structure.md` — explains the 2-level layout with examples
  - `docs/wiki-migration-guide.md` — step-by-step migration guide for other users
  - README update: "Wiki folder structure" section with a tree diagram

## Verification
- [ ] T1: `bun test src/lib/wiki/__tests__/subtype-folders.test.ts` all cases pass
- [ ] T2: `bun test src/lib/wiki/__tests__/file-io.test.ts` all cases pass
- [ ] T4: `bun test src/lib/wiki/__tests__/wikilinks-rewrite.test.ts` 17 cases pass
- [ ] T5: `python -c "import os; assert os.path.getsize('docs/wiki-folder-structure.md') > 800"` exits 0
- [ ] T6: `npm run build` exits 0
- [ ] T7: `bun test` reports 109+ pass
