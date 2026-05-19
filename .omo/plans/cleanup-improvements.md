# Codebase Cleanup & Improvement

**Goal**: Clean up dead code, add error boundaries, improve wiki UX, and optimize build size.

**Strategy**: Four parallel workstreams, executed in dependency order. Dead code cleanup first (reduces surface area), then error boundaries and wiki UX in parallel, build optimization last (after all other changes).

---

## TL;DR

> **Quick Summary**: Sweep dead code (6 dead files, 1 dead component, 1 unused dependency), add per-route error boundaries, add wiki edit/preview/revision features, and optimize bundle by removing unused deps.
>
> **Deliverables**:
> - 6 dead files deleted, 1 dead component deleted, `uuid` dependency removed
> - Error boundaries on all major route groups
> - Wiki: edit mode, preview toggle, revision history
> - Build size: remove `uuid`, consolidate `jsonwebtoken`/`jose`
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Wave 1 (dead code) → Wave 2 (error boundaries + wiki) → Wave 3 (build optimization)

---

## Context

### Dead Code Audit Results

| File/Item | Status | Reason |
|-----------|--------|--------|
| `src/lib/markdown.ts` | DEAD | Zero importers — replaced by `markdown-utils.ts` + `wiki/wikilinks.ts` |
| `src/lib/context-compression.ts` | DEAD | Zero importers |
| `src/lib/importance-scoring.ts` | DEAD | Zero importers |
| `src/lib/user-overrides.ts` | DEAD | Zero importers |
| `src/components/validation/validation-badge.tsx` | DEAD | Zero importers |
| `src/components/validation/` | DEAD | Only contains validation-badge.tsx |
| `uuid` (package.json dep) | UNUSED | Codebase uses `crypto.randomUUID()` (43 calls) |
| `jsonwebtoken` (package.json dep) | Used | Only in `src/lib/auth.ts` — overlaps with `jose` |

### Error Boundary Audit

| Item | Status |
|------|--------|
| `src/app/(app)/error.tsx` | EXISTS — covers all routes under `(app)` |
| `src/app/(app)/global-error.tsx` | EXISTS — covers root-level crashes |
| Per-route error boundaries | MISSING — no `error.tsx` under `/wiki/`, `/session/`, `/timeline/`, etc. |
| Empty catch blocks | 212 instances across 76 files — many silently swallow errors |

### Wiki UX Audit

| Feature | Status |
|---------|--------|
| Page view | ✅ Exists (`wiki/[...slug]/page.tsx`) |
| File tree navigation | ✅ Exists (`components/wiki/file-tree.tsx`) |
| Search | ✅ Exists (`components/wiki/search.tsx`) |
| Graph view | ✅ Exists (`wiki/graph/page.tsx`) |
| Backlinks | ✅ Exists (`components/wiki/backlink-panel.tsx`) |
| Markdown rendering | ✅ Exists (`components/wiki/markdown-renderer.tsx`) |
| **Edit mode** | ❌ Missing |
| **Preview toggle** (raw/edit) | ❌ Missing |
| **Revision history** | ❌ Missing |
| **Diff view** | ❌ Missing |
| **Page creation** | ❌ Missing |
| **Page delete** | ❌ Missing |

### Build Size Audit

| Item | Impact |
|------|--------|
| `uuid` package | ~3KB — unused, can remove |
| `jsonwebtoken` + `jose` overlap | `jsonwebtoken` only used in `auth.ts` — `jose` already handles JWT |
| 74 client components ("use client") | Large client bundle — many could be server components |
| No bundle analyzer | Need to add `@next/bundle-analyzer` for visibility |

---

## Work Objectives

### Core Objective
Clean up dead code, add error resilience, improve wiki usability, and reduce bundle size.

### Concrete Deliverables
- Delete 6 dead files + 1 dead component directory
- Remove `uuid` from package.json
- Add `error.tsx` to wiki, session, timeline route groups
- Add wiki edit mode with raw/preview toggle
- Add wiki revision history API + UI
- Add bundle analyzer script

### Definition of Done
- [x] `npx next build` succeeds
- [x] Zero dead code files remain
- [x] Error boundaries exist on all major route groups
- [x] Wiki has edit + preview + revision history
- [x] `uuid` removed from package.json

### Must Have
- All dead code removed without breaking functionality
- Error boundaries use existing pattern (error.tsx + global-error.tsx)
- Wiki edit preserves existing view mode
- Build passes at every step

### Must NOT Have (Guardrails)
- No breaking changes to existing wiki view
- No changes to auth flow (jsonwebtoken/jose decision is conservative)
- No new external dependencies (except bundle analyzer as devDep)
- No AI slop: no excessive comments, no over-abstraction

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (no test framework)
- **Automated tests**: None
- **Agent-Executed QA**: ALL verification via `npx next build` + manual grep

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - dead code cleanup):
├── Task 1: Delete dead library files (markdown.ts, context-compression.ts, importance-scoring.ts, user-overrides.ts)
├── Task 2: Delete dead component (validation-badge.tsx + validation/ dir)
├── Task 3: Remove uuid dependency + cleanup scripts
└── Task 4: Update markdown-utils.ts comment

Wave 2 (After Wave 1 - error boundaries + wiki UX, MAX PARALLEL):
├── Task 5: Add error.tsx to wiki route group
├── Task 6: Add error.tsx to session route group
├── Task 7: Add error.tsx to timeline route group
├── Task 8: Wiki edit mode + raw/preview toggle ✅
└── Task 9: Wiki revision history API ✅

Wave 3 (After Wave 2 - build optimization):
├── Task 10: Add bundle analyzer + run initial analysis ✅
└── Task 11: Review jsonwebtoken/jose overlap ✅ — consolidated to jose

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
```

### Dependency Matrix
- **1-4**: No dependencies — all parallel
- **5-9**: Depend on Wave 1 (clean codebase) — all parallel within Wave 2
- **10-11**: Depend on Wave 2 (all other changes applied) — parallel
- **F1-F4**: Depend on ALL tasks complete

### Agent Dispatch Summary
- **Wave 1**: 4 tasks → `quick` × 4
- **Wave 2**: 5 tasks → `quick` × 3 (error boundaries), `visual-engineering` × 1 (wiki edit), `unspecified-high` × 1 (revision API)
- **Wave 3**: 2 tasks → `quick` × 1, `unspecified-low` × 1
- **FINAL**: 4 tasks → `oracle`, `unspecified-high` × 2, `deep`

---

## TODOs

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
- [x] F2. **Code Quality Review** — `unspecified-high`
- [x] F3. **Real Manual QA** — `unspecified-high`
- [x] F4. **Scope Fidelity Check** — `deep`

---

## Commit Strategy

- **1**: `chore(cleanup): remove dead code files` - 4 files deleted
- **2**: `chore(cleanup): remove dead validation component` - validation/ dir deleted
- **3**: `chore(deps): remove unused uuid dependency` - package.json
- **4**: `chore(cleanup): update markdown-utils comment` - 1 file
- **5**: `feat(error): add wiki error boundary` - wiki/error.tsx
- **6**: `feat(error): add session error boundary` - session/error.tsx
- **7**: `feat(error): add timeline error boundary` - timeline/error.tsx
- **8**: `feat(wiki): add edit mode with preview toggle` - wiki edit UI
- **9**: `feat(wiki): add revision history API` - wiki revisions API
- **10**: `chore(build): add bundle analyzer` - devDep + script
- **11**: `chore(deps): review jsonwebtoken/jose overlap` - decision

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: succeeds
grep -r "from.*@/lib/markdown['\"]" src/  # Expected: 0 matches
grep -r "from.*uuid" src/  # Expected: 0 matches
```

### Final Checklist
- [x] All dead code removed
- [x] Error boundaries on wiki, session, timeline
- [x] Wiki edit + preview + revision history working
- [x] `uuid` removed from package.json
- [x] `npx next build` passes
