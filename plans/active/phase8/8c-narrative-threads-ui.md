# Phase 8C: Narrative Threads/Arcs UI

## Goal
Build a full CRUD UI for narrative threads/arcs — the system that tracks ongoing story arcs, unresolved items, and escalation levels across sessions.

## Current State
- `narrative_threads` table exists in schema
- No API routes for threads
- No UI page
- Threads are referenced in `scene_states.active_threads` (JSON array of IDs)
- Library functions reference threads but no management interface

## Schema Reference
```sql
CREATE TABLE narrative_threads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    session_id TEXT REFERENCES sessions(id),
    title TEXT NOT NULL,
    status TEXT DEFAULT 'active',     -- active, resolved, abandoned
    escalation_level TEXT DEFAULT 'low', -- low, medium, high, critical
    unresolved_items TEXT,            -- JSON array
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  /threads                                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Thread List (filterable by status/session)          │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │ ⚑ Missing traveler    [active]  [high]    →    │  │   │
│  │  │ ⚑ Orc sightings       [active]  [medium]  →    │  │   │
│  │  │ ⚑ The Lost Crown      [resolved] [low]    →    │  │   │
│  │  │ ⚑ Betrayal at Rivendell [abandoned] [critical]→│  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │  [+ New Thread]                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  /threads/[id]                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Thread Detail                                       │   │
│  │  Title: [Missing traveler____________]               │   │
│  │  Status: [active ▼]  Escalation: [high ▼]           │   │
│  │  Session: Eastern Ruins Expedition                   │   │
│  │                                                      │   │
│  │  Unresolved Items:                                   │   │
│  │  ☐ Find the traveler's camp                          │   │
│  │  ☐ Identify the kidnapper                            │   │
│  │  ☑ Report to the captain                             │   │
│  │  [+ Add item]                                        │   │
│  │                                                      │   │
│  │  [Save] [Resolve] [Abandon] [Delete]                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Execution Plan

### Step 1: Create Threads API Routes
**File**: `src/app/api/threads/route.ts`

- `GET` — list all threads for user, filterable by `?status=active&?sessionId=xxx`
- `POST` — create new thread (title, session_id, status, escalation_level, unresolved_items)

**File**: `src/app/api/threads/[id]/route.ts`

- `GET` — get single thread detail
- `PUT` — update thread (title, status, escalation_level, unresolved_items)
- `DELETE` — delete thread

### Step 2: Create Threads List Page
**File**: `src/app/(app)/threads/page.tsx`

Features:
- Filter tabs: All / Active / Resolved / Abandoned
- Session filter dropdown
- Thread cards showing: title, status badge, escalation indicator, session name, item count
- "New Thread" button → modal or inline form
- Click thread → navigate to detail page

Status badges:
- `active` → blue accent
- `resolved` → green
- `abandoned` → gray/muted

Escalation indicators:
- `low` → 1 dot
- `medium` → 2 dots
- `high` → 3 dots
- `critical` → 4 dots + red

### Step 3: Create Thread Detail Page
**File**: `src/app/(app)/threads/[id]/page.tsx`

Features:
- Editable title input
- Status dropdown (active/resolved/abandoned)
- Escalation dropdown (low/medium/high/critical)
- Session link (clickable, navigates to session)
- Unresolved items list:
  - Checkbox for each item
  - Inline edit on click
  - Add new item input
  - Delete item button
- Action buttons: Save, Resolve (sets status=resolved), Abandon (sets status=abandoned), Delete
- Created/updated timestamps

### Step 4: Add Threads to Sidebar
**File**: `src/app/(app)/layout.tsx`

Add nav item:
```typescript
{ href: "/threads", label: "Threads", icon: ListTodo }
```

### Step 5: Integrate with Session Context
**File**: `src/app/(app)/session/[id]/page.tsx`

- Scene state panel shows active threads for the session
- Click thread → navigate to thread detail
- When creating a thread from session, auto-link to current session

### Step 6: Markdown File Generation
**File**: `src/lib/lore-markdown.ts` (extend)

When thread is created/updated:
- Write markdown file to `data/<user_id>/story_arcs/<thread-title>.md`
- Include frontmatter: id, title, status, escalation_level, session_id, unresolved_items
- Include body: thread description, item checklist

## Files Created
- `src/app/api/threads/route.ts`
- `src/app/api/threads/[id]/route.ts`
- `src/app/(app)/threads/page.tsx`
- `src/app/(app)/threads/[id]/page.tsx`

## Files Modified
- `src/app/(app)/layout.tsx` (sidebar nav)
- `src/app/(app)/session/[id]/page.tsx` (scene panel integration)
- `src/lib/lore-markdown.ts` (thread markdown support)

## Tests
- Thread CRUD operations (create, read, update, delete)
- Filter by status and session
- Unresolved items add/edit/delete/check
- Status transitions (active → resolved, active → abandoned)
- Markdown file creation on thread save
- Auth enforcement on all endpoints
- Thread detail page renders correctly
- Sidebar navigation works

## Risk
- **LOW**: Standard CRUD pattern, isolated from core systems
- Threads reference sessions — need to handle session deletion cascade
