# Plan: Lore Editor

## Goal
Create an Obsidian-style lore editor with markdown editing, YAML frontmatter support, wikilink autocomplete, and override tracking for locations, NPCs, and other lore entities.

## Graph Analysis
- **Affected Systems**: Lore CRUD APIs, markdown storage, backlink system, validation system
- **Dependency Chain**: `api/locations/route.ts` → `api/npcs/route.ts` → `lib/backlinks.ts` → `lib/validations.ts` → `lore/editor.tsx`
- **Centrality**: HIGH — touches lore creation, editing, validation, and backlink systems

## Affected Files
| File | Change |
|------|--------|
| `src/app/(app)/lore/[id]/page.tsx` | New lore editor page |
| `src/app/(app)/lore/new/page.tsx` | New lore creation page |
| `src/components/lore/lore-editor.tsx` | New editor component |
| `src/components/lore/wikilink-autocomplete.tsx` | New autocomplete component |
| `src/components/lore/frontmatter-editor.tsx` | New frontmatter component |
| `src/lib/markdown.ts` | Add frontmatter parsing |
| `src/lib/backlinks.ts` | Extract wikilinks from content |
| `src/app/api/locations/[id]/route.ts` | Support markdown + frontmatter |
| `src/app/api/npcs/[id]/route.ts` | Support markdown + frontmatter |

## Database Changes
```sql
-- Add markdown_content column if not exists
ALTER TABLE locations ADD COLUMN markdown_content TEXT;
ALTER TABLE npcs ADD COLUMN markdown_content TEXT;

-- Track user overrides
ALTER TABLE locations ADD COLUMN user_override BOOLEAN DEFAULT 0;
ALTER TABLE npcs ADD COLUMN user_override BOOLEAN DEFAULT 0;
```

## Risks
- **MEDIUM**: Existing lore stored as structured fields — need migration to markdown
- **MEDIUM**: Wikilink parsing must handle `[[Entity Name]]` and `[[alias|Entity Name]]`
- **LOW**: Frontmatter must sync with database fields (name, entity_type, importance, etc.)
- **MEDIUM**: Backlink graph must update when wikilinks change

## Execution Phases

### Phase 1: Markdown + Frontmatter Infrastructure
1. Add `parseFrontmatter(content)` and `stringifyFrontmatter(data, content)` to `lib/markdown.ts`
2. Define frontmatter schema for each entity type (location, npc, event, etc.)
3. Update API routes to accept and return `markdown_content` field
4. Add `user_override` flag to track manual edits

### Phase 2: Editor Component
1. Create `LoreEditor` with split-pane view (edit + preview)
2. Markdown textarea with syntax highlighting
3. Live preview with rendered markdown
4. Frontmatter editor panel (collapsible)
5. Save button with override tracking

### Phase 3: Wikilink Autocomplete
1. Create `WikilinkAutocomplete` component
2. On `[[` trigger, fetch all lore entities for current universe
3. Filter by typed text, show name + type icon
4. Insert `[[Entity Name]]` on selection
5. Support `[[display text|Entity Name]]` syntax

### Phase 4: Backlink Integration
1. Parse wikilinks on save, update backlinks table
2. Show backlinks panel in editor (entities linking to this one)
3. Click backlink to navigate to that entity

### Phase 5: Creation Flow
1. Create `lore/new` page with entity type selector
2. Pre-fill frontmatter template based on type
3. Save creates new entity with markdown content
4. Redirect to editor after creation

## Validation
- Create location with markdown content and frontmatter, verify save
- Edit lore, verify `user_override` flag set to true
- Type `[[` in editor, verify autocomplete shows entities
- Select entity from autocomplete, verify wikilink inserted
- Save with wikilinks, verify backlinks updated
- Preview rendered markdown, verify formatting correct

## Rollback
- Revert to structured field editing
- Remove markdown_content columns (or leave dormant)
- Remove wikilink autocomplete component
