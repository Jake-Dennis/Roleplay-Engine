# Phase 5: Component Extraction & UI Completeness

## Overview
Extract inline UI patterns into reusable components and implement missing visual components from the implementation plan. This phase is purely frontend — no API or database changes.

---

## 5A: Modal Component System

### Problem
11 pages use native `confirm()` for delete actions. No proper modal dialog exists for confirmations, forms, or detail views.

### Plan

#### 5A.1: Create `src/components/ui/modal.tsx`
```tsx
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}
```

**Features:**
- Backdrop click to close
- Escape key to close
- Focus trap inside modal
- Size variants (sm: 320px, md: 480px, lg: 640px, xl: 800px)
- Animated enter/exit (CSS transitions)
- Scroll lock on body when open

**Implementation:**
```tsx
// Structure:
<div className="fixed inset-0 z-50 flex items-center justify-center">
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
  
  {/* Modal panel */}
  <div className="relative z-10 rounded-xl border border-border-default bg-bg-elevated shadow-2xl">
    {/* Header with title + close button */}
    <div className="flex items-center justify-between border-b border-border-default px-5 py-3">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      <button onClick={onClose}><X className="h-4 w-4" /></button>
    </div>
    {/* Content */}
    <div className="px-5 py-4">{children}</div>
  </div>
</div>
```

#### 5A.2: Create `src/components/ui/confirmation-dialog.tsx`
```tsx
interface ConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "default";
}
```

**Features:**
- Danger variant (red button) for destructive actions
- Default variant (accent button) for neutral actions
- Loading state during confirmation
- Prevents double-click

#### 5A.3: Replace all `confirm()` calls
| File | Current | Replacement |
|------|---------|-------------|
| `timeline/page.tsx` | `confirm("Delete this timeline entry?")` | `<ConfirmationDialog>` |
| `relationships/page.tsx` | `confirm("Delete this relationship?")` | `<ConfirmationDialog>` |
| `narrative-threads/page.tsx` | `confirm("Delete this thread?")` | `<ConfirmationDialog>` |
| `session/[id]/page.tsx` | `confirm("Leave this session?")` | `<ConfirmationDialog>` |
| `session/[id]/page.tsx` | `confirm("Delete this message...")` | `<ConfirmationDialog>` |
| `lore/page.tsx` | `confirm("Delete this location?")` | `<ConfirmationDialog>` |
| `timeline/[id]/page.tsx` | `confirm("Delete this timeline entry?")` | `<ConfirmationDialog>` |
| `session/page.tsx` | `confirm("Delete this session?")` | `<ConfirmationDialog>` |
| `events/page.tsx` | `confirm("Delete this event?")` | `<ConfirmationDialog>` |
| `characters/page.tsx` | `confirm("Delete this character?")` | `<ConfirmationDialog>` |
| `universe/page.tsx` | `confirm("Delete this universe?")` | `<ConfirmationDialog>` |

**Migration pattern:**
```tsx
// Before:
async function handleDelete(id: string) {
  if (!confirm("Delete this?")) return;
  await fetch(`/api/.../${id}`, { method: "DELETE" });
  // ...
}

// After:
const [deleteId, setDeleteId] = useState<string | null>(null);

async function handleDeleteConfirmed() {
  if (!deleteId) return;
  await fetch(`/api/.../${deleteId}`, { method: "DELETE" });
  setDeleteId(null);
  // ...
}

// In JSX:
<ConfirmationDialog
  open={!!deleteId}
  onClose={() => setDeleteId(null)}
  onConfirm={handleDeleteConfirmed}
  title="Delete Entry"
  message="Are you sure you want to delete this entry? This cannot be undone."
  confirmLabel="Delete"
  confirmVariant="danger"
/>
```

---

## 5B: Relationship Graph Visualization

### Problem
No visual graph showing entity relationships. Plan specifies `RelationshipGraph.js` component.

### Plan

#### 5B.1: Create `src/components/relationship/relationship-graph.tsx`

**Approach:** Pure SVG-based graph (no external dependencies). Uses force-directed layout computed client-side.

**Data structure:**
```ts
interface GraphNode {
  id: string;
  label: string;
  type: "npc" | "location" | "event" | "character";
  x: number;
  y: number;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
  strength: number; // 0-1, affects line thickness
}
```

**Implementation:**
- SVG canvas with viewBox for responsive sizing
- Nodes rendered as circles with type-based colors
- Edges rendered as lines with labels
- Simple force-directed layout (repulsion + attraction)
- Drag nodes to reposition
- Zoom/pan with mouse wheel + drag
- Click node to highlight connections

**Color scheme:**
| Type | Color |
|------|-------|
| NPC | `#6366f1` (accent) |
| Location | `#22c55e` (success) |
| Event | `#eab308` (warning) |
| Character | `#3b82f6` (info) |

**API integration:**
```ts
// Fetch graph data
const res = await fetch(`/api/backlinks?graph=true`);
const { nodes, edges } = await res.json();
```

**New API endpoint needed:** `GET /api/backlinks?graph=true`
- Returns all backlinks as graph nodes + edges
- Nodes: unique entities (locations, NPCs, events, threads)
- Edges: backlink relationships with link_type as label

#### 5B.2: Create `src/app/api/backlinks/graph/route.ts`
```ts
// Returns graph data for visualization
export async function GET(request: NextRequest) {
  // 1. Get all backlinks for user
  // 2. Build node map (unique entities)
  // 3. Build edge list (backlinks)
  // 4. Return { nodes: [...], edges: [...] }
}
```

---

## 5C: Importance Meter UI

### Problem
`importance.ts` lib exists with 4-axis scoring but no visual display component.

### Plan

#### 5C.1: Create `src/components/narrative/importance-meter.tsx`

**Visual design:**
```
┌─ Importance ─────────────────────────┐
│ Emotional  [████████░░░░░░░░]  67%   │
│ Local      [██████░░░░░░░░░░]  50%   │
│ Canonical  [████████████░░░░]  83%   │
│ Recency    [████░░░░░░░░░░░░]  33%   │
│                                        │
│ Composite Score: 9.2 (Normal)          │
└────────────────────────────────────────┘
```

**Props:**
```tsx
interface ImportanceMeterProps {
  scores: ImportanceScores;
  showComposite?: boolean;
  size?: "sm" | "md";
}
```

**Features:**
- 4 horizontal bars (emotional, local, canonical, recency)
- Color-coded by level (low=gray, medium=blue, high=amber, critical=red)
- Composite score with tier badge
- Animated bar fill on mount
- Tooltip on hover showing exact values

#### 5C.2: Create `src/components/narrative/thread-tracker.tsx`

**Visual design:**
```
┌─ Active Threads ─────────────────────┐
│ ⚑ Missing traveler          [High]   │
│   3 unresolved · 2 days ago          │
│                                        │
│ ⚑ Orc sightings             [Med]    │
│   1 unresolved · 5 days ago          │
└──────────────────────────────────────┘
```

**Props:**
```tsx
interface ThreadTrackerProps {
  threads: NarrativeThread[];
  onThreadClick: (id: string) => void;
  filter?: "all" | "active" | "resolved";
}
```

---

## 5D: TTS Per-Message Indicator

### Problem
No visual indicator showing which message is currently playing TTS audio.

### Plan

#### 5D.1: Create `src/components/tts/tts-indicator.tsx`

**Visual design:**
```
┌───────────────────────────────────────┐
│ Haleth: "The path is dangerous."      │
│ [🔊 Playing... 0:12]                  │
└───────────────────────────────────────┘
```

**Props:**
```tsx
interface TTSIndicatorProps {
  isPlaying: boolean;
  duration?: number; // ms
  progress?: number; // 0-1
  onStop: () => void;
}
```

**Features:**
- Animated waveform icon when playing
- Duration display (elapsed / total)
- Progress bar
- Stop button
- Auto-hides when not playing

#### 5D.2: Create `src/components/tts/tts-controls.tsx`

**Chat header TTS toggle:**
```tsx
interface TTSControlsProps {
  enabled: boolean;
  onToggle: () => void;
  onSettings: () => void;
}
```

**Visual:**
```
Session: Eastern Ruins    [🔊] [⚙]
```

#### 5D.3: Create `src/components/tts/voice-picker.tsx`

**Visual design:**
```
┌─ Voice Assignment: Haleth ────────────┐
│                                         │
│ Voice: [af_bella ▼]                     │
│   ┌─────────────────────────────────┐  │
│   │ af_bella (American Female)      │  │
│   │ af_sky   (American Female)      │  │
│   │ af_heart (American Female)      │  │
│   │ am_adam  (American Male)        │  │
│   │ bf_emma  (British Female)       │  │
│   └─────────────────────────────────┘  │
│                                         │
│ Speed: [────●────] 1.0x                │
│ Volume: [───●──────] 80%               │
│                                         │
│ [Preview Voice]  [Save]                 │
└─────────────────────────────────────────┘
```

**Props:**
```tsx
interface VoicePickerProps {
  voices: VoiceInfo[];
  selectedVoice?: string;
  speed?: number;
  volume?: number;
  onVoiceChange: (voice: string) => void;
  onSpeedChange: (speed: number) => void;
  onVolumeChange: (volume: number) => void;
  onPreview: (voice: string) => void;
  onSave: () => void;
}
```

**Features:**
- Searchable dropdown with voice metadata
- Speed slider (0.5x - 2.0x)
- Volume slider (0% - 100%)
- Preview button (plays sample text)
- Save button

---

## 5E: Canon Layer Selector

### Problem
5-tier canon picker exists inline in lore editor only. Needs to be a reusable component.

### Plan

#### 5E.1: Create `src/components/lore/canon-layer-selector.tsx`

**Visual design:**
```
┌─ Canon Layer ─────────────────────────┐
│ ○ Immutable Canon (locked)            │
│ ○ Soft Canon                          │
│ ● Generated Lore                      │
│ ○ Session Lore                        │
│ ○ Rumor                               │
└───────────────────────────────────────┘
```

**Props:**
```tsx
interface CanonLayerSelectorProps {
  value: string;
  onChange: (tier: string) => void;
  disabled?: boolean;
  showDescriptions?: boolean;
}
```

**Features:**
- Radio-style selection
- Locked state for `immutable_canon` (cannot select if already set)
- Descriptions on hover
- Color-coded tiers

#### 5E.2: Create `src/components/lore/validation-badge.tsx`

**Visual design:**
```
🟢 Validated    🟡 Under Review    🔴 Rejected    ⚪ Unverified
```

**Props:**
```tsx
interface ValidationBadgeProps {
  state: "generated_unverified" | "under_review" | "validated" | "rejected";
  size?: "sm" | "md";
}
```

**Features:**
- Color-coded badge (green/yellow/red/gray)
- Tooltip with full state description
- Clickable to open validation review (optional)

---

## 5F: Backlink Panel

### Problem
`backlinks.ts` lib exists but no dedicated navigation panel component.

### Plan

#### 5F.1: Create `src/components/lore/backlink-panel.tsx`

**Visual design:**
```
┌─ Eastern Ruins ─────────────────────────┐
│                                         │
│ [Markdown content with live links]      │
│                                         │
│ ── Backlinks (3) ─────────────────────  │
│ ← Haleth's Report (mentions)            │
│ ← Orc Activity in the East (related)    │
│ ← Bree (nearby)                         │
│                                         │
│ ── Links To (2) ──────────────────────  │
│ → Ancient Watchtower (located_in)       │
│ → Weather Hills (nearby)                │
└─────────────────────────────────────────┘
```

**Props:**
```tsx
interface BacklinkPanelProps {
  entityType: string;
  entityId: string;
  entityName: string;
}
```

**Features:**
- Two sections: incoming backlinks + outgoing links
- Clickable links navigate to entity
- Link type badges
- Empty state when no links
- Loading state while fetching

---

## 5G: Inline-to-Component Extractions

### Problem
Large page files contain inline component code that should be extracted for reusability and maintainability.

### Plan

#### 5G.1: `ChatWindow` → `src/components/chat/chat-window.tsx`

**Extract from:** `session/[id]/page.tsx` (lines ~200-500)

**Current inline code:**
- Message list rendering
- Auto-scroll logic
- Streaming text display
- Typing indicator
- Empty state

**Props:**
```tsx
interface ChatWindowProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  onMessageAction: (action, id, content?) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}
```

#### 5G.2: `ParticipantList` → `src/components/session/participant-list.tsx`

**Extract from:** `session/[id]/page.tsx` (lines ~600-750)

**Current inline code:**
- Participant list rendering
- Invite form
- Kick button
- Role badges
- Turn indicators

**Props:**
```tsx
interface ParticipantListProps {
  participants: Participant[];
  isOwner: boolean;
  turnMode: string;
  currentTurn: string | null;
  onInvite: (username: string) => void;
  onKick: (userId: string) => void;
  onSetTurn: (userId: string) => void;
}
```

#### 5G.3: `SceneStatePanel` → `src/components/session/scene-state-panel.tsx`

**Extract from:** `session/[id]/page.tsx` (lines ~800-950)

**Current inline code:**
- Scene state display (location, goal, tone)
- Active NPCs list
- Active threads list
- Editable fields

**Props:**
```tsx
interface SceneStatePanelProps {
  scene: SceneState;
  isEditing: boolean;
  onEdit: (field: string, value: string) => void;
  onSave: () => void;
  onToggleEdit: () => void;
}
```

#### 5G.4: `EmotionBar` → `src/components/relationship/emotion-bar.tsx`

**Extract from:** `relationships/page.tsx` (lines ~40-55)

**Current inline code:**
- Emotion bar rendering
- Color mapping
- Percentage display

**Props:**
```tsx
interface EmotionBarProps {
  label: string;
  value: number;
  color?: string;
}
```

#### 5G.5: `RelationshipHistory` → `src/components/relationship/relationship-history.tsx`

**Extract from:** `relationships/page.tsx` (lines ~56-101)

**Current inline code:**
- Evolution timeline rendering
- Entry display with emotion bars
- Date formatting

**Props:**
```tsx
interface RelationshipHistoryProps {
  entries: EvolutionEntry[];
  loading: boolean;
}
```

#### 5G.6: `EventTimeline` → `src/components/narrative/event-timeline.tsx`

**Extract from:** `events/page.tsx`

**Current inline code:**
- Event list rendering
- Event type icons
- Importance badges
- Date display

**Props:**
```tsx
interface EventTimelineProps {
  events: Event[];
  loading: boolean;
  onEventClick: (id: string) => void;
}
```

#### 5G.7: `LoreBrowser` → `src/components/lore/lore-browser.tsx`

**Extract from:** `lore/page.tsx`

**Current inline code:**
- Lore file list rendering
- Type filtering
- Search
- Edit/delete buttons

**Props:**
```tsx
interface LoreBrowserProps {
  files: LoreFile[];
  loading: boolean;
  onEdit: (id: string, type: string) => void;
  onDelete: (id: string, type: string) => void;
  filter?: string;
  search?: string;
}
```

#### 5G.8: `SessionList` → `src/components/session/session-list.tsx`

**Extract from:** `dashboard/page.tsx`

**Current inline code:**
- Session list rendering
- Status badges
- Type badges (solo/group)
- Last activity display

**Props:**
```tsx
interface SessionListProps {
  sessions: Session[];
  loading: boolean;
  onSessionClick: (id: string) => void;
}
```

#### 5G.9: `SessionCreator` → `src/components/session/session-creator.tsx`

**Extract from:** `session/new/page.tsx`

**Current inline code:**
- Session creation form
- Type selection (solo/group)
- Universe selector
- Name input

**Props:**
```tsx
interface SessionCreatorProps {
  universes: Universe[];
  onCreate: (data: SessionCreateData) => void;
  onCancel: () => void;
}
```

---

## Execution Order

| Phase | Tasks | Estimated Files | Status |
|-------|-------|-----------------|--------|
| **5A** | Modal + ConfirmationDialog | 2 files + 11 page updates | ✅ Complete |
| **5B** | Relationship Graph + API | 2 files | ✅ Complete |
| **5C** | Importance Meter + Thread Tracker | 2 files | ✅ Complete |
| **5D** | TTS Indicator + Controls + Voice Picker | 3 files | ✅ Complete |
| **5E** | Canon Layer Selector + Validation Badge | 2 files | ✅ Complete |
| **5F** | Backlink Panel | 1 file | ✅ Complete |
| **5G** | 9 inline extractions | 9 files + 9 page updates | ✅ Complete |

**Total: ~21 new component files + 20 page updates complete**

---

## Validation

- [x] All new components exported and importable
- [x] All `confirm()` calls replaced with `<ConfirmationDialog>` (11 pages)
- [x] Graph API returns valid node/edge data
- [x] All pages render without errors (build passes)
- [x] Full test suite passes (Phase 3: 84/84, Phase 4: 87/87, Phase 7: 401/403)

### Files Created (21 total)
- `src/components/ui/modal.tsx` - Modal dialog system
- `src/components/ui/confirmation-dialog.tsx` - Confirmation dialog replacing native confirm()
- `src/components/relationship/relationship-graph.tsx` - SVG force-directed graph visualization
- `src/components/relationship/emotion-bar.tsx` - Single emotion value bar
- `src/components/relationship/relationship-history.tsx` - Evolution timeline
- `src/app/api/backlinks/graph/route.ts` - Graph data API endpoint
- `src/components/narrative/importance-meter.tsx` - 4-axis importance scoring display
- `src/components/narrative/thread-tracker.tsx` - Active narrative threads display
- `src/components/narrative/event-timeline.tsx` - Event list with type icons
- `src/components/tts/tts-indicator.tsx` - Per-message TTS playback indicator
- `src/components/tts/tts-controls.tsx` - TTS playback controls
- `src/components/tts/voice-picker.tsx` - Voice selection dropdown
- `src/components/canon/canon-layer-selector.tsx` - 5-tier canon selector
- `src/components/validation/validation-badge.tsx` - Validation status badge
- `src/components/backlinks/backlink-panel.tsx` - Backlink navigation panel
- `src/components/lore/lore-browser.tsx` - Lore file list browser
- `src/components/session/session-list.tsx` - Session list display
- `src/components/session/session-creator.tsx` - Session creation form
- `src/components/session/participant-list.tsx` - Participant management
- `src/components/session/scene-state-panel.tsx` - Scene state editor
- `src/components/chat/chat-window.tsx` - Chat message list + input

### Pages Updated (11 pages)
- `src/app/(app)/timeline/page.tsx` - ConfirmationDialog
- `src/app/(app)/relationships/page.tsx` - ConfirmationDialog, EmotionBar, RelationshipHistory
- `src/app/(app)/narrative-threads/page.tsx` - ConfirmationDialog
- `src/app/(app)/session/[id]/page.tsx` - ConfirmationDialog, ChatWindow, ParticipantList, SceneStatePanel
- `src/app/(app)/lore/page.tsx` - ConfirmationDialog, LoreBrowser
- `src/app/(app)/timeline/[id]/page.tsx` - ConfirmationDialog
- `src/app/(app)/session/page.tsx` - ConfirmationDialog, SessionList
- `src/app/(app)/events/page.tsx` - ConfirmationDialog, EventTimeline
- `src/app/(app)/characters/page.tsx` - ConfirmationDialog
- `src/app/(app)/universe/page.tsx` - ConfirmationDialog
- `src/app/(app)/session/new/page.tsx` - SessionCreator

### Bug Fixes
- Fixed `STATUS_COLORS` → `THREAD_STATUS_COLORS` in narrative-threads/page.tsx
- Fixed `ENTRY_TYPE_ICONS` usage in timeline/page.tsx (was referencing non-existent constant)
- Fixed `useEntityFetch` hook TypeScript error (undefined index type)
- Added `CANON_TIER_COLORS` to entity-constants.ts
- Replaced emoji placeholders with Lucide icons in ChatWindow component
