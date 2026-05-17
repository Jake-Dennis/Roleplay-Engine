# Plan: Canon Layers UI

## Goal
Create UI for managing canon layers (`immutable_canon`, `soft_canon`, `generated_lore`, `session_lore`, `rumor`) with visual distinction, promotion/demotion workflows, and canon enforcement indicators.

## Graph Analysis
- **Affected Systems**: Lore CRUD APIs, validations system, lore editor, canon page
- **Dependency Chain**: `api/validations/route.ts` → `validations/page.tsx` → `lore/[id]/edit/page.tsx`
- **Centrality**: MEDIUM — touches lore editing and validation

## Affected Files
| File | Change |
|------|--------|
| `scripts/init-db.ts` | Add `canon_layer` + `canon_tier` columns |
| `src/app/api/locations/route.ts` | Return/accept `canon_layer` |
| `src/app/api/locations/[id]/route.ts` | Return/accept `canon_layer` |
| `src/app/api/npcs/route.ts` | Return/accept `canon_layer` |
| `src/app/api/npcs/[id]/route.ts` | Return/accept `canon_layer` |
| `src/app/(app)/canon/page.tsx` | LayerViewer + PromotionDialog + layer stats |
| `src/app/(app)/lore/[id]/edit/page.tsx` | Immutable badge + disabled editing |
| `src/components/canon/layer-viewer.tsx` | New component |
| `src/components/canon/promotion-dialog.tsx` | New component |

## Database Changes
```sql
-- Add canon_layer column if not exists
ALTER TABLE locations ADD COLUMN canon_layer TEXT DEFAULT 'generated_lore';
ALTER TABLE npcs ADD COLUMN canon_layer TEXT DEFAULT 'generated_lore';
ALTER TABLE events ADD COLUMN canon_layer TEXT DEFAULT 'generated_lore';
ALTER TABLE narrative_memories ADD COLUMN canon_layer TEXT DEFAULT 'generated_lore';
```

## Risks
- **LOW**: New column with default value, no data migration needed
- **MEDIUM**: UI complexity — need clear visual distinction between layers
- **LOW**: Canon enforcement is already partially implemented in validations

## Execution Phases

### Phase 1: Database + API
1. Add `canon_layer` column to lore tables
2. Update `GET /api/locations`, `GET /api/npcs`, etc. to return `canon_layer`
3. Update `PUT` endpoints to accept `canon_layer` parameter
4. Add validation: prevent editing `immutable_canon` entries

### Phase 2: Canon Layer Viewer
1. Create `LayerViewer` component showing all 5 layers as tabs
2. Each tab lists entities in that layer
3. Visual indicators:
   - `immutable_canon`: Red lock icon, read-only badge
   - `soft_canon`: Blue shield icon
   - `generated_lore`: Yellow question mark
   - `session_lore`: Green clock icon
   - `rumor`: Orange warning icon

### Phase 3: Promotion/Demotion Dialog
1. Create `PromotionDialog` for moving entities between layers
2. Show current layer, target layer options
3. Require confirmation for promotion to `immutable_canon`
4. Log promotion/demotion in lore_validations table

### Phase 4: Lore Editor Integration
1. Add canon layer selector to lore edit page
2. Show read-only badge for `immutable_canon` entries
3. Disable editing fields for `immutable_canon` entries
4. Show promotion/demotion button in toolbar

### Phase 5: Canon Page Enhancement
1. Update canon page to show layer breakdown
2. Show statistics: entities per layer
3. Add bulk promotion/demotion for selected entities
4. Show recent canon changes with timestamps

## Validation
- Create lore entry, verify default layer is `generated_lore`
- Promote to `soft_canon`, verify badge updates
- Promote to `immutable_canon`, verify editing is disabled
- Demote back to `generated_lore`, verify editing is re-enabled
- View canon page, verify layer breakdown is correct

## Rollback
- Remove `canon_layer` columns
- Revert canon page to previous state

## Status: COMPLETED
- [x] Phase 1: `canon_layer` columns in init-db.ts + API updates for locations/npcs
- [x] Phase 2: LayerViewer component with 5-layer distribution overview
- [x] Phase 3: PromotionDialog for moving entities between layers
- [x] Phase 4: Lore editor shows immutable badge + disables editing for immutable_canon
- [x] Phase 5: Canon page shows layer breakdown stats + Layer button per entity
- [x] Validation: Build passes clean, TypeScript compiles with zero errors
