# Wiki Folder Structure (v2)

> Part of the Wiki Evolution initiative (Plans 008–010).
>
> **Plan 009** — Introduces 2-level subtype subfolders for organizing wiki pages below
> the existing top-level type folders. Implemented in the Type Registry v2 (Plan 008).

---

## Overview

Wiki content is organized in a **2-level folder hierarchy**: **type folders** at the top
level, and **subtype subfolders** at the second level.

| Level | Example | Purpose |
|-------|---------|---------|
| Top-level | `entities/`, `concepts/` | Broad category (maps to `type` frontmatter) |
| Subtype | `entities/characters/`, `concepts/events/` | Fine-grained classification (maps to `subtype` frontmatter) |

This structure scales better for large wikis (1000+ pages) by keeping related pages
grouped together, making navigation, search, and LLM retrieval more targeted.

**Before** (flat per-type):
```
wiki/entities/gandalf.md
wiki/entities/shire.md
wiki/entities/anduril.md
wiki/entities/fellowship.md
wiki/entities/hobbit.md
```

**After** (2-level hierarchy):
```
wiki/entities/characters/gandalf.md
wiki/entities/locations/shire.md
wiki/entities/items/anduril.md
wiki/entities/factions/fellowship.md
wiki/entities/species/hobbit.md
```

---

## Default Layout

The default layout is defined by the **Type Registry** (`.wiki-config.json` v2). The
following structure is auto-created when a new wiki is initialized:

```
wiki/
├── entities/                          # type: entity
│   ├── characters/                    # subtype: character
│   │   ├── gandalf.md
│   │   └── aragorn.md
│   ├── locations/                     # subtype: location
│   │   └── shire.md
│   ├── items/                         # subtype: item
│   ├── factions/                      # subtype: faction
│   ├── organizations/                 # subtype: organization
│   ├── creatures/                     # subtype: creature
│   └── misc/                          # entity pages without a recognized subtype
├── concepts/                          # type: concept
│   ├── themes/                        # subtype: theme
│   ├── rules/                         # subtype: rule
│   ├── mechanics/                     # subtype: mechanic
│   ├── lore/                          # subtype: lore
│   ├── events/                        # subtype: event
│   ├── traditions/                    # subtype: tradition
│   └── misc/                          # concept pages without a recognized subtype
├── sources/                           # type: source (flat — no subtypes)
│   ├── campaign-setting.md
│   └── players-handbook.md
├── synthesis/                         # type: synthesis (flat — no subtypes)
│   ├── query-2026-06-01-factions.md
│   └── query-2026-06-02-timeline.md
├── _review/                           # System folder (not displayed in normal navigation)
│   └── conflicts/                     # Concurrent edit diffs
├── .wiki-config.json                  # Type Registry v2 configuration
└── index.md                           # Auto-generated page index
```

> **Note:** `sources/` and `synthesis/` remain flat because they typically have fewer
> pages and don't benefit from subtype grouping. Custom types with subtypes will get
> their own top-level folder with subfolders.

---

## How It Works

### Folder Resolution

Pages are placed into folders based on their **frontmatter fields**. The resolution
pipeline in `subtype-folders.ts` follows a priority chain:

```
folderForPage(frontmatter, registry)
  │
  ├── Has subtype?               ──► folderForSubtype(subtype, registry)
  │                                   │
  │                                   ├── Known in subtypeFolders map?  ──► entities/characters
  │                                   ├── Known in types[].subtypes?    ──► entities/{subtype}s (derived)
  │                                   └── Unknown subtype               ──► fallbackFolder (entities)
  │
  ├── No subtype, has type?      ──► folderForType(type, registry)
  │                                   │
  │                                   ├── Known type?                   ──► entities (from types[type].folder)
  │                                   └── Unknown type                  ──► fallbackFolder (entities)
  │
  └── No subtype, no type?       ──► fallbackFolder (entities)
```

#### `folderForSubtype(subtype, registry)`

Looks up the folder path for a subtype. Checks `registry.subtypeFolders` first (the
explicit map in `.wiki-config.json`), then falls back to deriving the folder from the
type definition's folder + pluralized subtype name, and finally falls back to the
entity folder.

```typescript
// Default subtypeFolders map
subtypeFolders: {
  character:   "entities/characters",
  location:    "entities/locations",
  item:        "entities/items",
  faction:     "entities/factions",
  organization:"entities/organizations",
  creature:    "entities/creatures",
  theme:       "concepts/themes",
  rule:        "concepts/rules",
  mechanic:    "concepts/mechanics",
  lore:        "concepts/lore",
  event:       "concepts/events",
  tradition:   "concepts/traditions",
}
```

#### `folderForType(type, registry)`

Returns the base folder for a type (e.g., `"entity"` → `"entities"`). Falls back to
`"entities"` for unknown types.

#### `subtypeFromFolder(folderPath, registry)`

Reverse lookup: given a folder path like `"entities/characters"`, returns the subtype
name `"character"`. Returns `null` if the folder is not a known subtype folder. Used by
`moveWikiPage()` when a page is drag-and-dropped into a different folder — the subtype
is automatically updated in the frontmatter.

### File Operations

#### `listWikiPages(wikiRoot)` — Recursive Scan

The `listWikiPages()` function in `file-io.ts` recursively scans all folders under the
wiki root, collecting `.md` files from both flat folders and 2-level subtype subfolders.

1. Read the resolved folder order from `.wiki-config.json`
2. For each top-level folder, call `collectPagesRecursive(dir, prefix, pages)`
3. `collectPagesRecursive` skips hidden dirs (`.` prefix) and system dirs (`_review`,
   `_archive`, `conflicts`, `node_modules`)
4. Pages are sorted by: folder order → subfolder path → `order` frontmatter → title

```typescript
// Sorting hierarchy
pages.sort((a, b) => {
  // 1. Top-level folder order (from config.folderOrder)
  const aIdx = folderIndex.get(aTop) ?? Infinity;
  const bIdx = folderIndex.get(bTop) ?? Infinity;
  if (aIdx !== bIdx) return aIdx - bIdx;

  // 2. Full relative folder path
  if (aRel !== bRel) return aRel.localeCompare(bRel);

  // 3. Order frontmatter field
  if (aOrder !== bOrder) return aOrder - bOrder;

  // 4. Title
  return a.title.localeCompare(b.title);
});
```

#### `writeWikiPage(filePath, content, frontmatter)` — Auto-Create Directories

When writing a page, the function ensures the target directory exists (creating
subtype directories automatically if needed):

```typescript
const dir = path.dirname(filePath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
```

No migration step is needed — pages written to `entities/characters/gandalf.md` work
immediately. Directories are created on first write.

### UI Display: File Tree Component

The `file-tree.tsx` component renders a **2-level tree**:

```
entities (12)
├── characters (4)          ← Expands on click
│   ├── Gandalf
│   ├── Aragorn
│   ├── Legolas              ← Active page highlighted
│   └── Gimli
├── locations (3)
│   ├── Shire
│   ├── Rivendell
│   └── Mordor
└── (2 directly in entities) ← Direct pages shown at top level
    ├── Campaign Notes
    └── World Map
```

The hierarchy is built by the `buildHierarchy()` function, which splits pages into:
- `directPages` — pages directly in the top folder (no subfolder)
- `subfolders` — grouped by 2-level path (e.g., `entities/characters`)

The `subfolderOf(path)` helper extracts the 2-level path:
```typescript
subfolderOf("entities/characters/gandalf.md")  → "entities/characters"
subfolderOf("entities/campaign-notes.md")       → null  (no subfolder)
```

Subfolder sections are collapsible. The quick-create modal walks through:
1. Select type → 2. Select subtype → 3. Enter title → creates at correct path.

### Drag-and-Drop Reordering

The file tree supports drag-and-drop for:
- **Moving pages between subfolders** — triggers `POST /api/wiki/reorder` with
  `{ moves: [{ oldPath, newPath }] }`. The server calls `moveWikiPage()` which:
  1. Renames the file on disk
  2. Updates `type` and `subtype` frontmatter to match the new folder
  3. Rewrites path-based wikilinks in all other pages
  4. Auto-creates the target directory if it doesn't exist
- **Reordering folders** — updates `folderOrder` in `.wiki-config.json`
- **Reordering pages within a folder** — updates the `order` frontmatter field

### Page Move Internals

`moveWikiPage()` in `move-page.ts` handles the full complexity of moving a page:

```
moveWikiPage("entities/gandalf.md", "entities/characters/gandalf.md", wikiRoot, registry)
  │
  ├── Security: path traversal check (isPathWithinRoot)
  ├── Reads source page (readWikiPage)
  ├── Updates frontmatter:
  │   ├── type: "entity" (from singularized folder name)
  │   └── subtype: "character" (from subtypeFromFolder("entities/characters", registry))
  ├── Writes to new location (auto-creates directory)
  ├── Deletes old file
  └── Rewrites path-based wikilinks in all other pages:
      [[entities/gandalf]]  →  [[entities/characters/gandalf]]
      (bare-name [[Gandalf]] and [[Universe::Gandalf]] links are left alone)
```

---

## Integration with Type Registry

The folder structure is driven entirely by the **Type Registry** (`.wiki-config.json` v2).

```json
{
  "version": 2,
  "folderOrder": [
    "entities", "concepts", "sources", "synthesis", "_review"
  ],
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
    "source": {
      "icon": "FileIcon",
      "folder": "sources",
      "subtypes": []
    },
    "synthesis": {
      "icon": "GitBranch",
      "folder": "synthesis",
      "subtypes": []
    }
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

### Adding a Custom Subtype

To add `"companion"` as a new entity subtype:

1. Add `"companion"` to `types.entity.subtypes`
2. Add `"companion": "entities/companions"` to `subtypeFolders`
3. Save `.wiki-config.json` — the folder is created on first write

```json
{
  "types": {
    "entity": {
      "subtypes": ["character", "location", "item", "faction", "organization", "creature", "companion"]
    }
  },
  "subtypeFolders": {
    "companion": "entities/companions"
  }
}
```

### Adding a Custom Type

To add a `"vehicle"` type:

1. Add `"vehicle"` to `types` with an icon, folder, and subtypes
2. Add subtype folder mappings
3. Add `"vehicles"` to `folderOrder`

```json
{
  "types": {
    "vehicle": {
      "icon": "Truck",
      "folder": "vehicles",
      "subtypes": ["car", "spaceship"]
    }
  },
  "subtypeFolders": {
    "car": "vehicles/cars",
    "spaceship": "vehicles/spaceships"
  },
  "folderOrder": ["entities", "concepts", "vehicles", "sources", "synthesis", "_review"]
}
```

---

## Prompt Integration

The LLM is informed about available subtypes via `prompt-subtypes.ts`. When generating
or classifying wiki content, the prompt includes a dynamic subtype section:

```
For each entity, pick a subtype from: character, location, item, faction, organization, creature
For each concept, pick a subtype from: theme, rule, mechanic, lore, event, tradition
```

Custom types and subtypes are included automatically. The compact form is used for
smaller prompts:

```
entity: character, location, item | concept: theme, rule, mechanic
```

---

## Template Integration

Subtype-specific templates exist under `src/lib/wiki/templates/`. When creating a new
page with a specific subtype, the corresponding template provides appropriate section
headings:

| Template | Subtype | Sections |
|----------|---------|---------|
| `character.md` | character | Description, Appearance, Personality, Background, Relationships, Notes |
| `location.md` | location | Description, Geography, History, Inhabitants, Points of Interest, Atmosphere, Notes |
| `event.md` | event | (generic) |
| `faction.md` | faction | (generic) |
| `concept.md` | concept | (generic) |

Templates use `{{title}}` placeholder substitution.

---

## The `misc/` Catch-All

Each top-level type folder can have a `misc/` subfolder for pages whose subtype doesn't
match any known subtype directory. This prevents orphaned flat files while still keeping
them within the correct type folder.

```
wiki/entities/misc/oddball-page.md
```

The `misc/` folder is created automatically when a page's subtype resolves to the
fallback folder but the page has a known type.

---

## The `_review/` System Folder

The `_review/` directory is a **hidden system folder** that does not appear in normal
wiki navigation. It contains:

- `_review/conflicts/` — Concurrent edit diffs saved when `onConflict: "save-diff"` is
  used. Files are named `{ISO-timestamp}-{original-filename}.diff`.

The `listWikiPages()` function explicitly skips `_review` (and `_archive`, `conflicts`,
`node_modules`) during recursive scanning.

---

## Backward Compatibility

### Existing Pages in Flat Folders

Pages in flat folders (e.g., `entities/gandalf.md`) continue to work. The
`listWikiPages()` function recursively scans all subdirectories, collecting `.md` files
from both flat and 2-level folder structures. The file tree component displays them
under `directPages` — the "top-level" section of each folder.

### The `misc` Folder

Pages without a recognized subtype are placed in `{type}/misc/` to keep them inside the
correct top-level type folder. If no `misc/` directory exists, pages fall back to the
entity root folder.

### Existing Links and Wikilinks

Moving a page to a subtype folder automatically rewrites **path-based** wikilinks
(e.g., `[[entities/gandalf]]` → `[[entities/characters/gandalf]]`). **Bare-name
wikilinks** (`[[Gandalf]]`) are unaffected since they resolve via title matching, not
path matching.

### Config Migration

v1 `.wiki-config.json` (only `folderOrder`) is auto-migrated to v2 on first read. The
migration adds default types and subtype folder mappings. No manual action needed.

---

## API Endpoints

| Method | Endpoint | Purpose | Folder Structure Relevance |
|--------|----------|---------|---------------------------|
| `GET` | `/api/wiki` | List all pages | Returns pages from all folders and subfolders, sorted by hierarchy |
| `POST` | `/api/wiki` | Create page | Accepts `subtype` in frontmatter, resolves to correct subfolder |
| `POST` | `/api/wiki/reorder` | Move/reorder pages | Drag-and-drop moves between subfolders, updates frontmatter and wikilinks |
| `GET` | `/api/wiki/reorder` | Get reorderable state | Returns pages grouped by folder with their `order` field |
| `GET` | `/api/wiki/types-registry` | Get type registry | Returns current subtype/folder mappings |
| `PUT` | `/api/wiki/types-registry` | Update registry | Changes take effect immediately for new pages |

---

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/wiki/subtype-folders.ts` | Folder resolution (`folderForPage`, `folderForSubtype`, `folderForType`, `subtypeFromFolder`) |
| `src/lib/wiki/type-registry.ts` | Cached registry accessor, cache invalidation |
| `src/lib/wiki/config-types.ts` | TypeScript interfaces (`WikiConfigV2`, `WikiTypeDef`, `DEFAULT_SUBTYPE_FOLDERS`) |
| `src/lib/wiki/config-migration.ts` | v1→v2 migration, add/remove type/subtype helpers |
| `src/lib/wiki/config.ts` | Config I/O, folder order resolution |
| `src/lib/wiki/file-io.ts` | `listWikiPages` recursive scan, `collectPagesRecursive`, `writeWikiPage` auto-mkdir |
| `src/lib/wiki/move-page.ts` | `moveWikiPage` — file rename + frontmatter update + wikilink rewrite |
| `src/lib/wiki/prompt-subtypes.ts` | LLM prompt subtype instructions |
| `src/lib/wiki/path-guard.ts` | Path traversal prevention (`isPathWithinRoot`) |
| `src/lib/wiki/templates/` | Subtype-specific page templates (character, location, event, faction, concept) |
| `src/components/wiki/file-tree.tsx` | 2-level tree UI with drag-and-drop, quick-create, collapsible subfolders |
| `src/app/api/wiki/reorder/route.ts` | Reorder API — moves pages, rewrites wikilinks, persists folder order |
| `src/app/api/wiki/types-registry/route.ts` | Type registry API — get/update subtype/folder mappings |
| `data/{userId}/wiki/.wiki-config.json` | Per-user type registry configuration |

---

## Related Plans

- **Plan 008**: Type Registry — introduced v2 config with `types`, `subtypeFolders`
- **Plan 010**: Evolution Tooling — bulk operations, merging, dormancy detection
