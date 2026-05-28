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
