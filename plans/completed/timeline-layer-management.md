# Plan: Timeline Layer Management

## Goal
Create a dedicated timeline management UI for managing eras, years, factions, and active canon characters as a separate layer from the main timeline entries.

## Graph Analysis
- **Affected Systems**: Timeline CRUD API, timeline UI, universe layer
- **Dependency Chain**: `api/timelines/route.ts` → `timeline/page.tsx` → `timeline/[id]/page.tsx`
- **Centrality**: MEDIUM — isolated to timeline subsystem

## Affected Files
| File | Change |
|------|--------|
| `scripts/init-db.ts` | Add `timeline_layers` table |
| `src/app/api/timelines/[id]/layers/route.ts` | New API: GET/POST layers |
| `src/app/api/timelines/[id]/layers/[layerId]/route.ts` | New API: PUT/DELETE layer |
| `src/app/(app)/timeline/[id]/page.tsx` | Add Layers toggle + LayerManager |
| `src/components/timeline/layer-manager.tsx` | New component with tabs |
| `src/components/timeline/era-editor.tsx` | New component |
| `src/components/timeline/faction-editor.tsx` | New component |
| `src/components/timeline/character-editor.tsx` | New component |

## Database Changes
```sql
-- Timeline layers table
CREATE TABLE IF NOT EXISTS timeline_layers (
  id TEXT PRIMARY KEY,
  timeline_id TEXT REFERENCES timelines(id),
  layer_type TEXT NOT NULL, -- 'era', 'faction', 'active_characters'
  name TEXT NOT NULL,
  description TEXT,
  start_year INTEGER,
  end_year INTEGER,
  metadata TEXT, -- JSON for faction details, character lists, etc.
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Risks
- **LOW**: New table, no existing data migration needed
- **MEDIUM**: UI complexity — need clean tab/layer navigation
- **LOW**: Timeline entries already exist, layers are additive

## Execution Phases

### Phase 1: Database + API
1. Create `timeline_layers` table in `init-db.ts`
2. Create `GET /api/timelines/[id]/layers` — list layers for timeline
3. Create `POST /api/timelines/[id]/layers` — create layer
4. Create `PUT /api/timelines/[id]/layers/[layerId]` — update layer
5. Create `DELETE /api/timelines/[id]/layers/[layerId]` — delete layer

### Phase 2: Layer Manager Component
1. Create `LayerManager` with tabs: Entries, Eras, Factions, Characters
2. Each tab shows relevant layer type with CRUD operations
3. Era editor: name, start year, end year, description
4. Faction editor: name, description, alignment, territory
5. Active characters editor: character list, canon status, role

### Phase 3: Timeline Page Integration
1. Add layer tabs to timeline page header
2. Switch content based on active tab
3. Entries tab shows existing timeline entries (current behavior)
4. Other tabs show layer-specific editors

## Validation
- Create timeline, add era layer, verify it saves
- Add faction layer with metadata, verify it persists
- Switch between tabs, verify content updates correctly
- Delete layer, verify it's removed from database

## Rollback
- Remove `timeline_layers` table
- Revert timeline page to entries-only view

## Status: COMPLETED
- [x] Phase 1: `timeline_layers` table in init-db.ts + full CRUD API
- [x] Phase 2: LayerManager with 3 tabs (Eras, Factions, Characters)
- [x] Phase 2: EraEditor, FactionEditor, CharacterEditor components
- [x] Phase 3: Layers toggle button in timeline detail page
- [x] Validation: Build passes clean, TypeScript compiles with zero errors
