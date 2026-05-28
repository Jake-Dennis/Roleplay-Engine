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

### Type checking
- `npx tsc --noEmit --pretty false` passes — only pre-existing `bun:test` errors in test files remain.
