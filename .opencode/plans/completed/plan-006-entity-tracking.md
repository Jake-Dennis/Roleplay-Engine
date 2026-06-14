# Plan 006: Universal Entity Tracking System

## Goal
Replace name-based entity references with a typed, ID-based system across all subsystems — relationships, conversations, entity mentions, and wiki sync. Eliminate duplicates and ambiguity between personas, NPCs, users, locations, and events.

## Problem
Currently entities are tracked by plain name strings:
- `relationships.source_entity` / `target_entity` = name strings (e.g., "Aragorn")
- `entity_mentions.entity_name` = name string
- Conversation pairs match by `personaId` + `speaking_as` (NPC name string)
- A persona called "Aragorn" and an NPC called "Aragorn" are indistinguishable
- Renaming a persona breaks all its relationships

## Solution: Entity Registry

A central table that assigns every entity a unique `{type}:{uuid}` identifier:

```
entity_registry
├── id TEXT PRIMARY KEY          # "persona:abc-123" or "npc:def-456"
├── entity_type TEXT             # persona | npc | user | location | event
├── display_name TEXT            # current display name (for UI)
├── user_id TEXT                 # owner
├── universe_id TEXT             # universe scope
├── created_at DATETIME
└── updated_at DATETIME

entity_aliases
├── id TEXT PRIMARY KEY
├── entity_id TEXT → entity_registry(id)
├── alias TEXT                   # alternative name (e.g., "Strider" → "npc:abc")
├── source TEXT                  # how it was learned (llm_extracted | user_defined | wiki_sync)
└── created_at DATETIME
```

## Migration Plan

### Phase 1: Entity Registry Support (no behavior changes)

- [ ] **Task A — Create entity_registry + entity_aliases tables** (assigned: @builder)
  Add to `scripts/init-db.ts` and `schema-migrations.ts`:
  ```sql
  CREATE TABLE IF NOT EXISTS entity_registry (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    display_name TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    universe_id TEXT REFERENCES universes(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_registry_type_id ON entity_registry(entity_type, id);
  
  CREATE TABLE IF NOT EXISTS entity_aliases (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entity_registry(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    source TEXT DEFAULT 'user_defined',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_entity_aliases_alias ON entity_aliases(alias);
  ```

- [ ] **Task B — Entity Registry API** (assigned: @builder)
  New API endpoint: `GET/POST /api/entities` with CRUD operations:
  - Register an entity (type, name, userId, universeId)
  - Lookup entity by alias (resolve "Strider" → entity_id)
  - List all entities for a user/universe
  - Add alias to existing entity
  - Merge two entities (when duplicates detected)

- [ ] **Task C — Backfill existing entities** (assigned: @builder)
  One-time script to register all existing personas, NPCs, locations, and events into the entity registry with their UUIDs.

### Phase 2: ID-based Relationships

- [ ] **Task D — Add source_entity_id / target_entity_id to relationships** (assigned: @builder)
  ```sql
  ALTER TABLE relationships ADD COLUMN source_entity_id TEXT REFERENCES entity_registry(id);
  ALTER TABLE relationships ADD COLUMN target_entity_id TEXT REFERENCES entity_registry(id);
  ```
  Keep old `source_entity` / `target_entity` name columns for backward compat. New code writes to both. After migration period, old columns become deprecated.

- [ ] **Task E — Update relationship analysis** (assigned: @builder)
  When the LLM returns relationship data with entity names, resolve them to entity IDs via the registry before saving. If an entity doesn't exist, create it in the registry first.

- [ ] **Task F — Update conversation tracking** (assigned: @builder)
  Conversation pairs (`getConversationPairMessages`) should match by entity_id instead of name strings. The `speaking_as` column should ideally store entity IDs, but for now resolve NPC names to IDs during pair building.

- [ ] **Task G — Update entity mentions** (assigned: @builder)
  `entity_mentions.entity_name` should be replaced with `entity_id` pointing to the registry. Mentions extraction should resolve names to IDs.

### Phase 3: Wiki Sync

- [ ] **Task H — Link wiki pages to entity registry** (assigned: @builder)
  Wiki pages about entities (NPCs, locations, events) should store the entity_id in their frontmatter. When creating wiki pages, register the entity first. Cross-links should use entity IDs.

### Phase 4: UI + Verification

- [ ] **Task I — Entity manager UI** (assigned: @builder)
  A page in the sidebar (or section in settings) showing all registered entities with their aliases, types, and linked data. Ability to merge duplicates, rename, and view relationships.

- [ ] **Task J — Verify build + backfill** (assigned: @reviewer)
  - `npm run build` passes
  - Existing personas, NPCs are registered with correct IDs
  - Relationships reference both old names and new IDs
  - Duplicate resolution works (merge two entities)
  - Aliases resolve correctly ("Strider" → Aragorn)

## Verification

- [ ] `npm run build`
- [ ] `python -c "import os; print('PASS' if os.path.exists('scripts/backfill-entities.cjs') else 'FAIL')"`
- [ ] `python -c "f=open('scripts/init-db.ts'); c=f.read(); print('PASS' if 'entity_registry' in c else 'FAIL')"`

## Files Changed (est.)
| File | Change |
|------|--------|
| `scripts/init-db.ts` | Add entity_registry + entity_aliases tables |
| `src/lib/schema-migrations.ts` | Add migration for new tables + columns |
| `src/app/api/entities/route.ts` | NEW — Entity Registry CRUD API |
| `src/lib/entity-registry.ts` | NEW — Registry lookup/resolve/merge logic |
| `src/lib/relationship-analysis.ts` | Use entity IDs instead of name strings |
| `src/lib/retrieval.ts` | Conversation pair matching via entity IDs |
| `src/lib/entity-extraction.ts` | Mention tracking via entity IDs |
| `src/lib/relationship-markdown.ts` | Wiki file paths use entity IDs |
| `scripts/backfill-entities.cjs` | NEW — one-time backfill script |
| `src/app/(app)/entities/page.tsx` | NEW — entity manager UI |
| Sidebar nav | Add Entities link |
