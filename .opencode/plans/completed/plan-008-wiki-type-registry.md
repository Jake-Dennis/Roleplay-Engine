# Plan 008: Wiki Type Registry (Config-Driven Taxonomy)

## Goal
Move the type/subtype definitions out of TypeScript constants (currently in `src/lib/wiki/ingest.ts:23-26`, `src/lib/jobs/lore-extraction.ts:30`, `src/lib/jobs/wiki-handler.ts`, etc.) and into a user-editable config file (`.wiki-config.json`). The LLM prompt reads the registry at runtime, so the user can add/rename/remove types and subtypes without code changes. Existing pages keep working — the config defaults match the current hardcoded values. This is the foundation that Plans 009 and 010 build on.

## Tasks

### Layer 1 (parallel, no deps)
- [ ] T1: Extend `.wiki-config.json` schema (assigned: @architect)
  - Add `version: 2` field at root
  - Add `types` map: `{ entity: { icon, folder, subtypes: [...] }, concept: {...}, source: {...}, synthesis: {...} }`
  - Add `subtypeFolders` map: `{ character: "entities/characters", ... }`
  - Write TypeScript types in `src/lib/wiki/config-types.ts`: `WikiTypeDef`, `WikiConfigV2`
  - Backward-compat: read `folderOrder` from v1, upgrade to v2 in memory if `types` missing
- [ ] T2: Write v1→v2 config migration helper (assigned: @builder)
  - `src/lib/wiki/config-migration.ts`: `migrateConfigV1toV2(v1Config)` returns v2
  - Populate `types` from current hardcoded values (entity/concept/source/synthesis)
  - Populate `subtypeFolders` from same
  - Idempotent: running on a v2 config is a no-op
  - Persist upgraded config back to disk on first read
  - Unit tests in `src/lib/wiki/__tests__/config-migration.test.ts`
- [ ] T3: Create `getTypeRegistry(wikiRoot)` accessor (assigned: @builder)
  - Reads + migrates config, returns normalized registry
  - Returns: `{ types: Record<string, TypeDef>, subtypeFolders: Record<string, string>, fallbackFolder: string }`
  - Handles missing config file → returns defaults
  - Caches the registry per-wikiRoot for the lifetime of the request
  - Unit tests in `src/lib/wiki/__tests__/type-registry.test.ts`

### Layer 2 (depends on T1, T2, T3)
- [ ] T4: Refactor LLM prompts to read from registry (assigned: @builder)
  - New helper: `buildSubtypePromptSection(registry)` in `src/lib/wiki/prompt-subtypes.ts`
  - Returns string like: `"For each entity, pick a subtype from: character, location, item, faction, organization, creature, companion"`
  - Update `src/lib/wiki/ingest.ts` to use the helper (replace hardcoded `ENTITY_SUBTYPES`/`CONCEPT_SUBTYPES`)
  - Update `src/lib/jobs/lore-extraction.ts` (replace `ENTITY_TYPE_TO_SUBTYPE` lookup with registry-driven)
  - Update `src/lib/jobs/wiki-handler.ts` (replace hardcoded subtype lists)
  - Update `src/lib/wiki/filing.ts` (synthesis tag list comes from registry)
  - Unit test: `src/lib/wiki/__tests__/prompt-subtypes.test.ts` verifies the prompt contains user-added subtypes
- [ ] T5: Update frontmatter validation to accept registry subtypes (assigned: @builder)
  - `validateWikiFrontmatter` in `src/lib/wiki/frontmatter.ts` reads the registry
  - Known subtype → normal validation
  - Unknown subtype → warning in `FrontmatterPropertiesPanel` UI, but don't reject (forward-compat: pages created before config update)
  - Add test case in `src/lib/__tests__/frontmatter.test.ts`
- [ ] T6: Build "Type Registry" admin page (assigned: @builder)
  - `src/app/(app)/admin/types/page.tsx`
  - Lists all types + their subtypes (read from registry)
  - **Add subtype**: name input, parent type dropdown, "Add" button
  - **Add type**: name, icon picker (Lucide icons), default folder, "Add" button
  - **Delete subtype/type**: button, disabled if any page uses it (must migrate first)
  - Save → calls `PUT /api/wiki/types-registry` with the new config
  - API: `GET /api/wiki/types-registry` returns current registry
  - API: `PUT /api/wiki/types-registry` validates and writes

### Layer 3 (depends on T4, T5, T6)
- [ ] T7: Update file tree to use registry icons (assigned: @builder)
  - Replace hardcoded `TYPE_ICONS` in `src/components/wiki/file-tree.tsx:53` with registry-driven lookup
  - "New Folder" button suggests folder name based on registry's `subtypeFolders` keys
  - Right-click context menu: "Change type of this folder" (writes to config)
- [ ] T8: Documentation (assigned: @docs)
  - `docs/wiki-type-registry.md` — full guide
  - README section: "Customizing your wiki taxonomy"
  - Inline tooltip on the admin page: "Subtypes let you categorize pages. The AI will learn new subtypes automatically."

## Verification
- [ ] T1: `python -c "import json; print(json.load(open('data/8aec6985-e41f-494c-ba65-99648ee80d4b/wiki/.wiki-config.json'))['version'])"` exits 0
- [ ] T2: `bun test src/lib/wiki/__tests__/config-migration.test.ts` all cases pass
- [ ] T3: `bun test src/lib/wiki/__tests__/type-registry.test.ts` all cases pass
- [ ] T4: `bun test src/lib/wiki/__tests__/prompt-subtypes.test.ts` prompt contains user-added subtype
- [ ] T5: `bun test src/lib/__tests__/frontmatter.test.ts` accepts custom subtype
- [ ] T6: `curl -s http://localhost:3000/api/wiki/types-registry | python -c "import sys, json; json.load(sys.stdin); print('ok')"` exits 0
- [ ] T7: `bun test src/components/wiki/__tests__/file-tree.test.tsx` icons come from registry
- [ ] T8: `python -c "import os; assert os.path.getsize('docs/wiki-type-registry.md') > 1000"` exits 0
- [ ] Build: `npm run build` exits 0
- [ ] All tests: `bun test` reports 114+ pass
