# Architecture Audit: Roleplay-Engine

**Date:** 2026-06-08
**Auditor:** @architect (automated)
**Scope:** Full architecture review against AGENTS.md conventions and anti-patterns
**Source:** AGENTS.md (generated 2026-05-20, commit 9267d10)

---

## 1. Anti-Pattern Check

### 1.1 Barrel Exports (index.ts)
**Result:** ✅ PASS — Zero index.ts re-export files found in src/.
No barrel exports exist. All imports use explicit file paths.

### 1.2 ORM / Query Builder
**Result:** ✅ PASS — No ORM packages found.
Project correctly uses raw etter-sqlite3 with db.prepare("...").get/all/run() pattern.
No imports of prisma, drizzle, kysely, typeorm, sequelize, mongoose, knex, or sqlalchemy in source.

### 1.3 Cookie-Based Middleware Auth (protectedRoutes)
**Result:** ✅ PASS — protectedRoutes is empty.
Confirmed src/proxy.ts:10: const protectedRoutes: string[] = [];
The src/middleware.ts file was already deleted (per work-log cycle 2).

### 1.4 Persistent Background Workers
**Result:** ✅ PASS — No persistent workers found.
No Worker, worker_threads, child_process, spawn, ork, or cron references in src/.
Jobs run on-demand via idle tiers (5/10/15/30 min) and API triggers.

### 1.5 active-universe.tsx Usage in New Code
**Result:** ⚠️ ISSUE — 6 files still import from active-universe.tsx compat shim.

| File | Import |
|------|--------|
| src/app/(app)/jobs/page.tsx:24 | import { useActiveUniverse } from "@/contexts/active-universe" |
| src/app/(app)/voice-combiner/page.tsx:5 | import { useActiveUniverse } from "@/contexts/active-universe" |
| src/app/(app)/narrative-threads/page.tsx:9 | import { useActiveUniverse } from "@/contexts/active-universe" |
| src/app/(app)/relationships/page.tsx:11 | import { useActiveUniverse } from "@/contexts/active-universe" |
| src/app/(app)/timeline/page.tsx:9 | import { useActiveUniverse } from "@/contexts/active-universe" |
| src/hooks/use-idle-tracker.ts:74 | localStorage.getItem("active-universe-id") (raw string) |

**Severity:** Low — the shim works correctly (re-exports from pp-context.tsx).
**Recommendation:** Migrate these 5 page imports to @/contexts/app-context and replace the localStorage key reference. Tag as tech-debt.

### 1.6 tailwind.config.* Existence
**Result:** ❌ ISSUE — 	ailwind.config.ts EXISTS but is dead code.

Found at: 	ailwind.config.ts (45 lines)

The project uses Tailwind CSS v4 with:
- @tailwindcss/postcss v4 in postcss.config.mjs
- @theme block in src/app/globals.css (161 lines of design tokens)
- No file imports 	ailwind.config.ts except the file itself

In Tailwind v4, 	ailwind.config.* is deprecated — configuration is CSS-first via @theme.
This file is dead code and directly violates the anti-pattern "Do NOT create tailwind.config.*".

**Severity:** Medium — no functional impact, but misleading.
**Recommendation:** Delete 	ailwind.config.ts.

### 1.7 Wiki Content in SQLite
**Result:** ✅ PASS — Wiki content is markdown-first on disk.
- Content stored as .md files under data/{userId}/wiki/
- wiki_versions SQLite table stores only metadata (version snapshots, paths)
- No wiki page content stored in SQLite

### 1.8 relationship/ vs relationships/ Split
**Result:** ✅ PASS — Both directories exist with different components.

| src/components/relationship/ (singular) | src/components/relationships/ (plural) |
|-------------------------------------------|------------------------------------------|
| emotion-bar.tsx | decay-indicator.tsx |
| elationship-graph.tsx | emotion-graph.tsx |
| elationship-history.tsx | elationship-timeline.tsx |
| | elationship-web.tsx |

No overlap in component names. Split is maintained.

---

## 2. Module Boundary Violations

### 2.1 lib/ → app/ imports
**Result:** ✅ PASS — No files in src/lib/ import from src/app/ via relative or @/app/ paths.

### 2.2 components/ → app/ imports
**Result:** ❌ ISSUE — 1 violation found.

src/components/debug/retrieval-inspector.tsx:41:
`	ypescript
import type {
  RetrievalInspectorResponse,
  BudgetBreakdown,
  SectionBudget,
} from "@/app/api/sessions/[id]/retrieval-context/route";
`

This component imports types from an API route file. API routes are implementation code, not type definitions. The types should be co-located either in the component file itself or in a shared types module (e.g., @/lib/retrieval).

**Severity:** Low — only type imports, no runtime dependency.
**Recommendation:** Extract the shared types (RetrievalInspectorResponse, BudgetBreakdown, SectionBudget) into src/lib/retrieval.ts or a dedicated types file, and import from there in both the route handler and the component.

### 2.3 hooks/ → components/ or app/ imports
**Result:** ✅ PASS — No hooks import from components or app.

### 2.4 lib/ → components/ or hooks/ imports
**Result:** ⚠️ MINOR — 1 non-test violation.

src/lib/__tests__/syntax-highlighter.test.ts:11:
`	ypescript
import { highlightMarkdown } from "@/components/wiki/editor/syntax-highlighter";
`

This is a test file importing from components, which is acceptable (tests test the component). However, the syntax-highlighter module itself is a .ts file (no JSX) and arguably belongs in src/lib/wiki/ rather than src/components/wiki/editor/.

**Recommendation:** Consider moving syntax-highlighter.ts to src/lib/wiki/ (it has no React dependency).

---

## 3. Naming Conventions

### 3.1 Directory Naming (should be kebab-case)
**Result:** ✅ PASS — All feature directories use kebab-case.
Exceptions: None found in feature directories.

### 3.2 File Naming — Duplicate Files (PascalCase vs kebab-case)
**Result:** ❌ CRITICAL — 2 sets of duplicate files found.

#### Duplicate 1: ChatWindow Component
| File | Lines | Bytes | Imported By |
|------|-------|-------|-------------|
| src/components/chat/ChatWindow.tsx (PascalCase) | 238 | 7,075 | NOT imported |
| src/components/chat/chat-window.tsx (kebab-case) | 415 | 16,164 | session/[id]/page.tsx |

These are DIFFERENT files with different implementations. ChatWindow.tsx appears to be an older/simpler version. Only the kebab-case version is in use.

**Severity:** High — dead code that diverges from the active version.
**Action:** Delete src/components/chat/ChatWindow.tsx after confirming it's unused.

#### Duplicate 2: useRenderLoop Hook
| File | Lines | Bytes | Imported By |
|------|-------|-------|-------------|
| src/hooks/useRenderLoop.ts (PascalCase) | 25 | 578 | NOT imported |
| src/hooks/use-render-loop.ts (kebab-case) | 51 | 1,280 | session/[id]/page.tsx, job-progress.tsx, streaming-text.tsx, ps-counter.tsx |

These are DIFFERENT files with different implementations. useRenderLoop.ts is a simpler wrapper. Only the kebab-case version is in use.

**Severity:** High — dead code that diverges from the active version.
**Action:** Delete src/hooks/useRenderLoop.ts after confirming it's unused.

### 3.3 PascalCase Component Files
**Result:** ⚠️ ISSUE — Several component files use PascalCase naming, which is CORRECT per convention for React component files.

| File | Verdict |
|------|---------|
| src/components/chat/ChatWindow.tsx | ❌ Dead duplicate (see 3.2) |
| src/components/chat/MessageBubble.tsx | ✅ PascalCase component file |
| src/components/chat/MessageInput.tsx | ✅ PascalCase component file |
| src/components/ui/Button.tsx | ✅ PascalCase component file |
| src/components/ui/Input.tsx | ✅ PascalCase component file |
| src/components/ui/StatusIndicator.tsx | ✅ PascalCase component file |

These PascalCase files for single React components are correct per convention. Only ChatWindow.tsx is a problem (dead duplicate).

---

## 4. Directory Structure

### 4.1 AGENTS.md vs Actual Structure

| Entry | AGENTS.md Claimed | Actual | Delta |
|-------|-------------------|--------|-------|
| API route handlers (oute.ts) | 94 | **107** | +13 |
| Component .tsx files | 71 | **98** | +27 |
| Component directories | 12 feature dirs | **19 subdirectories** | +7 |
| Hook files | 10 | **11** (+1 duplicate) | +1 |
| Lib flat utilities | 37 | **61** | +24 |
| Wiki lib files | 14 | **32** | +18 |
| Jobs lib files | 14 | **16** | +2 |
| UI component files | 7 | **12** | +5 |
| Session component files | 10 | **13** | +3 |
| Wiki component files | 12 | **23** | +11 |
| Chat component files | 6 | **9** | +3 |

**Finding:** AGENTS.md is significantly out of date — likely reflects state at commit 9267d10 (2026-05-20), but many features have been added since (rich wiki editor, benchmark system, admin pages, wiki evolution tooling, etc.).

**Severity:** Medium — documentation drift makes onboarding harder.
**Recommendation:** Regenerate AGENTS.md after the audit.

### 4.2 New Subdirectories in src/lib/
**Result:** ❌ ISSUE — Anti-pattern violation ("Do NOT create new subdirectories").

The src/lib/ directory has 6 subdirectories:
- wiki/ ✅ (established, documented)
- jobs/ ✅ (established, documented)
- enchmark/ ❌ (new, undocumented)
- idle/ ❌ (new, undocumented)
- alidation/ ❌ (new, undocumented)
- __tests__/ ❌ (new, undocumented)

The AGENTS.md anti-pattern states: "Do NOT create new subdirectories unless a clear subsystem emerges." The enchmark/ and idle/ directories represent legitimate subsystems that should be documented. __tests__/ for flat test files is acceptable.

**Recommendation:** Document the new subdirectories in src/lib/AGENTS.md.

### 4.3 New Component Directories
**Result:** ⚠️ NOTE — New component directories since AGENTS.md was generated:
- src/components/debug/ — 2 files (not in AGENTS.md structure)
- src/components/settings/ — 5 files (not in AGENTS.md structure)
- src/components/personas/ — 8 files (not in AGENTS.md structure)

**Recommendation:** Update AGENTS.md and src/components/AGENTS.md to reflect current structure.

---

## 5. Import Aliases

### 5.1 @/* → ./src/* Mapping
**Result:** ✅ PASS — Confirmed in 	sconfig.json:
`json
"paths": {
  "@/*": ["./src/*"]
}
`

### 5.2 Deep Relative Imports (../../../)
**Result:** ✅ PASS — No imports with 3+ parent directory segments found.
The project exclusively uses @/* aliases for non-local imports.

---

## 6. Client/Server Split

### 6.1 "use client" Directives
**Result:** ✅ PASS — Appropriate usage of "use client".

- 63 "use client" directives across src/components/
- 46 across src/app/ pages (all interactive pages correctly marked client)
- 3 across src/hooks/ (all hooks are client-only, as documented)
- No "use server" directives found anywhere (correct — no server actions)

Server-only patterns verified:
- Server components (ui/loading-state.tsx, ui/empty-state.tsx, ui/status-badge.tsx, etc.) correctly omit "use client"
- No server-only APIs (s, etter-sqlite3, Database) in client components — verified with grep

### 6.2 Server-Only Code in Client Components
**Result:** ✅ PASS — No s, etter-sqlite3, Database, or 
ode:fs imports found in src/components/.

---

## 7. Issues Found (Summary)

### Critical (2)
| # | Issue | Location | Action |
|---|-------|----------|--------|
| C1 | Duplicate ChatWindow.tsx (PascalCase) — dead code | src/components/chat/ | Delete the unused PascalCase file |
| C2 | Duplicate useRenderLoop.ts (PascalCase) — dead code | src/hooks/ | Delete the unused PascalCase file |

### High (1)
| # | Issue | Location | Action |
|---|-------|----------|--------|
| H1 | 	ailwind.config.ts exists as dead code | project root | Delete (Tailwind v4 uses @theme in CSS) |

### Medium (4)
| # | Issue | Location | Action |
|---|-------|----------|--------|
| M1 | AGENTS.md documentation — counts 40-50% out of date | Root AGENTS.md, component AGENTS.md, lib AGENTS.md | Regenerate after audit |
| M2 | 6 files still import compat shim ctive-universe.tsx | Various (app)/ pages | Migrate to pp-context.tsx |
| M3 | Module boundary: component imports types from API route | components/debug/retrieval-inspector.tsx | Extract shared types to lib/retrieval.ts |
| M4 | Undocumented subdirectories in src/lib/ | enchmark/, idle/, alidation/, __tests__/ | Document in lib/AGENTS.md |

### Low (2)
| # | Issue | Location | Action |
|---|-------|----------|--------|
| L1 | syntax-highlighter.ts in components/ (no React deps) | src/components/wiki/editor/ | Consider moving to src/lib/wiki/ |
| L2 | use-idle-tracker.ts uses raw localStorage string key | src/hooks/use-idle-tracker.ts:74 | Replace with context/constant reference |

---

## 8. Recommendations (Priority Order)

1. **Delete dead duplicate files** — ChatWindow.tsx and useRenderLoop.ts (critical, ~2 min)
2. **Delete 	ailwind.config.ts** — dead code for Tailwind v4 (high, ~1 min)
3. **Regenerate AGENTS.md** — all 4 AGENTS.md files are 2-3 weeks out of date (medium, ~15 min)
4. **Extract shared API types** — move RetrievalInspectorResponse etc. to lib/retrieval.ts (medium, ~10 min)
5. **Migrate remaining ctive-universe.tsx imports** — 5 pages + 1 localStorage key (medium, ~15 min)
6. **Move syntax-highlighter.ts** to src/lib/wiki/ as a pure function module (low, ~5 min)
7. **Document new lib subdirectories** in src/lib/AGENTS.md (low, ~5 min)

---

## 9. Metadata

| Metric | Count |
|--------|-------|
| Total .ts/.tsx files in src/ | 435 |
| API route handlers | 107 |
| Component .tsx files (excl. tests) | 98 |
| Pages (page.tsx) | 38 |
| Hook files | 11 (1 duplicate) |
| Lib flat files | 61 |
| Wiki lib files | 32 |
| Jobs lib files | 16 |
| Test files (.test.*) | 20 |
| "use client" directives (components) | 63 |
| "use client" directives (app) | 46 |
| "use server" directives | 0 ✅ |
| Barrel exports (index.ts) | 0 ✅ |
| Anti-pattern violations found | 4 (C1, C2, H1, M4) |