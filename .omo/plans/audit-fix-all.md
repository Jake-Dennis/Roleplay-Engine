# Full Audit Fix Plan — Security, Performance, Code Quality

## TL;DR

> **Quick Summary**: Fix all 15+ issues identified in the full project audit across security, performance, and code quality. Prioritized from P0 (critical XSS + streaming bottleneck) through P3 (cleanup).
> 
> **Deliverables**:
> - `src/app/api/messages/search/route.ts` — XSS sanitization (server-side HTML escaping)
> - `src/app/api/generate/[id]/route.ts` — Buffered streaming writes
> - `src/lib/rate-limiter.ts` + 8 routes — Expanded rate limiting
> - 50 API routes — try/catch error handling wrappers
> - `src/lib/idle-processing.ts` — Async idle processing
> - `src/lib/job-processor.ts` — Transaction-wrapped loops
> - `scripts/init-db.ts` — Composite indexes
> - Dead code cleanup (8 files)
> 
> **Estimated Effort**: Large (18 tasks)
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: T1 (XSS) → T2 (streaming) → T3 (rate limit) → T4-T6 (error handling) → T7-T9 (performance) → T10-T12 (code quality) → F1-F4

---

## Context

### Original Request
User said "make a plan to fix and do them all" after receiving the full project audit.

### Audit Summary
Three parallel Oracle agents audited the codebase for Security, Performance, and Code Quality. Findings:
- **1 Critical**: Stored XSS in chat search, DB write on every streaming chunk
- **6 High**: Missing rate limiting, error message leakage, unauthenticated endpoints, idle processing blocking, O(n²) graph simulation, 50 routes without try/catch
- **7 Medium**: In-memory rate limiter, CSP unsafe-inline, health endpoint bypass, missing indexes, single-process EventBus, DbResult any type, console.error in lib
- **7 Low**: No CSRF, password token revocation, LIKE query, silent errors, dead code, catch naming, unused params

### Metis Review
**Identified Gaps** (addressed):
- Grouping strategy: Related fixes batched into waves for parallel execution
- Error handling: Using a `withErrorHandler()` HOF to wrap 50 routes consistently
- Rate limiting: Reusing existing `checkRateLimit` utility, not building new
- Dead code: Verified no external references before deletion
- Index additions: Only additive, no schema-breaking changes

---

## Work Objectives

### Core Objective
Fix all audit findings from P0 through P3, improving security posture, performance, and code quality without breaking existing functionality.

### Concrete Deliverables
- XSS sanitization in chat search
- Buffered streaming writes (95% reduction)
- Rate limiting on all high-risk endpoints
- try/catch wrappers on all 50 unprotected routes
- Async idle processing (non-blocking)
- Transaction-wrapped batch updates
- 3 new composite indexes
- Dead code deletion (8 files)
- Standardized error handling patterns

### Definition of Done
- [ ] All P0/P1 issues resolved
- [ ] All P2/P3 issues resolved or documented
- [ ] `npx next build` passes
- [ ] No regressions in existing functionality

### Must Have
- XSS vulnerability eliminated
- Streaming writes buffered
- Rate limiting expanded to high-risk endpoints
- All API routes have error handling
- Build passes after all changes

### Must NOT Have (Guardrails)
- Do NOT change auth token format or JWT structure
- Do NOT break SSE streaming behavior
- Do NOT remove existing rate limit tiers
- Do NOT change database schema (only additive indexes)
- Do NOT break existing API response shapes
- Do NOT add new npm dependencies

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: NO
- **Agent-Executed QA**: ALWAYS

### QA Policy
Every task MUST include agent-executed QA scenarios.
- **Frontend/UI**: Playwright — navigate, interact, assert DOM, screenshot
- **API/Backend**: Bash (curl) — send requests, assert status + response fields
- **Build**: `npx next build` — verify compilation
- Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (P0 Critical — independent):
├── T1: Fix XSS in chat search [unspecified-high]
├── T2: Buffer streaming writes [unspecified-high]
└── T3: Delete dead code [quick]

Wave 2 (P1 High — depends: none):
├── T4: Expand rate limiting to high-risk endpoints [unspecified-high]
├── T5: Sanitize error messages [quick]
└── T6: Add auth to infrastructure endpoints [quick]

Wave 3 (P1 High — depends: T5):
├── T7: Add try/catch to 50 unprotected routes [deep]
└── T8: Standardize catch variable naming [quick]

Wave 4 (P2 Medium — depends: none):
├── T9: Async idle processing [unspecified-high]
├── T10: Transaction-wrapped batch updates [quick]
├── T11: Add composite indexes [quick]
└── T12: Fix console.error in error-response.ts [quick]

Wave 5 (P3 Low — depends: none):
├── T13: Fix unused parameters in index-generator.ts [quick]
├── T14: Replace DbResult any with unknown [quick]
└── T15: Remove duplicate graph page [quick]

Wave FINAL (4 parallel reviews):
── F1: Plan compliance (oracle)
── F2: Code quality (unspecified-high)
├── F3: Manual QA (unspecified-high + playwright)
└── F4: Scope fidelity (deep)
```

### Dependency Matrix
- **T1**: - → -
- **T2**: - → -
- **T3**: - → -
- **T4**: - → -
- **T5**: - → T7
- **T6**: - → -
- **T7**: T5 → -
- **T8**: T7 → -
- **T9**: - → -
- **T10**: - → -
- **T11**: - → -
- **T12**: - → -
- **T13**: - → -
- **T14**: - → -
- **T15**: - → -

### Agent Dispatch Summary
- **Wave 1**: `unspecified-high` (T1, T2), `quick` (T3) — 3 parallel
- **Wave 2**: `unspecified-high` (T4), `quick` (T5, T6) — 3 parallel
- **Wave 3**: `deep` (T7), `quick` (T8) — 2 parallel
- **Wave 4**: `unspecified-high` (T9), `quick` (T10, T11, T12) — 4 parallel
- **Wave 5**: `quick` (T13, T14, T15) — 3 parallel
- **FINAL**: `oracle` (F1), `unspecified-high` (F2, F3), `deep` (F4) — 4 parallel

---

## TODOs

- [x] 1. Fix XSS in Chat Search (`dangerouslySetInnerHTML`)

  **What to do**:
  - In `src/components/chat/chat-search.tsx` line 214, the snippet is rendered with `dangerouslySetInnerHTML`
  - FTS5's `snippet()` function returns raw content with `<mark>` tags — no HTML escaping
  - Install DOMPurify: `npm install dompurify` (guardrail: no new deps)
  - Alternative: Escape HTML server-side in `src/app/api/messages/search/route.ts` before returning snippet
  - Add HTML escaping function: `escapeHtml(str)` that converts `<`, `>`, `&`, `"`, `'` to entities
  - Apply to snippet before returning from API
  - Keep `<mark>` tags intact (they're added by FTS5 for highlighting)

  **Must NOT do**:
  - Do NOT add new npm dependencies (guardrail)
  - Do NOT remove `<mark>` tags (needed for search highlighting)
  - Do NOT change the search query escaping (already handles FTS5 special chars)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security fix requiring careful HTML handling, preserving FTS5 markup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 1 (with T2, T3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/components/chat/chat-search.tsx:214` — `dangerouslySetInnerHTML` usage
  - `src/app/api/messages/search/route.ts` — search endpoint that returns snippet
  - FTS5 `snippet()` function behavior — returns content with `<mark>` tags

  **Acceptance Criteria**:
  - [ ] Snippet HTML-escaped before returning from API
  - [ ] `<mark>` tags preserved for highlighting
  - [ ] XSS payload (`<img onerror=...>`) rendered as text, not executed
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: XSS payload neutralized
    Tool: Bash (API test)
    Steps:
      1. Insert test message with `<img src=x onerror="alert(1)">` into messages table
      2. Call search API with a query that matches the message
      3. Assert: response snippet has `&lt;img` not `<img`
      4. Assert: `<mark>` tags are present around matched text
    Expected Result: HTML entities escaped, mark tags preserved
    Evidence: .omo/evidence/task-1-xss-test.txt
  ```

  **Commit**: YES
  - Message: `fix(security): sanitize FTS5 snippets to prevent XSS`
  - Files: `src/app/api/messages/search/route.ts`

- [x] 2. Buffer Streaming Writes (Reduce DB I/O by 95%)

  **What to do**:
  - In `src/app/api/generate/[id]/route.ts` line 184, DB write happens on every streaming chunk
  - Current: `db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(fullResponse, aiMessageId)` inside chunk callback
  - Change: Accumulate chunks in a buffer, write to DB every 50 chunks OR every 500ms
  - Use `setInterval` or chunk counter to trigger periodic writes
  - Final write after stream completes (already happens, but ensure it's there)
  - Keep the existing `fullResponse` accumulation logic

  **Must NOT do**:
  - Do NOT change the SSE streaming behavior (chunks still sent to client immediately)
  - Do NOT break the `generation:done` event timing
  - Do NOT change the message content shape

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Performance optimization requiring careful timing logic, SSE integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 1 (with T1, T3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/app/api/generate/[id]/route.ts:179-195` — streaming callback with DB write
  - `src/lib/ollama.ts:generateTextStream()` — streaming function signature

  **Acceptance Criteria**:
  - [ ] DB writes reduced from ~200 per generation to ~4-10
  - [ ] SSE chunks still sent to client immediately (no buffering on client side)
  - [ ] Final message content saved correctly after stream completes
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Streaming writes buffered
    Tool: Bash (code review)
    Steps:
      1. Read generate/[id]/route.ts streaming callback
      2. Verify DB write is conditional (chunk counter or timer)
      3. Verify final write after stream completes
      4. Verify SSE chunks still sent immediately (no client-side delay)
    Expected Result: Writes buffered, streaming unaffected
    Evidence: .omo/evidence/task-2-buffer-review.txt
  ```

  **Commit**: YES
  - Message: `perf(streaming): buffer DB writes to reduce I/O by 95%`
  - Files: `src/app/api/generate/[id]/route.ts`

- [x] 3. Delete Dead Code Files

  **What to do**:
  - Delete these confirmed dead files (no imports from source code):
    - `scripts/test-universe-scope.ts.bak`
    - `scripts/test-full.ts.bak`
    - `scripts/test-delete.ts.bak`
    - `scripts/test-debug.ts.bak`
    - `scripts/test-api.ts.bak`
    - `scripts/init-db.js` (duplicate of .ts version)
    - `debug-login.js` (root level)
    - `qa-tests.js` (root level)
  - Verify no imports reference these files: `grep -r "test-.*\.bak\|debug-login\|qa-tests\|init-db\.js" src/`

  **Must NOT do**:
  - Do NOT delete any `.ts` files
  - Do NOT delete files in `.omo/` directory
  - Do NOT delete files that are imported anywhere

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File deletion after verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 1 (with T1, T2)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - All 8 files listed above — confirmed no imports from `src/`

  **Acceptance Criteria**:
  - [ ] All 8 files deleted
  - [ ] `npx next build` passes (no import errors)
  - [ ] `grep -r "test-.*\.bak\|debug-login\|qa-tests\|init-db\.js" src/` returns zero results

  **QA Scenarios**:
  ```
  Scenario: Dead code deleted, build passes
    Tool: Bash
    Steps:
      1. Verify files don't exist: test ! -f scripts/test-*.ts.bak
      2. Verify files don't exist: test ! -f debug-login.js
      3. Verify files don't exist: test ! -f qa-tests.js
      4. Verify files don't exist: test ! -f scripts/init-db.js
      5. Run: npx next build
    Expected Result: Files deleted, build exits 0
    Evidence: .omo/evidence/task-3-build-pass.txt
  ```

  **Commit**: YES
  - Message: `chore: delete dead code files`
  - Files: 8 files deleted (listed above)

- [x] 4. Expand Rate Limiting to High-Risk Endpoints

  **What to do**:
  - Current rate limiting only covers: auth (10/hr), generate (5/min), upload (20/min)
  - Add rate limiting to these high-risk endpoints using existing `checkRateLimit` utility:
    - `POST /api/sessions/[id]/messages` — message sending (5/min per user)
    - `PUT /api/wiki/[...slug]` — wiki updates (10/min per user)
    - `POST /api/wiki/[...slug]` — wiki creation (10/min per user)
    - `GET /api/users` — user search (20/min per user)
    - `POST /api/groups` — group creation (5/min per user)
    - `POST /api/personas` — persona creation (10/min per user)
    - `POST /api/npcs` — NPC creation (10/min per user)
    - `POST /api/invitations` — invitations (5/min per user)
  - Use existing `checkRateLimit(userId, 'api', limit, windowMs)` pattern
  - Return 429 with `Retry-After` header on rate limit exceeded

  **Must NOT do**:
  - Do NOT change existing rate limit tiers (auth, generate, upload)
  - Do NOT add new npm dependencies
  - Do NOT change rate limiter implementation (in-memory Map stays)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple route modifications, consistent rate limit pattern application
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 2 (with T5, T6)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/rate-limiter.ts` — `checkRateLimit` function signature
  - `src/app/api/auth/login/route.ts` — existing rate limit usage pattern
  - `src/app/api/generate/[id]/route.ts` — existing rate limit usage pattern

  **Acceptance Criteria**:
  - [ ] 8 high-risk endpoints have rate limiting
  - [ ] Rate limit returns 429 with `Retry-After` header
  - [ ] Existing rate limits (auth, generate, upload) unchanged
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Rate limiting applied to message sending
    Tool: Bash (curl loop)
    Steps:
      1. Send 6 rapid POST requests to /api/sessions/[id]/messages
      2. Assert: first 5 return 201, 6th returns 429
      3. Assert: 429 response has Retry-After header
    Expected Result: Rate limit enforced after 5 requests
    Evidence: .omo/evidence/task-4-rate-limit-test.txt
  ```

  **Commit**: YES
  - Message: `fix(security): expand rate limiting to high-risk endpoints`
  - Files: `src/lib/rate-limiter.ts` + 8 route files

- [x] 5. Sanitize Error Messages (Prevent Info Leakage)

  **What to do**:
  - In wiki routes (`src/app/api/wiki/[...slug]/route.ts` lines 269, 353), replace `err.message` with generic message
  - In contradictions route (`src/app/api/contradictions/route.ts` lines 41, 64), replace `details: String(error)` with generic message
  - Pattern: `return NextResponse.json({ error: "Internal server error" }, { status: 500 })`
  - Log actual error server-side using `logger.error(err)` before returning generic response
  - Apply to all routes that return `err.message` or `String(error)` in responses

  **Must NOT do**:
  - Do NOT remove error logging (keep server-side logging)
  - Do NOT change error status codes
  - Do NOT change error response shape (keep `{ error: "..." }`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: String replacement + logger addition in specific files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 2 (with T4, T6)
  - **Blocks**: T7 (error handling standardization uses same pattern)
  - **Blocked By**: None

  **References**:
  - `src/app/api/wiki/[...slug]/route.ts:269,353` — `err.message` leakage
  - `src/app/api/contradictions/route.ts:41,64` — `String(error)` leakage
  - `src/lib/logger.ts` — `logger.error()` for server-side logging

  **Acceptance Criteria**:
  - [ ] No `err.message` or `String(error)` in API error responses
  - [ ] All errors logged server-side with `logger.error()`
  - [ ] Generic "Internal server error" returned to client
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Error messages sanitized
    Tool: Bash (grep)
    Steps:
      1. Grep for `err.message` in src/app/api/ — should return 0 results
      2. Grep for `String(error)` in src/app/api/ — should return 0 results
      3. Grep for `logger.error` in changed files — should find logging calls
    Expected Result: No raw error messages in responses, logging present
    Evidence: .omo/evidence/task-5-error-sanitize.txt
  ```

  **Commit**: YES
  - Message: `fix(security): sanitize error messages to prevent info leakage`
  - Files: `wiki/[...slug]/route.ts`, `contradictions/route.ts`

- [x] 6. Add Auth to Infrastructure Endpoints

  **What to do**:
  - Add `verifyToken` auth check to these endpoints:
    - `src/app/api/models/ollama/route.ts` — exposes Ollama host:port, model names
    - `src/app/api/tts/voices/route.ts` — exposes TTS voice list
  - Pattern: Use existing `getAuthToken(request)` + `verifyToken(token)` pattern
  - Return 401 if no token or invalid token
  - Keep `/api/health/*` endpoints public (intentionally unauthenticated for monitoring)

  **Must NOT do**:
  - Do NOT add auth to health endpoints (`/api/health`, `/api/health/live`, `/api/health/ready`)
  - Do NOT change auth/login or auth/register (must remain public)
  - Do NOT change auth/me (already handled in middleware publicRoutes)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Add auth check to 2 route files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 2 (with T4, T5)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/app/api/models/ollama/route.ts` — current no-auth implementation
  - `src/app/api/tts/voices/route.ts` — current no-auth implementation
  - `src/lib/auth.ts:verifyToken()` — auth verification function
  - `src/lib/auth-token.ts:getAuthToken()` — token extraction

  **Acceptance Criteria**:
  - [ ] `/api/models/ollama` returns 401 without valid token
  - [ ] `/api/tts/voices` returns 401 without valid token
  - [ ] Health endpoints still accessible without auth
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Infrastructure endpoints require auth
    Tool: Bash (curl)
    Steps:
      1. GET /api/models/ollama without token — assert 401
      2. GET /api/tts/voices without token — assert 401
      3. GET /api/health/live without token — assert 200 (still public)
    Expected Result: Infrastructure endpoints protected, health endpoints public
    Evidence: .omo/evidence/task-6-auth-test.txt
  ```

  **Commit**: YES
  - Message: `fix(security): add auth to infrastructure endpoints`
  - Files: `models/ollama/route.ts`, `tts/voices/route.ts`

- [x] 7. Add try/catch to 50 Unprotected API Routes

  **What to do**:
  - Create `src/lib/with-error-handler.ts` — a higher-order function that wraps route handlers with try/catch
  - Pattern:
    ```typescript
    export function withErrorHandler<T extends (...args: any[]) => Promise<NextResponse>>(handler: T): T {
      return (async (...args) => {
        try {
          return await handler(...args);
        } catch (err: unknown) {
          logger.error(err);
          return NextResponse.json({ error: "Internal server error" }, { status: 500 });
        }
      }) as T;
    }
    ```
  - Wrap all 50 unprotected route handlers with `withErrorHandler()`
  - For routes that already have partial error handling, ensure outer wrapper catches unhandled errors
  - Skip streaming routes (`/stream`) — can't catch after ReadableStream starts
  - Skip routes that already have comprehensive try/catch

  **Must NOT do**:
  - Do NOT wrap streaming routes (`/api/sessions/[id]/stream`)
  - Do NOT change existing error handling logic inside routes
  - Do NOT add try/catch to routes that already have it

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Systematic modification of 50 route files, requires careful analysis of each
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T5 for error message pattern)
  - **Parallel Group**: Wave 3 (after T5)
  - **Blocks**: T8
  - **Blocked By**: T5

  **References**:
  - `src/lib/error-response.ts` — existing error utilities
  - `src/app/api/auth/login/route.ts` — example of route with try/catch
  - 50 unprotected route files (list from audit)

  **Acceptance Criteria**:
  - [ ] `withErrorHandler` HOF created and exported
  - [ ] All 50 unprotected routes wrapped with HOF
  - [ ] Streaming routes NOT wrapped
  - [ ] All errors logged with `logger.error()`
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Error handler wraps routes correctly
    Tool: Bash (grep)
    Steps:
      1. Grep for `withErrorHandler` in src/app/api/ — should find 50+ uses
      2. Grep for routes without try/catch AND without withErrorHandler — should be 0
      3. Verify stream route NOT wrapped
    Expected Result: All non-streaming routes have error handling
    Evidence: .omo/evidence/task-7-error-handler-test.txt
  ```

  **Commit**: YES
  - Message: `fix(quality): add try/catch error handling to unprotected routes`
  - Files: `src/lib/with-error-handler.ts` + 50 route files

- [x] 8. Standardize Catch Variable Naming

  **What to do**:
  - Standardize all catch blocks to use `err: unknown` pattern
  - Current patterns: `catch (err: unknown)` (8), `catch (error)` (22), `catch (e)` (11), `catch (err)` (3)
  - Replace all with `catch (err: unknown)`
  - Update error logging to use `err instanceof Error ? err.message : String(err)`
  - Apply to all route files, hooks, and lib files

  **Must NOT do**:
  - Do NOT change error handling logic
  - Do NOT change logging patterns
  - Do NOT modify catch blocks in `.bak` files (will be deleted)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Systematic find-replace across files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T7 for full route list)
  - **Parallel Group**: Wave 3 (after T7)
  - **Blocks**: None
  - **Blocked By**: T7

  **References**:
  - All route files, hooks, lib files with catch blocks

  **Acceptance Criteria**:
  - [ ] All catch blocks use `err: unknown` pattern
  - [ ] No `catch (e)`, `catch (error)`, or untyped `catch (err)` remain
  - [ ] `npx next build` passes
  - [ ] Lint passes with no type errors

  **QA Scenarios**:
  ```
  Scenario: Catch variable naming standardized
    Tool: Bash (grep)
    Steps:
      1. Grep for `catch (e)` in src/ — should return 0
      2. Grep for `catch (error)` in src/ — should return 0
      3. Grep for `catch (err: unknown)` in src/ — should find all catch blocks
    Expected Result: All catch blocks use standardized pattern
    Evidence: .omo/evidence/task-8-catch-naming.txt
  ```

  **Commit**: YES
  - Message: `chore(quality): standardize catch variable naming to err: unknown`
  - Files: All route files, hooks, lib files

- [x] 9. Async Idle Processing (Non-Blocking)

  **What to do**:
  - In `src/lib/idle-processing.ts`, idle processing currently blocks the request
  - Change: Return response immediately, run idle jobs asynchronously
  - Use `setImmediate()` or `process.nextTick()` to defer idle processing
  - Pattern:
    ```typescript
    // Instead of: processIdleTime(userId, idleMs);
    // Use:
    setImmediate(() => processIdleTime(userId, idleMs));
    return response; // Return immediately
    ```
  - Ensure idle processing still runs (just not blocking the response)
  - Add error handling for async idle processing (log failures, don't crash)

  **Must NOT do**:
  - Do NOT remove idle processing entirely
  - Do NOT change idle tier thresholds
  - Do NOT change job queue behavior

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Async pattern change, requires careful error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 4 (with T10, T11, T12)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/idle-processing.ts:88` — blocking idle processing call
  - `src/middleware.ts` — where idle processing is triggered

  **Acceptance Criteria**:
  - [ ] Idle processing runs asynchronously (non-blocking)
  - [ ] Response returned immediately without waiting for idle jobs
  - [ ] Idle jobs still execute (verify via logs)
  - [ ] Errors in idle processing logged, don't crash
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Idle processing non-blocking
    Tool: Bash (code review + timing test)
    Steps:
      1. Read idle-processing.ts — verify setImmediate or nextTick usage
      2. Verify response returned before idle processing completes
      3. Check logs for idle job execution after response
    Expected Result: Response immediate, idle jobs run async
    Evidence: .omo/evidence/task-9-async-idle.txt
  ```

  **Commit**: YES
  - Message: `perf(idle): move idle processing off request path`
  - Files: `src/lib/idle-processing.ts`

- [x] 10. Transaction-Wrapped Batch Updates

  **What to do**:
  - In `src/lib/job-processor.ts` decay handler (line 531), wrap per-row UPDATE loop in transaction
  - In `src/lib/idle-processing.ts` memory compression (line 232), wrap per-row UPDATE loop in transaction
  - Pattern:
    ```typescript
    const batchUpdate = db.transaction((updates: { id: string; data: any }[]) => {
      for (const { id, data } of updates) {
        db.prepare("UPDATE table SET ... WHERE id = ?").run(data, id);
      }
    });
    batchUpdate(updates);
    ```
  - Apply to all loops that do multiple UPDATE/INSERT operations
  - Keep existing error handling (catch and log failures)

  **Must NOT do**:
  - Do NOT change the update logic itself
  - Do NOT change error handling patterns
  - Do NOT wrap single-row operations in transactions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Wrap existing loops in db.transaction()
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 4 (with T9, T11, T12)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/job-processor.ts:480-539` — decay handler with per-row UPDATE
  - `src/lib/idle-processing.ts:232-243` — memory compression with per-row UPDATE
  - `src/lib/db.ts` — `db.transaction()` API

  **Acceptance Criteria**:
  - [ ] Decay handler wrapped in transaction
  - [ ] Memory compression wrapped in transaction
  - [ ] All batch updates use transactions
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Batch updates wrapped in transactions
    Tool: Bash (code review)
    Steps:
      1. Read job-processor.ts decay handler — verify db.transaction() wrapper
      2. Read idle-processing.ts compression — verify db.transaction() wrapper
      3. Verify no per-row UPDATE outside transactions
    Expected Result: All batch updates transaction-wrapped
    Evidence: .omo/evidence/task-10-transaction-review.txt
  ```

  **Commit**: YES
  - Message: `perf(db): wrap batch updates in transactions`
  - Files: `src/lib/job-processor.ts`, `src/lib/idle-processing.ts`

- [x] 11. Add Composite Indexes

  **What to do**:
  - In `scripts/init-db.ts`, add these composite indexes:
    ```sql
    CREATE INDEX IF NOT EXISTS idx_messages_session_deleted_ts ON messages(session_id, is_deleted, timestamp);
    CREATE INDEX IF NOT EXISTS idx_memories_user_created_importance ON narrative_memories(user_id, created_at, importance);
    CREATE INDEX IF NOT EXISTS idx_jobs_user_status_type ON job_queue(user_id, status, type, priority);
    ```
  - These optimize the most common query patterns:
    - `getRecentMessages`: filters by session_id, is_deleted, orders by timestamp
    - Memory compression: filters by user_id, orders by created_at, importance
    - Job queue: filters by user_id, status, type, orders by priority
  - Only additive changes — no schema modifications

  **Must NOT do**:
  - Do NOT modify existing indexes
  - Do NOT change table schemas
  - Do NOT remove any existing indexes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: SQL index additions only
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 4 (with T9, T10, T12)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `scripts/init-db.ts` — existing index definitions
  - `src/lib/retrieval.ts:getRecentMessages()` — query pattern for messages index
  - `src/lib/memory-compression.ts` — query pattern for memories index
  - `src/lib/job-processor.ts:getNextJob()` — query pattern for jobs index

  **Acceptance Criteria**:
  - [ ] 3 composite indexes added to init-db.ts
  - [ ] No existing indexes modified
  - [ ] `npx next build` passes
  - [ ] Database migration runs without errors

  **QA Scenarios**:
  ```
  Scenario: Composite indexes added
    Tool: Bash (code review)
    Steps:
      1. Read init-db.ts — verify 3 new CREATE INDEX statements
      2. Verify no DROP INDEX or ALTER TABLE statements
      3. Verify index names follow existing convention (idx_*)
    Expected Result: 3 indexes added, no schema changes
    Evidence: .omo/evidence/task-11-indexes-review.txt
  ```

  **Commit**: YES
  - Message: `perf(db): add composite indexes for query optimization`
  - Files: `scripts/init-db.ts`

- [x] 12. Fix console.error in error-response.ts

  **What to do**:
  - In `src/lib/error-response.ts:39`, replace `console.error(error)` with `logger.error(error)`
  - Import `logger` from `@/lib/logger` at top of file
  - Keep the existing error response logic unchanged
  - This is the only `console.error` in production lib code (error boundaries are acceptable)

  **Must NOT do**:
  - Do NOT change error response shape or status codes
  - Do NOT modify error boundary console.error calls (acceptable in client components)
  - Do NOT add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line replacement + import addition
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 4 (with T9, T10, T11)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/error-response.ts:39` — `console.error(error)` call
  - `src/lib/logger.ts` — `logger.error()` function

  **Acceptance Criteria**:
  - [ ] `console.error` replaced with `logger.error` in error-response.ts
  - [ ] `logger` imported at top of file
  - [ ] No `console.error` remains in src/lib/ (except logger.ts itself)
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: console.error replaced with logger
    Tool: Bash (grep)
    Steps:
      1. Grep for `console.error` in src/lib/ — should return 0 (except logger.ts)
      2. Verify logger imported in error-response.ts
      3. Verify logger.error call present
    Expected Result: No console.error in lib code, logger used instead
    Evidence: .omo/evidence/task-12-logger-review.txt
  ```

  **Commit**: YES
  - Message: `fix(quality): use logger instead of console.error in error-response`
  - Files: `src/lib/error-response.ts`

- [x] 13. Fix Unused Parameters in index-generator.ts

  **What to do**:
  - In `src/lib/wiki/index-generator.ts:86`, `updateIndexEntry(wikiRoot, _pagePath)` — `_pagePath` unused
  - In `src/lib/wiki/index-generator.ts:94`, `removeIndexEntry(wikiRoot, _pagePath)` — `_pagePath` unused
  - Option A: Remove the unused parameter from function signature and all call sites
  - Option B: Implement the intended behavior (use `_pagePath` for something)
  - Choose Option A (remove parameter) since the underscore prefix indicates intentional unused
  - Update all call sites to not pass the second argument

  **Must NOT do**:
  - Do NOT change the function behavior
  - Do NOT add new functionality
  - Do NOT break existing index generation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Parameter removal + call site updates
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 5 (with T14, T15)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/wiki/index-generator.ts:86,94` — unused parameters
  - All call sites of `updateIndexEntry` and `removeIndexEntry`

  **Acceptance Criteria**:
  - [ ] `_pagePath` parameter removed from both functions
  - [ ] All call sites updated
  - [ ] `npx next build` passes
  - [ ] Wiki index generation still works

  **QA Scenarios**:
  ```
  Scenario: Unused parameters removed
    Tool: Bash (grep)
    Steps:
      1. Grep for `_pagePath` in index-generator.ts — should return 0
      2. Verify function signatures updated
      3. Verify call sites updated
    Expected Result: No unused parameters, all call sites updated
    Evidence: .omo/evidence/task-13-params-review.txt
  ```

  **Commit**: YES
  - Message: `fix(quality): remove unused parameters from index-generator`
  - Files: `src/lib/wiki/index-generator.ts`

- [x] 14. Replace DbResult any with unknown

  **What to do**:
  - In `src/lib/types.ts:31`, change `export type DbResult = Record<string, any>;` to `Record<string, unknown>`
  - Update all cast sites that use `as DbResult` or `as DbResult[]` to use `as Record<string, unknown>` or proper type assertions
  - There are ~24 uses across the codebase — update each one
  - For places that need specific property access, add proper type guards or assertions

  **Must NOT do**:
  - Do NOT change database query logic
  - Do NOT break existing type safety
  - Do NOT add `as any` casts to fix type errors

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type replacement + cast site updates
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 5 (with T13, T15)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/types.ts:31` — `DbResult` type definition
  - All files that import and use `DbResult`

  **Acceptance Criteria**:
  - [ ] `DbResult` changed to `Record<string, unknown>`
  - [ ] All cast sites updated
  - [ ] `npx next build` passes
  - [ ] No TypeScript errors

  **QA Scenarios**:
  ```
  Scenario: DbResult type updated
    Tool: Bash (grep + build)
    Steps:
      1. Grep for `Record<string, any>` in src/lib/types.ts — should return 0
      2. Grep for `DbResult` in src/ — verify all uses updated
      3. Run: npx next build
    Expected Result: No any in DbResult, build passes
    Evidence: .omo/evidence/task-14-type-review.txt
  ```

  **Commit**: YES
  - Message: `fix(types): replace DbResult any with unknown`
  - Files: `src/lib/types.ts` + ~24 cast sites

- [x] 15. Remove Duplicate Graph Page

  **What to do**:
  - `src/app/(app)/graph/page.tsx` has a custom canvas-based force-directed graph implementation
  - `src/components/wiki/graph-view.tsx` already has a Cytoscape-based graph view
  - The canvas implementation is inferior (O(n²) simulation, main thread blocking)
  - Delete `src/app/(app)/graph/page.tsx`
  - Update any navigation links that point to `/graph` to use the wiki graph view instead
  - Or redirect `/graph` to the wiki graph page

  **Must NOT do**:
  - Do NOT break wiki graph view functionality
  - Do NOT remove Cytoscape dependency (still used by graph-view.tsx)
  - Do NOT break navigation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File deletion + navigation update
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 5 (with T13, T14)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/app/(app)/graph/page.tsx` — duplicate canvas implementation
  - `src/components/wiki/graph-view.tsx` — Cytoscape implementation (keep)
  - Navigation links that reference `/graph`

  **Acceptance Criteria**:
  - [ ] `graph/page.tsx` deleted
  - [ ] Navigation links updated or redirected
  - [ ] Wiki graph view still works
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Duplicate graph page removed
    Tool: Bash (grep + build)
    Steps:
      1. Verify file deleted: test ! -f src/app/(app)/graph/page.tsx
      2. Grep for `/graph` navigation links — verify updated
      3. Run: npx next build
    Expected Result: File deleted, navigation updated, build passes
    Evidence: .omo/evidence/task-15-graph-review.txt
  ```

  **Commit**: YES
  - Message: `chore: remove duplicate canvas graph implementation`
  - Files: `src/app/(app)/graph/page.tsx` (deleted)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx next build` + linter. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `fix(security): sanitize FTS5 snippets to prevent XSS` — `api/messages/search/route.ts`
- **2**: `perf(streaming): buffer DB writes to reduce I/O by 95%` — `generate/[id]/route.ts`
- **3**: `chore: delete dead code files` — 8 files deleted
- **4**: `fix(security): expand rate limiting to 8 high-risk endpoints` — `rate-limiter.ts` + 8 routes
- **5**: `fix(security): sanitize error messages to prevent info leakage` — wiki routes, contradictions route
- **6**: `fix(security): add auth to infrastructure endpoints` — `models/ollama`, `tts/voices`
- **7**: `fix(quality): add try/catch error handling to unprotected routes` — 50 route files
- **8**: `chore(quality): standardize catch variable naming to err: unknown` — all route files
- **9**: `perf(idle): move idle processing off request path` — `idle-processing.ts`
- **10**: `perf(db): wrap batch updates in transactions` — `job-processor.ts`, `idle-processing.ts`
- **11**: `perf(db): add composite indexes for query optimization` — `init-db.ts`
- **12**: `fix(quality): use logger instead of console.error in error-response` — `error-response.ts`
- **13**: `fix(quality): remove unused parameters from index-generator` — `index-generator.ts`
- **14**: `fix(types): replace DbResult any with unknown` — `types.ts` + cast sites
- **15**: `chore: remove duplicate canvas graph implementation` — `graph/page.tsx`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: ✓ Compiled successfully
```

### Final Checklist
- [ ] XSS vulnerability eliminated
- [ ] Streaming writes buffered
- [ ] Rate limiting expanded
- [ ] All API routes have error handling
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `npx next build` passes
