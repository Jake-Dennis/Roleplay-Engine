# Plan: Relationship Visualization

## Goal
Create animated relationship visualization showing emotion graphs and the relationship web between characters/NPCs.

## Graph Analysis
- **Affected Systems**: Relationships API, graph visualization, UI rendering
- **Dependency Chain**: `api/relationships/route.ts` → `relationships/page.tsx` → visualization component
- **Centrality**: MEDIUM — isolated to relationships subsystem

## Affected Files
| File | Change |
|------|--------|
| `src/app/(app)/relationships/page.tsx` | Add visualization tab |
| `src/components/relationships/relationship-web.tsx` | New component |
| `src/components/relationships/emotion-graph.tsx` | New component |
| `src/components/relationships/relationship-card.tsx` | Update for visualization |
| `src/lib/relationship-viz.ts` | New utility for graph data |

## Risks
- **MEDIUM**: Canvas/SVG rendering performance with many relationships
- **LOW**: 30fps render loop already exists, can reuse for animations
- **LOW**: Purely additive — existing list view remains

## Execution Phases

### Phase 1: Graph Data Utility
- [x] Create `lib/relationship-viz.ts` with:
    - `buildRelationshipGraph(universeId)` — returns nodes + edges
    - `calculateEmotionVectors(relationshipId)` — returns emotion data
    - `layoutForceDirected(nodes, edges)` — simple force-directed layout

### Phase 2: Relationship Web Component
- [x] Create `RelationshipWeb` using SVG
- [x] Nodes = characters/NPCs, sized by importance
- [x] Edges = relationships, colored by dominant emotion
- [x] Edge thickness = relationship strength
- [x] Hover shows relationship details tooltip
- [x] Click node opens relationship detail panel

### Phase 3: Emotion Graph Component
- [x] Create `EmotionGraph` for individual relationships
- [x] Radar/spider chart showing 7 emotions: trust, suspicion, loyalty, resentment, attraction, respect, fear
- [x] Animated transitions when emotions change

### Phase 4: Integration
- [x] Add "Visualization" tab to relationships page
- [x] Toggle between list view and visualization
- [x] Click node to select relationship and show emotion graph

## Validation
- Load relationships page, switch to visualization tab
- Verify nodes and edges render correctly
- Hover over relationship, verify tooltip shows details
- Click node, verify detail panel opens
- Verify animations run at 30fps without stutter

## Rollback
- Remove visualization tab from relationships page
- Delete visualization components
