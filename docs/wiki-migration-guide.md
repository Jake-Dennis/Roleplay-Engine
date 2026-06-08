# Wiki Migration Guide: Subtype Folder Structure

> **Plan 009** — Migrating from flat folders to the 2-level subtype folder hierarchy.
>
> If you are migrating from the legacy lore database (pre-wiki), see
> [wiki-migration.md](wiki-migration.md) instead.

---

## Table of Contents

1. [Overview](#overview)
2. [Before vs. After](#before-vs-after)
3. [Prerequisites](#prerequisites)
4. [Step 1: Enable the Type Registry (v2)](#step-1-enable-the-type-registry-v2)
5. [Step 2: Create Subtype Directories](#step-2-create-subtype-directories)
6. [Step 3: Move Pages to Subtype Folders](#step-3-move-pages-to-subtype-folders)
7. [Step 4: Update Frontmatter](#step-4-update-frontmatter)
8. [Step 5: Verify the Migration](#step-5-verify-the-migration)
9. [Dry-Run Mode](#dry-run-mode)
10. [Rollback](#rollback)
11. [Troubleshooting](#troubleshooting)
12. [Batch Operations Reference](#batch-operations-reference)

---

## Overview

This guide explains how to migrate an existing wiki from flat per-type folders to the
2-level subtype folder structure introduced in Plan 009.

**Why migrate?** The flat structure (`entities/gandalf.md`, `entities/shire.md`) becomes
hard to navigate as the wiki grows beyond ~100 pages. The 2-level structure groups
related pages together (all characters in `entities/characters/`, all locations in
`entities/locations/`), making navigation, search, and LLM retrieval more targeted.

The migration is **non-destructive** — existing pages in flat folders continue to work
indefinitely. You can migrate at your own pace, one subtype at a time.

---

## Before vs. After

### Flat Structure (Before)

```
wiki/
├── entities/
│   ├── gandalf.md          ← type: entity, no subtype
│   ├── shire.md            ← type: entity, no subtype
│   ├── anduril.md          ← type: entity, no subtype
│   ├── fellowship.md       ← type: entity, no subtype
│   ├── hobbit.md           ← type: entity, no subtype
│   └── elrond.md           ← type: entity, no subtype
├── concepts/
│   ├── war-of-the-ring.md  ← type: concept, no subtype
│   └── magic-system.md     ← type: concept, no subtype
├── sources/
├── synthesis/
└── _review/
```

### Subtype Structure (After)

```
wiki/
├── entities/
│   ├── characters/
│   │   ├── gandalf.md      ← type: entity, subtype: character
│   │   └── elrond.md       ← type: entity, subtype: character
│   ├── locations/
│   │   └── shire.md        ← type: entity, subtype: location
│   ├── items/
│   │   └── anduril.md      ← type: entity, subtype: item
│   ├── factions/
│   │   └── fellowship.md   ← type: entity, subtype: faction
│   ├── species/
│   │   └── hobbit.md       ← type: entity, subtype: species
│   └── misc/               ← entity pages without a recognized subtype
├── concepts/
│   ├── events/
│   │   └── war-of-the-ring.md
│   ├── magic/
│   │   └── magic-system.md
│   └── misc/
├── sources/
├── synthesis/
└── _review/
```

Pages that don't fit a subtype remain in the flat folder or go into `misc/`.

---

## Prerequisites

Before starting the migration:

1. **Back up your wiki data:**
   ```bash
   cp -r data/{userId}/wiki data/{userId}/wiki-backup-$(date +%Y%m%d)
   ```

2. **Ensure you are on the latest code** that includes Plan 008 and 009 changes:
   - `src/lib/wiki/subtype-folders.ts` must exist
   - `src/lib/wiki/config-migration.ts` must exist (v1→v2 migration)
   - `src/lib/wiki/move-page.ts` must exist
   - `src/components/wiki/file-tree.tsx` must support 2-level display

3. **Check that `.wiki-config.json` is at v2** (has `types` and `subtypeFolders`):
   ```bash
   cat data/{userId}/wiki/.wiki-config.json
   ```
   If it only has `folderOrder`, it auto-migrates to v2 on first read. No action needed.

4. **Decide which subtypes to use.** The defaults are:

   | Type | Default Subtypes |
   |------|-----------------|
   | entity | character, location, item, faction, organization, creature |
   | concept | theme, rule, mechanic, lore, event, tradition |
   | source | (none — stays flat) |
   | synthesis | (none — stays flat) |

   You can customize these in `.wiki-config.json` before migrating.

5. **Identify untyped pages.** Pages missing a `type` or `subtype` in frontmatter:
   ```bash
   # Find pages without type frontmatter
   grep -l -r "type:" data/{userId}/wiki/entities/ --include="*.md" | wc -l
   grep -L -r "type:" data/{userId}/wiki/entities/ --include="*.md"
   ```

---

## Step 1: Enable the Type Registry (v2)

The type registry is auto-migrated from v1 on first read, but you should verify it is
set up correctly:

1. **Check that `.wiki-config.json` exists:**
   ```bash
   ls -la data/{userId}/wiki/.wiki-config.json
   ```

2. **If missing, create it** (or restart the server, which will create defaults):
   ```bash
   echo '{"folderOrder":["entities","concepts","sources","synthesis","_review"]}' > data/{userId}/wiki/.wiki-config.json
   ```

3. **Restart the server** to trigger auto-migration:
   ```bash
   npm run dev
   ```
   The server reads the config and persists v2 with default types and subtype folder
   mappings. You can verify the result:
   ```bash
   cat data/{userId}/wiki/.wiki-config.json
   ```

4. **Customize subtypes** (optional) by editing `.wiki-config.json`:

   ```json
   {
     "version": 2,
     "folderOrder": ["entities", "concepts", "sources", "synthesis", "_review"],
     "types": {
       "entity": {
         "icon": "Users",
         "folder": "entities",
         "subtypes": ["character", "location", "item", "faction", "organization", "creature"]
       },
       "concept": {
         "icon": "BookOpen",
         "folder": "concepts",
         "subtypes": ["theme", "rule", "mechanic", "lore", "event", "tradition"]
       },
       "source": { "icon": "FileIcon", "folder": "sources", "subtypes": [] },
       "synthesis": { "icon": "GitBranch", "folder": "synthesis", "subtypes": [] }
     },
     "subtypeFolders": {
       "character": "entities/characters",
       "location": "entities/locations",
       "item": "entities/items",
       "faction": "entities/factions",
       "organization": "entities/organizations",
       "creature": "entities/creatures",
       "theme": "concepts/themes",
       "rule": "concepts/rules",
       "mechanic": "concepts/mechanics",
       "lore": "concepts/lore",
       "event": "concepts/events",
       "tradition": "concepts/traditions"
     }
   }
   ```

---

## Step 2: Create Subtype Directories

Subtype directories are **auto-created** on the first write to that folder. You don't
need to create them manually. However, if you want to pre-create them, you can use the
API or the config helper:

### Via the API (favored)

Make a PUT request to the type registry endpoint with your desired configuration. This
is the cleanest approach as it validates the config.

```bash
curl -X PUT /api/wiki/types-registry \
  -H "Content-Type: application/json" \
  -d '{ ... v2 config ... }'
```

### Via the Config Migration Helper

Call the `addTypeToConfig()` or `addSubtypeToConfig()` functions programmatically:

```typescript
import { addSubtypeToConfig } from "@/lib/wiki/config-migration";

addSubtypeToConfig(wikiRoot, "entity", "companion", "entities/companions");
```

This updates `.wiki-config.json` and the subtype directory is created on first page
write.

### Via Direct API Call

If the v2 config already has the subtypes listed, subtype directories are created lazily
when the first page is written to them. To force creation, write a stub page (which the
UI's quick-create modal does automatically).

---

## Step 3: Move Pages to Subtype Folders

### Individual Page Moves (via Drag-and-Drop)

The **recommended approach** for small wikis (under 100 pages). Use the file tree UI:

1. Navigate to the wiki in the browser
2. Drag a page from the flat folder to the desired subtype subfolder
3. The server automatically:
   - Moves the file on disk
   - Updates `type` and `subtype` frontmatter
   - Rewrites path-based wikilinks in all other pages
   - Creates the target directory if it doesn't exist

### Individual Page Moves (via API)

For programmatic moves:

```bash
curl -X POST /api/wiki/reorder \
  -H "Content-Type: application/json" \
  -d '{
    "moves": [{
      "oldPath": "entities/gandalf.md",
      "newPath": "entities/characters/gandalf.md"
    }]
  }'
```

### Batch Moves (for Large Wikis)

For wikis with many pages, use the `moveWikiPage()` function in a script:

```typescript
// scripts/migrate-to-subtype-folders.ts
import fs from "fs";
import path from "path";
import { getWikiRoot } from "@/lib/wiki/wiki-root";
import { getTypeRegistry, clearTypeRegistryCache } from "@/lib/wiki/type-registry";
import { moveWikiPage } from "@/lib/wiki/move-page";
import { listWikiPages } from "@/lib/wiki/file-io";
import { folderForPage } from "@/lib/wiki/subtype-folders";

interface MigrationRule {
  /** Current relative path prefix. */
  fromFolder: string;
  /** New subtype to assign. Pages with this subtype will be moved to the subtype's folder. */
  subtype: string;
}

async function migrateToSubtypeFolders(
  userId: string,
  rules: MigrationRule[],
  dryRun = true,
): Promise<void> {
  const wikiRoot = getWikiRoot(userId);
  const registry = getTypeRegistry(wikiRoot);
  const pages = listWikiPages(wikiRoot);
  const moved: Array<{ from: string; to: string }> = [];

  for (const page of pages) {
    const relPath = path.relative(wikiRoot, page.path).replace(/\\/g, "/");
    const pageFolder = path.dirname(relPath);

    for (const rule of rules) {
      if (pageFolder === rule.fromFolder) {
        // Assign subtype temporarily to compute target folder
        const fm = { ...page.frontmatter, subtype: rule.subtype } as Record<string, unknown>;
        const targetFolder = folderForPage(fm, registry);
        const filename = path.basename(relPath);
        const newRelPath = `${targetFolder}/${filename}`;

        if (relPath !== newRelPath) {
          moved.push({ from: relPath, to: newRelPath });

          if (!dryRun) {
            // Clear registry cache to get fresh state for each move
            clearTypeRegistryCache(wikiRoot);
            const freshRegistry = getTypeRegistry(wikiRoot);
            moveWikiPage(relPath, newRelPath, wikiRoot, freshRegistry);
          }
        }
        break;
      }
    }
  }

  console.log(`Migration ${dryRun ? "preview" : "complete"}:`);
  console.log(`  ${moved.length} pages would be moved`);
  for (const m of moved) {
    console.log(`  ${m.from}  →  ${m.to}`);
  }
}

// Example usage:
migrateToSubtypeFolders("user-id", [
  { fromFolder: "entities", subtype: "character" },
], true /* dry-run */);
```

Run with:
```bash
npx tsx scripts/migrate-to-subtype-folders.ts
```

### Mapping Rules

A mapping rule consists of:
- **`fromFolder`** — The current flat folder (e.g., `"entities"`)
- **`subtype`** — The subtype to assign to all pages in that folder

The script iterates all pages, checks if they match a rule, and moves them. Multiple
rules can be applied in a single pass:

```typescript
const rules = [
  { fromFolder: "entities",  subtype: "character" },  // Move all flat entity pages to characters
  { fromFolder: "npcs",      subtype: "character" },  // Also migrate old "npcs" folder
  { fromFolder: "concepts",  subtype: "lore" },        // Move flat concept pages to lore
];
```

---

## Step 4: Update Frontmatter

When a page is moved via `moveWikiPage()`, the frontmatter is automatically updated:

- **`type`** field is set to the singular form of the top-level folder (e.g.,
  `"entities"` → `"entity"`, `"concepts"` → `"concept"`)
- **`subtype`** field is set via the `subtypeFromFolder()` reverse lookup (e.g.,
  `"entities/characters"` → `"character"`)

The singularization uses a lookup table:

| Plural Folder | Singular Type |
|---------------|---------------|
| `entities` | `entity` |
| `concepts` | `concept` |
| `sources` | `source` |
| `synthesis` | `synthesis` |
| `characters` | `character` |
| `locations` | `location` |
| `items` | `item` |
| `events` | `event` |
| `timelines` | `timeline` |
| `factions` | `faction` |
| `species` | `species` |

If a subtype folder name doesn't match an entry in the lookup table, the system strips
the trailing `s` as a fallback.

---

## Step 5: Verify the Migration

### Check the File Tree

1. Open the wiki in the browser
2. Verify that pages appear in their correct subtype subfolders
3. Verify that the page count per folder is correct (shown in parentheses)
4. Check that orphan badges no longer appear for moved pages (if they had inbound links)

### Check the Filesystem

```bash
# Count pages in each subtype folder
ls data/{userId}/wiki/entities/characters/*.md | wc -l
ls data/{userId}/wiki/entities/locations/*.md | wc -l
ls data/{userId}/wiki/entities/items/*.md | wc -l

# Check that old files are gone
ls data/{userId}/wiki/entities/gandalf.md
# Expected: ls: cannot access ...: No such file or directory
```

### Check Frontmatter

```bash
# Verify subtype field is set
head -10 data/{userId}/wiki/entities/characters/gandalf.md
```

Expected output:
```yaml
---
title: "Gandalf"
type: entity
subtype: character
status: draft
---
```

### Check Wikilinks

```bash
# Search for broken path-based links (old paths lingering in other pages)
grep -r "\[\[entities/gandalf\]\]" data/{userId}/wiki/ --include="*.md"
# Should return no results if wikilinks were rewritten
```

### Run the Lint Check

```typescript
import { lintWiki } from "@/lib/wiki/lint";
import { getWikiRoot } from "@/lib/wiki/wiki-root";

const report = await lintWiki(getWikiRoot("user-id"));
console.log("Missing pages:", report.missingPages);
console.log("Orphans:", report.orphans);
```

---

## Dry-Run Mode

Before running the batch migration live, always do a dry run:

```bash
npx tsx scripts/migrate-to-subtype-folders.ts --dry-run
```

Dry-run output shows:
```
Migration preview:
  5 pages would be moved:
    entities/gandalf.md  →  entities/characters/gandalf.md
    entities/shire.md    →  entities/locations/shire.md
    entities/anduril.md  →  entities/items/anduril.md
    entities/fellowship.md  →  entities/factions/fellowship.md
    entities/hobbit.md   →  entities/species/hobbit.md
```

Review the output carefully. Check that:
- Each page is going to the correct subtype folder
- No page is being moved to the wrong subtype
- The source files exist (no missing FROM paths)

---

## Rollback

If the migration needs to be reversed:

### While Server is Running

For individual pages, use drag-and-drop to move them back to the flat folder in the
file tree UI. The `moveWikiPage()` function is bidirectional — it works the same
way in reverse.

### Batch Rollback

Restore from backup:

```bash
# Stop the server
# Restore the wiki data
rm -rf data/{userId}/wiki
cp -r data/{userId}/wiki-backup-YYYYMMDD data/{userId}/wiki
# Restart the server
```

### Partial Rollback

If only some pages need reverting, you can manually move them:

```bash
mv data/{userId}/wiki/entities/characters/gandalf.md data/{userId}/wiki/entities/gandalf.md
```

Then update the frontmatter to remove the `subtype` field:

```yaml
---
title: "Gandalf"
type: entity
# removed: subtype: character
---
```

The file tree will display it as a "direct page" in the entities folder.

---

## Troubleshooting

### Pages Not Appearing in the File Tree

- **Cause:** The file tree uses the API response from `GET /api/wiki` and `GET /api/wiki/reorder`. If a page was moved but the cache wasn't invalidated, it may not appear.
- **Fix:** Refresh the page. If that doesn't work, clear the server-side type registry cache by restarting the server.

### "Source page not found" Error

- **Cause:** The old file doesn't exist at the expected path (maybe already moved).
- **Fix:** Check the actual path. The `moveWikiPage()` function is idempotent for same-source-same-target moves but throws if the source is missing.

### "Destination already exists" Error

- **Cause:** A page with the same filename already exists in the target subfolder.
- **Fix:** Rename one of the pages before moving. Use a unique slug for the filename.

### Type Not Updated After Move

- **Cause:** The `moveWikiPage()` function only updates `type` when the folder changes. If the old and new folders are different levels but within the same type, only `subtype` is updated.
- **Fix:** Manually update the type in the frontmatter if needed.

### Wikilinks Not Rewritten

- **Cause:** Only **path-based** wikilinks (e.g., `[[entities/gandalf]]`) are rewritten.
  Bare-name links (`[[Gandalf]]`) and namespace links (`[[Universe::Gandalf]]`) are left
  unchanged because they resolve via the 3-pass title resolver.
- **Impact:** This is intentional. Bare-name links still work after the move because the
  3-pass resolver matches by title. No action needed.

### "Path escapes wiki root" Error

- **Cause:** The source or destination path attempts path traversal (contains `..` or
  doesn't resolve under the wiki root).
- **Fix:** Ensure both paths are relative to the wiki root and don't contain parent
  directory references.

### Config Not Migrating to v2

- **Cause:** If `.wiki-config.json` exists but is malformed, the migration helper falls
  back to defaults.
- **Fix:** Check the config file for JSON validity:
  ```bash
  node -e "JSON.parse(require('fs').readFileSync('data/{userId}/wiki/.wiki-config.json','utf-8'))"
  ```

### Wrong Subtype Assigned

- **Cause:** The `subtypeFromFolder()` function matches by folder path. If two subtypes
  map to the same folder, the first match wins (iteration order of `subtypeFolders`).
- **Fix:** Update the frontmatter manually or use the admin UI at `/admin/types` to
  review subtype-to-folder mappings.

---

## Batch Operations Reference

### Move All Pages in a Folder to a Subtype

```typescript
import { moveWikiPage } from "@/lib/wiki/move-page";
import { listWikiPages } from "@/lib/wiki/file-io";
import { getTypeRegistry } from "@/lib/wiki/type-registry";
import { folderForPage } from "@/lib/wiki/subtype-folders";
import path from "path";

function moveAllToSubtype(
  wikiRoot: string,
  fromFolder: string,
  targetSubtype: string,
  dryRun = true,
): void {
  const registry = getTypeRegistry(wikiRoot);
  const pages = listWikiPages(wikiRoot);

  for (const page of pages) {
    const relPath = path.relative(wikiRoot, page.path).replace(/\\/g, "/");
    if (!relPath.startsWith(fromFolder + "/")) continue;

    const fm = { ...page.frontmatter, subtype: targetSubtype } as Record<string, unknown>;
    const newFolder = folderForPage(fm, registry);
    const filename = path.basename(relPath);
    const newRelPath = `${newFolder}/${filename}`;

    if (relPath !== newRelPath) {
      console.log(`${dryRun ? "[DRY]" : ""} ${relPath} → ${newRelPath}`);
      if (!dryRun) {
        moveWikiPage(relPath, newRelPath, wikiRoot, getTypeRegistry(wikiRoot));
      }
    }
  }
}
```

### Restore All Pages to Flat Structure

```typescript
import { moveWikiPage } from "@/lib/wiki/move-page";
import { listWikiPages } from "@/lib/wiki/file-io";
import { folderForPage } from "@/lib/wiki/subtype-folders";
import { getTypeRegistry } from "@/lib/wiki/type-registry";
import path from "path";

function flattenAllSubtypes(wikiRoot: string, dryRun = true): void {
  const pages = listWikiPages(wikiRoot);

  for (const page of pages) {
    const relPath = path.relative(wikiRoot, page.path).replace(/\\/g, "/");
    const parts = relPath.split("/");

    // Only process pages in 2-level folders (entities/characters/gandalf.md)
    if (parts.length < 3) continue;

    const topFolder = parts[0];
    const filename = parts[parts.length - 1];
    const flatPath = `${topFolder}/${filename}`;

    if (relPath !== flatPath) {
      // Remove subtype from frontmatter
      const cleanedFm = { ...page.frontmatter };
      delete (cleanedFm as Record<string, unknown>).subtype;
      const registry = getTypeRegistry(wikiRoot);
      const targetFolder = folderForPage(cleanedFm as Record<string, unknown>, registry);

      console.log(`${dryRun ? "[DRY]" : ""} ${relPath} → ${flatPath}`);
      if (!dryRun) {
        moveWikiPage(relPath, flatPath, wikiRoot, registry);
      }
    }
  }
}
```

### Bulk Add Subtype to Untyped Pages

```typescript
import { readWikiPage, writeWikiPage } from "@/lib/wiki/file-io";
import { listWikiPages } from "@/lib/wiki/file-io";
import { folderForPage } from "@/lib/wiki/subtype-folders";
import { getTypeRegistry } from "@/lib/wiki/type-registry";
import path from "path";

function bulkAssignSubtype(
  wikiRoot: string,
  pageFilter: (page: { path: string; frontmatter: Record<string, unknown> }) => boolean,
  subtype: string,
  dryRun = true,
): number {
  const pages = listWikiPages(wikiRoot);
  let count = 0;

  for (const page of pages) {
    if (!pageFilter(page)) continue;

    const fm = page.frontmatter as Record<string, unknown>;
    if (fm.subtype) continue; // Skip pages that already have a subtype

    fm.subtype = subtype;

    const newFolder = folderForPage(fm, getTypeRegistry(wikiRoot));
    const filename = path.basename(page.path);
    const newRelPath = `${newFolder}/${filename}`;
    const relPath = path.relative(wikiRoot, page.path).replace(/\\/g, "/");

    console.log(`${dryRun ? "[DRY]" : ""} ${relPath} → ${newRelPath}  (subtype: ${subtype})`);
    count++;

    if (!dryRun) {
      moveWikiPage(relPath, newRelPath, wikiRoot, getTypeRegistry(wikiRoot));
    }
  }

  return count;
}

// Example: assign "character" subtype to all entity pages containing "NPC" in tags
bulkAssignSubtype(wikiRoot, (page) => {
  const tags: string[] = (page.frontmatter.tags ?? []) as string[];
  return tags.includes("NPC");
}, "character", true);
```

---

## Related Documentation

- [Wiki Folder Structure](wiki-folder-structure.md) — Complete reference for the 2-level hierarchy
- [Wiki Type Registry](wiki-type-registry.md) — Configuring types, subtypes, and icons
- [Wiki Schema Reference](wiki-schema-reference.md) — Frontmatter fields and conventions
