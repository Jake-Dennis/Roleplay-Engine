# Test Coverage Audit — Roleplay-Engine

**Date:** 2026-06-08
**Scope:** All source files under src/
**Test Framework:** Bun test (package.json → "test": "bun test")
**Test Runner Config:** No unfig.toml or itest.config.* found — defaults apply

---

## Summary Stats

| Metric | Value |
|--------|-------|
| Total source files (.ts + .tsx) | ~300 files |
| Total source lines | ~64,565 lines |
| Test files | **20 files** (19 in src/lib/, 1 in src/components/) |
| Test lines | ~4,317 lines |
| Source files with ≥1 dedicated test | **18 files** |
| Source lines with test coverage | ~4,179 lines (**6.5%**) |
| API route files with tests | **0 of 98** (0%) |
| Component files with tests | **1 of 94** (1.1%) |
| Hook files with tests | **0 of 11** (0%) |
| Context files with tests | **0 of 2** (0%) |

---

## Test Files by Directory

### src/lib/__tests__/ (6 files)

| Test File | Lines | Describes | Its | Tests | What It Tests |
|-----------|-------|-----------|-----|-------|---------------|
| rontmatter.test.ts | 157 | 4 | 13 | 4 | wiki/frontmatter.ts — YAML frontmatter parsing |
| get-active-job-model.test.ts | 99 | 1 | 5 | 0 | ollama.ts (getActiveJobModel) — model selection logic |
| safe-json.test.ts | 47 | 2 | 10 | 0 | safe-json.ts — safe JSON parse/stringify |
| syntax-highlighter.test.ts | 177 | 1 | 23 | 0 | components/wiki/editor/syntax-highlighter.ts — markdown syntax highlighting |
| wiki-prompt-integration.test.ts | 456 | 8 | 18 | 0 | Integration: wiki/query.ts, wiki/frontmatter.ts, retrieval pipeline |
| helpers.ts | 173 | — | — | — | Shared test utilities (not a test itself) |

### src/lib/wiki/__tests__/ (10 files)

| Test File | Lines | Describes | Its | Tests | What It Tests |
|-----------|-------|-----------|-----|-------|---------------|
| ile-io.test.ts | 166 | 1 | 15 | 0 | wiki/file-io.ts — CRUD, file locking, conflict detection |
| wikilinks-rewrite.test.ts | 347 | 2 | 29 | 0 | wiki/wikilinks.ts — 3-pass wikilink resolution |
| merge.test.ts | 311 | 1 | 15 | 0 | wiki/merge.ts — wiki page merge logic |
| merge-suggestions.test.ts | 275 | 1 | 14 | 0 | wiki/merge-suggester.ts — merge suggestions algorithm |
| ulk-move.test.ts | 302 | 1 | 18 | 0 | wiki/bulk-move.ts — bulk page moving |
| ulk-recategorize.test.ts | 425 | 1 | 22 | 0 | wiki/bulk-recategorize.ts — bulk recategorization |
| config-migration.test.ts | 115 | 4 | 10 | 0 | wiki/config-migration.ts — config migration logic |
| 	ype-registry.test.ts | 117 | 4 | 8 | 0 | wiki/type-registry.ts — wiki type registry |
| prompt-subtypes.test.ts | 119 | 3 | 6 | 0 | wiki/prompt-subtypes.ts — prompt subtypes |
| subtype-folders.test.ts | 94 | 5 | 12 | 0 | wiki/subtype-folders.ts — subtype folder structure |

### src/lib/jobs/__tests__/ (2 test files + 1 helper)

| Test File | Lines | Describes | Its | Tests | What It Tests |
|-----------|-------|-----------|-----|-------|---------------|
| 
pc-wiki-sync.test.ts | 190 | 2 | 11 | 0 | jobs/npc-wiki-sync.ts — NPC wiki sync job |
| wiki-restructure-suggestions.test.ts | 332 | 2 | 9 | 0 | jobs/wiki-restructure-suggestions.ts — restructure suggestions |
| helpers.ts | 40 | — | — | — | Shared test utilities |

### src/lib/benchmark/__tests__/ (2 files)

| Test File | Lines | Describes | Its | Tests | What It Tests |
|-----------|-------|-----------|-----|-------|---------------|
| uto-tune.test.ts | 124 | 1 | 7 | 0 | enchmark/auto-tune.ts — auto-tuning logic |
| context-test.test.ts | 123 | 1 | 7 | 0 | enchmark/context-test.ts — context testing |

### src/components/wiki/__tests__/ (1 file)

| Test File | Lines | Describes | Its | Tests | What It Tests |
|-----------|-------|-----------|-----|-------|---------------|
| ile-tree.test.tsx | 9 | 1 | 1 | 0 | **Stub only** — components/wiki/file-tree.tsx |

**Total test assertions:** 260+ (it() + 	est() blocks across all files)

---

## Module Coverage Table

### src/lib/ (101 source files, 20,467 lines)

| Module | Tested? | Test File(s) | # Tests | Risk | Lines |
|--------|---------|--------------|---------|------|-------|
| uth.ts | ❌ UNTESTED | — | — | **CRITICAL** | 286 |
| uth-token.ts | ❌ UNTESTED | — | — | **HIGH** | 8 |
| uth-edge.ts | ❌ UNTESTED | — | — | **HIGH** | 29 |
| with-auth.ts | ❌ UNTESTED | — | — | **HIGH** | 26 |
| with-error-handler.ts | ❌ UNTESTED | — | — | **MEDIUM** | 14 |
| pi-client.ts | ❌ UNTESTED | — | — | **MEDIUM** | 94 |
| acklinks.ts | ❌ UNTESTED | — | — | **MEDIUM** | 235 |
| canon-tiers.ts | ❌ UNTESTED | — | — | **LOW** | 65 |
| config.ts | ❌ UNTESTED | — | — | **HIGH** | 181 |
| contradiction-detector.ts | ❌ UNTESTED | — | — | **MEDIUM** | 277 |
| date-formatter.ts | ❌ UNTESTED | — | — | **LOW** | 86 |
| db.ts | ❌ UNTESTED | — | — | **HIGH** | 64 |
| embeddings.ts | ❌ UNTESTED | — | — | **MEDIUM** | 256 |
| emotion-utils.ts | ❌ UNTESTED | — | — | **LOW** | 9 |
| entity-constants.ts | ❌ UNTESTED | — | — | **LOW** | 120 |
| entity-extraction.ts | ❌ UNTESTED | — | — | **MEDIUM** | 123 |
| entity-resolution.ts | ❌ UNTESTED | — | — | **MEDIUM** | 206 |
| error-response.ts | ❌ UNTESTED | — | — | **LOW** | 35 |
| event-bus.ts | ❌ UNTESTED | — | — | **CRITICAL** | 228 |
| group-migrations.ts | ❌ UNTESTED | — | — | **LOW** | 103 |
| idle-processing.ts | ❌ UNTESTED | — | — | **HIGH** | 404 |
| idle/relationship-tasks.ts | ❌ UNTESTED | — | — | **MEDIUM** | 129 |
| idle/wiki-tasks.ts | ❌ UNTESTED | — | — | **MEDIUM** | 417 |
| importance.ts | ❌ UNTESTED | — | — | **LOW** | 168 |
| intent-analyzer.ts | ❌ UNTESTED | — | — | **MEDIUM** | 81 |
| job-processor.ts | ❌ UNTESTED | — | — | **CRITICAL** | 172 |
| logger.ts | ❌ UNTESTED | — | — | **LOW** | 125 |
| markdown-utils.ts | ❌ UNTESTED | — | — | **LOW** | 84 |
| memory-compression.ts | ❌ UNTESTED | — | — | **MEDIUM** | 267 |
| message-summarizer.ts | ❌ UNTESTED | — | — | **MEDIUM** | 171 |
| ollama.ts | ⚠️ PARTIAL | __tests__/get-active-job-model.test.ts | 5 | **CRITICAL** | 543 |
| ollama-busy.ts | ❌ UNTESTED | — | — | **MEDIUM** | 34 |
| ollama-meta.ts | ❌ UNTESTED | — | — | **MEDIUM** | 364 |
| prompt-builder.ts | ❌ UNTESTED | — | — | **CRITICAL** | 357 |
| prompts.ts | ❌ UNTESTED | — | — | **HIGH** | 239 |
| ate-limiter.ts | ❌ UNTESTED | — | — | **MEDIUM** | 100 |
| elationship-access.ts | ❌ UNTESTED | — | — | **LOW** | 18 |
| elationship-analysis.ts | ❌ UNTESTED | — | — | **MEDIUM** | 215 |
| elationship-constants.ts | ❌ UNTESTED | — | — | **LOW** | 13 |
| elationship-decay.ts | ❌ UNTESTED | — | — | **MEDIUM** | 341 |
| elationship-markdown.ts | ❌ UNTESTED | — | — | **LOW** | 309 |
| elationship-types.ts | ❌ UNTESTED | — | — | **LOW** | 136 |
| elationship-viz.ts | ❌ UNTESTED | — | — | **LOW** | 219 |
| ender-loop.ts | ❌ UNTESTED | — | — | **LOW** | 54 |
| esponse-utils.ts | ❌ UNTESTED | — | — | **LOW** | 29 |
| etrieval.ts | ❌ UNTESTED | — | — | **CRITICAL** | 825 |
| ow-to-json.ts | ❌ UNTESTED | — | — | **LOW** | 20 |
| safe-json.ts | ✅ TESTED | __tests__/safe-json.test.ts | 10 | **LOW** | 59 |
| scene-extraction.ts | ❌ UNTESTED | — | — | **MEDIUM** | 363 |
| schema-migrations.ts | ❌ UNTESTED | — | — | **HIGH** | 399 |
| semantic-contradiction.ts | ❌ UNTESTED | — | — | **MEDIUM** | 293 |
| server-config.ts | ❌ UNTESTED | — | — | **MEDIUM** | 259 |
| session-columns.ts | ❌ UNTESTED | — | — | **LOW** | 13 |
| shutdown.ts | ❌ UNTESTED | — | — | **LOW** | 71 |
| startup-check.ts | ❌ UNTESTED | — | — | **LOW** | 47 |
| summarization.ts | ❌ UNTESTED | — | — | **MEDIUM** | 165 |
| 	ts.ts | ❌ UNTESTED | — | — | **MEDIUM** | 200 |
| 	ts-queue.ts | ❌ UNTESTED | — | — | **LOW** | 95 |
| 	ypes.ts | ❌ UNTESTED | — | — | **LOW** | 41 |
| universe-utils.ts | ❌ UNTESTED | — | — | **LOW** | 6 |
| alidation.ts | ❌ UNTESTED | — | — | **LOW** | 15 |
| alidation/uuid-validator.ts | ❌ UNTESTED | — | — | **LOW** | 4 |
| ector-search.ts | ❌ UNTESTED | — | — | **MEDIUM** | 212 |
| oice-discovery.ts | ❌ UNTESTED | — | — | **LOW** | 119 |

### src/lib/wiki/ subsystem

| Module | Tested? | Test File(s) | # Tests | Risk | Lines |
|--------|---------|--------------|---------|------|-------|
| ile-io.ts | ✅ TESTED | wiki/__tests__/file-io.test.ts | 15 | **CRITICAL** | 402 |
| rontmatter.ts | ✅ TESTED | __tests__/frontmatter.test.ts, __tests__/wiki-prompt-integration.test.ts | 17+ | **HIGH** | 95 |
| wikilinks.ts | ✅ TESTED | wiki/__tests__/wikilinks-rewrite.test.ts | 29 | **HIGH** | 377 |
| merge.ts | ✅ TESTED | wiki/__tests__/merge.test.ts | 15 | **MEDIUM** | 190 |
| ulk-move.ts | ✅ TESTED | wiki/__tests__/bulk-move.test.ts | 18 | **MEDIUM** | 273 |
| ulk-recategorize.ts | ✅ TESTED | wiki/__tests__/bulk-recategorize.test.ts | 22 | **MEDIUM** | 283 |
| merge-suggester.ts | ✅ TESTED | wiki/__tests__/merge-suggestions.test.ts | 14 | **MEDIUM** | 156 |
| config-migration.ts | ✅ TESTED | wiki/__tests__/config-migration.test.ts | 10 | **LOW** | 158 |
| 	ype-registry.ts | ✅ TESTED | wiki/__tests__/type-registry.test.ts | 8 | **LOW** | 67 |
| prompt-subtypes.ts | ✅ TESTED | wiki/__tests__/prompt-subtypes.test.ts | 6 | **LOW** | 57 |
| subtype-folders.ts | ✅ TESTED | wiki/__tests__/subtype-folders.test.ts | 12 | **LOW** | 64 |
| query.ts | ⚠️ PARTIAL | __tests__/wiki-prompt-integration.test.ts | ~5 | **HIGH** | 353 |
| lint.ts | ❌ UNTESTED | — | — | **MEDIUM** | 522 |
| ingest.ts | ❌ UNTESTED | — | — | **MEDIUM** | 354 |
| alidation.ts | ❌ UNTESTED | — | — | **MEDIUM** | 110 |
| uto-extract.ts | ❌ UNTESTED | — | — | **MEDIUM** | 293 |
| history.ts | ❌ UNTESTED | — | — | **LOW** | 120 |
| iling.ts | ❌ UNTESTED | — | — | **LOW** | 247 |
| orphans.ts | ❌ UNTESTED | — | — | **LOW** | 88 |
| index-generator.ts | ❌ UNTESTED | — | — | **LOW** | 105 |
| index-utils.ts | ❌ UNTESTED | — | — | **LOW** | 144 |
| move-page.ts | ❌ UNTESTED | — | — | **LOW** | 174 |
| page-split.ts | ❌ UNTESTED | — | — | **LOW** | 150 |
| path-guard.ts | ❌ UNTESTED | — | — | **LOW** | 22 |
| config.ts | ❌ UNTESTED | — | — | **LOW** | 83 |
| config-types.ts | ❌ UNTESTED | — | — | **LOW** | 77 |
| evisions.ts | ❌ UNTESTED | — | — | **LOW** | 95 |
| wiki-root.ts | ❌ UNTESTED | — | — | **LOW** | 24 |
| callout-remark-plugin.ts | ❌ UNTESTED | — | — | **LOW** | 251 |
| embed-remark-plugin.ts | ❌ UNTESTED | — | — | **LOW** | 175 |
| logger.ts | ❌ UNTESTED | — | — | **LOW** | 63 |
| 	ypes.ts | ❌ UNTESTED | — | — | **LOW** | 175 |

### src/lib/jobs/ subsystem

| Module | Tested? | Test File(s) | # Tests | Risk | Lines |
|--------|---------|--------------|---------|------|-------|
| 
pc-wiki-sync.ts | ✅ TESTED | jobs/__tests__/npc-wiki-sync.test.ts | 11 | **MEDIUM** | 229 |
| wiki-restructure-suggestions.ts | ✅ TESTED | jobs/__tests__/wiki-restructure-suggestions.test.ts | 9 | **MEDIUM** | 122 |
| queue.ts | ❌ UNTESTED | — | — | **CRITICAL** | 368 |
| 	ypes.ts | ❌ UNTESTED | — | — | **LOW** | 159 |
| wiki-handler.ts | ❌ UNTESTED | — | — | **HIGH** | 546 |
| lore-extraction.ts | ❌ UNTESTED | — | — | **MEDIUM** | 361 |
| 
pc-evolution.ts | ❌ UNTESTED | — | — | **MEDIUM** | 227 |
| scene-handler.ts | ❌ UNTESTED | — | — | **LOW** | 37 |
| decay-handler.ts | ❌ UNTESTED | — | — | **MEDIUM** | 116 |
| embedding-handler.ts | ❌ UNTESTED | — | — | **LOW** | 33 |
| 	hread-analysis-handler.ts | ❌ UNTESTED | — | — | **MEDIUM** | 116 |
| session-recap.ts | ❌ UNTESTED | — | — | **MEDIUM** | 84 |
| rchival-handler.ts | ❌ UNTESTED | — | — | **LOW** | 64 |
| summarization-handler.ts | ❌ UNTESTED | — | — | **MEDIUM** | 123 |
| elationship-analysis-handler.ts | ❌ UNTESTED | — | — | **LOW** | 66 |
| elationship-summary-handler.ts | ❌ UNTESTED | — | — | **LOW** | 76 |

### src/lib/benchmark/ subsystem

| Module | Tested? | Test File(s) | # Tests | Risk | Lines |
|--------|---------|--------------|---------|------|-------|
| uto-tune.ts | ✅ TESTED | enchmark/__tests__/auto-tune.test.ts | 7 | **LOW** | 54 |
| context-test.ts | ✅ TESTED | enchmark/__tests__/context-test.test.ts | 7 | **LOW** | 233 |
| orchestrator.ts | ❌ UNTESTED | — | — | **MEDIUM** | 182 |
| combination-test.ts | ❌ UNTESTED | — | — | **LOW** | 184 |
| predict-test.ts | ❌ UNTESTED | — | — | **LOW** | 150 |
| oleplay-test.ts | ❌ UNTESTED | — | — | **LOW** | 323 |
| job-store.ts | ❌ UNTESTED | — | — | **LOW** | 130 |
| 	ypes.ts | ❌ UNTESTED | — | — | **LOW** | 97 |

---

## API Route Coverage

**98 route files** in src/app/api/ — **0 have tests.**

| Route Group | Files | Tested? |
|-------------|-------|---------|
| uth/* | 5 (login, logout, me, password, register) | ❌ |
| dmin/* | 3 (contradictions, contradictions/[id], entities) | ❌ |
| acklinks/* | 2 (root, graph) | ❌ |
| enchmark/* | 3 (root, roleplay, [jobId]) | ❌ |
| contradictions | 1 | ❌ |
| generate/* | 2 ([id], [id]/regenerate-choices) | ❌ |
| groups/* | 3 (root, [id], [id]/members) | ❌ |
| health/* | 3 (root, live, ready) | ❌ |
| idle/heartbeat | 1 | ❌ |
| invitations | 1 | ❌ |
| jobs/* | 2 (root, stream) | ❌ |
| models/ollama | 1 | ❌ |
| 
arrative-memories/* | 2 (root, [id]) | ❌ |
| 
arrative-threads | 1 | ❌ |
| 
pcs/* | 2 (root, [id]) | ❌ |
| ollama/models | 1 | ❌ |
| personas/* | 4 (root, active, [id], [id]/activate) | ❌ |
| eindex | 1 | ❌ |
| elationships/* | 5 (root, [id], [id]/decay, [id]/evolution, [id]/file) | ❌ |
| search | 1 | ❌ |
| sessions/* | 17 (root, [id]/*) | ❌ |
| settings/* | 2 (root, active-state) | ❌ |
| 	imeline/* | 1 + timelines/ | ❌ |
| 	ts/* | 7 voices/cache/generate/stream | ❌ |
| universes/* | 2 (root, [id]) | ❌ |
| user/settings | 1 | ❌ |
| users | 1 | ❌ |
| oice-assignments | 1 | ❌ |
| wiki/* | 24 routes | ❌ |
| wiki-revisions | 1 | ❌ |
| **Total** | **98** | **0%** |

---

## Component Coverage

**94 component files** across 18 directories — **1 has a test (stub).**

| Directory | Files | Tested? | Test Details |
|-----------|-------|---------|-------------|
| acklinks/ | 1 | ❌ | — |
| canon/ | 3 | ❌ | — |
| chat/ | 9 | ❌ | — |
| debug/ | 2 | ❌ | — |
| jobs/ | 6 | ❌ | — |
| layout/ | 1 | ❌ | — |
| 
arrative/ | 3 | ❌ | — |
| 
pcs/ | 2 | ❌ | — |
| personas/ | 8 | ❌ | — |
| elationship/ | 3 | ❌ | — |
| elationships/ | 4 | ❌ | — |
| session/ | 14 | ❌ | — |
| settings/ | 5 | ❌ | — |
| 	imeline/ | 4 | ❌ | — |
| 	ts/ | 3 | ❌ | — |
| ui/ | 13 | ❌ | — |
| wiki/ | 15 | ⚠️ | 1 stub test (file-tree.test.tsx, 9 lines, 1 it) |
| **Total** | **94** | **1.1%** | |

**Note:** The wiki/editor/syntax-highlighter.ts (a .ts file in components, 307 lines) is tested by lib/__tests__/syntax-highlighter.test.ts.

---

## Hook & Context Coverage

### src/hooks/ (11 files, 871 lines)

| Hook | Lines | Tested? |
|------|-------|---------|
| use-audio-player.ts | 60 | ❌ |
| use-auth.ts | 89 | ❌ |
| use-connection-status.ts | 67 | ❌ |
| use-entity-fetch.ts | 59 | ❌ |
| use-idle-tracker.ts | 86 | ❌ |
| use-local-storage.ts | 41 | ❌ |
| use-render-loop.ts | 41 | ❌ |
| useRenderLoop.ts | 19 | ❌ |
| use-session.ts | 211 | ❌ |
| use-tts.ts | 79 | ❌ |
| use-voices.ts | 119 | ❌ |

### src/contexts/ (2 files, 250 lines)

| Context | Lines | Tested? |
|---------|-------|---------|
| pp-context.tsx | 229 | ❌ |
| ctive-universe.tsx | 21 | ❌ |

---

## High-Risk Untested Modules

These are modules where a bug could cause data loss, auth bypass, incorrect AI output, or system-wide failure:

### 🔴 CRITICAL (7 modules)

| Module | Lines | Reason |
|--------|-------|--------|
| **lib/retrieval.ts** | 825 | Core context retrieval pipeline — determines what wiki content goes into LLM prompts. Bugs here affect all generation quality. |
| **lib/ollama.ts** | 543 | LLM client — all AI generation flows through this. Only getActiveJobModel has a unit test; generateTextStream, getEmbeddings, etc. are untested. |
| **lib/prompt-builder.ts** | 357 | Assembles 10-section structured prompts. Errors produce wrong AI behavior silently. |
| **lib/auth.ts** | 286 | Core auth: hashing, JWT create/verify, user CRUD. A bug = security breach. |
| **lib/event-bus.ts** | 228 | In-process SSE event bus. Powers all real-time streaming. Failure breaks all SSE endpoints. |
| **lib/job-processor.ts** | 172 | Job orchestrator — routes jobs to handlers, manages state. Untested failure modes cascade to all background processing. |
| **lib/jobs/queue.ts** | 368 | Job queue — create/fetch/update/delete jobs. Core infrastructure for all async work. |

### 🟠 HIGH (9 modules)

| Module | Lines | Reason |
|--------|-------|--------|
| lib/auth-token.ts | 8 | Token extraction utility — used by all API routes for auth. |
| lib/with-auth.ts | 26 | API route auth HOF — wraps every protected endpoint. |
| lib/config.ts | 181 | Global configuration — incorrect values affect all subsystems. |
| lib/db.ts | 64 | Database connection — all data access depends on this. |
| lib/idle-processing.ts | 404 | 4-tier idle scheduling — manages all background job timing. |
| lib/prompts.ts | 239 | Prompt templates — errors here produce broken AI output. |
| lib/schema-migrations.ts | 399 | Database schema migrations — bugs can corrupt the DB. |
| lib/wiki/query.ts | 353 | LLM-powered wiki query + synthesis — under-tested (integration only). |
| lib/wiki/ingest.ts | 354 | Wiki page ingestion — errors can lose or corrupt wiki content. |
| lib/jobs/wiki-handler.ts | 546 | Wiki job handler — largest handler, complex branching logic. |
| lib/wiki/lint.ts | 522 | Wiki linting — large file, no tests. |
| lib/wiki/file-io.ts | 402 | Wiki file I/O — HAS tests, but is critical for data integrity. |
| src/app/api/generate/[id]/route.ts | 355 | Generation endpoint — orchestrates retrieval → prompt → Ollama → SSE. No tests. |
| src/app/api/sessions/[id]/stream/route.ts | 199 | Session SSE stream — real-time message delivery. No tests. |
| src/app/api/wiki/[...slug]/route.ts | 438 | Wiki CRUD API — largest route file. No tests. |

---

## Coverage Calculation Details

| Category | Source Lines | Test Lines | Source Coverage % |
|----------|-------------|------------|-------------------|
| src/lib/ (all) | 20,467 | 3,982 (19 test files) | ~6-10% (only 16 of 101 files have dedicated tests) |
| src/lib/wiki/ | 5,237 | 2,271 (10 test files) | ~43% (11 of 32 source files have tests) |
| src/lib/jobs/ | 2,870 | 562 (2 test files + helpers) | ~12% (2 of 16 source files have tests) |
| src/lib/benchmark/ | 1,353 | 247 (2 test files) | ~15% (2 of 8 source files have tests) |
| src/components/ | 15,558 | 9 (1 stub test) | <0.1% |
| src/hooks/ | 871 | 0 | 0% |
| src/contexts/ | 250 | 0 | 0% |
| src/app/api/ (routes) | 10,469 | 0 | 0% |
| src/app/ (pages) | 9,021 | 0 | 0% |
| **Total project** | **~64,565** | **~4,317** | **~6.5%** |

---

## Recommendations

### Tier 1 — Critical (immediate need)

1. **Add tests for lib/retrieval.ts (825 lines)** — This is the largest untested module and the heart of the generation pipeline. Test context assembly, keyword extraction, relevance scoring, budget truncation.
2. **Add tests for lib/ollama.ts (543 lines)** — The LLM client. Mock the HTTP layer and test stream parsing, error handling, timeout logic, model fallback, embedding extraction.
3. **Add tests for lib/prompt-builder.ts (357 lines)** — Test the 10-section prompt assembly, structural integrity, token counting, budget enforcement.
4. **Add tests for lib/auth.ts (286 lines)** — Test password hashing, JWT creation/verification, expiry, user CRUD, bcrypt cost configuration.
5. **Add tests for lib/event-bus.ts (228 lines)** — Test event emission, subscription, unsubscription, history replay, controller registration, error isolation.
6. **Add tests for lib/job-processor.ts (172 lines) + lib/jobs/queue.ts (368 lines)** — Test job creation, state transitions, error handling, priority ordering, handler dispatch.

### Tier 2 — High (next priority)

7. **Add integration tests for key API routes** — Start with uth/login, uth/register, sessions/[id]/turn, generate/[id], and wiki CRUD (wiki/[...slug]).
8. **Add tests for lib/idle-processing.ts (404 lines)** — Test tier scheduling, heartbeat, task dispatch.
9. **Add tests for lib/schema-migrations.ts (399 lines)** — Test migration application, rollback, idempotency.
10. **Add proper component tests** — The single stub test (ile-tree.test.tsx) has 1 assertion. Focus on high-value components: session/session-list, wiki/file-tree, chat/chat-window, ui/modal.

### Tier 3 — Medium (ongoing)

11. **Add tests for remaining wiki modules** — ingest.ts, alidation.ts, uto-extract.ts, lint.ts are key surface areas.
12. **Add tests for all 11 hooks** — Mock context/state, test render behavior and error states.
13. **Add tests for both contexts** — pp-context.tsx is the main state provider.
14. **Expand existing test suites** — ile-io.test.ts (15 tests for 402 lines), wikilinks-rewrite.test.ts (29 tests for 377 lines) are solid but could be extended with edge cases.

### Test Infrastructure Improvements

15. **Add unfig.toml** — Configure test root, coverage settings, and module aliases explicitly.
16. **Set up CI test runner** — No CI config detected. Add GitHub Actions with un install && bun test.
17. **Add coverage reporting** — un test --coverage generates lcov reports. Configure a coverage threshold.
18. **Create test helpers for common patterns** — Auth mock helper, DB mock/fixture helper, SSE stream helper, wiki temp-directory helper (the wiki-prompt-integration test already creates temp dirs — standardize this).

---

*Audit generated manually from file system scan. Test counts approximate based on regex matching of describe, it, and 	est keywords.*
