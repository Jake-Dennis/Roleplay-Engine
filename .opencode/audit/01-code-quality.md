# Code Quality Audit Report

**Project:** Roleplay-Engine
**Date:** 2026-06-08
**Scope:** Full 
pm run lint output, dead code analysis, deprecated API scan
**Tooling:** ESLint (flat config: eslint-config-next/core-web-vitals + eslint-config-next/typescript)

---

## Summary Stats

| Metric | Count |
|--------|-------|
| **Total Problems** | 146 |
| **Errors** | 79 |
| **Warnings** | 67 |
| **Fixable (--fix)** | 1 error |
| **Source files scanned (src/)** | ~159 .ts/.tsx files |
| **Historical/doc files** | 6 .ts/.js files in docs/ |

### Error Distribution by Rule

| Rule | Count | Location Breakdown |
|------|-------|-------------------|
| @typescript-eslint/no-explicit-any | 60 | 25 docs/ + 35 src/ |
| @typescript-eslint/no-require-imports | 9 | 8 docs/ + 1 src/ |
| eact-hooks/set-state-in-effect | 5 | all in src/ |
| eact-hooks/immutability | 2 | all in src/ |
| eact-hooks/refs (refs-in-render) | 1 | src/components/session/tts-playback.tsx:157 |
| prefer-const | 1 | src/app/api/benchmark/roleplay/route.ts:83 |

### Warning Distribution by Rule

| Rule | Count | Notes |
|------|-------|-------|
| @typescript-eslint/no-unused-vars | ~53 | 11 docs/ + ~42 src/ |
| eact-hooks/exhaustive-deps | 3 | all in src/ |

---

## Errors by Category

### 1. @typescript-eslint/no-explicit-any -- 60 occurrences

#### In archived scripts (docs/historical-evidence/) -- 25 occurrences

| File | Count | Lines |
|------|-------|-------|
| docs/.../migrate-events-to-wiki.ts | 6 | 139, 170, 210, 300, 335, 358 |
| docs/.../migrate-locations-to-wiki.ts | 6 | 91, 121, 186, 270, 302, 325 |
| docs/.../migrate-npcs-to-wiki.ts | 6 | 120, 158, 195, 281, 316, 339 |
| docs/.../migrate-relationships-to-wiki.ts | 6 | 87, 121, 156, 242, 275, 298 |
| docs/.../migrate-universe-scope.ts | 1 | 30 |

#### In application source (src/) -- 35 occurrences

##### Test files -- 31 occurrences

| File | Count | Lines |
|------|-------|-------|
| src/lib/__tests__/wiki-prompt-integration.test.ts | 13 | 28-35, 448-450 |
| src/lib/jobs/__tests__/npc-wiki-sync.test.ts | 5 | 75, 93, 108, 119, 130 |
| src/lib/jobs/__tests__/wiki-restructure-suggestions.test.ts | 5 | 355-357, 383-384 |
| src/lib/__tests__/safe-json.test.ts | 5 | 6, 7, 8, 9, 42 |
| src/lib/__tests__/frontmatter.test.ts | 1 | 154 |
| src/lib/wiki/__tests__/config-migration.test.ts | 1 | 45 |
| src/lib/wiki/__tests__/file-io.test.ts | 1 | 13 |

##### Production code -- 4 occurrences

| File | Count | Lines |
|------|-------|-------|
| src/lib/wiki/bulk-move.ts | 2 | 294, 304 |
| src/lib/wiki/bulk-recategorize.ts | 1 | 318 |
| src/app/api/wiki/merge/route.ts | 1 | 97 |

---

### 2. eact-hooks/immutability (access-before-declaration) -- 2 occurrences

| File | Line | Issue |
|------|------|-------|
| src/app/(app)/settings/benchmark/page.tsx | 198 | etchHistory() called in useEffect before const fetchHistory on line 257 |
| src/app/(app)/settings/benchmark/page.tsx | 199 | etchUserSettings() called in useEffect before const fetchUserSettings on line 209 |

**Impact:** This is a **real runtime bug**. Because etchHistory and etchUserSettings are const arrow functions (not unction declarations), they are NOT hoisted. The useEffect will throw a ReferenceError when called.

---

### 3. eact-hooks/set-state-in-effect -- 5 occurrences

| File | Line | State Setter | Notes |
|------|------|-------------|-------|
| src/app/(app)/settings/benchmark/page.tsx | 253 | etchModels() | Calls setState inside effect body |
| src/app/(app)/settings/server/page.tsx | 144 | setAuthError(false) | Resets auth error in effect |
| src/components/settings/server-info-section.tsx | 41 | setOllamaHost() | Initializes form state from settings data |
| src/components/wiki/markdown-editor.tsx | 93 | setOverlayHtml() | Derives overlay HTML from value prop |
| src/components/wiki/wiki-quick-switcher.tsx | 90 | setActiveIndex() | Clamps active index on results change |

---

### 4. eact-hooks/refs (refs-in-render) -- 1 occurrence

| File | Line | Issue |
|------|------|-------|
| src/components/session/tts-playback.tsx | 157 | Ref current accessed during render by passing to render-prop child |

---

### 5. prefer-const -- 1 occurrence

| File | Line | Variable |
|------|------|----------|
| src/app/api/benchmark/roleplay/route.ts | 83 | contextSize (fixable with --fix) |

---

### 6. @typescript-eslint/no-require-imports -- 9 occurrences

#### In archived scripts (docs/) -- 8 occurrences

| File | Lines |
|------|-------|
| docs/.../test-phase3.js | 11, 12 |
| docs/.../test-phase4.js | 12, 13 |
| docs/.../test-phase6.js | 436, 437 |
| docs/.../test-phase7.js | 845, 846 |

#### In application source (src/) -- 1 occurrence

| File | Line | Code |
|------|------|------|
| src/lib/ollama.ts | 302 | const { TTS_CONFIG } = require("./config"); |

**Impact:** Uses CommonJS require() in an otherwise ESM codebase. Should be import.

---

## Warnings by Category

### 1. @typescript-eslint/no-unused-vars -- ~53 occurrences

**Archived test scripts (8 unused variables in 2 files):**
- docs/.../test-phase1.js: ok, dupData, headers (x2), data (x2), s
- docs/.../test-phase7.js: BACKLINK2_ID, 	hreadId2, entryId2

**Test files in src/ (12 unused variables in 9 files):**
- src/lib/__tests__/wiki-prompt-integration.test.ts: etrieval, UNIVERSES, section, createIndexMd, lines
- src/lib/__tests__/get-active-job-model.test.ts: _userId
- src/lib/benchmark/__tests__/context-test.test.ts: ContextTestResult, generateText
- src/lib/benchmark/orchestrator.ts: ContextTestResult, PredictTestResult, CombinationResult, logger, startTime
- src/lib/jobs/__tests__/npc-wiki-sync.test.ts: eforeEach
- src/lib/wiki/__tests__/bulk-move.test.ts: listWikiPages
- src/lib/wiki/__tests__/type-registry.test.ts: eadAndMigrateConfig

**API routes (19 unused variables in 15 files):**
- src/app/api/benchmark/[jobId]/route.ts: getUserJobs, updateJob, persistJob
- src/app/api/benchmark/roleplay/route.ts: userId
- src/app/api/benchmark/route.ts: generateJobId
- src/app/api/npcs/[id]/route.ts: path
- src/app/api/ollama/models/route.ts: userId
- src/app/api/relationships/[id]/route.ts: unauthorizedError
- src/app/api/sessions/[id]/export/route.ts: unauthorizedError
- src/app/api/sessions/[id]/messages/search/route.ts: unauthorizedError
- src/app/api/settings/route.ts: userId (x2: L27, L76)
- src/app/api/tts/generate/route.ts: unauthorizedError
- src/app/api/tts/stream/route.ts: TTS_CONFIG
- src/app/api/tts/voices/combine/route.ts: userId
- src/app/api/universes/[id]/route.ts: unauthorizedError
- src/app/api/wiki/templates/route.ts: userId

**UI Components/Pages (11 unused variables in 5 files):**
- src/components/wiki/file-tree.tsx: pathOf, 	opFolder, 	otalPages, _event, ctiveSubfolder
- src/app/(app)/settings/benchmark/page.tsx: showEmptyState, stageIcon, isFuture
- src/app/(app)/admin/restructure/tabs/bulk-move-tab.tsx: LoadingState
- src/app/(app)/admin/restructure/tabs/dormancy-tab.tsx: BookOpen
- src/app/(app)/admin/restructure/tabs/merge-suggestions-tab.tsx: useCallback, ExternalLink
- src/app/(app)/settings/server/page.tsx: uthError
- src/app/(app)/wiki/[...slug]/page.tsx: parseWikiFrontmatter, serializeWikiFrontmatter

**Library files (5 unused variables in 5 files):**
- src/lib/wiki/bulk-move.ts: TypeRegistry
- src/lib/wiki/config.ts: CONFIG_FILENAME
- src/lib/wiki/merge-suggester.ts: candidates
- src/lib/wiki/type-registry.ts: WikiConfigV2
- src/lib/prompt-builder.ts: BUDGET_MESSAGE_SUMMARIES

---

### 2. eact-hooks/exhaustive-deps -- 3 occurrences

| File | Line | Missing Dependency |
|------|------|-------------------|
| src/app/(app)/settings/benchmark/page.tsx | 200 | etchHistory (in useEffect) |
| src/app/(app)/settings/benchmark/page.tsx | 294 | etchHistory (in useCallback pollJob) |
| src/app/(app)/settings/server/page.tsx | 220 | ollamaUrl (in useEffect) |

---

## Dead Code

### Files NOT Imported by Any Other Source File

Confirmed via exhaustive cross-reference grep of all import patterns from @/ and relative paths.

| File | Lines | Purpose |
|------|-------|---------|
| src/lib/message-summarizer.ts | 198 | Per-message summarization engine. Contains full summarizeMessage(), 4 prompt types, DB writes. **Not called anywhere.** |
| src/lib/api-client.ts | 111 | Typed ApiClient class with retry logic. **Not instantiated anywhere.** |
| src/hooks/use-auth.ts | ~80 | useAuth() hook wrapping login/logout/register API calls. **Not used by any component.** |
| src/hooks/use-tts.ts | ~60 | useTts() hook for TTS playback state. **Not used by any component.** |
| src/hooks/use-local-storage.ts | ~40 | useLocalStorage() hook. **Not imported anywhere.** |
| src/hooks/use-voices.ts | ~50 | useVoices() hook. **Not imported anywhere.** |
| src/components/session/session-header.tsx | 217 | Full session header component. **No page imports it.** |
| src/lib/entity-resolution.ts | ~100+ | Entity resolution logic. **Not imported anywhere.** |
| src/lib/wiki/prompt-subtypes.ts | ~150 | uildSubtypePromptSection(), uildCompactSubtypeList() -- only imported by test. **No production consumer.** |
| src/components/ui/error-boundary.tsx | ~40 | Error boundary component. **Not imported anywhere.** |

### Files with Unused Exports (defined but never used outside own file)

- src/lib/config.ts: TTS_CONFIG -- imported but unused in src/app/api/tts/stream/route.ts:7
- Various API routes: unauthorizedError -- imported but unused in 5 route files
- Various API routes: userId -- destructured from getAuthToken() but unused in 5 route files

---

## Deprecated APIs

### React Deprecations -- None Found

| Pattern | Result |
|---------|--------|
| componentWillMount / UNSAFE_componentWill* | 0 hits |
| indDOMNode | 0 hits |
| String refs (	his.refs.) | 0 hits |
| createClass / PropTypes | 0 hits |

**Conclusion:** Fully migrated to modern React (functional components, hooks, ref objects).

### Node.js Deprecations -- Minor

| Pattern | Files | Status |
|---------|-------|--------|
| equire() in ESM context | src/lib/ollama.ts:302 | 1 occurrence in src/ |
| Buffer.from() / Buffer.alloc() / Buffer.concat() | 6 files (TTS, embeddings, wiki) | Standard usage, not deprecated |
| .substr() | Full src/ | 0 hits |

---

## Most Problematic Files

| Rank | File | Errors | Warnings | Total | Key Issues |
|------|------|--------|----------|-------|------------|
| 1 | src/lib/__tests__/wiki-prompt-integration.test.ts | 13 | 5 | 18 | 13x no-explicit-any, 5x unused |
| 2 | src/app/(app)/settings/benchmark/page.tsx | 3 | 5 | 8 | 2x immutability (crash), set-state-in-effect, deps, unused |
| 3 | src/components/wiki/file-tree.tsx | 0 | 5 | 5 | 5x unused variables |
| 4 | src/lib/benchmark/orchestrator.ts | 0 | 5 | 5 | 5x unused imports/vars |
| 5 | src/lib/jobs/__tests__/npc-wiki-sync.test.ts | 5 | 1 | 6 | 5x no-explicit-any |
| 6 | src/lib/jobs/__tests__/wiki-restructure-suggestions.test.ts | 5 | 0 | 5 | 5x no-explicit-any |
| 7 | src/lib/__tests__/safe-json.test.ts | 5 | 0 | 5 | 5x no-explicit-any |
| 8 | src/lib/ollama.ts | 1 | 0 | 1 | require() in ESM |
| 9 | src/app/(app)/settings/server/page.tsx | 1 | 2 | 3 | set-state-in-effect, unused, deps |
| 10 | src/app/api/benchmark/[jobId]/route.ts | 0 | 3 | 3 | 3x unused imports |

---

## Critical Findings

### CRITICAL: Access-before-declaration Bug in settings/benchmark/page.tsx

`	ypescript
useEffect(() => {
  fetchHistory();       // LINE 198 -- ReferenceError at runtime!
  fetchUserSettings();  // LINE 199 -- ReferenceError at runtime!
}, []);

const fetchUserSettings = async () => { ... };  // LINE 209
const fetchHistory = async () => { ... };        // LINE 257
`

**Because const arrow functions are NOT hoisted**, calling them before declaration throws a ReferenceError. **Fix:** Move the declarations above the useEffect, or convert to unction declarations / useCallback hoisted above.

### YELLOW: 10 Dead Files (~1,000+ lines) Never Executed

- **Orphaned utilities** (pi-client.ts, message-summarizer.ts, entity-resolution.ts) -- significant engineering effort, completely unused.
- **Orphaned hooks** (use-auth.ts, use-tts.ts, use-voices.ts, use-local-storage.ts) -- built but never wired into components.
- **Orphaned component** (session-header.tsx) -- 217-line component no page renders.

### YELLOW: 4 Production Files with ny Types

ulk-move.ts, ulk-recategorize.ts, merge/route.ts -- real type safety gaps in production code.

### YELLOW: equire() in ollama.ts

Breaks ESM expectations. Should be converted to import.

---

## Recommendations (Priority Order)

1. **CRITICAL**: Fix access-before-declaration in src/app/(app)/settings/benchmark/page.tsx lines 198-199 -- **runtime crash**.
2. **HIGH**: Remove or re-integrate the 10 confirmed dead code files (~1,000+ lines).
3. **HIGH**: Fix the 5 set-state-in-effect violations (convert to derived state via useMemo or move to useLayoutEffect).
4. **MEDIUM**: Convert src/lib/ollama.ts:302 from equire() to import.
5. **MEDIUM**: Add proper type annotations to 4 production-code ny usages.
6. **LOW**: Clean up 42 unused variable warnings (mostly leftover imports).
7. **LOW**: Fix 3 exhaustive-deps warnings.
8. **LOW**: Exclude docs/historical-evidence/ from ESLint to reduce noise by 33 problems.

---

*Generated 2026-06-08 by code quality audit. Full lint output available on request.*
