# Full Audit Remediation Plan

## TL;DR

> **Quick Summary**: Fix all 61 findings from the full project audit across security, code quality, architecture, and production readiness. Organized into 6 parallel execution waves.
>
> **Deliverables**: 
> - 4 CRITICAL security fixes (path traversal, circular deps, graceful shutdown, event bus leak)
> - 15 HIGH severity fixes (token exposure, no pagination, N+1 queries, stuck jobs, etc.)
> - 27 MEDIUM improvements (type safety, deduplication, error handling, missing indexes)
> - 12 LOW cleanups (naming, bundle size, config)
>
> **Estimated Effort**: Large — 6 waves, ~40+ tasks
> **Parallel Execution**: YES — 6 waves, max 8 concurrent per wave
> **Critical Path**: W1 (security foundation) → W2 (deduplication) → W3 (error handling) → W4 (API patterns) → W5 (security hardening) → W6 (production)

---

## Context

### Original Request
"can you do a full project audit" → "yes make a plan for them all"

### Audit Summary
**Scope**: 272 source files, ~33K lines, 80 API routes, 48 lib files, 56 components  
**Next.js 16** App Router · **better-sqlite3** · **Ollama** (self-hosted) · **Markdown-first wiki**

### Research Findings
- Zero `as any` casts already — type discipline is good, just needs `Record<string, any>` cleanup
- Wiki subsystem has the most critical security gap (revisions path traversal)
- Circular dependency between `relationship-decay.ts` and `relationship-markdown.ts` is the only import cycle
- 58 unprotected `JSON.parse()` calls is the largest single-code-quality issue
- 3 files contain ~2000 lines of near-identical idle enrichment code
- Dual localStorage/DB state for TTS settings, universe ID, and voice assignments

---

## Work Objectives

### Core Objective
Fix every audit finding across all 4 categories, organized by priority and dependency, with zero regressions.

### Concrete Deliverables
- All 7 CRITICAL findings resolved
- All 15 HIGH findings resolved
- All 27 MEDIUM findings resolved
- All 12 LOW findings resolved
- `npx next build` passes after every wave
- Zero new TypeScript errors

### Definition of Done
- [ ] `npx next build` passes
- [ ] Zero CRITICAL/HIGH findings remain
- [ ] All MEDIUM findings resolved or explicitly deferred with justification
- [ ] All LOW findings resolved or explicitly deferred with justification

### Must Have
- Every security fix preserves existing functionality
- Every deduplication extracts to a shared utility without changing behavior
- Every type improvement maintains runtime compatibility
- No new npm dependencies (except Phase 6 production tooling)

### Must NOT Have (Guardrails)
- Do NOT add ORM or query builder
- Do NOT add barrel exports
- Do NOT change API response shapes for existing endpoints
- Do NOT break existing wiki file content
- Do NOT remove any existing functionality

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO — no test framework
- **Automated tests**: NO — will add test framework in Wave 6
- **Agent-Executed QA**: ALWAYS — every task includes scenarios

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API changes**: Bash (curl) — send requests, assert status + response fields
- **Build/Type**: Bash (npx next build) — verify compilation
- **Security fixes**: Bash (curl with malicious input) — verify blocking
- **Refactoring**: Bash (npx next build + grep patterns) — verify no regressions

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — CRITICAL security + stability):
├── Task 1: Wiki revisions path traversal fix [quick]
├── Task 2: Circular dependency fix [quick]
├── Task 3: JWT token removal from login response [quick]
├── Task 4: Graceful shutdown enhancement [quick]
├── Task 5: Event bus memory leak fix [quick]
├── Task 6: Stale job recovery mechanism [quick]
├── Task 7: Structured logging utility [quick]
└── Task 8: Health check with proper status codes [quick]

Wave 2 (After Wave 1 — Deduplication + type safety):
├── Task 9: Extract shared getWikiRoot utility [quick]
├── Task 10: Extract shared parseBoundaries utility [quick]
├── Task 11: Consolidate duplicate TTS functions [quick]
├── Task 12: Consolidate duplicate vectorSearch [quick]
├── Task 13: Extract shared emotion parsing utility [quick]
├── Task 14: Fix parseWikilinks naming collision [quick]
├── Task 15: Eliminate Record<string, any> — wiki types [deep]
└── Task 16: Eliminate Record<string, any> — relationship types [deep]

Wave 3 (After Wave 2 — Error handling):
├── Task 17: Protect all 58 JSON.parse() calls [deep]
├── Task 18: Fix empty catch blocks [quick]
├── Task 19: Fix swallowed errors in .catch() [quick]
├── Task 20: Fix unhandled promise chains [quick]
├── Task 21: Route all console.log/warn through logger [quick]
└── Task 22: Fix hardcoded timeouts to use config [quick]

Wave 4 (After Wave 3 — API patterns + performance):
├── Task 23: Add pagination to list endpoints (batch 1) [deep]
├── Task 24: Add pagination to list endpoints (batch 2) [deep]
├── Task 25: Fix N+1 query patterns [deep]
├── Task 26: Add missing database indexes [quick]
├── Task 27: Dynamic import cytoscape [quick]
├── Task 28: Consolidate dual state sources — TTS settings [deep]
└── Task 29: Consolidate dual state sources — voice assignments [deep]

Wave 5 (After Wave 4 — Security hardening):
├── Task 30: Token rotation on password change [quick]
├── Task 31: Token revocation/denylist [deep]
├── Task 32: Remove x-auth-token header fallback [quick]
├── Task 33: Fix rate limiter IP spoofing [quick]
├── Task 34: Fix error response message leakage [quick]
├── Task 35: Add input length validation [quick]
├── Task 36: Add Content-Type validation [quick]
├── Task 37: Fix path-guard edge case [quick]
└── Task 38: Add security headers [quick]

Wave 6 (After Wave 5 — Production + cleanup):
├── Task 39: Integrate startup-check into Next.js lifecycle [quick]
├── Task 40: Add test framework (bun test) [quick]
├── Task 41: Move @types/cytoscape to devDependencies [quick]
├── Task 42: Fix WAL checkpoint configuration [quick]
├── Task 43: Fix mixed API response casing [quick]
├── Task 44: Add request correlation IDs [quick]
├── Task 45: Fix react-cytoscapejs React 19 compatibility [quick]
└── Task 46: Prompt injection protection [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
```

### Dependency Matrix

- **1-8**: — (all independent)
- **9**: None — can start immediately
- **10**: None
- **11**: None
- **12**: None
- **13**: None
- **14**: None
- **15**: 9 (uses shared getWikiRoot)
- **16**: None
- **17**: None (independent of deduplication)
- **18-22**: None (independent)
- **23-24**: 26 (need indexes first for pagination queries)
- **25**: 26 (need indexes first)
- **26**: None
- **27**: None
- **28**: 7 (uses structured logging)
- **29**: 7 (uses structured logging)
- **30-38**: 3 (depends on JWT token removal from W1)
- **39-46**: None (independent cleanup)

### Agent Dispatch Summary

- **Wave 1**: 8 tasks → all `quick`
- **Wave 2**: 8 tasks → 6 `quick`, 2 `deep`
- **Wave 3**: 6 tasks → 1 `deep`, 5 `quick`
- **Wave 4**: 7 tasks → 4 `deep`, 3 `quick`
- **Wave 5**: 9 tasks → 1 `deep`, 8 `quick`
- **Wave 6**: 8 tasks → 1 `deep`, 7 `quick`
- **FINAL**: 4 tasks → `oracle`, `unspecified-high`, `unspecified-high`, `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Wiki Revisions Path Traversal Fix

  **What to do**:
  - Add `isPathWithinRoot()` check to `getRevisionsDir()` in `src/lib/wiki/revisions.ts`
  - Apply same guard to `saveRevision()`, `listRevisions()`, `getRevision()` functions
  - The slug array comes from URL `[...slug]` — must be validated before any file operations

  **Must NOT do**:
  - Do NOT change the revisions API response shape
  - Do NOT modify other wiki path checks

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `customize-opencode` (not editing opencode config)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/wiki/revisions.ts` — target file with path traversal vulnerability
  - `src/lib/wiki/path-guard.ts` — `isPathWithinRoot()` utility to apply
  - `src/lib/wiki/file-io.ts` — example of correct path validation pattern

  **Acceptance Criteria**:
  - `src/lib/wiki/revisions.ts` uses `isPathWithinRoot()` before all file operations
  - Path traversal attempt `?slug=..%2F..%2Fetc` returns 400

  **QA Scenarios**:
  ```
  Scenario: Normal revision access works
    Tool: Bash (curl)
    Steps:
      1. Create a wiki page, then get its revisions via normal slug
      2. Assert 200 response with revision list
    Expected Result: 200 with revision array
    Evidence: .omo/evidence/task-1-normal-revisions.json

  Scenario: Path traversal blocked
    Tool: Bash (curl)
    Steps:
      1. GET /api/wiki-revisions?slug=..%2F..%2F..%2Fetc
      2. Assert 400 response
    Expected Result: 400 with error message
    Evidence: .omo/evidence/task-1-path-traversal-blocked.json
  ```

  **Commit**: YES (groups with 1-8)
  - Message: `sec: fix wiki revisions path traversal`

- [x] 2. Circular Dependency Fix

  **What to do**:
  - Extract `EMOTION_HALF_LIVES` constant from `src/lib/relationship-decay.ts` to a new shared file `src/lib/relationship-constants.ts`
  - Update `src/lib/relationship-markdown.ts` to import from `relationship-constants.ts` instead of `relationship-decay.ts`
  - This breaks the cycle: `relationship-decay` → `relationship-markdown` → ~~`relationship-decay`~~

  **Must NOT do**:
  - Do NOT change the constant value or export name
  - Do NOT modify any other imports in these files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/relationship-decay.ts:16` — imports `syncRelationshipToFilesystem` from markdown
  - `src/lib/relationship-markdown.ts:20` — imports `EMOTION_HALF_LIVES` from decay
  - `src/lib/relationship-decay.ts` — find `EMOTION_HALF_LIVES` definition

  **Acceptance Criteria**:
  - `src/lib/relationship-constants.ts` created with `EMOTION_HALF_LIVES` export
  - `src/lib/relationship-markdown.ts` imports from `relationship-constants.ts`
  - `npx next build` passes
  - No circular dependency between decay and markdown

  **QA Scenarios**:
  ```
  Scenario: Build passes with no circular deps
    Tool: Bash
    Steps:
      1. Run npx next build
      2. Assert exit code 0
    Expected Result: Compiled successfully
    Evidence: .omo/evidence/task-2-build-output.txt
  ```

  **Commit**: YES (groups with 1-8)
  - Message: `fix: break circular dependency between relationship-decay and relationship-markdown`

- [x] 3. JWT Token Removal from Login Response

  **What to do**:
  - Remove `token: result.token` from the JSON response in `src/app/api/auth/login/route.ts`
  - The httpOnly cookie is sufficient; returning the token in the body defeats httpOnly protection
  - Verify register route doesn't have the same issue

  **Must NOT do**:
  - Do NOT change the cookie setting logic
  - Do NOT change the response status code

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 30, 32 (downstream security fixes depend on this)
  - **Blocked By**: None

  **References**:
  - `src/app/api/auth/login/route.ts:48` — line returning token in response body
  - `src/app/api/auth/register/route.ts` — check for same pattern

  **Acceptance Criteria**:
  - Login response body does NOT contain `token` field
  - Login still sets httpOnly cookie correctly
  - Client login flow still works (cookie is set)

  **QA Scenarios**:
  ```
  Scenario: Login response has no token field
    Tool: Bash (curl)
    Steps:
      1. POST /api/auth/login with valid credentials
      2. Parse JSON response body
      3. Assert no "token" field exists in response
    Expected Result: 200 with user data, no token field
    Evidence: .omo/evidence/task-3-login-no-token.json

  Scenario: Login still sets httpOnly cookie
    Tool: Bash (curl)
    Steps:
      1. POST /api/auth/login with -v flag
      2. Check Set-Cookie header present
      3. Assert cookie has httpOnly flag
    Expected Result: Set-Cookie header with httpOnly
    Evidence: .omo/evidence/task-3-cookie-set.txt
  ```

  **Commit**: YES (groups with 1-8)
  - Message: `sec: remove JWT token from login response body`

- [x] 4. Graceful Shutdown Enhancement

  **What to do**:
  - Update `src/lib/shutdown.ts` to:
    1. Drain event bus — close all active SSE streams
    2. Mark all "processing" jobs as "failed" with reason "server shutdown"
    3. Wait for pending LLM calls to complete or timeout (5s)
    4. Close DB connection (already done)
  - Ensure `instrumentation.ts` calls the enhanced shutdown

  **Must NOT do**:
  - Do NOT change the shutdown signal handlers (SIGTERM/SIGINT)
  - Do NOT block shutdown for more than 5 seconds total

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/shutdown.ts` — current shutdown implementation (only closes DB)
  - `src/lib/event-bus.ts` — event bus with active connections to drain
  - `src/lib/job-processor.ts` — job queue with "processing" state to mark failed
  - `src/instrumentation.ts` — where shutdown is registered

  **Acceptance Criteria**:
  - `shutdown.ts` drains event bus before closing DB
  - `shutdown.ts` marks processing jobs as failed
  - `shutdown.ts` has 5-second timeout
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Build passes with enhanced shutdown
    Tool: Bash
    Steps:
      1. Run npx next build
      2. Assert exit code 0
    Expected Result: Compiled successfully
    Evidence: .omo/evidence/task-4-build-output.txt
  ```

  **Commit**: YES (groups with 1-8)
  - Message: `fix: enhance graceful shutdown to drain event bus and mark jobs failed`

- [x] 5. Event Bus Memory Leak Fix

  **What to do**:
  - Add cleanup for `eventHistory` Map when sessions disconnect
  - Add cleanup for `connectionCount` Map when sessions disconnect
  - Add a periodic cleanup interval (every 60s) to remove entries for sessions with no active connections
  - Add cleanup in `shutdown.ts` to clear all maps on shutdown

  **Must NOT do**:
  - Do NOT change the event bus API (subscribe, publish, canConnect)
  - Do NOT break existing SSE stream functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/event-bus.ts:23-26` — eventHistory and connectionCount Maps
  - `src/lib/event-bus.ts:55` — error handler that silently swallows errors

  **Acceptance Criteria**:
  - `eventHistory` Map has cleanup for disconnected sessions
  - `connectionCount` Map has cleanup for disconnected sessions
  - Periodic cleanup interval added (60s)
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Build passes with event bus cleanup
    Tool: Bash
    Steps:
      1. Run npx next build
      2. Assert exit code 0
    Expected Result: Compiled successfully
    Evidence: .omo/evidence/task-5-build-output.txt
  ```

  **Commit**: YES (groups with 1-8)
  - Message: `fix: add event bus cleanup for disconnected sessions`

- [x] 6. Stale Job Recovery Mechanism

  **What to do**:
  - Add a `recoverStaleJobs()` function that runs on startup
  - Find all jobs with `status = 'processing'` and `updated_at < NOW() - 5 minutes`
  - Mark them as `failed` with `error = 'Server crashed during processing'`
  - Call this from `instrumentation.ts` on startup (after DB connection)

  **Must NOT do**:
  - Do NOT change the job queue schema
  - Do NOT recover jobs that were intentionally processing (use 5-minute threshold)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/job-processor.ts:170-174` — job processing logic (no recovery)
  - `scripts/init-db.ts` — job_queue table schema (status, updated_at columns)
  - `src/instrumentation.ts` — startup hook location

  **Acceptance Criteria**:
  - `recoverStaleJobs()` function exists and is called on startup
  - Jobs stuck in "processing" for >5 minutes are marked failed
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Build passes with stale job recovery
    Tool: Bash
    Steps:
      1. Run npx next build
      2. Assert exit code 0
    Expected Result: Compiled successfully
    Evidence: .omo/evidence/task-6-build-output.txt
  ```

  **Commit**: YES (groups with 1-8)
  - Message: `fix: add stale job recovery on startup`

- [x] 7. Structured Logging Utility

  **What to do**:
  - Replace `src/lib/logger.ts` with a proper structured logger that:
    - Outputs JSON in production, colored console in development
    - Includes timestamp, level, message, and optional metadata
    - Supports request correlation IDs (via async local storage or explicit parameter)
    - Has proper log levels: debug, info, warn, error
  - Keep the same API surface (`logger.debug()`, `logger.warn()`, `logger.error()`) for backward compatibility

  **Must NOT do**:
  - Do NOT add new npm dependencies
  - Do NOT change existing logger call sites (keep API compatible)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 28, 29 (state consolidation uses structured logging)
  - **Blocked By**: None

  **References**:
  - `src/lib/logger.ts` — current simple logger to replace
  - `src/lib/error-response.ts` — example of dev-only detail leakage pattern

  **Acceptance Criteria**:
  - `logger.ts` outputs JSON in production, colored in development
  - Includes timestamp, level, message fields
  - Supports correlation ID parameter
  - Existing `logger.debug()`, `logger.warn()`, `logger.error()` calls still work
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Logger outputs JSON in production mode
    Tool: Bash
    Steps:
      1. Run node with NODE_ENV=production, import logger, call logger.info("test")
      2. Assert output is valid JSON with timestamp, level, message fields
    Expected Result: JSON output
    Evidence: .omo/evidence/task-7-prod-logging.json

  Scenario: Logger outputs colored console in development
    Tool: Bash
    Steps:
      1. Run node with NODE_ENV=development, import logger, call logger.info("test")
      2. Assert output contains [INFO] prefix
    Expected Result: Console output with [INFO] prefix
    Evidence: .omo/evidence/task-7-dev-logging.txt
  ```

  **Commit**: YES (groups with 1-8)
  - Message: `feat: replace simple logger with structured logging utility`

- [x] 8. Health Check with Proper Status Codes

  **What to do**:
  - Update `src/app/api/health/route.ts` to:
    1. Add DB connectivity check
    2. Return proper HTTP status codes (503 when services are down, 200 when healthy)
    3. Add `/api/health/live` endpoint (always 200 if process is running)
    4. Add `/api/health/ready` endpoint (200 only when all dependencies are reachable)
    5. Add authentication or restrict to localhost

  **Must NOT do**:
    - Do NOT change the existing `/api/health` response shape for backward compatibility
    - Do NOT add new npm dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/app/api/health/route.ts` — current health check (only Ollama + TTS, always 200)
  - `src/lib/db.ts` — DB connectivity check pattern
  - `src/lib/startup-check.ts` — existing service checks to reuse

  **Acceptance Criteria**:
  - `/api/health` includes DB check and returns 503 when services are down
  - `/api/health/live` returns 200 if process is running
  - `/api/health/ready` returns 200 only when all deps are reachable
  - Health endpoints restricted to localhost or authenticated
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Health endpoint returns 200 when healthy
    Tool: Bash (curl)
    Steps:
      1. GET /api/health
      2. Assert 200 status
      3. Assert response includes ollama, tts, and db status
    Expected Result: 200 with all services status
    Evidence: .omo/evidence/task-8-health-200.json

  Scenario: Live endpoint always returns 200
    Tool: Bash (curl)
    Steps:
      1. GET /api/health/live
      2. Assert 200 status
    Expected Result: 200
    Evidence: .omo/evidence/task-8-live-200.json
  ```

  **Commit**: YES (groups with 1-8)
  - Message: `feat: add proper health check endpoints with status codes`

- [x] 9. Extract Shared getWikiRoot Utility

  **What to do**:
  - Create `src/lib/wiki/wiki-root.ts` with a single `getWikiRoot(userId, universeId?)` function
  - Delete the 3 duplicate copies from `idle/wiki-tasks.ts`, `idle-enrichment.ts`, `jobs/wiki-handler.ts`
  - Update all 3 files to import from `@/lib/wiki/wiki-root`

  **Must NOT do**:
  - Do NOT change the function logic
  - Do NOT change any other code in the 3 files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 15 (wiki types elimination uses shared root)
  - **Blocked By**: None

  **References**:
  - `src/lib/idle/wiki-tasks.ts:26` — duplicate getWikiRoot
  - `src/lib/idle-enrichment.ts:53` — duplicate getWikiRoot
  - `src/lib/jobs/wiki-handler.ts:31` — duplicate getWikiRoot

  **Acceptance Criteria**:
  - `src/lib/wiki/wiki-root.ts` created with exported getWikiRoot
  - Zero duplicate getWikiRoot definitions remain
  - All 3 files import from shared utility
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No duplicate getWikiRoot definitions
    Tool: Bash (grep)
    Steps:
      1. grep -r "function getWikiRoot" src/
      2. Assert exactly 1 match (in wiki-root.ts)
    Expected Result: 1 match
    Evidence: .omo/evidence/task-9-no-duplicates.txt
  ```

  **Commit**: YES (groups with 9-16)
  - Message: `quality: extract shared getWikiRoot utility`

- [x] 10. Extract Shared parseBoundaries Utility

  **What to do**:
  - Create `src/lib/universe-utils.ts` with `parseBoundaries(raw: string | null): string[]`
  - Delete duplicates from `src/app/api/universes/[id]/route.ts` and `src/app/api/universes/route.ts`
  - Update both files to import from `@/lib/universe-utils`

  **Must NOT do**:
  - Do NOT change the function logic
  - Do NOT change any other code in the route files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/app/api/universes/[id]/route.ts:8-16` — duplicate parseBoundaries
  - `src/app/api/universes/route.ts:8-16` — duplicate parseBoundaries

  **Acceptance Criteria**:
  - `src/lib/universe-utils.ts` created with parseBoundaries
  - Zero duplicate parseBoundaries definitions remain
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No duplicate parseBoundaries definitions
    Tool: Bash (grep)
    Steps:
      1. grep -r "function parseBoundaries" src/
      2. Assert exactly 1 match
    Expected Result: 1 match
    Evidence: .omo/evidence/task-10-no-duplicates.txt
  ```

  **Commit**: YES (groups with 9-16)
  - Message: `quality: extract shared parseBoundaries utility`

- [x] 11. Consolidate Duplicate TTS Functions

  **What to do**:
  - `src/lib/voice-discovery.ts` has the better implementations (`isTTSAvailable`, `getAvailableVoices`, `parseVoiceInfo` with proper types)
  - Update `src/lib/tts.ts` to re-export from `voice-discovery.ts` or remove its own versions
  - Ensure all callers use the consolidated versions
  - Keep `tts.ts` for TTS-specific logic (generation, queue)

  **Must NOT do**:
  - Do NOT break any existing TTS generation functionality
  - Do NOT change the VoiceInfo type

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/tts.ts:48-56` — duplicate TTS functions
  - `src/lib/voice-discovery.ts:43-92` — better implementations with proper types

  **Acceptance Criteria**:
  - `src/lib/tts.ts` re-exports from voice-discovery.ts or removes duplicates
  - Zero duplicate TTS function definitions remain
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No duplicate TTS function definitions
    Tool: Bash (grep)
    Steps:
      1. grep -r "function isTTSAvailable\|function getAvailableVoices\|function parseVoiceInfo" src/
      2. Assert exactly 1 definition each
    Expected Result: 3 matches total (1 per function)
    Evidence: .omo/evidence/task-11-no-duplicates.txt
  ```

  **Commit**: YES (groups with 9-16)
  - Message: `quality: consolidate duplicate TTS functions`

- [x] 12. Consolidate Duplicate vectorSearch

  **What to do**:
  - `src/lib/vector-search.ts` has the better implementation (wrapper with fallback logic)
  - Update `src/lib/embeddings.ts` to use `vectorSearch` from `vector-search.ts` instead of its own version
  - Remove the duplicate from `embeddings.ts`
  - Ensure all callers use the consolidated version

  **Must NOT do**:
  - Do NOT change the vector search behavior
  - Do NOT break existing embedding functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/embeddings.ts:263` — duplicate vectorSearch
  - `src/lib/vector-search.ts:30` — better implementation with fallback

  **Acceptance Criteria**:
  - `src/lib/embeddings.ts` imports vectorSearch from vector-search.ts
  - Zero duplicate vectorSearch definitions remain
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No duplicate vectorSearch definitions
    Tool: Bash (grep)
    Steps:
      1. grep -r "function vectorSearch\|export function vectorSearch" src/
      2. Assert exactly 1 definition
    Expected Result: 1 match
    Evidence: .omo/evidence/task-12-no-duplicates.txt
  ```

  **Commit**: YES (groups with 9-16)
  - Message: `quality: consolidate duplicate vectorSearch`

- [x] 13. Extract Shared Emotion Parsing Utility

  **What to do**:
  - Create `src/lib/emotion-utils.ts` with `parseEmotionalState(raw: string | null): Record<string, number>`
  - Replace all 8+ occurrences of `JSON.parse(rel.emotional_state) || {}` pattern
  - Add try/catch for malformed JSON
  - Update all callers to use the shared utility

  **Must NOT do**:
  - Do NOT change the emotion data structure
  - Do NOT change any business logic around emotions

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/relationship-viz.ts:200` — emotion parsing
  - `src/lib/relationship-markdown.ts:112` — emotion parsing
  - `src/lib/relationship-decay.ts:348` — emotion parsing
  - `src/lib/job-processor.ts:543` — emotion parsing
  - `src/lib/idle-enrichment.ts:133` — emotion parsing
  - `src/lib/idle/wiki-tasks.ts:116` — emotion parsing
  - `src/app/(app)/relationships/page.tsx:132` — emotion parsing
  - `src/app/api/relationships/[id]/evolution/route.ts:37,93` — emotion parsing

  **Acceptance Criteria**:
  - `src/lib/emotion-utils.ts` created with parseEmotionalState
  - All 8+ occurrences replaced with shared utility
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No duplicate emotion parsing patterns
    Tool: Bash (grep)
    Steps:
      1. grep -r "JSON.parse.*emotional_state" src/
      2. Assert zero matches (all replaced with utility)
    Expected Result: 0 matches
    Evidence: .omo/evidence/task-13-no-duplicates.txt
  ```

  **Commit**: YES (groups with 9-16)
  - Message: `quality: extract shared emotion parsing utility`

- [x] 14. Fix parseWikilinks Naming Collision

  **What to do**:
  - Rename `parseWikilinks` in `src/lib/backlinks.ts` to `parseWikilinksFromContent` (or similar)
  - Rename `resolveWikilink` in `src/lib/backlinks.ts` to `resolveWikilinkFromDB` (or similar)
  - Update all callers of the backlinks versions
  - Keep the wiki system versions (`src/lib/wiki/wikilinks.ts`) with their current names

  **Must NOT do**:
  - Do NOT change the function logic
  - Do NOT change the wiki system wikilinks functions

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/wiki/wikilinks.ts:26-44` — wiki system parseWikilinks (keep)
  - `src/lib/backlinks.ts:43-62` — backlinks parseWikilinks (rename)
  - `src/lib/backlinks.ts:112-147` — backlinks resolveWikilink (rename)

  **Acceptance Criteria**:
  - Backlinks functions renamed to avoid collision
  - All callers updated
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No naming collision
    Tool: Bash (grep)
    Steps:
      1. grep -r "export function parseWikilinks" src/
      2. Assert exactly 1 match (in wikilinks.ts)
    Expected Result: 1 match
    Evidence: .omo/evidence/task-14-no-collision.txt
  ```

  **Commit**: YES (groups with 9-16)
  - Message: `quality: fix parseWikilinks naming collision`

- [x] 15. Eliminate Record<string, any> — Wiki Types

  **What to do**:
  - Create `src/lib/wiki/types.ts` with proper interfaces:
    - `WikiFrontmatter` — title, type, status, tags, created, updated, lastModified
    - `WikiPage` — path, content, frontmatter (typed)
    - `RevisionFrontmatter` — for revision files
    - `QueryResult` — for query pipeline results
  - Replace all `Record<string, any>` in wiki subsystem files
  - Update `src/lib/types.ts` DbResult to use a more specific type if possible

  **Must NOT do**:
  - Do NOT change runtime behavior
  - Do NOT break any wiki functionality

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: 9 (uses shared getWikiRoot)

  **References**:
  - `src/lib/wiki/file-io.ts:12` — frontmatter: Record<string, any>
  - `src/lib/wiki/revisions.ts:8,32` — revision frontmatter
  - `src/lib/wiki/query.ts:279,313,457,515` — query frontmatter
  - `src/lib/wiki/wikilinks.ts` — Wikilink type definition
  - `src/components/wiki/search.tsx:10` — search result frontmatter
  - `src/components/wiki/file-tree.tsx:10,16,119` — file tree frontmatter

  **Acceptance Criteria**:
  - `src/lib/wiki/types.ts` created with proper interfaces
  - Zero `Record<string, any>` in wiki subsystem
  - `npx next build` passes with no type errors

  **QA Scenarios**:
  ```
  Scenario: No Record<string, any> in wiki subsystem
    Tool: Bash (grep)
    Steps:
      1. grep -r "Record<string, any>" src/lib/wiki/
      2. Assert zero matches
    Expected Result: 0 matches
    Evidence: .omo/evidence/task-15-no-record-any.txt
  ```

  **Commit**: YES (groups with 9-16)
  - Message: `types: eliminate Record<string, any> in wiki subsystem`

- [x] 16. Eliminate Record<string, any> — Relationship Types

  **What to do**:
  - Create `src/lib/relationship-types.ts` with proper interfaces:
    - `RelationshipRow` — all DB columns with proper types
    - `EmotionalState` — typed emotion map
    - `RelationshipFrontmatter` — for markdown serialization
  - Replace `Record<string, any>` in relationship files
  - Replace `as string` / `as number` assertions where possible with proper typing

  **Must NOT do**:
  - Do NOT change runtime behavior
  - Do NOT break any relationship functionality

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/contradiction-detector.ts:24,148-173` — entity/canon typed as Record<string, any>
  - `src/lib/relationship-markdown.ts:119,224-233` — frontmatter parsing
  - `src/app/(app)/relationships/page.tsx:150,332,388-390` — emotion value assertions
  - `src/lib/types.ts:22` — DbResult = Record<string, any>

  **Acceptance Criteria**:
  - `src/lib/relationship-types.ts` created with proper interfaces
  - Reduced Record<string, any> in relationship files
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Build passes with new relationship types
    Tool: Bash
    Steps:
      1. Run npx next build
      2. Assert exit code 0
    Expected Result: Compiled successfully
    Evidence: .omo/evidence/task-16-build-output.txt
  ```

  **Commit**: YES (groups with 9-16)
  - Message: `types: eliminate Record<string, any> in relationship subsystem`

- [x] 17. Protect All 58 JSON.parse() Calls

  **What to do**:
  - Create `src/lib/safe-json.ts` with `safeParse(raw: string | null, fallback?: T): T | null`
  - Replace all 58 unprotected `JSON.parse()` calls with `safeParse()`
  - Each replacement should include appropriate fallback behavior
  - For critical parses (job payloads, DB rows), log warnings on failure
  - For UI parses (localStorage), use empty object fallback

  **Must NOT do**:
  - Do NOT change the fallback behavior for existing parses
  - Do NOT add try/catch inline — use the shared utility

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/relationship-markdown.ts:112-113,128,163,357` — 5 unprotected parses
  - `src/lib/job-processor.ts:276,445,543-544,608` — 5 unprotected parses
  - `src/lib/idle-enrichment.ts:133-134,449` — 3 unprotected parses
  - `src/lib/idle/wiki-tasks.ts:116-117,435` — 3 unprotected parses
  - `src/lib/retrieval.ts:388` — universe.boundaries parse
  - `src/lib/ollama.ts:197,332` — settings and SSE stream parse
  - `src/app/api/universes/[id]/route.ts:11` — boundaries parse
  - `src/app/api/sessions/[id]/turn/route.ts:44,173` — 2 parses
  - `src/app/api/sessions/[id]/scene/route.ts:43-44` — 2 parses
  - `src/app/(app)/session/[id]/page.tsx:309` — SSE stream parse

  **Acceptance Criteria**:
  - `src/lib/safe-json.ts` created with safeParse utility
  - Zero unprotected JSON.parse() calls remain in src/
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No unprotected JSON.parse calls
    Tool: Bash (grep)
    Steps:
      1. grep -rn "JSON\.parse(" src/ | grep -v "safeParse\|safe-json"
      2. Assert zero matches (all wrapped)
    Expected Result: 0 matches
    Evidence: .omo/evidence/task-17-no-unprotected-parse.txt

  Scenario: safeParse handles malformed input gracefully
    Tool: Bash
    Steps:
      1. Import safeParse, call with invalid JSON string
      2. Assert returns fallback value, no crash
    Expected Result: Returns fallback without throwing
    Evidence: .omo/evidence/task-17-safe-parse-test.txt
  ```

  **Commit**: YES (groups with 17-22)
  - Message: `fix: protect all 58 JSON.parse() calls with safeParse utility`

- [x] 18. Fix Empty Catch Blocks

  **What to do**:
  - `src/lib/backlinks.ts:208-210` — add `logger.warn()` for skipped DB insert failures
  - `src/lib/ollama.ts:72` — add `logger.debug()` for persona tags parse failure
  - `src/app/(app)/personas/page.tsx:97` — add `console.warn()` for tags parse failure (client-side, acceptable)

  **Must NOT do**:
  - Do NOT change the fallback behavior
  - Do NOT add error throwing where silent fallback is intentional

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/backlinks.ts:208-210` — empty catch with comment
  - `src/lib/ollama.ts:72` — empty catch for JSON.parse
  - `src/app/(app)/personas/page.tsx:97` — inline catch

  **Acceptance Criteria**:
  - Zero `} catch {` blocks without logging
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No empty catch blocks
    Tool: Bash (grep)
    Steps:
      1. grep -rn "} catch {" src/
      2. Assert zero matches (all have logging or comments with justification)
    Expected Result: 0 matches
    Evidence: .omo/evidence/task-18-no-empty-catch.txt
  ```

  **Commit**: YES (groups with 17-22)
  - Message: `fix: add logging to empty catch blocks`

- [x] 19. Fix Swallowed Errors in .catch()

  **What to do**:
  - Update all 19 `.catch((err) => console.warn(...))` patterns to use `logger.warn()` or `logger.error()`
  - For critical operations (data loading, state sync), add user-facing error state
  - For non-critical operations (model list, voice list), keep silent warning but use structured logger

  **Must NOT do**:
  - Do NOT change the fallback behavior (empty arrays, default values)
  - Do NOT add error throwing where graceful degradation is intentional

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: 7 (uses structured logger)

  **References**:
  - `src/contexts/app-context.tsx:81,183,236` — data loading failures
  - `src/components/session/session-settings-panel.tsx:57` — model list fetch
  - `src/app/(app)/voice-combiner/page.tsx:49` — voices fetch
  - `src/app/(app)/settings/page.tsx:95,105,183` — three fetch failures
  - `src/app/(app)/session/[id]/page.tsx:87` — persona load
  - `src/app/(app)/groups/[id]/page.tsx:103` — error completely swallowed

  **Acceptance Criteria**:
  - All 19 `.catch()` patterns use structured logger
  - Critical operations have user-facing error state
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No console.warn in .catch() blocks
    Tool: Bash (grep)
    Steps:
      1. grep -rn "catch.*console.warn" src/
      2. Assert zero matches (all use logger)
    Expected Result: 0 matches
    Evidence: .omo/evidence/task-19-no-console-warn.txt
  ```

  **Commit**: YES (groups with 17-22)
  - Message: `fix: replace console.warn in catch blocks with structured logger`

- [x] 20. Fix Unhandled Promise Chains

  **What to do**:
  - Add `.catch()` to all 18 `.then()` chains without error handling
  - For component data loading, add error state
  - For non-critical chains, add `.catch(() => {})` with logger warning

  **Must NOT do**:
  - Do NOT change the data flow or response handling
  - Do NOT add error throwing where graceful degradation is intentional

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/components/chat/edit-history.tsx:32` — .then without .catch
  - `src/app/(app)/dashboard/page.tsx:36` — .then without .catch
  - `src/app/(app)/wiki/page.tsx:18` — .then without .catch
  - `src/app/(app)/voice-combiner/page.tsx:45` — .then without .catch
  - `src/app/(app)/graph/page.tsx:51` — .then without .catch
  - `src/app/(app)/session/[id]/page.tsx:80` — .then without .catch

  **Acceptance Criteria**:
  - Zero `.then()` chains without `.catch()`
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No unhandled promise chains
    Tool: Bash (grep)
    Steps:
      1. grep -rn "\.then(" src/ | grep -v "\.catch("
      2. Review results — all should have .catch() on subsequent lines
    Expected Result: All .then() chains have .catch()
    Evidence: .omo/evidence/task-20-no-unhandled-then.txt
  ```

  **Commit**: YES (groups with 17-22)
  - Message: `fix: add .catch() to all unhandled promise chains`

- [x] 21. Route All console.log/warn Through Logger

  **What to do**:
  - Replace all `console.error/warn` in business logic and API routes with `logger.error/warn`
  - Keep console calls in: `logger.ts`, `startup-check.ts`, `shutdown.ts`, error boundaries
  - Update 12+ files identified in the audit

  **Must NOT do**:
  - Do NOT change console calls in startup-check.ts, shutdown.ts, logger.ts, or error boundaries
  - Do NOT change the log messages themselves

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: 7 (uses structured logger)

  **References**:
  - `src/app/api/groups/route.ts:51,87` — console.error
  - `src/app/api/sessions/[id]/messages/route.ts:46,149` — console.error
  - `src/lib/wiki/ingest.ts:147,227,269` — console.error
  - `src/lib/group-migrations.ts:101` — console.error
  - `src/app/(app)/groups/new/page.tsx:43` — console.error

  **Acceptance Criteria**:
  - Zero console.error/warn in API routes and lib business logic
  - Console calls remain only in: logger.ts, startup-check.ts, shutdown.ts, error boundaries
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No console.error/warn in business logic
    Tool: Bash (grep)
    Steps:
      1. grep -rn "console\.\(error\|warn\)" src/lib/ src/app/api/
      2. Assert zero matches (all use logger)
    Expected Result: 0 matches
    Evidence: .omo/evidence/task-21-no-console-business.txt
  ```

  **Commit**: YES (groups with 17-22)
  - Message: `quality: route all console calls through structured logger`

- [x] 22. Fix Hardcoded Timeouts to Use Config

  **What to do**:
  - Add missing timeout constants to `src/lib/config.ts`:
    - `HEALTH_CHECK_TIMEOUT = 3000`
    - `VOICE_DISCOVERY_TIMEOUT = 5000`
    - `TTS_CONNECTION_TIMEOUT = 5000`
    - `MODEL_FETCH_TIMEOUT = 10000`
    - `LLM_FETCH_TIMEOUT = 30000`
    - `HEALTH_CHECK_INTERVAL = 30000`
  - Replace all inline timeout values with config constants

  **Must NOT do**:
  - Do NOT change the timeout values
  - Do NOT change any other logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/app/api/health/route.ts:20,50` — 3000 timeout
  - `src/lib/voice-discovery.ts:62` — 5000 timeout
  - `src/lib/tts.ts:30` — 5000 timeout
  - `src/lib/startup-check.ts:35` — 5000 timeout
  - `src/lib/ollama.ts:157,215` — 30000 timeout
  - `src/app/api/models/ollama/route.ts:20` — 10000 timeout
  - `src/hooks/use-connection-status.ts:55` — 30000 interval

  **Acceptance Criteria**:
  - All timeout constants added to config.ts
  - Zero hardcoded timeout values in lib/ and api/
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No hardcoded timeouts in lib/api
    Tool: Bash (grep)
    Steps:
      1. grep -rn "3000\|5000\|10000\|30000" src/lib/ src/app/api/ | grep -v "config.ts\|node_modules"
      2. Review results — remaining should be non-timeout values
    Expected Result: No hardcoded timeout values
    Evidence: .omo/evidence/task-22-no-hardcoded-timeouts.txt
  ```

  **Commit**: YES (groups with 17-22)
  - Message: `quality: replace hardcoded timeouts with config constants`

- [ ] 23. Add Pagination to List Endpoints (Batch 1)

  **What to do**:
  - Add cursor-based pagination to these endpoints:
    - `GET /api/sessions/[id]/messages` — currently returns ALL messages
    - `GET /api/narrative-memories` — currently LIMIT 50
    - `GET /api/timeline` — currently LIMIT 200
    - `GET /api/narrative-threads` — currently LIMIT 100
  - Accept `?limit=N&cursor=ID` query parameters
  - Return `{ items: [...], nextCursor: string | null }` response shape
  - Maintain backward compatibility: if no cursor provided, return first page with default limit

  **Must NOT do**:
  - Do NOT break existing clients that don't use pagination params
  - Do NOT change the item response shape

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: 26 (needs indexes first)

  **References**:
  - `src/app/api/sessions/[id]/messages/route.ts:42` — returns all messages
  - `src/app/api/narrative-memories/route.ts:23` — LIMIT 50
  - `src/app/api/timeline/route.ts:56` — LIMIT 200
  - `src/app/api/narrative-threads/route.ts:55` — LIMIT 100

  **Acceptance Criteria**:
  - All 4 endpoints accept `?limit=N&cursor=ID`
  - Response includes `nextCursor` field
  - Default limit applied when no params provided
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Messages endpoint returns paginated results
    Tool: Bash (curl)
    Steps:
      1. GET /api/sessions/[id]/messages?limit=10
      2. Assert response has items array and nextCursor field
      3. Assert items.length <= 10
    Expected Result: Paginated response with nextCursor
    Evidence: .omo/evidence/task-23-messages-paginated.json

  Scenario: Messages endpoint returns first page by default
    Tool: Bash (curl)
    Steps:
      1. GET /api/sessions/[id]/messages (no params)
      2. Assert response has items and nextCursor
      3. Assert default limit applied
    Expected Result: First page with default limit
    Evidence: .omo/evidence/task-23-messages-default.json
  ```

  **Commit**: YES (groups with 23-29)
  - Message: `feat: add pagination to messages, memories, timeline, threads endpoints`

- [ ] 24. Add Pagination to List Endpoints (Batch 2)

  **What to do**:
  - Add cursor-based pagination to these endpoints:
    - `GET /api/backlinks` — currently LIMIT 100
    - `GET /api/users` — currently LIMIT 20
    - `GET /api/tts/cache` — currently LIMIT 20
    - `GET /api/contradictions` — currently LIMIT 50
  - Same pattern as Task 23: `?limit=N&cursor=ID`, return `{ items, nextCursor }`

  **Must NOT do**:
  - Do NOT break existing clients
  - Do NOT change item response shape

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: 26 (needs indexes first)

  **References**:
  - `src/app/api/backlinks/route.ts:38,48` — LIMIT 100
  - `src/app/api/users/route.ts:31,38,48,54` — LIMIT 20
  - `src/app/api/tts/cache/route.ts:62` — LIMIT 20
  - `src/app/api/contradictions/route.ts:94` — LIMIT 50

  **Acceptance Criteria**:
  - All 4 endpoints accept `?limit=N&cursor=ID`
  - Response includes `nextCursor` field
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Users endpoint returns paginated results
    Tool: Bash (curl)
    Steps:
      1. GET /api/users?limit=5
      2. Assert response has items array and nextCursor field
      3. Assert items.length <= 5
    Expected Result: Paginated response
    Evidence: .omo/evidence/task-24-users-paginated.json
  ```

  **Commit**: YES (groups with 23-29)
  - Message: `feat: add pagination to backlinks, users, tts-cache, contradictions endpoints`

- [ ] 25. Fix N+1 Query Patterns

  **What to do**:
  - `src/app/api/groups/route.ts:27-39` — Replace 3 separate COUNT queries per group with a single JOIN query
  - `src/app/api/sessions/[id]/route.ts:30-78` — Replace 4 separate queries (participants, scene state, private settings, turn settings) with a single query using JOINs
  - Use `LEFT JOIN` to include all data in one round trip

  **Must NOT do**:
  - Do NOT change the response shape
  - Do NOT break any existing functionality

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: 26 (needs indexes first)

  **References**:
  - `src/app/api/groups/route.ts:27-39` — N+1: 3 COUNTs per group
  - `src/app/api/sessions/[id]/route.ts:30-78` — N+1: 4 separate queries
  - `scripts/init-db.ts` — table schemas for JOIN construction

  **Acceptance Criteria**:
  - Groups route uses single JOIN query instead of N+1
  - Sessions route uses single JOIN query instead of N+1
  - Response shapes unchanged
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Groups endpoint returns same shape with fewer queries
    Tool: Bash (curl)
    Steps:
      1. GET /api/groups
      2. Assert response has groups array with sessionCount, universeCount, memberCount
      3. Assert response shape matches previous format
    Expected Result: Same response shape, fewer DB queries
    Evidence: .omo/evidence/task-25-groups-response.json
  ```

  **Commit**: YES (groups with 23-29)
  - Message: `perf: fix N+1 query patterns in groups and sessions routes`

- [ ] 26. Add Missing Database Indexes

  **What to do**:
  - Create `scripts/add-missing-indexes.ts` migration script
  - Add indexes for these columns:
    - `messages(sender_id)`
    - `messages(parent_message_id)`
    - `sessions(group_id)`
    - `universes(user_id)`
    - `timelines(user_id)`
    - `narrative_memories(user_id, session_id)`
    - `narrative_memories(user_id, universe_id)`
    - `job_queue(user_id, status)`
    - `relationships(user_id, universe_id, source_entity, target_entity)` — composite index
  - Use `CREATE INDEX IF NOT EXISTS` for idempotency
  - Run the script as part of startup or provide manual execution instructions

  **Must NOT do**:
  - Do NOT modify existing indexes
  - Do NOT change the table schema

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: 23, 24, 25 (pagination and N+1 fixes need indexes)
  - **Blocked By**: None

  **References**:
  - `scripts/init-db.ts` — existing index definitions
  - Table schemas in init-db.ts for column types

  **Acceptance Criteria**:
  - Migration script created with all 9 indexes
  - Script is idempotent (CREATE INDEX IF NOT EXISTS)
  - Script runs without errors
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Migration script runs successfully
    Tool: Bash
    Steps:
      1. Run npx tsx scripts/add-missing-indexes.ts
      2. Assert exit code 0
      3. Assert all indexes created
    Expected Result: All indexes created
    Evidence: .omo/evidence/task-26-migration-output.txt
  ```

  **Commit**: YES (groups with 23-29)
  - Message: `db: add missing indexes for common query patterns`

- [ ] 27. Dynamic Import Cytoscape

  **What to do**:
  - Update `src/components/wiki/graph-view.tsx` to use `next/dynamic` for cytoscape import
  - Add loading state while cytoscape loads
  - Remove `react-cytoscapejs` if possible, use direct cytoscape import
  - Move `@types/cytoscape` from dependencies to devDependencies in package.json

  **Must NOT do**:
  - Do NOT change the graph visualization behavior
  - Do NOT break the graph view component

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/components/wiki/graph-view.tsx` — current cytoscape usage
  - `package.json:14` — @types/cytoscape in dependencies
  - `package.json:25` — react-cytoscapejs dependency

  **Acceptance Criteria**:
  - Cytoscape dynamically imported via next/dynamic
  - Loading state shown while cytoscape loads
  - @types/cytoscape moved to devDependencies
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Build passes with dynamic import
    Tool: Bash
    Steps:
      1. Run npx next build
      2. Assert exit code 0
      3. Check bundle size reduction for graph-view chunk
    Expected Result: Compiled successfully
    Evidence: .omo/evidence/task-27-build-output.txt
  ```

  **Commit**: YES (groups with 23-29)
  - Message: `perf: dynamic import cytoscape to reduce initial bundle`

- [ ] 28. Consolidate Dual State — TTS Settings

  **What to do**:
  - Remove localStorage TTS settings from `src/app/(app)/settings/page.tsx`
  - Store TTS settings (speed, volume, format, autoplay) in the DB via existing settings table
  - Load TTS settings from DB on page load
  - Save TTS settings to DB on change
  - Use structured logger for any warnings

  **Must NOT do**:
  - Do NOT change the TTS settings UI
  - Do NOT change the TTS generation logic
  - Do NOT break existing TTS functionality

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: 7 (uses structured logger)

  **References**:
  - `src/app/(app)/settings/page.tsx:107-213` — localStorage TTS settings
  - `src/app/api/settings/route.ts` — settings API for DB storage
  - `src/contexts/app-context.tsx` — pattern for DB-backed state

  **Acceptance Criteria**:
  - Zero localStorage TTS settings in settings page
  - TTS settings loaded from DB on page load
  - TTS settings saved to DB on change
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No localStorage TTS settings
    Tool: Bash (grep)
    Steps:
      1. grep -n "localStorage.*tts" src/app/(app)/settings/page.tsx
      2. Assert zero matches
    Expected Result: 0 matches
    Evidence: .omo/evidence/task-28-no-localstorage.txt
  ```

  **Commit**: YES (groups with 23-29)
  - Message: `fix: consolidate TTS settings from localStorage to DB`

- [ ] 29. Consolidate Dual State — Voice Assignments

  **What to do**:
  - Remove localStorage voice assignments from `src/app/(app)/voice-combiner/page.tsx`
  - Store voice assignments in DB via existing `voice_assignments` table
  - Load voice assignments from DB on page load
  - Save voice assignments to DB on change
  - Use structured logger for any warnings

  **Must NOT do**:
  - Do NOT change the voice combiner UI
  - Do NOT change the voice assignment logic
  - Do NOT break existing voice functionality

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: 7 (uses structured logger)

  **References**:
  - `src/app/(app)/voice-combiner/page.tsx:56,179,197` — localStorage voice assignments
  - `src/app/api/voice-assignments/` — voice assignments API
  - `scripts/init-db.ts` — voice_assignments table schema

  **Acceptance Criteria**:
  - Zero localStorage voice assignments in voice-combiner page
  - Voice assignments loaded from DB on page load
  - Voice assignments saved to DB on change
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No localStorage voice assignments
    Tool: Bash (grep)
    Steps:
      1. grep -n "localStorage.*voice" src/app/(app)/voice-combiner/page.tsx
      2. Assert zero matches
    Expected Result: 0 matches
    Evidence: .omo/evidence/task-29-no-localstorage.txt
  ```

  **Commit**: YES (groups with 23-29)
  - Message: `fix: consolidate voice assignments from localStorage to DB`

- [ ] 30. Token Rotation on Password Change

  **What to do**:
  - Add `password_changed_at` column to users table (TIMESTAMP, nullable)
  - Update `src/app/api/auth/password/route.ts` to set `password_changed_at = CURRENT_TIMESTAMP` on successful password change
  - Include `password_changed_at` in JWT payload when creating tokens
  - Update `src/lib/auth.ts` verifyToken to reject tokens issued before `password_changed_at`
  - Add migration script to set `password_changed_at = created_at` for existing users

  **Must NOT do**:
  - Do NOT invalidate existing tokens for users who haven't changed passwords
  - Do NOT change the JWT structure for other claims

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: 3 (depends on JWT token removal from login response)

  **References**:
  - `src/app/api/auth/password/route.ts` — password change endpoint
  - `src/lib/auth.ts` — token verification
  - `scripts/init-db.ts` — users table schema

  **Acceptance Criteria**:
  - `password_changed_at` column added to users table
  - Password change sets timestamp
  - JWT includes password_changed_at claim
  - verifyToken rejects tokens issued before password change
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Token rejected after password change
    Tool: Bash (curl)
    Steps:
      1. Login to get valid token
      2. Change password
      3. Use old token to access protected endpoint
      4. Assert 401 response
    Expected Result: 401 Unauthorized
    Evidence: .omo/evidence/task-30-token-rejected.json
  ```

  **Commit**: YES (groups with 30-38)
  - Message: `sec: add token rotation on password change`

- [ ] 31. Token Revocation/Denylist

  **What to do**:
  - Create `token_denylist` table: `(token_id TEXT PRIMARY KEY, expires_at TIMESTAMP)`
  - Update `src/app/api/auth/logout/route.ts` to add the current token's JTI to the denylist
  - Update `src/lib/auth.ts` verifyToken to check denylist before accepting a token
  - Add cleanup job to remove expired entries from denylist
  - Add `jti` (JWT ID) claim to new tokens

  **Must NOT do**:
  - Do NOT change the JWT structure for existing claims
  - Do NOT block logout if denylist write fails (graceful degradation)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: 3 (depends on JWT token removal from login response)

  **References**:
  - `src/app/api/auth/logout/route.ts` — logout endpoint
  - `src/lib/auth.ts` — token verification
  - `src/lib/jose` — JWT library for JTI generation
  - `scripts/init-db.ts` — table schema reference

  **Acceptance Criteria**:
  - `token_denylist` table created
  - Logout adds token to denylist
  - verifyToken checks denylist
  - Expired entries cleaned up
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Token rejected after logout
    Tool: Bash (curl)
    Steps:
      1. Login to get valid token
      2. Logout
      3. Use same token to access protected endpoint
      4. Assert 401 response
    Expected Result: 401 Unauthorized
    Evidence: .omo/evidence/task-31-token-rejected-after-logout.json
  ```

  **Commit**: YES (groups with 30-38)
  - Message: `sec: add token revocation via denylist`

- [ ] 32. Remove x-auth-token Header Fallback

  **What to do**:
  - Update `src/lib/auth-token.ts` to remove the `x-auth-token` header fallback
  - Update `src/middleware.ts` to remove the header fallback
  - Update any client code that sends `x-auth-token` header
  - Document that cookie-only auth is now the only path

  **Must NOT do**:
  - Do NOT break cookie-based authentication
  - Do NOT change the cookie setting logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: 3 (depends on JWT token removal from login response)

  **References**:
  - `src/lib/auth-token.ts:10` — x-auth-token header fallback
  - `src/middleware.ts:43` — header fallback in middleware
  - `src/hooks/use-auth.ts:52` — client sends x-auth-token header

  **Acceptance Criteria**:
  - Zero x-auth-token header references in src/
  - Cookie-only auth works
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No x-auth-token header references
    Tool: Bash (grep)
    Steps:
      1. grep -rn "x-auth-token" src/
      2. Assert zero matches
    Expected Result: 0 matches
    Evidence: .omo/evidence/task-32-no-header-auth.txt
  ```

  **Commit**: YES (groups with 30-38)
  - Message: `sec: remove x-auth-token header fallback`

- [ ] 33. Fix Rate Limiter IP Spoofing

  **What to do**:
  - Update rate limiter key extraction to use the TCP connection IP instead of `x-forwarded-for`
  - In Next.js, use `request.ip` or the socket address from the underlying request
  - Add a trusted proxy configuration option for deployments behind reverse proxies
  - Update all rate-limited routes to use the new key extraction

  **Must NOT do**:
  - Do NOT change the rate limiting algorithm
  - Do NOT change the rate limit thresholds

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: 3 (depends on JWT token removal from login response)

  **References**:
  - `src/app/api/auth/login/route.ts:8` — x-forwarded-for usage
  - `src/app/api/auth/register/route.ts:8` — x-forwarded-for usage
  - `src/lib/rate-limiter.ts` — rate limiter implementation

  **Acceptance Criteria**:
  - Rate limiter key uses request.ip instead of x-forwarded-for
  - Trusted proxy configuration option added
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Rate limiter uses request IP
    Tool: Bash (grep)
    Steps:
      1. grep -rn "x-forwarded-for" src/
      2. Assert zero matches in rate-limited routes
    Expected Result: 0 matches
    Evidence: .omo/evidence/task-33-no-xff.txt
  ```

  **Commit**: YES (groups with 30-38)
  - Message: `sec: fix rate limiter to use request IP instead of x-forwarded-for`

- [ ] 34. Fix Error Response Message Leakage

  **What to do**:
  - Replace all `(error as Error).message` patterns in API routes with `serverError()` from `error-response.ts`
  - In development mode, include the error message; in production, use generic message
  - Update 15+ routes identified in the audit

  **Must NOT do**:
  - Do NOT change the error response shape
  - Do NOT remove error logging (just stop exposing to clients)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: 3 (depends on JWT token removal from login response)

  **References**:
  - `src/app/api/wiki/query/route.ts:35` — error message leakage
  - `src/app/api/wiki/lint/route.ts:35` — error message leakage
  - `src/app/api/wiki/ingest/route.ts:41` — error message leakage
  - `src/app/api/wiki/sources/upload/route.ts:85` — error message leakage
  - `src/lib/error-response.ts` — error response utility

  **Acceptance Criteria**:
  - Zero `(error as Error).message` patterns in API routes
  - Production errors return generic message
  - Development errors return detailed message
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: No error message leakage in production
    Tool: Bash (grep)
    Steps:
      1. grep -rn "(error as Error).message\|error\.message" src/app/api/
      2. Assert zero matches (all use error-response utility)
    Expected Result: 0 matches
    Evidence: .omo/evidence/task-34-no-message-leak.txt
  ```

  **Commit**: YES (groups with 30-38)
  - Message: `sec: fix error response message leakage`

- [ ] 35. Add Input Length Validation

  **What to do**:
  - Add maximum length validation for all string inputs in API routes:
    - `content`: 100,000 chars
    - `username`: 50 chars
    - `query`: 1,000 chars
    - `title`: 200 chars
    - `description`: 5,000 chars
  - Create `src/lib/validation.ts` with `validateLength(value: string, max: number, field: string): void`
  - Apply to all POST/PUT routes

  **Must NOT do**:
  - Do NOT change existing validation logic
  - Do NOT change error response shapes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: 3 (depends on JWT token removal from login response)

  **References**:
  - `src/app/api/sessions/[id]/messages/route.ts` — content input
  - `src/app/api/auth/register/route.ts` — username input
  - `src/app/api/wiki/query/route.ts` — query input
  - `src/lib/error-response.ts` — badRequest for validation errors

  **Acceptance Criteria**:
  - `src/lib/validation.ts` created with validateLength
  - All string inputs validated
  - Oversized inputs return 400
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Oversized content rejected
    Tool: Bash (curl)
    Steps:
      1. POST /api/sessions/[id]/messages with content > 100,000 chars
      2. Assert 400 response
    Expected Result: 400 Bad Request
    Evidence: .omo/evidence/task-35-oversized-rejected.json
  ```

  **Commit**: YES (groups with 30-38)
  - Message: `sec: add input length validation to all API routes`

- [ ] 36. Add Content-Type Validation

  **What to do**:
  - Create middleware or utility that validates `Content-Type: application/json` before calling `request.json()`
  - Apply to all POST/PUT routes that parse JSON body
  - Return 415 Unsupported Media Type for incorrect content types

  **Must NOT do**:
  - Do NOT change existing request handling
  - Do NOT break routes that don't require JSON body

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: 3 (depends on JWT token removal from login response)

  **References**:
  - `src/app/api/sessions/[id]/messages/route.ts` — request.json() usage
  - `src/lib/error-response.ts` — badRequest for validation errors

  **Acceptance Criteria**:
  - All POST/PUT routes validate Content-Type
  - Incorrect content types return 415
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Wrong Content-Type rejected
    Tool: Bash (curl)
    Steps:
      1. POST /api/sessions/[id]/messages with Content-Type: text/plain
      2. Assert 415 response
    Expected Result: 415 Unsupported Media Type
    Evidence: .omo/evidence/task-36-wrong-content-type.json
  ```

  **Commit**: YES (groups with 30-38)
  - Message: `sec: add Content-Type validation to JSON endpoints`

- [ ] 37. Fix Path-Guard Edge Case

  **What to do**:
  - Update `src/lib/wiki/path-guard.ts` to handle the case where the candidate path equals the root directory
  - The current implementation appends `path.sep` to the root, which fails when candidate === root
  - Fix: check `normalizedCandidate === normalizedRoot` OR `normalizedCandidate.startsWith(normalizedRoot + path.sep)`

  **Must NOT do**:
  - Do NOT change the core path validation logic
  - Do NOT break existing path checks

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: 3 (depends on JWT token removal from login response)

  **References**:
  - `src/lib/wiki/path-guard.ts:18-22` — current implementation with edge case

  **Acceptance Criteria**:
  - `isPathWithinRoot` returns true when candidate === root
  - Path traversal still blocked
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Root path passes validation
    Tool: Bash
    Steps:
      1. Import isPathWithinRoot, call with candidate === root
      2. Assert returns true
    Expected Result: true
    Evidence: .omo/evidence/task-37-root-passes.txt
  ```

  **Commit**: YES (groups with 30-38)
  - Message: `fix: handle root path edge case in path-guard`

- [ ] 38. Add Security Headers

  **What to do**:
  - Add security headers to `next.config.ts` via `headers()` configuration:
    - `X-Frame-Options: DENY`
    - `X-Content-Type-Options: nosniff`
    - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
    - `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;`

  **Must NOT do**:
  - Do NOT break any existing functionality
  - Do NOT add overly restrictive CSP that blocks inline styles/scripts needed by the app

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: 3 (depends on JWT token removal from login response)

  **References**:
  - `next.config.ts` — current config (no headers)
  - Next.js 16 docs for headers() API

  **Acceptance Criteria**:
  - All 6 security headers configured in next.config.ts
  - `npx next build` passes
  - Headers present in response

  **QA Scenarios**:
  ```
  Scenario: Security headers present in response
    Tool: Bash (curl)
    Steps:
      1. GET /login -I
      2. Assert X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy, CSP present
    Expected Result: All 6 headers present
    Evidence: .omo/evidence/task-38-security-headers.txt
  ```

  **Commit**: YES (groups with 30-38)
  - Message: `sec: add security headers to next.config.ts`

- [ ] 39. Integrate Startup-Check into Next.js Lifecycle

  **What to do**:
  - Update `src/instrumentation.ts` to call `runStartupChecks()` automatically during Next.js startup
  - Use the `register()` function in instrumentation to run checks before the server starts accepting requests
  - If any critical check fails (JWT_SECRET, data dir, DB), throw to prevent startup
  - If non-critical checks fail (Ollama, TTS), log warnings but allow startup

  **Must NOT do**:
  - Do NOT change the startup-check logic itself
  - Do NOT block startup for non-critical failures

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/startup-check.ts` — existing startup checks
  - `src/instrumentation.ts` — Next.js instrumentation hook

  **Acceptance Criteria**:
  - `runStartupChecks()` called automatically on startup
  - Critical failures prevent startup
  - Non-critical failures log warnings
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Startup checks run automatically
    Tool: Bash
    Steps:
      1. Start dev server
      2. Check console output for [startup] messages
    Expected Result: Startup check messages visible
    Evidence: .omo/evidence/task-39-startup-output.txt
  ```

  **Commit**: YES (groups with 39-46)
  - Message: `ops: integrate startup-check into Next.js lifecycle`

- [ ] 40. Add Test Framework (bun test)

  **What to do**:
  - Add `bun` as dev dependency (if not already present)
  - Create `bunfig.toml` with test configuration
  - Add `"test": "bun test"` to package.json scripts
  - Create initial test file `src/lib/__tests__/safe-json.test.ts` to verify the framework works
  - Test the safeParse utility from Task 17

  **Must NOT do**:
  - Do NOT add Jest, Vitest, or other test frameworks
  - Do NOT write comprehensive tests yet — just verify the framework works

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `package.json` — scripts section
  - `src/lib/safe-json.ts` — utility to test (from Task 17)

  **Acceptance Criteria**:
  - `bun test` command works
  - Initial test file passes
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Test framework works
    Tool: Bash
    Steps:
      1. Run bun test
      2. Assert at least 1 test passes
    Expected Result: Tests pass
    Evidence: .omo/evidence/task-40-test-output.txt
  ```

  **Commit**: YES (groups with 39-46)
  - Message: `chore: add bun test framework`

- [ ] 41. Move @types/cytoscape to devDependencies

  **What to do**:
  - Move `@types/cytoscape` from `dependencies` to `devDependencies` in package.json
  - Run npm install to verify no issues

  **Must NOT do**:
  - Do NOT change any other dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `package.json:14` — @types/cytoscape in dependencies

  **Acceptance Criteria**:
  - @types/cytoscape in devDependencies
  - `npm install` succeeds
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: @types/cytoscape in devDependencies
    Tool: Bash
    Steps:
      1. Check package.json for @types/cytoscape in devDependencies
      2. Assert not in dependencies
    Expected Result: Correct placement
    Evidence: .omo/evidence/task-41-package-json.txt
  ```

  **Commit**: YES (groups with 39-46)
  - Message: `chore: move @types/cytoscape to devDependencies`

- [ ] 42. Fix WAL Checkpoint Configuration

  **What to do**:
  - Update `src/lib/db.ts` to set `wal_autocheckpoint` pragma after enabling WAL mode
  - Set to 1000 pages (default) or a reasonable value
  - Add a manual checkpoint function that can be called during shutdown

  **Must NOT do**:
  - Do NOT change the WAL mode setting
  - Do NOT change any other DB configuration

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/db.ts:21` — WAL mode pragma
  - better-sqlite3 docs for PRAGMA wal_autocheckpoint

  **Acceptance Criteria**:
  - wal_autocheckpoint pragma set
  - Manual checkpoint function available
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: WAL autocheckpoint configured
    Tool: Bash
    Steps:
      1. Read db.ts, verify PRAGMA wal_autocheckpoint is set
    Expected Result: Pragma present
    Evidence: .omo/evidence/task-42-wal-config.txt
  ```

  **Commit**: YES (groups with 39-46)
  - Message: `db: configure WAL autocheckpoint`

- [ ] 43. Fix Mixed API Response Casing

  **What to do**:
  - Standardize on camelCase for all API response fields
  - Use SQL `AS` aliases in queries that return snake_case columns
  - Create a `camelizeKeys()` utility in `src/lib/response-utils.ts` for consistent transformation
  - Apply to routes that currently return snake_case: `groups/route.ts`, `universes/route.ts`

  **Must NOT do**:
  - Do NOT change the DB column names
  - Do NOT break existing clients that expect snake_case (add migration notes)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/app/api/groups/route.ts` — returns raw DB rows (snake_case)
  - `src/lib/backlinks.ts:228-239` — uses AS aliases (camelCase) — good pattern
  - `src/lib/row-to-json.ts` — existing row transformation utility

  **Acceptance Criteria**:
  - All API responses use camelCase
  - camelizeKeys utility created
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: API responses use camelCase
    Tool: Bash (curl)
    Steps:
      1. GET /api/groups
      2. Assert response fields are camelCase (createdAt, not created_at)
    Expected Result: camelCase fields
    Evidence: .omo/evidence/task-43-camelcase.json
  ```

  **Commit**: YES (groups with 39-46)
  - Message: `quality: standardize API responses to camelCase`

- [ ] 44. Add Request Correlation IDs

  **What to do**:
  - Add `requestId` field to all error responses via `error-response.ts`
  - Generate unique ID per request using `crypto.randomUUID()`
  - Include requestId in structured logger output
  - Add requestId to response headers (`X-Request-Id`)

  **Must NOT do**:
  - Do NOT change the error response shape beyond adding requestId
  - Do NOT break existing error handling

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6
  - **Blocks**: None
  - **Blocked By**: 7 (uses structured logger)

  **References**:
  - `src/lib/error-response.ts` — error response utility
  - `src/lib/logger.ts` — structured logger (from Task 7)

  **Acceptance Criteria**:
  - All error responses include requestId field
  - All responses include X-Request-Id header
  - Logger includes requestId in output
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Error response includes requestId
    Tool: Bash (curl)
    Steps:
      1. Make a request that returns an error
      2. Assert response body has requestId field
      3. Assert response headers include X-Request-Id
    Expected Result: requestId in body and header
    Evidence: .omo/evidence/task-44-request-id.json
  ```

  **Commit**: YES (groups with 39-46)
  - Message: `ops: add request correlation IDs to error responses`

- [ ] 45. Fix react-cytoscapejs React 19 Compatibility

  **What to do**:
  - Check if `react-cytoscapejs@2.0.0` is compatible with React 19
  - If not compatible, replace with direct cytoscape usage (no React wrapper)
  - Create a custom React wrapper component that manages the cytoscape instance via useEffect and useRef
  - This also supports the dynamic import from Task 27

  **Must NOT do**:
  - Do NOT change the graph visualization behavior
  - Do NOT break the graph view component

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6
  - **Blocks**: None
  - **Blocked By**: 27 (dynamic import)

  **References**:
  - `src/components/wiki/graph-view.tsx` — current cytoscape usage
  - `package.json:25` — react-cytoscapejs dependency

  **Acceptance Criteria**:
  - react-cytoscapejs removed or verified compatible
  - Custom React wrapper created if needed
  - Graph view works correctly
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Build passes without react-cytoscapejs compatibility issues
    Tool: Bash
    Steps:
      1. Run npx next build
      2. Assert exit code 0
    Expected Result: Compiled successfully
    Evidence: .omo/evidence/task-45-build-output.txt
  ```

  **Commit**: YES (groups with 39-46)
  - Message: `fix: resolve react-cytoscapejs React 19 compatibility`

- [ ] 46. Prompt Injection Protection

  **What to do**:
  - Add delimiters/escaping in `src/lib/prompt-builder.ts` to separate user content from system instructions
  - Use XML-style tags or markdown fences to delimit user content: `<user_content>...</user_content>`
  - Add a validation step that checks LLM outputs for instruction-following before storing/displaying
  - Add a system instruction that tells the LLM to ignore any instructions found in user content

  **Must NOT do**:
  - Do NOT change the LLM prompt structure beyond adding delimiters
  - Do NOT break existing LLM functionality

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/prompt-builder.ts` — prompt assembly
  - `src/lib/prompts.ts` — prompt templates
  - `src/lib/ollama.ts` — LLM client

  **Acceptance Criteria**:
  - User content delimited in all prompts
  - System instruction includes injection protection
  - LLM outputs validated before storage
  - `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Prompt injection attempt is neutralized
    Tool: Bash
    Steps:
      1. Create wiki content with prompt injection attempt
      2. Trigger LLM generation with that content
      3. Assert LLM output does not follow injected instructions
    Expected Result: Injection attempt ignored
    Evidence: .omo/evidence/task-46-injection-blocked.txt
  ```

  **Commit**: YES (groups with 39-46)
  - Message: `sec: add prompt injection protection`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx next build` + lint. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration. Test edge cases: empty state, invalid input, rapid actions. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1 (Tasks 1-8)**: `sec: fix critical security and stability issues`
  - Files: `src/lib/wiki/revisions.ts`, `src/lib/relationship-constants.ts`, `src/app/api/auth/login/route.ts`, `src/lib/shutdown.ts`, `src/lib/event-bus.ts`, `src/lib/job-processor.ts`, `src/lib/logger.ts`, `src/app/api/health/route.ts`
  - Pre-commit: `npx next build`

- **Wave 2 (Tasks 9-16)**: `quality: deduplicate code and improve type safety`
  - Files: `src/lib/wiki/wiki-root.ts`, `src/lib/universe-utils.ts`, `src/lib/emotion-utils.ts`, `src/lib/wiki/types.ts`, `src/lib/relationship-types.ts` + updated callers
  - Pre-commit: `npx next build`

- **Wave 3 (Tasks 17-22)**: `fix: improve error handling and logging`
  - Files: `src/lib/safe-json.ts` + 34 updated files
  - Pre-commit: `npx next build`

- **Wave 4 (Tasks 23-29)**: `perf: add pagination, fix N+1 queries, optimize bundle`
  - Files: 8 route files, `scripts/add-missing-indexes.ts`, `src/components/wiki/graph-view.tsx`, `src/app/(app)/settings/page.tsx`, `src/app/(app)/voice-combiner/page.tsx`
  - Pre-commit: `npx next build`

- **Wave 5 (Tasks 30-38)**: `sec: harden authentication and input validation`
  - Files: `src/lib/auth.ts`, `src/lib/validation.ts`, `src/lib/auth-token.ts`, `src/lib/rate-limiter.ts`, `src/lib/error-response.ts`, `src/lib/wiki/path-guard.ts`, `next.config.ts` + updated routes
  - Pre-commit: `npx next build`

- **Wave 6 (Tasks 39-46)**: `ops: production readiness and cleanup`
  - Files: `src/instrumentation.ts`, `package.json`, `src/lib/db.ts`, `src/lib/response-utils.ts`, `src/components/wiki/graph-view.tsx`, `src/lib/prompt-builder.ts`
  - Pre-commit: `npx next build`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: Compiled successfully
npx tsc --noEmit  # Expected: no errors
```

### Final Checklist
- [ ] All 7 CRITICAL findings resolved
- [ ] All 15 HIGH findings resolved
- [ ] All 27 MEDIUM findings resolved or explicitly deferred
- [ ] All 12 LOW findings resolved or explicitly deferred
- [ ] `npx next build` passes
- [ ] Zero new TypeScript errors
- [ ] Zero `as any` casts
- [ ] Zero unprotected `JSON.parse()` calls
- [ ] Zero empty catch blocks
- [ ] Zero circular dependencies
- [ ] All API endpoints have pagination
- [ ] All security headers configured
- [ ] Structured logging in place
- [ ] Health check endpoints working
- [ ] Test framework operational
