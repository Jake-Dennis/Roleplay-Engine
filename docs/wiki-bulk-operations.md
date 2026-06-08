# Wiki Bulk Operations

> **Plan 010** — Bulk move and bulk recategorize tools for large-scale wiki
> reorganization.
>
> Part of the Wiki Evolution tooling. Designed for wikis with 100+ pages where
> individual drag-and-drop operations become impractical.

---

## Table of Contents

1. [Overview](#overview)
2. [Safety First: Dry-Run Mode](#safety-first-dry-run-mode)
3. [Bulk Move](#bulk-move)
4. [Bulk Re-categorize](#bulk-re-categorize)
5. [Both Operations Available Via](#both-operations-available-via)
6. [Use Cases and Examples](#use-cases-and-examples)
7. [API Reference](#api-reference)
8. [Performance Considerations](#performance-considerations)
9. [File Reference](#file-reference)

---

## Overview

Two bulk operations are available for large-scale wiki reorganization:

| Operation | What It Does | Best For |
|-----------|-------------|----------|
| **Bulk Move** | Move all pages from one top-level folder to another | Reorganizing folder structure |
| **Bulk Re-categorize** | Change frontmatter fields on matching pages | Retagging, reclassifying, bulk status changes |

Both operations are **preview-first** — they default to **dry-run mode** so you can
see exactly what will change before applying. Only explicit `dryRun: false` commits
the changes.

### When to Use Bulk Operations vs. Individual Moves

| Situation | Use |
|-----------|-----|
| Moving 1–5 pages | Drag-and-drop in file tree (individual `POST /api/wiki/reorder`) |
| Moving 10+ pages between folders | **Bulk Move** (single request, batch link rewrite) |
| Changing subtype on 1–2 pages | Frontmatter panel (individual edit) |
| Changing subtype/tags on 20+ pages | **Bulk Re-categorize** (filter + apply) |
| Moving pages and recategorizing at once | Two passes: bulk recategorize first (moves files), then bulk move if needed |

---

## Safety First: Dry-Run Mode

Both bulk operations default to **dry-run mode** (`dryRun: true`). In dry-run mode:

1. Pages are read from disk
2. Filter criteria are evaluated
3. Proposed changes are computed (folder paths, new frontmatter)
4. The result is returned as a preview
5. **No files are modified, moved, or deleted**

### Dry-Run in the API

The `dryRun` parameter is part of the request body:

```json
{
  "moves": [...],
  "dryRun": true
}
```

If `dryRun` is omitted, it defaults to `true`. To apply changes, explicitly set
`dryRun: false`:

```json
{
  "moves": [...],
  "dryRun": false
}
```

### Dry-Run in the Admin UI

The admin UI has a two-step workflow:

1. **Click "Preview"** — runs the operation in dry-run mode and displays results
2. **Click "Apply"** — runs the operation with `dryRun: false`

A confirmation dialog appears between steps 1 and 2:
```
Confirm Bulk Move
Are you sure you want to move 12 pages from "entities" to "characters"?
This will update all wikilinks pointing to moved pages.

            [Cancel]  [Apply Move]
```

### What to Check in a Dry-Run Preview

For **Bulk Move**, check:
- Are the correct pages listed? (check `fromFolder` is right)
- Are the destination paths correct? (check `toFolder` is right)
- Are there any failures? (source not found, destination exists)
- How many links will be updated? (verify the count is reasonable)

For **Bulk Re-categorize**, check:
- Do the filter criteria match the expected number of pages?
- Are the proposed changes correct for each page?
- Which pages will be moved to a different folder (`newFolder` in the response)?
- Are there any errors? (page read failures, etc.)

---

## Bulk Move

The bulk move operation moves multiple wiki pages from one folder to another in a
single batch. It is designed for efficiency — instead of calling `moveWikiPage()` for
each page (which does a full link scan per page), it uses a **two-phase approach**
that scans links only once.

### How It Works

```
Phase 1: File Moves (O(n) where n = number of moves)
  ├── For each move:
  │   ├── Validate paths (traversal check, source exists, destination doesn't exist)
  │   ├── Read source page
  │   ├── Update frontmatter (type, subtype based on new folder)
  │   ├── Write to destination (create directory if needed)
  │   └── Delete source
  └── Collect moved page info (old folder, new folder, title, filename)

Phase 2: Batch Link Rewrite (O(n + m) where m = total wiki pages)
  ├── Collect all .md files in wiki
  ├── For each file:
  │   ├── Read content
  │   ├── For each moved page: rewrite wikilinks (old path → new path)
  │   └── Write back if content changed
  └── Return count of modified files
```

This is significantly more efficient than individual `moveWikiPage()` calls for
large batches. For a wiki with 500 pages and 50 moves:

| Approach | Reads | Writes |
|----------|-------|--------|
| Individual `moveWikiPage()` × 50 | 50 × 500 = 25,000 reads | 50 + (50 × 500) = 25,050 writes |
| Batch (`bulkMovePages`) | 50 + 500 = 550 reads | 50 + (up to 500) writes |

### Input Format

Each move specifies an `oldPath` and `newPath`:

```typescript
interface BulkMoveItem {
  /** Relative path of the source page (e.g. "entities/characters/gandalf.md"). */
  oldPath: string;
  /** Relative path of the destination (e.g. "characters/gandalf.md"). */
  newPath: string;
  /**
   * Optional explicit subtype to set in frontmatter.
   * If omitted, the subtype is derived from the destination folder.
   */
  newSubtype?: string;
}
```

**Simple folder-to-folder:** Replace the top-level folder prefix:
```json
{
  "moves": [
    { "oldPath": "entities/characters/gandalf.md", "newPath": "characters/gandalf.md" },
    { "oldPath": "entities/locations/shire.md", "newPath": "characters/locations/shire.md" }
  ]
}
```

**With explicit subtype:** Override the derived subtype:
```json
{
  "moves": [
    { "oldPath": "entities/misc/oddball.md", "newPath": "entities/items/oddball.md", "newSubtype": "item" }
  ]
}
```

### Frontmatter Updates During Move

When a page moves to a new folder, the `type` and `subtype` frontmatter fields are
updated automatically:

| Old Path | New Path | Updated Fields |
|----------|----------|----------------|
| `entities/characters/gandalf.md` | `characters/gandalf.md` | `type: "entity"` → `type: "character"` |
| `entities/characters/gandalf.md` | `characters/gandalf.md` | `subtype: "character"` → removed (flat folder) |
| `entities/misc/oddball.md` | `entities/items/oddball.md` | `subtype` → `"item"` |

The `singularizeFolder()` helper converts plural folder names to singular types:
```typescript
singularizeFolder("entities")      → "entity"
singularizeFolder("characters")    → "character"
singularizeFolder("entities/characters") → "entities/character"
```

For 2-level folders (e.g., `entities/characters`), only the last segment is
singularized, so `subtype` gets the singular form `"character"`.

### Wikilink Rewrite Scope

Only **path-based wikilinks** are rewritten:
- `[[entities/characters/gandalf]]` → `[[characters/gandalf]]`
- `[[entities/characters/gandalf\|wizard]]` → `[[characters/gandalf\|wizard]]`

**Not rewritten:**
- `[[Gandalf]]` — bare-name links (resolve via title, not path)
- `[[Universe::Gandalf]]` — namespace links
- `![[embed:...]]` — embed links (unless they use path format)

### Result Format

```typescript
interface BulkMoveResult {
  /** Relative paths of pages that were successfully moved. */
  moved: string[];
  /** Pages that could not be moved, with reasons. */
  failed: Array<{ path: string; reason: string }>;
  /** Number of pages whose wikilinks were updated. */
  linksUpdated: number;
}
```

**Example response:**
```json
{
  "moved": [
    "entities/characters/gandalf.md",
    "entities/locations/shire.md"
  ],
  "failed": [
    { "path": "entities/items/anduril.md", "reason": "Destination already exists" }
  ],
  "linksUpdated": 15
}
```

### Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `Source file not found` | `oldPath` doesn't exist | Check the path is correct and relative to wiki root |
| `Destination already exists` | A file at `newPath` already exists | Rename the source or destination before moving |
| `Path traversal detected` | Path contains `..` or escapes wiki root | Use only relative paths within the wiki root |
| Same-file no-op | `oldPath` and `newPath` are the same | No action needed; counted as "moved" (idempotent) |

### Admin UI Workflow (Bulk Move Tab)

```
┌───────────────────────────────────────────────────┐
│  From Folder: [entities ▼]  To Folder: [concepts ▼]│
│                                           │
│  [Preview]     12 pages in "entities"     │
├───────────────────────────────────────────────────┤
│  Preview — 12 files to move · 32 links to update  │
│                                                   │
│  entities/characters/gandalf.md  →  concepts/g... │
│  entities/locations/shire.md     →  concepts/l... │
│  ...                                               │
│                                                   │
│  [Apply Moves (12)]                                │
└───────────────────────────────────────────────────┘
```

Steps:
1. Select "From Folder" (source)
2. Select "To Folder" (destination)
3. Click **Preview** to see proposed moves and link counts
4. Review the move list (shows old → new for each page)
5. Click **Apply Moves** and confirm

---

## Bulk Re-categorize

The bulk recategorize operation finds pages matching a filter and applies frontmatter
changes (type, subtype, tags, status) to all of them. When type or subtype changes
cause a folder move, the file is moved automatically and wikilinks are rewritten.

### Architecture

```
bulkRecategorize(filter, changes, wikiRoot, { dryRun })
  │
  ├── 1. List all pages (including dormant)
  │
  ├── 2. Apply filter (AND of all criteria)
  │     ├── type === filter.type ?
  │     ├── subtype === filter.subtype ?
  │     ├── status === filter.status ?
  │     ├── tags includes filter.tag ?
  │     └── path startsWith filter.folder ?
  │
  ├── 3. For each matched page:
  │     ├── Compute proposed frontmatter (working copy)
  │     ├── Compute target folder (folderForPage)
  │     ├── Compute new tags (merge/replace logic)
  │     └── Check if folder changed vs. current
  │
  ├── 4. If dry-run: return proposed changes, no files touched
  │
  └── 5. If apply:
        ├── For folder-change case:
        │     ├── moveWikiPage() → file move + wikilink rewrite
        │     └── Apply tags/status to moved page
        └── For same-folder case:
              └── Update frontmatter in place (writeWikiPage)
```

### Filter Criteria

All filter criteria are **ANDed** — a page must match ALL criteria to be affected.
An empty filter matches **every page**.

```typescript
interface RecategorizeFilter {
  /** Filter by exact type match. */
  type?: string;
  /** Filter by exact subtype match. */
  subtype?: string;
  /** Filter by tag presence (page must have this tag). */
  tag?: string;
  /** Filter by exact status match. */
  status?: string;
  /** Filter by folder prefix (path must start with this). */
  folder?: string;
}
```

**Examples:**

| Filter | Effect |
|--------|--------|
| `{ type: "entity" }` | All entity pages |
| `{ type: "entity", subtype: "character" }` | All character pages |
| `{ tag: "npc" }` | All pages tagged "npc" |
| `{ status: "draft" }` | All draft pages |
| `{ type: "entity", status: "draft", folder: "entities/misc" }` | Draft entity pages in misc folder |
| `{}` | **All pages** (use with caution) |

### Changes to Apply

```typescript
interface RecategorizeChanges {
  /** Replace the subtype entirely. */
  newSubtype?: string;
  /** Replace the type entirely. */
  newType?: string;
  /** Replace all tags with this array. */
  newTags?: string[];
  /** Replace the status entirely. */
  newStatus?: string;
  /** Tags to add to existing tags (deduplicated). */
  addTags?: string[];
  /** Tags to remove from existing tags. */
  removeTags?: string[];
}
```

**Tag logic priority:**
1. If `newTags` is set → **replace** all tags with the new array (ignores `addTags`/`removeTags`)
2. If `addTags` and/or `removeTags` are set → **modify** existing tags (add then remove)
3. If neither → tags are left unchanged

**Examples:**

| Changes | Effect |
|---------|--------|
| `{ newSubtype: "character", newTags: ["wizard"] }` | Set subtype to "character", replace all tags with ["wizard"] |
| `{ addTags: ["important"], newStatus: "reviewed" }` | Add "important" tag, set status to "reviewed" |
| `{ removeTags: ["deprecated"] }` | Remove "deprecated" tag if present |
| `{ newType: "concept", addTags: ["meta"], removeTags: ["character"] }` | Change type to "concept", add "meta" tag, remove "character" tag |

### Folder Move Detection

When a change in `type` or `subtype` would result in a different folder, the
system detects this by comparing the current directory with the target folder
computed by `folderForPage()`:

```typescript
const registry = getTypeRegistry(wikiRoot);
const newFolder = folderForPage(workingFm, registry);
const folderChanged = newFolder !== oldDir;

if (folderChanged && (needsSubtypeChange || needsTypeChange)) {
  // Case 1: Move to new folder (uses moveWikiPage which rewrites links)
  const newRelPath = path.join(newFolder, filename);
  moveWikiPage(relPath, newRelPath, wikiRoot, registry);
  // ... then apply tags/status to moved page
} else {
  // Case 2: Same folder — just update frontmatter in place
  // ... update and write
}
```

### Result Format

```typescript
interface BulkRecategorizeResult {
  /** One entry per matched page, with proposed or applied changes. */
  changes: RecategorizeItem[];
  /** String-form error messages from pages that failed. */
  errors: string[];
  /** Total number of pages that matched the filter. */
  totalAffected: number;
}

interface RecategorizeItem {
  path: string;
  proposed: {
    type?: string;
    subtype?: string;
    tags?: string[];
    status?: string;
    /** Non-null only when the page would move folders. */
    newFolder?: string;
  };
  error?: string;
}
```

**Example response:**
```json
{
  "changes": [
    {
      "path": "entities/misc/oddball.md",
      "proposed": {
        "subtype": "character",
        "tags": ["npc", "important"],
        "newFolder": "entities/characters"
      }
    },
    {
      "path": "entities/characters/gandalf.md",
      "proposed": {
        "tags": ["wizard", "istari", "important"]
      }
    }
  ],
  "errors": [],
  "totalAffected": 2
}
```

The `newFolder` field is only present when the page would be moved to a different
folder (because the type or subtype change maps to a different folder in the
registry).

### Admin UI Workflow (Bulk Re-categorize Tab)

```
┌───────────────────────────────────────────────────┐
│  Filter Pages                                      │
│  ┌──────────────┐  ┌──────────────┐               │
│  │ Type: [Any ▼]│  │Subtype:[Any ▼]│               │
│  ├──────────────┤  ├──────────────┤               │
│  │ Tags: [npc]  │  │Status:[Any ▼]│               │
│  └──────────────┘  └──────────────┘               │
├───────────────────────────────────────────────────┤
│  Changes to Apply                                  │
│  ┌──────────────┐  ┌──────────────┐               │
│  │NewType:[Any ▼]│  │ NSubtype:[character ▼]      │
│  ├──────────────┤  ├──────────────┤               │
│  │ NewTags:[ ]  │  │ NStatus:[Any ▼]              │
│  ├──────────────┤  ├──────────────┤               │
│  │Add Tags: [important]  │ Remove Tags: []         │
│  └──────────────┘  └──────────────┘               │
│                                                   │
│  [Preview]  (Filter empty → will affect all pages) │
├───────────────────────────────────────────────────┤
│  Preview — 5 pages affected                        │
│                                                   │
│  entities/misc/oddball.md                          │
│    subtype: character  tags: npc, important        │
│    folder: entities/characters                     │
│                                                   │
│  [Apply Changes (5)]                               │
└───────────────────────────────────────────────────┘
```

Steps:
1. Set **filter criteria** to select which pages to affect (or leave empty for all)
2. Set **changes** to apply to matching pages
3. Click **Preview** to see proposed changes (note: empty filter warns you)
4. Review the changes list (shows each page, proposed field changes, and folder moves)
5. Click **Apply Changes** and confirm

---

## Both Operations Available Via

### Admin UI: `/admin/restructure`

The admin restructure page provides a tabbed interface for both operations:

| Tab | Component | Access |
|-----|-----------|--------|
| **Bulk Move** | `bulk-move-tab.tsx` | Navigate to `/admin/restructure`, click "Bulk Move" tab |
| **Bulk Re-categorize** | `bulk-recategorize-tab.tsx` | Navigate to `/admin/restructure`, click "Bulk Re-categorize" tab |

Both tabs follow the same pattern:
1. Configure the operation
2. Preview (dry-run)
3. Confirm and apply

### API Endpoints

**Bulk Move:**
```
POST /api/wiki/bulk-move
Content-Type: application/json

{
  "moves": [
    { "oldPath": "entities/characters/gandalf.md", "newPath": "characters/gandalf.md" }
  ],
  "dryRun": true
}
```

**Bulk Re-categorize:**
```
POST /api/wiki/bulk-recategorize
Content-Type: application/json

{
  "filter": { "type": "entity", "status": "draft" },
  "changes": { "newSubtype": "character", "addTags": ["npc"] },
  "dryRun": true
}
```

### Library Functions (for Scripts)

Both operations are available as importable library functions for use in scripts
or automated workflows:

```typescript
import { bulkMovePages } from "@/lib/wiki/bulk-move";
import { bulkRecategorize } from "@/lib/wiki/bulk-recategorize";
import { getWikiRoot } from "@/lib/wiki/wiki-root";

const wikiRoot = getWikiRoot("user-id");

// Bulk move
const moveResult = bulkMovePages(
  [{ oldPath: "entities/characters/gandalf.md", newPath: "characters/gandalf.md" }],
  wikiRoot,
  { dryRun: true },
);

// Bulk recategorize
const recatResult = bulkRecategorize(
  { type: "entity", tag: "npc" },
  { newSubtype: "character", addTags: ["important"] },
  wikiRoot,
  { dryRun: false },
);
```

---

## Use Cases and Examples

### Use Case 1: Reorganizing After Adding a Custom Type

You added a `"vehicle"` type with subtypes `"car"` and `"spaceship"`. Now you need
to move existing vehicle-related pages from `entities/items/` to `vehicles/`.

**Bulk Move approach:**
```json
POST /api/wiki/bulk-move
{
  "moves": [
    { "oldPath": "entities/items/falcon.md", "newPath": "vehicles/spaceships/falcon.md" },
    { "oldPath": "entities/items/truck.md", "newPath": "vehicles/cars/truck.md" }
  ],
  "dryRun": true
}
```

### Use Case 2: Recategorizing All "NPC" Characters

You've been tagging NPC pages with "npc" and want to give them the correct subtype
and mark them as reviewed.

**Bulk Re-categorize approach:**
```json
POST /api/wiki/bulk-recategorize
{
  "filter": { "tag": "npc", "type": "entity" },
  "changes": { "newSubtype": "character", "newStatus": "reviewed", "addTags": ["npc"] },
  "dryRun": true
}
```

### Use Case 3: Emptying the Misc Folder

The `entities/misc/` folder has accumulated pages without proper subtypes. You want
to categorize them all as "character" (they're all character stubs).

**Bulk Re-categorize approach:**
```json
POST /api/wiki/bulk-recategorize
{
  "filter": { "folder": "entities/misc" },
  "changes": { "newSubtype": "character" },
  "dryRun": true
}
```

This will:
1. Find all pages in `entities/misc/`
2. Set their `subtype` to `"character"`
3. Move them to `entities/characters/` (because subtype→folder resolves there)
4. Rewrite any path-based wikilinks

### Use Case 4: Cleaning Up After a Bulk Import

After importing 50 pages from an external source, they all have `status: "draft"`
and no subtypes. You want to:
1. Set all imported entity pages to subtype `"character"` (they're all characters)
2. Set status to `"reviewed"`
3. Add an "imported" tag

**Bulk Re-categorize approach:**
```json
POST /api/wiki/bulk-recategorize
{
  "filter": { "type": "entity", "status": "draft", "tag": "imported" },
  "changes": { "newSubtype": "character", "newStatus": "reviewed", "addTags": ["imported"] },
  "dryRun": false
}
```

### Use Case 5: Fixing a Mistaken Bulk Operation

You accidentally moved all entity pages to the wrong folder. To undo:

1. Plan the reverse move (swap old and new paths)
2. Run it as a dry-run first to verify
3. Then apply

```typescript
// Reverse a bulk move
const reverseMoves = result.moved.map((oldPath) => ({
  oldPath: oldPath.replace("wrong-folder", "right-folder"),
  newPath: oldPath,
}));

bulkMovePages(reverseMoves, wikiRoot, { dryRun: true });
```

For complex undo scenarios, a full backup restore is safer.

---

## API Reference

### POST /api/wiki/bulk-move

Move multiple wiki pages in a single batch.

**Request body:**
```json
{
  "moves": [
    { "oldPath": "entities/characters/gandalf.md", "newPath": "characters/gandalf.md" }
  ],
  "dryRun": true
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `moves` | `BulkMoveItem[]` | Yes | — | Array of move operations |
| `moves[].oldPath` | string | Yes | — | Source path relative to wiki root |
| `moves[].newPath` | string | Yes | — | Destination path relative to wiki root |
| `moves[].newSubtype` | string | No | Derived | Explicit subtype to set |
| `dryRun` | boolean | No | `true` | Preview mode (no files changed) |

**Response (200):**
```json
{
  "moved": ["entities/characters/gandalf.md"],
  "failed": [],
  "linksUpdated": 5
}
```

**Errors:**
- `400` — Missing or malformed `moves` array, path traversal detected, paths don't end in `.md`
- `401` — Authentication failed
- `415` — Content-Type is not application/json

### POST /api/wiki/bulk-recategorize

Find pages matching a filter and apply frontmatter changes.

**Request body:**
```json
{
  "filter": { "type": "entity", "status": "draft" },
  "changes": { "newSubtype": "character", "addTags": ["npc"] },
  "dryRun": true
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `filter` | `RecategorizeFilter` | No | `{}` (match all) | Criteria to select pages |
| `filter.type` | string | No | — | Exact type match |
| `filter.subtype` | string | No | — | Exact subtype match |
| `filter.tag` | string | No | — | Tag must be present |
| `filter.status` | string | No | — | Exact status match |
| `filter.folder` | string | No | — | Folder prefix match |
| `changes` | `RecategorizeChanges` | **Yes** | — | Modifications to apply |
| `changes.newSubtype` | string | No | — | Replace subtype |
| `changes.newType` | string | No | — | Replace type |
| `changes.newTags` | string[] | No | — | Replace all tags |
| `changes.newStatus` | string | No | — | Replace status |
| `changes.addTags` | string[] | No | — | Add these tags |
| `changes.removeTags` | string[] | No | — | Remove these tags |
| `dryRun` | boolean | No | `true` | Preview mode (no files changed) |

**Response (200):**
```json
{
  "changes": [
    {
      "path": "entities/misc/oddball.md",
      "proposed": { "subtype": "character", "tags": ["npc"], "newFolder": "entities/characters" }
    }
  ],
  "errors": [],
  "totalAffected": 1
}
```

**Errors:**
- `400` — Missing or empty `changes` object, no valid change fields
- `401` — Authentication failed
- `415` — Content-Type is not application/json

---

## Performance Considerations

### Bulk Move Performance

| Wiki Size | Pages to Move | Expected Time |
|-----------|---------------|---------------|
| 100 pages | 10 moves | < 1 second |
| 500 pages | 50 moves | 2–5 seconds |
| 1000 pages | 100 moves | 5–15 seconds |

**Scaling factors:**
- Phase 1 (file moves): O(n) where n = number of moves
- Phase 2 (link rewrite): O(n + m) where m = total wiki pages
- The batch link rewrite is the dominant cost for large wikis

**Memory:**
- All moved page info is kept in memory during Phase 2
- For 1000 moves, this is negligible (< 1 MB)
- The wikilink rewrite regex is applied per-file, per-move

### Bulk Re-categorize Performance

| Wiki Size | Matched Pages | Expected Time |
|-----------|---------------|---------------|
| 100 pages | 20 matched | < 1 second |
| 500 pages | 100 matched | 1–3 seconds |
| 1000 pages | 500 matched | 5–20 seconds |

**Scaling factors:**
- Page listing: O(m) where m = total wiki pages
- Filter evaluation: O(n) where n = matched pages
- Folder computation: O(n) — calls `folderForPage()` per matched page
- Moves (subtype/type change): uses `moveWikiPage()` which is O(m) per move + link rewrite

**When subtype/type changes, performance depends on how many pages need to be moved:**
- If only tags/status change (no folder move): ~O(m) total
- If all matched pages change folder: ~O(n × m) where n = matched pages

### Tips for Large Operations

1. **Always dry-run first** — verify the scope and impact before committing
2. **Run in batches** — for 500+ page operations, break into batches of 50–100
3. **Back up first** — always have a rollback plan:
   ```bash
   cp -r data/{userId}/wiki data/{userId}/wiki-backup-$(date +%Y%m%d-%H%M%S)
   ```
4. **Avoid concurrent operations** — don't run bulk operations while other users
   are editing the wiki (conflict detection may trigger)
5. **Check file locks** — the bulk move/recategorize functions respect file locks
   set by concurrent edit protection

---

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/wiki/bulk-move.ts` | `bulkMovePages()` — 2-phase batch move (file ops → link rewrite) |
| `src/lib/wiki/bulk-recategorize.ts` | `bulkRecategorize()` — filter-based frontmatter changes |
| `src/lib/wiki/move-page.ts` | `moveWikiPage()` — single page move (used internally by bulk-recategorize) |
| `src/lib/wiki/file-io.ts` | `listWikiPages()` with dormant filter, page CRUD |
| `src/lib/wiki/wikilinks.ts` | `rewriteLinksForPageMove()` — wikilink path rewrites |
| `src/lib/wiki/subtype-folders.ts` | `folderForPage()` — resolves subtype/type to folder path |
| `src/lib/wiki/type-registry.ts` | `getTypeRegistry()` — cached registry accessor |
| `src/lib/wiki/path-guard.ts` | `isPathWithinRoot()` — path traversal prevention |
| `src/app/api/wiki/bulk-move/route.ts` | Bulk move API endpoint (dry-run by default) |
| `src/app/api/wiki/bulk-recategorize/route.ts` | Bulk recategorize API endpoint (dry-run by default) |
| `src/app/(app)/admin/restructure/tabs/bulk-move-tab.tsx` | Bulk move tab UI |
| `src/app/(app)/admin/restructure/tabs/bulk-recategorize-tab.tsx` | Bulk recategorize tab UI |
| `src/app/(app)/admin/restructure/page.tsx` | Admin restructure page (tab container) |

## Related Documentation

- [Wiki Evolution Tooling](wiki-evolution-tooling.md) — Overview of all Plan 010 tools
- [Wiki Merge Workflow](wiki-merge-workflow.md) — Merge process and duplicate detection
- [Wiki Dormancy](wiki-dormancy.md) — Dormant page lifecycle and behavior
- [Wiki Folder Structure](wiki-folder-structure.md) — Folder hierarchy and path resolution
- [Wiki Migration Guide (Subtype Folders)](wiki-migration-guide.md) — Migrating to 2-level folders
