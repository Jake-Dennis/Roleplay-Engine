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
