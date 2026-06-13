# Plan 007: Unify Personas + NPCs into Entity Registry

## Goal
Make the entity registry the single source of truth for all entity types. Personas, NPCs, locations, and events all live in `entity_registry` with typed IDs (`persona:uuid`, `npc:uuid`). The old `personas` and `npcs` tables become supplementary metadata stores keyed by `entity_id` instead of having their own separate ID systems.

## Motivation
Currently the system has split identity — personas have their own UUIDs, NPCs have their own UUIDs, and the entity registry maps display names to registry IDs. This means:
- When you rename a persona, the registry name and persona name can diverge
- Creating a persona requires two INSERTs (personas + entity_registry)
- The merge API can't fully merge two personas or NPCs without duplicating records
- Entity aliases cover the name layer but not the underlying data

## Migration Strategy

### Phase 1: Add entity_id to personas + npcs tables

- [ ] **Task A — Add entity_id FK columns** (assigned: @builder)
  ```sql
  ALTER TABLE personas ADD COLUMN entity_id TEXT REFERENCES entity_registry(id);
  ALTER TABLE npcs ADD COLUMN entity_id TEXT REFERENCES entity_registry(id);
  ```
  Update `scripts/init-db.ts`, `schema-migrations.ts`, test helpers, and the `Persona` / `Npc` types.

- [ ] **Task B — Backfill entity_id for existing records** (assigned: @builder)
  One-time script: for each persona and NPC, find or create the corresponding `entity_registry` entry and set `entity_id`.

### Phase 2: Create via registry first

- [ ] **Task C — Update persona creation** (assigned: @builder)
  When creating a persona (`POST /api/personas`), first register it in `entity_registry` with `persona:uuid`, then create the persona record using that same entity_id. The persona's UUID stays the same as the registry ID.

- [ ] **Task D — Update NPC creation** (assigned: @builder)
  Same as C but for NPCs (`POST /api/npcs`, NPC editor). First create `npc:uuid` in registry, then NPC record with that entity_id.

- [ ] **Task E — Update persona/NPC updates** (assigned: @builder)
  When a persona or NPC is renamed, update the entity_registry `display_name` and add the old name as an alias automatically.

### Phase 3: Converge readers

- [ ] **Task F — Update entity manager UI** (assigned: @builder)
  The entity manager should show persona/NPC data inline (persona traits, NPC location/tags) since the registry now owns the entities. Add ability to edit these fields from the entity page.

- [ ] **Task G — Update API consumers** (assigned: @builder)
  Update all code that reads `personas.id` or `npcs.id` to prefer `entity_registry.id`. This includes:
  - Session persona selection
  - Relationship analysis (entity ID resolution)
  - Conversation pair matching
  - Wiki entity linking
  - Voice assignment lookups
  - Backfill the merge endpoint to also merge persona/NPC supplementary data

### Phase 4: Cleanup (optional, future)

- [ ] **Task H — Deprecate old ID columns** (assigned: @builder)
  Once everything uses `entity_id`, the old `personas.id` and `npcs.id` can be deprecated or repurposed. Not urgent — they can coexist indefinitely.

## Key Principle
The **entity_registry** is the canonical entity. Supplementary tables (`personas`, `npcs`) are just metadata extensions. Every entity has exactly one registry ID — type prefix + UUID. The old UUID in `personas.id` becomes the same as `entity_registry.id` (minus the `persona:` prefix logic), or we store the registry ID directly in `personas.entity_id`.

## Files Changed (est.)
| File | Change |
|------|--------|
| `scripts/init-db.ts` | Add entity_id columns to personas + npcs |
| `src/lib/schema-migrations.ts` | ALTER TABLE migrations |
| `src/lib/persona-types.ts` | Add entity_id to Persona interface |
| `src/lib/relationship-types.ts` | Update NPC/Persona related types |
| `src/app/api/personas/route.ts` | Create entity in registry on POST |
| `src/app/api/personas/[id]/route.ts` | Update registry on rename |
| `src/app/api/npcs/route.ts` | Create entity in registry on POST |
| `src/app/api/npcs/[id]/route.ts` | Update registry on rename |
| `src/app/api/entities/merge/route.ts` | Also merge persona/npc metadata |
| `src/app/(app)/entities/entity-manager-client.tsx` | Show persona/NPC inline data |
| `src/lib/ollama.ts` | Persona context lookup uses entity_id |
| `src/components/personas/persona-editor.tsx` | May need entity_id passed through |
| `src/components/npcs/npc-editor.tsx` | May need entity_id passed through |
| `scripts/backfill-persona-npc-entities.cjs` | NEW — one-time backfill |
