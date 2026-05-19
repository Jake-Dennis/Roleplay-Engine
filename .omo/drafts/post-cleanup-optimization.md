# Draft: Post-Lore Cleanup & Optimization Plan

## User Request
"make a full plan for it all" — confirmed: ALL items

## Scope Items (confirmed)
1. Commit 121 uncommitted files (lore removal + wiki + cleanup improvements)
2. Run bundle analysis with `ANALYZE=true npx next build`
3. Convert client → server components (68 files with "use client")
4. Fix 34 empty catch blocks (11 files)
5. Remove `@types/uuid` leftover from devDependencies

## Current State
- 121 files modified/added/deleted, zero commits
- 68 "use client" components across routes and components
- 34 empty catch blocks (group-migrations.ts has 18 alone)
- `@types/uuid` in devDependencies but `uuid` not in dependencies
- Bundle analyzer installed but never run

## Research in Progress
- Explore agent 1: Analyzing which client components can become server components
- Explore agent 2: Categorizing empty catch blocks by risk level

## Plan Generated
Plan saved to `.omo/plans/post-cleanup-optimization.md`

### Key Decisions
- 3-wave structure: commit+analysis → conversions+fixes → cleanup
- Only 3 client→server candidates found (95.8% must stay client)
- 22 SAFE empty catches left alone (SQLite migrations, SSE drops)
- 11 SHOULD_LOG catches targeted for console.warn upgrade
- `importance-meter.tsx` has zero consumers — dead code but safe to convert
- `emotion-bar.tsx` + `relationship-history.tsx` need parent refactor (imported by client `relationships/page.tsx`)

## Constraints
- `npx next build` must pass at every phase
- No breaking changes to existing functionality
- No new external dependencies
