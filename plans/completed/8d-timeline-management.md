# Phase 8D: Timeline Management ✅ COMPLETE

## Goal
Build a full CRUD UI for timelines — the system that defines eras, years, restrictions, and active factions within a universe.

## Status
All steps completed. Timeline list page, detail page, API routes, and session integration all built.

## Current State
- [x] `src/app/api/timelines/route.ts` — GET (list), POST (create)
- [x] `src/app/api/timelines/[id]/route.ts` — GET, PUT, DELETE
- [x] `src/app/(app)/timeline/page.tsx` — list with universe filter, sort by year
- [x] `src/app/(app)/timeline/[id]/page.tsx` — detail with era, year, restrictions, factions
- [x] `src/app/(app)/layout.tsx` — sidebar nav item "Timeline"
- [x] Session creation includes timeline selection

## Schema Reference
```sql
CREATE TABLE timelines (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    universe_id TEXT REFERENCES universes(id),
    era TEXT,
    year INTEGER,
    restrictions TEXT,    -- JSON array of restriction strings
    active_factions TEXT  -- JSON array of faction names
);
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  /timelines                                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Universe: [Third Age ▼]                              │   │
│  │                                                      │   │
│  │  Timeline List                                       │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │ 📅 Year 3018 — War of the Ring                 │  │   │
│  │  │    Era: Third Age | Factions: Gondor, Mordor   │  │   │
│  │  │    Restrictions: No elves, no magic items      │  │   │
│  │  │                              [Edit] [Delete]   │  │   │
│  │  ├────────────────────────────────────────────────┤  │   │
│  │  │ 📅 Year 2941 — Quest of Erebor                 │  │   │
│  │  │    Era: Third Age | Factions: Dwarves, Dragons │  │   │
│  │  │    Restrictions: No ring bearers               │  │   │
│  │  │                              [Edit] [Delete]   │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │  [+ New Timeline]                                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  /timelines/[id]                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Timeline Detail                                     │   │
│  │  Universe: Third Age                                 │   │
│  │  Era: [Third Age____________]                        │   │
│  │  Year: [3018____]                                    │   │
│  │                                                      │   │
│  │  Restrictions:                                       │   │
│  │  × No elves in the south                             │   │
│  │  × Magic items are rare                              │   │
│  │  [+ Add restriction]                                 │   │
│  │                                                      │   │
│  │  Active Factions:                                    │   │
│  │  ● Gondor  ● Mordor  ● Rohan                        │   │
│  │  [+ Add faction]                                     │   │
│  │                                                      │   │
│  │  [Save] [Delete]                                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Execution Plan

### Step 1: Create Timelines API Routes
**File**: `src/app/api/timelines/route.ts`

- `GET` — list all timelines for user, filterable by `?universeId=xxx`
- `POST` — create new timeline (universe_id, era, year, restrictions, active_factions)

**File**: `src/app/api/timelines/[id]/route.ts`

- `GET` — get single timeline detail
- `PUT` — update timeline
- `DELETE` — delete timeline

### Step 2: Create Timelines List Page
**File**: `src/app/(app)/timelines/page.tsx`

Features:
- Universe filter dropdown (loads user's universes)
- Timeline cards showing: year, era, faction count, restriction count
- Sort by year (ascending/descending)
- "New Timeline" button
- Click timeline → navigate to detail page

### Step 3: Create Timeline Detail Page
**File**: `src/app/(app)/timelines/[id]/page.tsx`

Features:
- Universe selector (dropdown of user's universes)
- Era text input
- Year number input
- Restrictions list:
  - Tag-style inputs (add/remove)
  - Stored as JSON array
- Active factions list:
  - Tag-style inputs (add/remove)
  - Stored as JSON array
- Save/Delete buttons
- Validation: year must be integer, universe required

### Step 4: Add Timelines to Sidebar
**File**: `src/app/(app)/layout.tsx`

Add nav item:
```typescript
{ href: "/timelines", label: "Timelines", icon: CalendarClock }
```

### Step 5: Integrate with Session Creation
**File**: `src/app/(app)/session/new/page.tsx`

- When creating a session, show timeline dropdown (filtered by selected universe)
- Store `timeline_id` on session

### Step 6: Integrate with Universe Detail
**File**: `src/app/(app)/universe/[id]/page.tsx`

- Show timelines belonging to this universe
- Link to timeline detail
- "Add timeline" button from universe page

## Files Created
- `src/app/api/timelines/route.ts`
- `src/app/api/timelines/[id]/route.ts`
- `src/app/(app)/timelines/page.tsx`
- `src/app/(app)/timelines/[id]/page.tsx`

## Files Modified
- `src/app/(app)/layout.tsx` (sidebar nav)
- `src/app/(app)/session/new/page.tsx` (timeline selector)
- `src/app/(app)/universe/[id]/page.tsx` (timeline list)

## Tests
- Timeline CRUD operations
- Filter by universe
- Restrictions add/remove (JSON array)
- Factions add/remove (JSON array)
- Year validation (integer)
- Universe required validation
- Session creation with timeline_id
- Auth enforcement
- Sidebar navigation

## Risk
- **LOW**: Standard CRUD pattern
- Timeline deletion should not cascade-delete sessions (sessions can exist without timelines)
- Need to handle universe deletion cascade (timelines should be deleted when universe is deleted)
