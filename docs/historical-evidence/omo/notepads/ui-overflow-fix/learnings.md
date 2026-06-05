# UI Overflow Fix — Learnings

## Date: 2026-05-21

## Problem
Session page had vertical overflow causing unwanted scrollbar. Root cause: `py-6` padding on main wrapper + `h-[calc(100vh-3rem)]` on session page caused content to exceed viewport height.

## Fix Applied
### `src/app/(app)/app-layout-shell.tsx`
- `<main className="relative flex-1">` → `<main className="relative flex-1 overflow-hidden">`
- `<div className="mx-auto max-w-5xl px-6 py-6">` → `<div className="mx-auto h-full max-w-5xl px-6 py-3">`

### `src/app/(app)/session/[id]/page.tsx`
- `<div className="flex h-[calc(100vh-3rem)] flex-col">` → `<div className="flex h-full flex-col">`

## Verification
- `npx next build` passes cleanly
- No sidebar changes
- No other pages affected
- No new dependencies added

## Key Insight
Using `h-[calc(100vh-3rem)]` is fragile — it hardcodes assumptions about header/sidebar height. `h-full` with proper parent constraints (`flex-1` + `overflow-hidden`) is more robust and adapts to layout changes automatically.
