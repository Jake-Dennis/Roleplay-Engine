# Post-Lore Cleanup & Optimization

## TL;DR

> **Quick Summary**: Commit 121 uncommitted files, run bundle analysis, convert 3 client→server components, fix 11 fire-and-forget empty catches, remove `@types/uuid` leftover.
>
> **Deliverables**:
> - 121 files committed in atomic groups
> - Bundle analysis report generated
> - 3 components converted from client to server
> - 11 empty catches upgraded with `console.warn`
> - `@types/uuid` removed from devDependencies
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Commit → Bundle Analysis → Client→Server → Empty Catch Fix

---

## Context

### Current State
- 121 files modified/added/deleted, zero commits
- 71 files with `"use client"` directive
- 38 empty catch blocks across 13 files
- `@types/uuid` in devDependencies but `uuid` not in dependencies
- Bundle analyzer installed but never run

### Client→Server Audit Results

| Verdict | Count | Files |
|---------|-------|-------|
| CAN_BE_SERVER | 3 | `relationship-history.tsx`, `emotion-bar.tsx`, `importance-meter.tsx` |
| MUST_STAY_CLIENT | 68 | All others |

**Caveat**: `emotion-bar.tsx` and `relationship-history.tsx` are directly imported by `relationships/page.tsx` (a client component). Converting them requires either: (a) refactoring the parent to use children pattern, or (b) converting the parent too. `importance-meter.tsx` has zero consumers — dead code, safe to convert.

### Empty Catch Block Audit

| Pattern | Count | Risk | Files |
|---------|-------|------|-------|
| SQLite idempotent migration | 22 | SAFE | `group-migrations.ts` (18), 3 API routes (4) |
| SSE/stream connection closed | 4 | SAFE | `stream/route.ts` (3), `session/page.tsx` (1) |
| Fire-and-forget fetch | 11 | SHOULD_LOG | 7 files — see task 7 |
| Turn config silent default | 1 | SHOULD_LOG | `sessions/[id]/route.ts` |
| Total | 38 | | 13 files |

### Build Size Audit
- Bundle analyzer installed (`@next/bundle-analyzer` + `cross-env`)
- Never run — no baseline data yet

---

## Work Objectives

### Core Objective
Commit accumulated work, establish bundle baseline, convert eligible client components to server, and add logging to silent error handlers.

### Concrete Deliverables
- Git commits for all 121 changed files
- Bundle analysis HTML report
- 3 `"use client"` directives removed
- 11 `.catch(() => {})` → `.catch((err) => console.warn(...))`
- `@types/uuid` removed from devDependencies

### Definition of Done
- [ ] `npx next build` succeeds
- [ ] All changes committed
- [ ] Bundle analysis report exists
- [ ] 3 client→server conversions verified
- [ ] 11 empty catches have logging

### Must Have
- Build passes at every step
- No breaking changes to existing functionality
- Atomic commits with descriptive messages

### Must NOT Have (Guardrails)
- No new external dependencies
- No refactoring beyond the 3 client→server files
- No touching SAFE-pattern empty catches (SQLite migrations, SSE connection drops)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None
- **Agent-Executed QA**: ALL verification via `npx next build` + `git diff`

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - commit + bundle analysis):
├── Task 1: Commit lore removal + dead code cleanup
├── Task 2: Commit wiki features + error boundaries
├── Task 3: Commit cleanup improvements + auth migration
└── Task 4: Run bundle analysis + capture report

Wave 2 (After Wave 1 - client→server conversion):
├── Task 5: Convert importance-meter.tsx to server component
├── Task 6: Convert emotion-bar.tsx + relationship-history.tsx (with parent refactor)
└── Task 7: Fix 11 fire-and-forget empty catches

Wave 3 (After Wave 2 - cleanup):
└── Task 8: Remove @types/uuid leftover

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
```

### Dependency Matrix
- **1-4**: No dependencies — all parallel within Wave 1
- **5-7**: Depend on Wave 1 (clean committed baseline) — all parallel within Wave 2
- **8**: Depends on Wave 2 — standalone
- **F1-F4**: Depend on ALL tasks complete

### Agent Dispatch Summary
- **Wave 1**: 4 tasks → `git` × 3 (commits), `quick` × 1 (bundle analysis)
- **Wave 2**: 3 tasks → `quick` × 2 (server conversions), `quick` × 1 (empty catch fix)
- **Wave 3**: 1 task → `quick` × 1
- **FINAL**: 4 tasks → `oracle`, `unspecified-high` × 2, `deep`

---

## TODOs

- [x] 1. Commit lore removal + dead code cleanup

  **What to do**:
  - Stage and commit all lore system removal files (deleted API routes, components, lib files, scripts)
  - Stage and commit all dead code deletions (markdown.ts, context-compression.ts, importance-scoring.ts, user-overrides.ts, validation/)
  - Stage and commit archived scripts to .omo/archived-scripts/
  - Message: `chore(lore): remove old lore system and dead code`

  **Must NOT do**:
  - Stage wiki feature files, error boundaries, or auth changes
  - Stage untracked files outside the expected scope

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward git staging and commit
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit with proper staging

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Wave 2 tasks
  - **Blocked By**: None

  **References**:
  - `git status --short` output — see which files are deleted/modified

  **Acceptance Criteria**:
  - [ ] `git log --oneline -1` shows commit with message `chore(lore): remove old lore system and dead code`
  - [ ] `git status` shows remaining files (not committed yet)

  **QA Scenarios**:
  ```
  Scenario: Verify commit contains expected files
    Tool: Bash (git)
    Steps:
      1. Run: git log --oneline -1
      2. Run: git show --stat HEAD
    Expected: Commit message matches, stat shows ~50+ deleted/modified files for lore system
    Evidence: .omo/evidence/task-1-commit-stat.txt
  ```

  **Commit**: NO (this IS the commit)

- [x] 2. Commit wiki features + error boundaries

  **What to do**:
  - Stage and commit wiki edit mode, revision history, error boundaries
  - Files: wiki/[...slug]/page.tsx, wiki/error.tsx, session/error.tsx, timeline/error.tsx, wiki-revisions/, revision-history.tsx, revisions.ts
  - Message: `feat(wiki): add edit mode, revision history, error boundaries`

  **Must NOT do**:
  - Stage auth changes, bundle analyzer, or dead code files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward git staging and commit
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Wave 2 tasks
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `git log --oneline -1` shows commit with wiki/error boundary message

  **QA Scenarios**:
  ```
  Scenario: Verify commit contains wiki and error boundary files
    Tool: Bash (git)
    Steps:
      1. Run: git log --oneline -1
      2. Run: git show --stat HEAD
    Expected: Commit message matches, stat shows wiki page, 3 error.tsx files, revision files
    Evidence: .omo/evidence/task-2-commit-stat.txt
  ```

  **Commit**: NO (this IS the commit)

- [x] 3. Commit cleanup improvements + auth migration

  **What to do**:
  - Stage and commit all remaining files: auth.ts migration, bundle analyzer config, package.json changes, API route updates (await verifyToken), idle-processing changes, retrieval changes, font changes, layout changes
  - Message: `chore(cleanup): consolidate auth, add bundle analyzer, update 60+ API routes`

  **Must NOT do**:
  - Stage files already committed in Tasks 1-2

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward git staging and commit
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Wave 2 tasks
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `git log --oneline -1` shows cleanup commit
  - [ ] `git status` shows only untracked files remaining (no modified files)

  **QA Scenarios**:
  ```
  Scenario: Verify all modified files are committed
    Tool: Bash (git)
    Steps:
      1. Run: git status --short
      2. Verify no lines starting with " M" or "M " remain
    Expected: Only "??" (untracked) lines remain
    Evidence: .omo/evidence/task-3-git-status.txt
  ```

  **Commit**: NO (this IS the commit)

- [x] 4. Run bundle analysis + capture report

  **What to do**:
  - Run `npx cross-env ANALYZE=true npx next build`
  - Capture the output and verify the analysis HTML report is generated
  - Note the top 5 largest bundles by size

  **Must NOT do**:
  - Modify any source files
  - Change next.config.ts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Run a single command and capture output
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: None
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `npx cross-env ANALYZE=true npx next build` completes successfully
  - [ ] Bundle analysis report file exists (typically `.next/analyze/` or stdout output)

  **QA Scenarios**:
  ```
  Scenario: Bundle analysis runs and produces output
    Tool: Bash
    Steps:
      1. Run: npx cross-env ANALYZE=true npx next build 2>&1 | tee .omo/evidence/task-4-bundle-output.txt
      2. Check output for bundle size information
    Expected: Build succeeds, output contains bundle size data
    Evidence: .omo/evidence/task-4-bundle-output.txt
  ```

  **Commit**: NO

- [x] 5. Convert importance-meter.tsx to server component

  **What to do**:
  - Remove `"use client"` from `src/components/narrative/importance-meter.tsx`
  - Verify no other file imports it (grep confirmed: zero consumers)
  - Run `npx next build` to verify no RSC errors

  **Must NOT do**:
  - Modify the component's logic or styling
  - Touch any other files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single line removal + build verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: None
  - **Blocked By**: Wave 1

  **Acceptance Criteria**:
  - [ ] `"use client"` removed from importance-meter.tsx
  - [ ] `npx next build` succeeds

  **QA Scenarios**:
  ```
  Scenario: Component converted and build passes
    Tool: Bash
    Steps:
      1. Verify "use client" is gone: grep '"use client"' src/components/narrative/importance-meter.tsx → 0 matches
      2. Run: npx next build
    Expected: Build succeeds, no RSC errors
    Evidence: .omo/evidence/task-5-build-output.txt
  ```

  **Commit**: YES
  - Message: `perf(rsc): convert importance-meter to server component`
  - Files: `src/components/narrative/importance-meter.tsx`

- [x] 6. Convert emotion-bar.tsx + relationship-history.tsx to server components

  **What to do**:
  - Remove `"use client"` from `src/components/relationship/emotion-bar.tsx`
  - Remove `"use client"` from `src/components/relationship/relationship-history.tsx`
  - Refactor `src/app/(app)/relationships/page.tsx` to not directly import these server components (use children pattern or extract wrapper)
  - Run `npx next build` to verify

  **Must NOT do**:
  - Change the visual output or behavior of the relationships page
  - Modify any other components

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 2 line removals + 1 small parent refactor
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7)
  - **Blocks**: None
  - **Blocked By**: Wave 1

  **Acceptance Criteria**:
  - [ ] `"use client"` removed from both files
  - [ ] `relationships/page.tsx` still renders correctly
  - [ ] `npx next build` succeeds

  **QA Scenarios**:
  ```
  Scenario: Both components converted, build passes
    Tool: Bash
    Steps:
      1. grep '"use client"' src/components/relationship/emotion-bar.tsx → 0 matches
      2. grep '"use client"' src/components/relationship/relationship-history.tsx → 0 matches
      3. Run: npx next build
    Expected: Build succeeds, no RSC boundary errors
    Evidence: .omo/evidence/task-6-build-output.txt
  ```

  **Commit**: YES
  - Message: `perf(rsc): convert emotion-bar and relationship-history to server components`
  - Files: `src/components/relationship/emotion-bar.tsx`, `src/components/relationship/relationship-history.tsx`, `src/app/(app)/relationships/page.tsx`

- [x] 7. Fix 11 fire-and-forget empty catches

  **What to do**:
  - Upgrade 11 `.catch(() => {})` to `.catch((err) => console.warn("[context] failed:", err))`
  - Files: `app-context.tsx` (L87, L247), `session/[id]/page.tsx` (L87), `settings/page.tsx` (L93, L103, L181), `session-settings-panel.tsx` (L57), `app-layout-shell.tsx` (L355), `voice-combiner/page.tsx` (L49), `jobs/page.tsx` (L113), `sessions/[id]/route.ts` (L89)

  **Must NOT do**:
  - Touch SAFE-pattern catches (SQLite migrations, SSE connection drops, clipboard fallback)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 11 targeted find-and-replace edits
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: None
  - **Blocked By**: Wave 1

  **Acceptance Criteria**:
  - [ ] All 11 catches upgraded with context-specific console.warn
  - [ ] `npx next build` succeeds

  **QA Scenarios**:
  ```
  Scenario: All 11 catches upgraded, build passes
    Tool: Bash
    Steps:
      1. Run: grep -rn '\.catch(() => {})' src/ | grep -v node_modules
      2. Verify the 11 target lines are no longer empty
      3. Run: npx next build
    Expected: 11 lines now have console.warn, build succeeds
    Evidence: .omo/evidence/task-7-grep-output.txt
  ```

  **Commit**: YES
  - Message: `fix(logging): add console.warn to fire-and-forget fetches`
  - Files: 8 files across 7 directories

- [x] 8. Remove @types/uuid leftover

  **What to do**:
  - Remove `"@types/uuid": "^11.0.0"` from devDependencies in `package.json`
  - Run `npx next build` to verify

  **Must NOT do**:
  - Touch any other dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single line removal
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: None
  - **Blocked By**: Wave 2

  **Acceptance Criteria**:
  - [ ] `@types/uuid` removed from package.json
  - [ ] `npx next build` succeeds

  **QA Scenarios**:
  ```
  Scenario: @types/uuid removed, build passes
    Tool: Bash
    Steps:
      1. grep '@types/uuid' package.json → 0 matches
      2. Run: npx next build
    Expected: Build succeeds
    Evidence: .omo/evidence/task-8-build-output.txt
  ```

  **Commit**: YES
  - Message: `chore(deps): remove @types/uuid leftover`
  - Files: `package.json`, `package-lock.json`


> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
- [x] F2. **Code Quality Review** — `unspecified-high`
- [x] F3. **Real Manual QA** — `unspecified-high`
- [x] F4. **Scope Fidelity Check** — `deep`

---

## Commit Strategy

- **1**: `chore(lore): remove old lore system and dead code` - 50+ files
- **2**: `feat(wiki): add edit mode, revision history, error boundaries` - 10 files
- **3**: `chore(cleanup): consolidate auth, add bundle analyzer` - 60+ files
- **5**: `perf(rsc): convert importance-meter to server component` - 1 file
- **6**: `perf(rsc): convert emotion-bar and relationship-history to server` - 2 files + 1 parent refactor
- **7**: `fix(logging): add console.warn to fire-and-forget fetches` - 7 files
- **8**: `chore(deps): remove @types/uuid leftover` - 1 file

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: succeeds
git log --oneline -5  # Expected: 8 new commits
grep -r '"use client"' src/components/relationship/ src/components/narrative/importance-meter.tsx  # Expected: 0 matches for emotion-bar, relationship-history, importance-meter
grep -r '\.catch(() => {})' src/  # Expected: 0 matches (all upgraded to console.warn)
```

### Final Checklist
- [ ] All changes committed
- [ ] Bundle analysis report generated
- [ ] 3 client→server conversions verified
- [ ] 11 empty catches have logging
- [ ] `@types/uuid` removed
- [ ] `npx next build` passes
