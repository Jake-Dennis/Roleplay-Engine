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
