# Wiki Type Registry

The **Wiki Type Registry** is a user-editable configuration that defines how wiki pages are categorized. It replaces hardcoded type/subtype constants with a `.wiki-config.json` file that you can modify without touching code.

## Overview

The registry controls:
- **Top-level types**: entity, concept, source, synthesis (plus custom types)
- **Subtypes**: character, location, item, etc. (per type)
- **Icons**: Lucide icons for each type in the UI
- **Folder mapping**: which subfolder each subtype maps to

## Configuration File

Location: `data/{userId}/wiki/.wiki-config.json` (per wiki root)

### Schema (v2)

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

## How It Works

1. **On startup**: The server reads `.wiki-config.json`. If missing or v1, it auto-migrates to v2 with defaults.
2. **At runtime**: The `getTypeRegistry(wikiRoot)` function returns a cached, normalized registry.
3. **LLM prompts**: The `buildSubtypePromptSection(registry)` helper generates dynamic subtype lists for LLM prompts.
4. **File operations**: When creating pages, the server looks up the subtype → folder mapping.

## Adding Custom Types

### Via Admin UI
Navigate to `/admin/types` to use the visual editor.

### Via Config File
Edit `.wiki-config.json` directly:

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

After saving, the next LLM call will know about `vehicle` type with `car` and `spaceship` subtypes.

## Adding Subtypes to Existing Types

```json
{
  "types": {
    "entity": {
      "icon": "Users",
      "folder": "entities",
      "subtypes": ["character", "location", "item", "faction", "organization", "creature", "companion"]
    }
  },
  "subtypeFolders": {
    "companion": "entities/companions"
  }
}
```

## Deleting Types/Subtypes

Use the admin UI at `/admin/types` — it prevents deletion if any pages use the type/subtype.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/wiki/types-registry` | GET | Returns the full registry |
| `/api/wiki/types-registry` | PUT | Updates the registry (validates) |

## Lucide Icons

Use any [Lucide](https://lucide.dev/icons/) icon name. Common choices:

| Category | Icons |
|----------|-------|
| People | `Users`, `User`, `UserPlus`, `UserMinus`, `UserCheck`, `UserX` |
| Places | `MapPin`, `Map`, `Globe`, `Building`, `Building2`, `Home` |
| Items | `Package`, `Box`, `Gift`, `ShoppingBag`, `ShoppingCart` |
| Groups | `Users`, `Shield`, `Flag`, `Crown`, `Award` |
| Creatures | `PawPrint`, `Bone`, `Fish`, `Bird`, `Bug` |
| Concepts | `BookOpen`, `Book`, `Library`, `Scroll`, `Sparkles` |
| Events | `Calendar`, `Clock`, `Timer`, `Zap`, `Star` |
| Misc | `FileText`, `FileIcon`, `GitBranch`, `Truck`, `Rocket` |

## Migration from v1

Old config:
```json
{ "folderOrder": ["entities", "concepts", "sources", "synthesis", "_review"] }
```

Auto-migrates to v2 with defaults on first read. No manual action needed.

## Files

| File | Purpose |
|------|---------|
| `src/lib/wiki/config-types.ts` | TypeScript interfaces |
| `src/lib/wiki/config-migration.ts` | v1→v2 migration logic |
| `src/lib/wiki/type-registry.ts` | Cached registry accessor |
| `src/lib/wiki/prompt-subtypes.ts` | LLM prompt builder |
| `src/app/(app)/admin/types/page.tsx` | Admin UI |
| `src/app/api/wiki/types-registry/route.ts` | API endpoints |

## Related Plans

- **Plan 009**: Subtype Folder Structure (uses `subtypeFolders` for 2-level folders)
- **Plan 010**: Evolution Tooling (bulk operations, merge, dormancy)