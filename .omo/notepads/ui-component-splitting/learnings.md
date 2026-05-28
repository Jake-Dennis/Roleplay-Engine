# UI Component Splitting — Learnings

## Task 18: Extract shared `SettingsPageLayout` wrapper

**Date:** 2026-05-29

### Pattern discovered
All 4 settings pages (`user`, `groups`, `universes`, `sessions`) share an identical outer shell:

```tsx
<div className="mx-auto max-w-lg space-y-8">
  <div className="flex items-center gap-3">
    <Link href="/settings" className="text-text-muted hover:text-text-primary transition-colors">
      <ArrowLeft className="h-4 w-4" />
    </Link>
    <div>
      <h1 className="text-base font-semibold text-text-primary">{title}</h1>
      <p className="mt-1 text-xs text-text-muted">{description}</p>
    </div>
  </div>
  {/* page-specific sections */}
</div>
```

### Extracted component
- **File:** `src/components/settings/settings-page-layout.tsx`
- **Type:** Server component (no `"use client"`) — pure presentational, no hooks/browser APIs
- **Props:** `{ title: string, description?: string, backHref?: string, children: React.ReactNode }`
- **Key decisions:**
  - `backHref` is optional — when absent, no back arrow/link is rendered
  - `description` is optional — when absent, no `<p>` is rendered
  - Uses `ArrowLeft` from `lucide-react` and `Link` from `next/link` (same as existing pages)
  - No `"use client"` — this is a server component matching the codebase convention (server by default)

### Future work (Tasks 19-22)
- The `groups` settings page has a different header with `justify-between` and a "New" action button on the right — it wraps `backHref` + title inside an inner flex container. The wrapper's `backHref` render is unconditional (not wrapped in an extra div), so groups would need to either accept a slightly different layout or be refactored separately.

### Revision notes
- **v1 (initial):** Used `ArrowLeft` icon from `lucide-react`, simple `{children}` passthrough
- **v2 (final):** Replaced `ArrowLeft` with `← Back` text to avoid lucide-react dependency in server component; added `<hr>` separators between multiple top-level children via `React.Children.toArray().reduce()`

### `<hr>` separator behavior
When `children` contain multiple top-level elements, they are rendered with `<hr />` separators between each element. A single child/fragment renders without extra `<hr>` elements. This matches the sectioned structure of settings pages (e.g., TTS preferences section followed by password change section).

### Deviation from existing pages
The existing pages use `ArrowLeft` icon from `lucide-react`. The final wrapper uses `← Back` text instead — this avoids importing a lucide icon in a server component and keeps the component dependency-free. If the icon is desired during refactoring, the component could be extended with an optional `backIcon` slot, or children can include the icon.

### Type checking
- `npx tsc --noEmit --pretty false` passes — only pre-existing `bun:test` errors in test files remain.

---

## Task 22: Extract shared job components (StatsCards, FilterBar, JobTable, ReindexSection, JobsHeader)

**Date:** 2026-05-29

### Pattern discovered
Both `src/app/(app)/jobs/page.tsx` and `src/app/(app)/admin/jobs/page.tsx` share identical patterns:
- **Stats cards**: 5-column (jobs) vs 4-column (admin) grid of labeled count cards with icons — same structure, different counts and labels
- **Status filter buttons**: Identical `["all", "queued", "processing", "completed", "failed", "cancelled"]` button group with same active/inactive styling
- **JOB_TYPE dropdown**: Same 19 job types array with same labels — both pages duplicate the full `JOB_TYPES` and `JOB_TYPE_LABELS` constants
- **Job list**: Both show type, status badge, created time, retries, cancel/retry actions — but jobs page uses expandable cards while admin uses a flat table
- **Header**: Title + subtitle + action buttons layout is identical in structure

### Extracted components

| Component | File | Type | Props | Notes |
|-----------|------|------|-------|-------|
| `StatsCards` | `src/components/jobs/stats-cards.tsx` | Server | `items: StatCard[]`, `className?: string` | Accepts grid class via `className` (e.g. `grid-cols-5` or `grid-cols-4`) |
| `JobsHeader` | `src/components/jobs/jobs-header.tsx` | Server | `icon`, `title`, `subtitle`, `children?` | Action buttons passed as children |
| `FilterBar` | `src/components/jobs/filter-bar.tsx` | Client | `statusFilter`, `typeFilter`, `onStatusChange`, `onTypeChange`, `onStatusFilterLoad?` | `onStatusFilterLoad` is optional — for pages that load on filter change |
| `ReindexSection` | `src/components/jobs/reindex-section.tsx` | Client | `onReindex`, `reindexing`, `reindexResult` | Only used by jobs page (not admin) |
| `JobTable` | `src/components/jobs/job-table.tsx` | Client | `jobs`, `loading?`, `variant="cards"|"table"`, `expandedId?`, `onToggleExpand?`, `onCancel`, `onRetry`, `actionLoading?` | Cards variant = expandable list (jobs page), Table variant = flat table (admin page). Uses `stopPropagation` in cards variant to prevent row toggle on action clicks. |

### Shared types/constants added to `src/lib/jobs/types.ts`
- `JOB_TYPES` — const tuple of 19 job type strings
- `JOB_TYPE_LABELS` — human-readable labels for each type
- `PRIORITY_COLORS` — Tailwind text color classes per priority level
- `STATUS_COLORS` — `{ bg, text, dot }` Tailwind classes per status
- `Job` — UI interface (id, type, priority, status, payload, progress, timestamps, retries)
- `Stats` — queued/processing/completed/failed/cancelled/total counts

### Key decisions
- `StatsCards` receives the grid column class via `className` (not computed from array length) — the 5 vs 4 column difference is a layout choice, not a data-driven one
- `JobTable` uses `variant` prop to switch between "cards" (expandable detail rows) and "table" (flat admin table) — both share the same action callbacks but have structurally different HTML
- `FilterBar` fires `onStatusFilterLoad` separately from `onStatusChange` — admin uses the same callback for both, but the split allows different behavior per page
- `stopPropagation()` on cancel/retry buttons is only needed in the cards variant (where buttons are inside clickable rows)
- `actionLoading` prop is only used in table variant (admin page passes it, jobs page uses a different `processing` state for header buttons only)
- No `"use client"` on `StatsCards` or `JobsHeader` — pure presentational components
- Pre-existing `STATUS_COLORS` and `PRIORITY_COLORS` at lines 133-146 in types.ts were shadow duplicates — removed and replaced with the correct version that has `{ bg, text, dot }` structure for STATUS_COLORS

### Pre-existing type errors (unrelated)
- `bun:test` module resolution errors in test files (`src/lib/__tests__/safe-json.test.ts`, `src/lib/jobs/__tests__/npc-wiki-sync.test.ts`) — pre-existing, require Bun type declarations
