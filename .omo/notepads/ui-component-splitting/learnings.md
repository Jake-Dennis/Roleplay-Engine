# UI Component Splitting — Learnings

## Task 1: Shared Job Components

### What was done
- Added JOB_TYPES, JOB_TYPE_LABELS, STATUS_COLORS, PRIORITY_COLORS, Job, Stats exports to src/lib/jobs/types.ts
- Verified/updated 5 existing component files under src/components/jobs/

### Key observations
1. **Components already existed**: stats-cards.tsx, job-table.tsx, ilter-bar.tsx, eindex-section.tsx, jobs-header.tsx were already partially implemented. The existing job-table.tsx was surprisingly sophisticated with both "cards" and "table" variants.
2. **STATUS_COLORS shape**: Must be Record<string, { bg: string; text: string; dot: string }> to support the statusStyle.dot usage in job-table.tsx. The simpler Record<string, string> would break the colored status dot rendering.
3. **StatsCards API**: Spec says { stats: Stats } but a generic { items: StatCard[] } would be more flexible for both jobs page (5 cards) and admin page (4 cards with "Completed Today"). Went with spec-compliant { stats: Stats }.
4. **JobsHeader vs FilterBar**: The jobs page header has 6 action buttons (Refresh, Queue Idle, Process Next, Process All, Retry Failed, Cancel All). The admin page header has only a Refresh button. JobsHeader is designed for the full jobs page; admin page may use a simpler header.
5. **No import side-effects**: All components import from @/lib/jobs/types using named exports. No barrel exports anywhere — consistent with project conventions.
6. **"use client" decisions**: stats-cards.tsx doesn't need "use client" (pure render). All other components do (interactive buttons/handlers).

### Patterns discovered
- JobProgress is imported from @/components/jobs/job-progress — keeps the existing pattern.
- StatusBadge/statusToVariant from @/components/ui/status-badge — handles queued/processing/completed/failed/cancelled mapping via statusToVariant.
- ormatRelativeTime from @/lib/date-formatter — used for relative timestamps in job-table.
- safeParse from @/lib/safe-json — used for payload JSON parsing in job-table.

### Files created/modified
- src/lib/jobs/types.ts — Added 6 constants + 2 interfaces
- src/components/jobs/stats-cards.tsx — Updated to { stats: Stats } API
- src/components/jobs/filter-bar.tsx — Renamed props to match spec
- src/components/jobs/jobs-header.tsx — Rewritten from generic shell to full toolbar
- src/components/jobs/job-table.tsx — Verified (no changes needed)
- src/components/jobs/reindex-section.tsx — Verified (no changes needed)

## Task 2: Slim Jobs Page

### What was done
- Refactored `src/app/(app)/jobs/page.tsx` from 693 lines down to 246 lines (~64% reduction)
- Replaced 5 inline JSX sections with shared components: JobsHeader, StatsCards, FilterBar, ReindexSection, JobTable
- Removed duplicated constants/interfaces (JOB_TYPES, JOB_TYPE_LABELS, STATUS_COLORS, PRIORITY_COLORS, Job, Stats) — now imported from @/lib/jobs/types
- Removed helper functions (formatTime, formatAbsoluteTime, parsePayload) — now internal to JobTable
- Removed 15+ lucide-react icon imports — moved to sub-components

### What stayed in page
- All state declarations (keeping SSE, filter, loading, expanded, confirmation states)
- loadJobs callback (still uses activeUniverse and API)
- 3 useEffect hooks (initial load, 10s interval, SSE subscription with job:progress/completed/failed)
- All handler functions (processNext, processAll, cancel, cancelAll, retry, retryAll, queueIdle, reindex)
- filteredJobs computation (type filter still client-side)
- 3 ConfirmationDialog instances (cancel single job, cancel all, retry all)
- safeParse import (still used in SSE handler)

### Key observations
1. **StatsCards takes `stats: Stats` directly** — not `items: StatCard[]` as originally scoped. The component builds its own stat cards array internally. This meant the page no longer needs the statCards array at all.
2. **JobTable is self-sufficient** — handles loading, empty, and error states internally with loading and empty-state JSX. Only needs jobs array + handler props.
3. **FilterBar calls onStatusChange + onStatusFilterLoad** — the FilterBar already calls both on each click. onStatusChange sets the state while onStatusFilterLoad triggers API refresh. Used a single onStatusChange handler that does both setState + loadJobs.
4. **onCancel in JobTable vs confirmation** — JobTable's onCancel is called directly on button click (for queued jobs). The page wraps it in `(id) => setCancelTarget(id)` to show the ConfirmationDialog first. For retry, onRetry is called directly (no confirmation).
5. **onRetryAll/onCancelAll in JobsHeader** — these trigger the confirmation dialogs, not the actual cancel/retry. So they pass `() => setRetryAllConfirm(true)` and `() => setCancelAllConfirm(true)`.
6. **import type syntax** — Used `import type { Job, Stats } from "@/lib/jobs/types"` as a type-only import to avoid runtime bundling issues.
7. **safeParse stays in page** — The SSE handler uses safeParse directly to parse event data. It can't be moved to JobTable because the SSE subscription happens in the page.

### Line count comparison
- Before: 693 lines (all inline JSX)
- After: 246 lines (shared components + orchestration)
- Reduction: 64.5%

### Files modified
- src/app/(app)/jobs/page.tsx — Major refactor (693 → 246 lines)

### Verification
- `npx tsc --noEmit --pretty false` passes clean for jobs page and all non-test files.
- The only errors are pre-existing test file issues (`bun:test` module not found) in `src/lib/__tests__/safe-json.test.ts` and `src/lib/jobs/__tests__/npc-wiki-sync.test.ts` — unrelated to jobs page.
- Page is 246 lines, well under the ~250 target.
- All 6 expected outcome imports confirmed: StatsCards, JobTable, FilterBar, ReindexSection, JobsHeader, and types from @/lib/jobs/types.
- All 3 ConfirmationDialogs retained in page.
- SSE subscription, loadJobs/process/cancel/retry handlers, filter/expanded/cancelTarget state all preserved.

## Task 3: Personas Page Splitting

### What was done
- Extracted all inline UI from `src/app/(app)/personas/page.tsx` (570 lines) into 9 files under `src/components/personas/`
- Page slimmed from ~570 to 265 lines (~53% reduction)
- Removed 15+ lucide-react icon imports — moved to sub-components
- Removed inline `Persona` interface and `TabKey` type — moved to `persona-types.ts`

### Files created
| File | Lines | Purpose |
|------|-------|---------|
| `src/components/personas/persona-types.ts` | 21 | `Persona` interface + `TabKey` type |
| `src/components/personas/persona-list.tsx` | 68 | Left sidebar: persona items, selection highlight, "New" button, active badge |
| `src/components/personas/persona-editor.tsx` | 161 | Right editor panel: header, tabs, action buttons, slot for children |
| `src/components/personas/persona-preview.tsx` | 106 | Read-only preview of all persona fields (server component) |
| `src/components/personas/persona-tab-description.tsx` | 65 | Tab: name, description, tags, writing style fields |
| `src/components/personas/persona-tab-personality.tsx` | 25 | Tab: personality textarea |
| `src/components/personas/persona-tab-scenario.tsx` | 25 | Tab: scenario textarea |
| `src/components/personas/persona-tab-dialogue.tsx` | 38 | Tab: first message + example dialogue |
| `src/components/personas/persona-tab-advanced.tsx` | 63 | Tab: system prompt, post-history, creator notes, LLM model |

### What stayed in page
- All 14 `useState` declarations
- `useEffect` for initial load
- `loadPersonas()`, `startCreate()`, `selectPersona()`, `cancelEdit()`, `handleSave()`, `handleDelete()`, `handleActivate()`
- `handleFieldChange()` — dispatches to individual setState via switch
- `safeParse` import (still used in `selectPersona` tags parsing)
- Loading state JSX (trivial, 4 lines)
- Main layout div with `PersonaList` + `PersonaEditor` composition

### Key observations
1. **Editor uses `children` slot** — `PersonaEditor` accepts `children: ReactNode` and renders either tabs or preview content inside it. This keeps the tab-switching logic (`showPreview ? <Preview> : tab === "description" ? <DescTab> : ...`) in the page, not the editor.
2. **Tab components are server components** — No `"use client"` on any tab or preview. They receive `onChange` callbacks and render form fields. Interactivity is pushed up to the page.
3. **`handleFieldChange` pattern** — Single dispatch function vs. individual setState calls reduces prop drilling. Each tab receives `onChange={(field, value) => ...}` instead of needing `onNameChange`, `onDescriptionChange`, etc.
4. **`activePersonaId` computed in page** — `personas.find(p => p.is_active === 1)?.id ?? null` is computed in the page and passed to `PersonaList` as `activePersonaId`. The list uses this to show the "Active" badge.
5. **`isEmpty` prop in editor** — `PersonaEditor` receives `isEmpty={!selectedId && !creating}` and renders the empty state inline. No need for a separate empty-state component.
6. **Tab icons in editor** — `TABS` constant array with `{ key, label, icon }` is internal to `persona-editor.tsx`. Cleaner than inline mapping in JSX.
7. **PersonaPreview lost its outer scroll wrapper** — The old inline preview had `<div className="flex-1 overflow-y-auto space-y-4">` wrapping the preview card. The extracted component renders just the card. The scroll wrapper is now in `PersonaEditor`'s content area (`<div className="flex-1 overflow-y-auto">{children}</div>`).

### Line count comparison
- Before: ~570 lines (all inline JSX)
- After: 265 lines (orchestration only)
- Reduction: ~53%

### Files modified
- src/app/(app)/personas/page.tsx — Major refactor (~570 → 265 lines)

---

## Task 22b: Refactor admin jobs page to use shared job components

**Date:** 2026-05-29

### Outcome
Reduced `src/app/(app)/admin/jobs/page.tsx` from 582 lines to ~180 lines by replacing inline JSX with shared job components.

### Changes made
- **StatsCards**: Added optional `items: StatCardItem[]` and `className?: string` props (backward-compatible). Admin page renders 4 custom stat cards (Queued, Processing, Failed, Completed Today) instead of the default 5.
- **FilterBar**: Used for status + type filter buttons. Date range filters remain inline as admin-only addition.
- **JobTable**: Used with `variant="table"` to replace the ~150-line inline table. `onCancel`/`onRetry` callbacks open admin-specific ConfirmationDialogs before executing.
- **Types**: Removed duplicate `JOB_TYPES`, `JOB_TYPE_LABELS`, `Job`, `Stats` declarations (85 lines) — imported from `@/lib/jobs/types`.

### Components NOT used from Task 1
- **ReindexSection**: Not applicable to admin page (regular jobs page only).
- **JobsHeader**: Admin page has a distinct header — Shield icon, "Admin: Job Queue" title, single Refresh button. Too different from JobsHeader's action toolbar (Queue Idle, Process Next, etc.).

### Admin-specific JSX preserved inline
- Header (Shield icon, unique title, Refresh-only toolbar)
- Date range filters (outside FilterBar, same flex row)
- Auto-refresh indicator (pulsing dot + "Auto-refreshing every 10s")
- ConfirmationDialogs for cancel/retry (admin confirms before API calls)
- SSE subscription with admin-specific progress/event handlers

### Type checking
- `npx tsc --noEmit --pretty false` passes — only pre-existing `bun:test` errors in test files remain.

---

## Task 4: Refactor Admin Jobs Page

**Date:** 2026-05-29

### What was done
- Refactored `src/app/(app)/admin/jobs/page.tsx` from 582 lines down to 310 lines (~47% reduction)
- Replaced 3 inline JSX sections with shared components: StatsCards, FilterBar, JobTable
- Removed duplicate constants/interfaces (85 lines): `JOB_TYPES`, `JOB_TYPE_LABELS`, `Job`, `Stats` — now imported from `@/lib/jobs/types`
- Removed imports: `StatusBadge`, `statusToVariant`, `JobProgress`, `formatRelativeTime`, `AlertTriangle`, `Filter`, `ListTodo`, `RotateCcw`

### Shared components used
| Component | Usage | Props |
|-----------|-------|-------|
| `StatsCards` | Custom 4-card layout (Queued, Processing, Failed, Completed Today) | `stats`, `items: StatCardItem[]`, `className="grid-cols-4"` |
| `FilterBar` | Status + type filter buttons | `status`, `type`, `onStatusChange`, `onTypeChange` |
| `JobTable` | Admin table variant (no expand, no cards) | `jobs`, `loading`, `variant="table"`, `onCancel`, `onRetry`, `actionLoading` |

### Components NOT used (admin-specific reasons)
- **JobsHeader**: Admin header uses Shield icon + "Admin: Job Queue" title + single Refresh button. JobsHeader's toolbar (Queue Idle, Process Next, Process All, Retry Failed, Cancel All) is irrelevant for admin.
- **ReindexSection**: Admin page doesn't manage wiki reindexing — that's on the regular jobs page.

### Admin-specific logic preserved inline
- **Date range filters**: FilterBar doesn't support date range. Two `<input type="date">` elements kept inline, positioned below FilterBar in the same flex row.
- **Auto-refresh indicator**: Pulsing dot + "Auto-refreshing every 10s" text — preserved inline for admin visibility.
- **ConfirmationDialogs**: Admin requires confirmation before both cancel AND retry (regular page only confirms cancel). Both ConfirmationDialog instances kept inline.
- **SSE subscription**: Same `/api/jobs/stream` endpoint as regular page. Admin uses `job:progress` to update individual job progress, plus `job:completed`/`job:failed` to full-refresh.

### Key observations
1. **StatsCards accepts custom `items`** — The admin page uses 4 custom stat cards that differ from the default 5 (replaces Completed+Total with "Completed Today"). The `items` prop on StatsCards allows this customization via `StatCardItem[]`.
2. **`variant="table"` on JobTable** — The admin table renders columns: Status, Type, Created, Attempts, Progress/Error, Actions. Same columns as the original inline table.
3. **Confirmation before retry** — Unlike the regular jobs page (which retries directly on button click), the admin page requires an extra confirmation step: `onRetry={(id) => setRetryTarget(id)}` → ConfirmationDialog → `handleRetry(retryTarget)`.
4. **`actionLoading` shared with JobTable** — The admin page's `actionLoading` state is passed to JobTable, which disables action buttons during API calls. Matches behavior of the original inline actions.
5. **No `expandedId`** — Admin page uses `variant="table"` so `expandedId` and `onToggleExpand` are omitted from JobTable props entirely. Saves 2 state variables vs the regular jobs page.

### Line count comparison
- Before: 582 lines (all inline JSX)
- After: 310 lines (shared components + orchestration)
- Reduction: 46.7%

### Files modified
- src/app/(app)/admin/jobs/page.tsx — Major refactor (582 → 310 lines)

### Verification
- `npx tsc --noEmit --pretty false` passes — only pre-existing `bun:test` errors in test files remain.
- LSP diagnostics clean on the refactored file.

---

## Task ??: Extract Persona page inline UI into reusable components

**Date:** 2026-05-29

### Source
`src/app/(app)/personas/page.tsx` — 598 lines, zero component imports, all JSX inline.

### Target
9 new component files under `src/components/personas/`.

### Extracted components

| Component | File | Type | Props | Notes |
|-----------|------|------|-------|-------|
| `PersonaList` | `src/components/personas/persona-list.tsx` | Client | `personas`, `selectedId`, `onSelect`, `onCreateNew`, `activePersonaId?` | Left sidebar. Uses `"use client"` for onClick handlers. Active badge shown via `activePersonaId` or `is_active===1`. |
| `PersonaEditor` | `src/components/personas/persona-editor.tsx` | Client | `isEmpty`, `formName`, `isActive`, `activeTab`, `showPreview`, `saving`, `hasSelection`, `isCreating`, `onTabChange`, `onSave`, `onDelete`, `onCancel`, `onTogglePreview`, `onActivate`, `children` | Wraps header + tab nav + content area. Tabs hidden when `showPreview=true`. Children rendered inside `flex-1 overflow-y-auto` scroll container. |
| `PersonaPreview` | `src/components/personas/persona-preview.tsx` | Server | Same 11 form field strings as original | Exact copy of the PersonaPreview function — no `"use client"`. Removed outer `flex-1 overflow-y-auto` wrapper since editor provides scroll container. |
| `PersonaTabDescription` | `src/components/personas/persona-tab-description.tsx` | Server | `formName`, `formDescription`, `formTags`, `formWritingStyle`, `onChange` | Name input + Description textarea + Tags input + Writing Style input. |
| `PersonaTabPersonality` | `src/components/personas/persona-tab-personality.tsx` | Server | `formPersonality`, `onChange` | Single Personality textarea. |
| `PersonaTabScenario` | `src/components/personas/persona-tab-scenario.tsx` | Server | `formScenario`, `onChange` | Single Scenario textarea. |
| `PersonaTabDialogue` | `src/components/personas/persona-tab-dialogue.tsx` | Server | `formFirstMes`, `formMesExample`, `onChange` | First Message + Example Dialogue textareas. `font-mono` on mes_example preserved. |
| `PersonaTabAdvanced` | `src/components/personas/persona-tab-advanced.tsx` | Server | `formSystemPrompt`, `formPostHistory`, `formCreatorNotes`, `formLlmModel`, `onChange` | System Prompt, Post-History, Creator Notes textareas + LLM Model input. |

### Shared types
- **File:** `src/components/personas/persona-types.ts`
- **Exports:** `Persona` interface (16 fields), `TabKey` type (5 string union)
- **No `"use client"`** — pure type exports
- Imported by page and all component files

### Key decisions
- **Tab components are server components** — no `"use client"`. They receive form values and a single `onChange(field, value)` callback. The page handles field->setState mapping via a `switch` statement in `handleFieldChange()`.
- **`PersonaList` receives `activePersonaId`** (not `activePersona: Persona | null`) — the page computes it: `personas.find(p => p.is_active === 1)?.id ?? null`.
- **`PersonaEditor` uses boolean props** (`isEmpty`, `hasSelection`, `isCreating`, `showPreview`) rather than computing them internally — keeps logic in the page.
- **Editor wraps children in scroll container** — tab components and PersonaPreview no longer have their own `flex-1 overflow-y-auto`.
- **No `persona` prop on tab components** — each tab receives only the form values it needs. The `persona` prop from the task spec was removed as unused (dead code).
- **TABS constant** defined inside `persona-editor.tsx` — 5-tuple of `{ key, label, icon }` for the tab navigation bar.

### Result
- Page slimmed from 598 -> ~260 lines (form state, handlers, effects, component composition)
- No CSS/behavior changes
- `npx tsc --noEmit --pretty false` passes (only pre-existing `bun:test` errors)

---

## Task 19c: Extract SessionHeader, GenerationErrorBanner, TTSPlayback

**Date:** 2026-05-29

### Source
`src/app/(app)/session/[id]/page.tsx` — 1012 lines, 13 already-extracted components remaining.

### Components extracted

| Component | File | Type | Props | Notes |
|-----------|------|------|-------|-------|
| `SessionHeader` | `src/components/session/session-header.tsx` | Client | `sessionId`, `sessionName`, `messageCount`, `isGroup`, `personas`, `personasLoading`, `activePersonaId`, `hasSceneState`, `showScenePanel/ParticipantPanel/PrivatePanel/RelationshipTimeline/RecapPanel`, `activeLocationId?`, `onPersonaChange`, `onToggleScenePanel/ParticipantPanel/PrivatePanel/RelationshipTimeline/RecapPanel` | Manages persona dropdown state and click-outside handler internally. Conditionally renders MapPin button based on `hasSceneState`. |
| `GenerationErrorBanner` | `src/components/session/generation-error-banner.tsx` | Client | `message: string \| null`, `onDismiss: () => void` | Returns `null` when `message` is falsy. Minimal presentational component. |
| `TTSPlayback` | `src/components/session/tts-playback.tsx` | Client | `children: (props: TTSPlaybackRenderProps) => React.ReactNode` | Render-prop pattern. Encapsulates all TTS audio state (`ttsPlayingId`, `ttsAudioRef`, `ttsBlobUrlRef`), voice assignment loading, audio cleanup, and `handleTtsPlay` (streaming + fallback). Renders nothing itself — delegates rendering to children render prop. |

### Key decisions

- **`SessionHeader`** manages persona dropdown open/close state internally (`showPersonaSelector`, `personaDropdownRef`, click-outside handler). The page doesn't need to know about it.
- **`SessionHeader`** imports `ChatSearch` and `ChatExport` internally since they're always rendered as part of the header bar.
- **`SessionHeader`** receives `hasSceneState` boolean (not the full `sceneState` object) to conditionally render the MapPin button. This keeps the prop interface minimal and decouples from the session hook's shape.
- **`GenerationErrorBanner`** uses `"use client"` despite minimal interactivity — the `onClick` dismiss handler requires client rendering.
- **`TTSPlayback`** uses a **render-prop pattern** (function as children) rather than callbacks or `forwardRef`. This fully encapsulates TTS state (`ttsPlayingId`, refs, effects) while giving the parent reactive access to `ttsPlayingId` and `handleTtsPlay` without extra state management.
  - Uses `ttsPlayingIdRef` (a ref synced to state via `useEffect`) inside `handleTtsPlay` to avoid recreating the callback when `ttsPlayingId` changes — prevents infinite render cycles with `useCallback`.
  - Loads narrator voice assignment from `/api/voice-assignments` on mount, same as original page code.
  - The `handleTtsPlay` callback depends only on `[defaultVoice]`, recreating only when voice assignment loads from the API.
- **Page file** lost ~150 lines (header JSX ~130 lines, error banner ~12 lines, TTS handler/effects/state ~100 lines minus the 3 new import lines and TTSPlayback JSX overhead). Net reduction: ~240 lines (from 1012 to ~770).

### Props interface design (anti-pattern avoided)

The original page passed `sceneState` to the header via direct closure access and used `sceneState && (...)` to conditionally render the MapPin button. The extracted `SessionHeader` could have accepted the full `sceneState` object, but this would couple the component to the session hook's shape. Instead, `hasSceneState: boolean` and `activeLocationId?: string | null` are the only scene-related props — minimal surface area.

### TTS state removed from page
- `ttsPlayingId` (useState) — now inside TTSPlayback
- `defaultVoice` (useState) — now inside TTSPlayback
- `ttsAudioRef` (useRef) — now inside TTSPlayback
- `ttsBlobUrlRef` (useRef) — now inside TTSPlayback
- Voice assignment loading effect — now inside TTSPlayback
- Audio cleanup on unmount effect — now inside TTSPlayback
- `handleTtsPlay` function (~100 lines) — now inside TTSPlayback
- `showPersonaSelector` (useState) — now inside SessionHeader
- `personaDropdownRef` (useRef) — now inside SessionHeader
- Click-outside handler effect — now inside SessionHeader

### Imports moved from page to SessionHeader
- `Link` from `next/link`
- `ArrowLeft`, `MapPin`, `Users`, `Lock`, `Heart`, `User`, `Loader2`, `ChevronDown`, `ChevronUp` from `lucide-react`
- `ChatSearch` from `@/components/chat/chat-search`
- `ChatExport` from `@/components/chat/chat-export`

### Type checking
- `npx tsc --noEmit --pretty false` passes — only pre-existing `bun:test` errors remain.
