# Full Audit Remediation — 2026-05-21

## TL;DR

> **Quick Summary**: Fix all 95 findings from the fresh full-system audit (Security: 32, Performance: 18, Code Quality: 45) across 8 parallel execution waves.
>
> **Deliverables**:
> - 4 CRITICAL security fixes (unauthenticated endpoint, path traversal, missing validation, resource exhaustion)
> - 9 HIGH security fixes (auth bypass, IDOR, CSRF, excessive data exposure)
> - 9 MEDIUM security fixes (rate limiting gaps, input validation, information disclosure)
> - 3 CRITICAL performance fixes (SQLite singleton, N+1 queries, sync wiki scans)
> - 6 HIGH performance fixes (SSE polling, no wiki caching, memory leaks)
> - 14 HIGH code quality fixes (duplication, god files, error swallowing, type safety)
> - 26 MEDIUM/LOW code quality fixes (dead code, naming, React patterns, convention violations)
>
> **Estimated Effort**: XL — 8 waves, ~30 tasks
> **Parallel Execution**: YES — max 7 concurrent per wave
> **Critical Path**: W1 (critical security) → W2 (high security) → W3 (medium security + perf) → W4 (deduplication) → W5 (type safety) → W6 (code patterns) → W7 (performance) → W8 (cleanup)

---

## Context

### Original Request
"can you do a full system audit" → "create a plan and fix them all"

### Audit Summary
**Scope**: 306 TS/TSX files, 91 API routes, 37 lib utilities, 56 components
**Next.js 16** App Router · **better-sqlite3** · **Ollama** (self-hosted) · **Markdown-first wiki**

### Key Findings from Verification
- `/api/ollama/models` has `withErrorHandler` but ZERO auth — confirmed
- Wiki ingest `sourcePath` passed directly to `fs.readFileSync()` — confirmed
- Logout uses `decodeJwt()` without signature verification — confirmed
- Health `isAuthorized()` checks token existence but never calls `verifyToken()` — confirmed
- Message PUT/DELETE/regenerate verify auth but NOT session ownership — confirmed
- Wiki GET single page returns `allPages` with full content of every page — confirmed
- Session settings accepts temperature/topP/numCtx without range validation — confirmed
- TTS stream has no text length check, no rate limiting — confirmed
- 23 `err as Error` occurrences across 10 files — confirmed
- 12 `Record<string, any>` across 6 files (down from 15+, some already fixed) — confirmed
- 2 `useRef<any>` (Cytoscape, FlexSearch) — confirmed
- 5 index-as-key in `.map()` — confirmed
- 0 empty `catch {}` blocks (already fixed in prior audit) — confirmed
- Triple-duplicated decay logic in job-processor.ts, idle-enrichment.ts, relationship-decay.ts — confirmed
- Duplicated wiki index parsing in query.ts vs retrieval.ts — confirmed
- `markdown-renderer.ts` and `idle-enrichment.ts` exist and are oversized — confirmed

### Prior Audit Fixes Already Applied
- Rate limiter exists (13 endpoints covered)
- `withErrorHandler` HOF wraps 50+ routes
- Composite indexes added (3)
- `DbResult` changed to `Record<string, unknown>`
- `console.error` → `logger.error` in error-response.ts
- Buffered streaming writes (every 50 chunks)
- XSS fix with `escapeHtmlPreservingMarks`
- Async idle processing via `setImmediate()`
- Transaction-wrapped batch updates

---

## Work Objectives

### Core Objective
Fix every finding from the 2026-05-21 full system audit across security, performance, and code quality dimensions.

### Concrete Deliverables
- All 7 CRITICAL findings resolved
- All 19 HIGH findings resolved
- All 40 MEDIUM findings resolved
- All 29 LOW findings resolved or explicitly deferred

### Definition of Done
- [ ] `npx next build` passes
- [ ] Zero CRITICAL/HIGH findings remain
- [ ] All MEDIUM findings resolved or deferred with justification
- [ ] All LOW findings resolved or deferred with justification

### Must Have
- Every security fix preserves existing functionality
- Every deduplication extracts to shared utility without changing behavior
- Every type improvement maintains runtime compatibility
- `npx next build` passes after every wave

### Must NOT Have (Guardrails)
- No new npm dependencies
- No `as any`, `@ts-ignore`, empty catch blocks, or `TODO` markers introduced
- No barrel exports (`index.ts` re-export files)
- No new subdirectories in `lib/` (only `wiki/` allowed)
- No changes to `data/` directory or imports from it
- No merging `relationship/` and `relationships/` directories
- No `active-universe.tsx` usage for new code
- No `tailwind.config.*` creation

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (no test framework)
- **Automated tests**: None
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks)

### QA Policy
Every task MUST include agent-executed QA scenarios.
- **API routes**: `Bash` with curl — send requests, assert status + response fields
- **Lib utilities**: `Bash` (bun/node REPL) — import, call functions, compare output
- **Build verification**: `npx next build` passes after every wave
- **Evidence saved to**: `.omo/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Critical Security — 4 tasks, start immediately):
├── Task 1: Add auth to /api/ollama/models [quick]
├── Task 2: Fix wiki ingest path traversal [quick]
├── Task 3: Add password validation to password change [quick]
└── Task 4: Add length limit to userMessage in generate [quick]

Wave 2 (High Security — 9 tasks, after W1):
├── Task 5: Fix health endpoint token verification [quick]
├── Task 6: Add session access to message edit/delete/regenerate [unspecified-high]
├── Task 7: Fix logout to use verifyToken [quick]
├── Task 8: Fix TTS cache path traversal (DELETE + POST) [quick]
├── Task 9: Add CSRF Origin/Referer validation to middleware [quick]
├── Task 10: Add range validation to session settings [quick]
├── Task 11: Add validation + rate limiting to TTS stream [quick]
├── Task 12: Fix wiki GET to not return all pages [quick]
└── Task 13: Add auth to settings GET or redact [quick]

Wave 3 (Medium Security — 6 tasks, after W2):
├── Task 14: Add rate limiting to remaining 76 routes [unspecified-high]
├── Task 15: Fix logger stack traces in production [quick]
├── Task 16: Fix getWikiRoot string interpolation [quick]
├── Task 17: Add input validation to search endpoint [quick]
├── Task 18: Add input validation to jobs endpoint [quick]
└── Task 19: Add UUID validation utility [quick]

Wave 4 (Deduplication — 5 tasks, after W3):
├── Task 20: Consolidate triple-duplicated decay logic [unspecified-high]
├── Task 21: Deduplicate wiki index parsing/scoring/resolution [unspecified-high]
├── Task 22: Remove dead code files/functions [quick]
├── Task 23: Consolidate duplicate verifyToken in middleware [quick]
└── Task 24: Remove overlapping internalError/serverError [quick]

Wave 5 (Type Safety — 4 tasks, after W4):
├── Task 25: Replace err as Error with instanceof checks (23 occurrences) [quick]
├── Task 26: Replace Record<string, any> with proper types (12 occurrences) [quick]
├── Task 27: Fix useRef<any> for typed libraries (2 occurrences) [quick]
└── Task 28: Fix JWT type casts (2 occurrences) [quick]

Wave 6 (Code Patterns — 4 tasks, after W5):
├── Task 29: Add logging to API route catch blocks [quick]
├── Task 30: Fix inline functions breaking MessageItem memoization [quick]
├── Task 31: Fix index-as-key in .map() calls (5 occurrences) [quick]
└── Task 32: Extract TTS cache FS operations to lib [unspecified-high]

Wave 7 (Performance — 5 tasks, after W6):
├── Task 33: Add LRU cache to listWikiPages() [unspecified-high]
├── Task 34: Add busy_timeout pragma to SQLite [quick]
├── Task 35: Fix unbounded Maps (fileLocks, lastProcessingTime, rate limiter) [quick]
├── Task 36: Debounce wiki index regeneration [quick]
└── Task 37: Batch contradiction detector queries [unspecified-high]

Wave 8 (Cleanup — 5 tasks, after W7):
├── Task 38: Fix naming inconsistencies (data, err) [quick]
├── Task 39: Fix settings page useState overuse [quick]
├── Task 40: Fix subdirectory convention violations [quick]
├── Task 41: Fix remaining low-priority issues [quick]
└── Task 42: Remove unused exports and dead re-exports [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright skill if UI)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1-T4 → T5-T13 → T14-T19 → T20-T24 → T25-T28 → T29-T32 → T33-T37 → T38-T42 → F1-F4 → user okay
Parallel Speedup: ~75% faster than sequential
Max Concurrent: 9 (Wave 2)
```

### Dependency Matrix

- **1-4**: - → 5-13
- **5-13**: 1-4 → 14-19
- **14-19**: 5-13 → 20-24
- **20-24**: 14-19 → 25-28
- **25-28**: 20-24 → 29-32
- **29-32**: 25-28 → 33-37
- **33-37**: 29-32 → 38-42
- **38-42**: 33-37 → F1-F4

### Agent Dispatch Summary

- **Wave 1**: **4** — T1-T4 → `quick`
- **Wave 2**: **9** — T5, T7-T10, T12-T13 → `quick`, T6, T11 → `unspecified-high`
- **Wave 3**: **6** — T14 → `unspecified-high`, T15-T19 → `quick`
- **Wave 4**: **5** — T20-T21 → `unspecified-high`, T22-T24 → `quick`
- **Wave 5**: **4** — T25-T28 → `quick`
- **Wave 6**: **4** — T29, T31 → `quick`, T30, T32 → `unspecified-high`
- **Wave 7**: **5** — T33, T37 → `unspecified-high`, T34-T36 → `quick`
- **Wave 8**: **5** — T38-T42 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add auth to `/api/ollama/models`

  **What to do**:
  - Read `src/app/api/ollama/models/route.ts` (13 lines)
  - Add `getAuthToken()` + `verifyToken()` check before fetching models
  - Return 401 if unauthenticated, 403 if invalid token
  - Follow the existing auth pattern from other routes

  **Must NOT do**:
  - Do NOT add middleware-level auth
  - Do NOT change the response shape for authenticated requests

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, ~10 lines of auth boilerplate to add
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1 with Tasks 2, 3, 4)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/app/api/users/route.ts` — Standard auth pattern with `getAuthToken()` + `verifyToken()`
  - `src/lib/auth-token.ts` — `getAuthToken()` utility
  - `src/lib/auth.ts` — `verifyToken()` function

  **Acceptance Criteria**:
  - [ ] `curl http://localhost:3000/api/ollama/models` returns 401
  - [ ] `curl -H "Cookie: auth-token=valid_jwt" http://localhost:3000/api/ollama/models` returns 200 with models
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Unauthenticated request returns 401
    Tool: Bash (curl)
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/ollama/models
    Expected Result: Status code 401
    Evidence: .omo/evidence/task-1-unauth.txt

  Scenario: Authenticated request returns models
    Tool: Bash (curl)
    Steps:
      1. Login to get valid token
      2. curl -s -H "Cookie: auth-token=$TOKEN" http://localhost:3000/api/ollama/models
    Expected Result: Status 200, JSON with "models", "defaultLlm", "defaultEmbedding" fields
    Evidence: .omo/evidence/task-1-auth.txt
  ```

  **Commit**: YES (groups with 2, 3, 4)
  - Message: `fix(security): add auth to /api/ollama/models endpoint`
  - Files: `src/app/api/ollama/models/route.ts`
  - Pre-commit: `npx next build`

- [x] 2. Fix wiki ingest path traversal via `sourcePath`

  **What to do**:
  - Read `src/app/api/wiki/ingest/route.ts` (44 lines)
  - Before calling `ingestSource(sourcePath, wikiRoot, universeId)`, validate that `sourcePath` resolves within an allowed directory
  - Use `path.resolve()` + `isPathWithinRoot()` from `src/lib/wiki/path-guard.ts`
  - If `sourcePath` is a relative filename, resolve it within a safe base directory
  - If `sourcePath` is absolute, verify it's within an allowed base (e.g., user's upload directory)

  **Must NOT do**:
  - Do NOT change the `ingestSource()` function signature
  - Do NOT break existing valid ingest flows

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single route file, add path validation before existing call
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1 with Tasks 1, 3, 4)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/wiki/path-guard.ts` — `isPathWithinRoot()` function
  - `src/app/api/wiki/sources/upload/route.ts` — Example of path validation pattern
  - `src/lib/wiki/file-io.ts` — `findWikiRoot()` for reference on safe path resolution

  **Acceptance Criteria**:
  - [ ] `sourcePath` containing `../` is rejected with 400
  - [ ] Valid relative filenames are accepted
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Path traversal attempt is rejected
    Tool: Bash (curl)
    Steps:
      1. Login to get token
      2. curl -s -X POST -H "Cookie: auth-token=$TOKEN" -H "Content-Type: application/json" -d '{"sourcePath":"../../../../etc/passwd","universeId":"test"}' http://localhost:3000/api/wiki/ingest
    Expected Result: Status 400 or 403, error message about invalid path
    Evidence: .omo/evidence/task-2-traversal.txt

  Scenario: Valid filename is accepted
    Tool: Bash (curl)
    Steps:
      1. Create a test file in allowed directory
      2. curl with valid sourcePath
    Expected Result: Status 200, success response
    Evidence: .omo/evidence/task-2-valid.txt
  ```

  **Commit**: YES (groups with 1, 3, 4)
  - Message: `fix(security): validate sourcePath in wiki ingest to prevent path traversal`
  - Files: `src/app/api/wiki/ingest/route.ts`
  - Pre-commit: `npx next build`

- [x] 3. Add password validation to password change route

  **What to do**:
  - Read `src/app/api/auth/password/route.ts` (34 lines)
  - Import `validatePassword` from `@/lib/validation`
  - Add `const pwError = validatePassword(newPassword); if (pwError) return ...` before calling `changePassword()`

  **Must NOT do**:
  - Do NOT change the `changePassword()` function
  - Do NOT modify the response shape

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, add 3-line validation check
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1 with Tasks 1, 2, 4)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/validation/` — Check for `validatePassword()` function
  - `src/app/api/auth/register/route.ts` — Example of password validation usage

  **Acceptance Criteria**:
  - [ ] Weak password (e.g., "123") returns 400 with validation error
  - [ ] Strong password is accepted
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Weak password is rejected
    Tool: Bash (curl)
    Steps:
      1. Login to get token
      2. curl -X PUT -H "Cookie: auth-token=$TOKEN" -H "Content-Type: application/json" -d '{"currentPassword":"valid","newPassword":"123"}' http://localhost:3000/api/auth/password
    Expected Result: Status 400, error about password requirements
    Evidence: .omo/evidence/task-3-weak.txt
  ```

  **Commit**: YES (groups with 1, 2, 4)
  - Message: `fix(security): add route-level password validation to password change`
  - Files: `src/app/api/auth/password/route.ts`
  - Pre-commit: `npx next build`

- [x] 4. Add length limit to `userMessage` in generate endpoint

  **What to do**:
  - Read `src/app/api/generate/[id]/route.ts` (284 lines, focus on lines 74-79)
  - After extracting `userMessage` from body, add `validateLength(userMessage, 10000, "userMessage")` check
  - Import `validateLength` from `@/lib/validation` if not already imported

  **Must NOT do**:
  - Do NOT change the streaming logic
  - Do NOT change the LLM prompt assembly

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, add 3-line validation check
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1 with Tasks 1, 2, 3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/lib/validation/length-validator.ts` — `validateLength()` function
  - `src/app/api/sessions/[id]/messages/[messageId]/route.ts:29` — Example of `validateLength` usage

  **Acceptance Criteria**:
  - [ ] `userMessage` > 10000 chars returns 400
  - [ ] `userMessage` <= 10000 chars is accepted
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Oversized message is rejected
    Tool: Bash (curl)
    Steps:
      1. Login, create/get session
      2. curl -X POST with userMessage of 15000 chars
    Expected Result: Status 400, error about message length
    Evidence: .omo/evidence/task-4-oversized.txt
  ```

  **Commit**: YES (groups with 1, 2, 3)
  - Message: `fix(security): add length validation to userMessage in generate endpoint`
  - Files: `src/app/api/generate/[id]/route.ts`
  - Pre-commit: `npx next build`

- [x] 5. Fix health endpoint token verification

  **What to do**:
  - Read `src/app/api/health/route.ts` (lines 112-126) and `src/app/api/health/ready/route.ts` (similar)
  - In `isAuthorized()`, replace `if (token) { return true; }` with `if (token) { const decoded = await verifyToken(token); return decoded !== null; }`
  - Import `verifyToken` from `@/lib/auth` if not already imported

  **Must NOT do**:
  - Do NOT remove localhost bypass (line 115-116)
  - Do NOT change the response shape

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two files, 3-line change each
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 with Tasks 6-13)
  - **Blocks**: None
  - **Blocked By**: Wave 1

  **References**:
  - `src/lib/auth.ts` — `verifyToken()` function
  - `src/app/api/settings/route.ts:31-33` — Example of token verification pattern

  **Acceptance Criteria**:
  - [ ] Health endpoint with invalid token returns unauthorized
  - [ ] Health endpoint with valid token returns health status
  - [ ] Health endpoint from localhost still works without token
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Invalid token is rejected
    Tool: Bash (curl)
    Steps:
      1. curl -s -H "Cookie: auth-token=invalid_token" http://localhost:3000/api/health
    Expected Result: Status 401 or 403
    Evidence: .omo/evidence/task-5-invalid-token.txt
  ```

  **Commit**: YES (groups with 6, 7)
  - Message: `fix(security): verify token in health endpoints instead of just checking existence`
  - Files: `src/app/api/health/route.ts`, `src/app/api/health/ready/route.ts`
  - Pre-commit: `npx next build`

- [x] 6. Add session access checks to message edit/delete/regenerate

  **What to do**:
  - Read `src/app/api/sessions/[id]/messages/[messageId]/route.ts` (PUT line 33, DELETE line 148)
  - Read `src/app/api/sessions/[id]/messages/[messageId]/regenerate/route.ts` (POST line 19)
  - Before message operations, add session access verification query (same pattern as sibling `edits/route.ts` lines 18-26)
  - Verify the authenticated user owns the session OR is a participant

  **Must NOT do**:
  - Do NOT change the message operation logic
  - Do NOT change the response shape

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple files, need to understand session access patterns
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 with Tasks 5, 7-13)
  - **Blocks**: None
  - **Blocked By**: Wave 1

  **References**:
  - `src/app/api/sessions/[id]/messages/[messageId]/edits/route.ts:18-26` — Session access verification pattern
  - `src/app/api/sessions/[id]/route.ts` — Session ownership check pattern

  **Acceptance Criteria**:
  - [ ] User cannot edit message in session they don't own/participate in
  - [ ] User can edit message in their own session
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: IDOR attack is blocked
    Tool: Bash (curl)
    Steps:
      1. Login as user A, get session A message ID
      2. Login as user B
      3. User B tries to edit user A's message
    Expected Result: Status 403 or 404
    Evidence: .omo/evidence/task-6-idor.txt
  ```

  **Commit**: YES (groups with 5, 7)
  - Message: `fix(security): add session access checks to message edit/delete/regenerate endpoints`
  - Files: `src/app/api/sessions/[id]/messages/[messageId]/route.ts`, `src/app/api/sessions/[id]/messages/[messageId]/regenerate/route.ts`
  - Pre-commit: `npx next build`

- [x] 7. Fix logout to use `verifyToken()` instead of `decodeJwt()`

  **What to do**:
  - Read `src/app/api/auth/logout/route.ts` (35 lines)
  - Replace `decodeJwt(token)` with `verifyToken(token)` from `@/lib/auth`
  - `verifyToken` returns `null` on invalid — handle gracefully (logout should still succeed)
  - Keep the `catch {}` block for graceful degradation

  **Must NOT do**:
  - Do NOT break logout functionality — logout MUST always succeed even if token is invalid
  - Do NOT remove the cookie clearing logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, replace one function call
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 with Tasks 5, 6, 8-13)
  - **Blocks**: None
  - **Blocked By**: Wave 1

  **References**:
  - `src/lib/auth.ts` — `verifyToken()` function
  - `src/app/api/auth/logout/route.ts` — Current implementation

  **Acceptance Criteria**:
  - [ ] Logout with valid token revokes it and clears cookie
  - [ ] Logout with invalid token still clears cookie (graceful)
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Logout with valid token works
    Tool: Bash (curl)
    Steps:
      1. Login to get token
      2. curl -X POST -H "Cookie: auth-token=$TOKEN" http://localhost:3000/api/auth/logout
    Expected Result: Status 200, cookie cleared
    Evidence: .omo/evidence/task-7-valid.txt
  ```

  **Commit**: YES (groups with 5, 6)
  - Message: `fix(security): use verifyToken instead of decodeJwt in logout`
  - Files: `src/app/api/auth/logout/route.ts`
  - Pre-commit: `npx next build`

- [x] 8. Fix TTS cache path traversal (DELETE + POST)

  **What to do**:
  - Read `src/app/api/tts/cache/route.ts` (326 lines)
  - DELETE action "all" (lines 142-146): After `path.join()`, validate `fullPath` is within cache directory using `isPathWithinRoot()`
  - POST action (lines 284-288): Sanitize `outputName` with `path.basename()`, validate final path with `isPathWithinRoot()`
  - Import `isPathWithinRoot` from `@/lib/wiki/path-guard.ts`

  **Must NOT do**:
  - Do NOT change the TTS generation logic
  - Do NOT change the cache database operations

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, add path validation in two places
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 with Tasks 5-7, 9-13)
  - **Blocks**: None
  - **Blocked By**: Wave 1

  **References**:
  - `src/lib/wiki/path-guard.ts` — `isPathWithinRoot()` function
  - `src/app/api/tts/cache/route.ts:142-146` — DELETE path usage
  - `src/app/api/tts/cache/route.ts:284-288` — POST filename usage

  **Acceptance Criteria**:
  - [ ] `audio_path` with `../` cannot delete files outside cache
  - [ ] `outputName` with `../` cannot write files outside cache
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Path traversal in DELETE is blocked
    Tool: Bash (curl)
    Steps:
      1. Login, insert malicious audio_path into tts_cache table
      2. Trigger DELETE all action
    Expected Result: Malicious path skipped, no files deleted outside cache
    Evidence: .omo/evidence/task-8-delete.txt
  ```

  **Commit**: YES (groups with 9, 10)
  - Message: `fix(security): add path validation to TTS cache file operations`
  - Files: `src/app/api/tts/cache/route.ts`
  - Pre-commit: `npx next build`

- [x] 9. Add CSRF Origin/Referer validation to middleware

  **What to do**:
  - Read `src/middleware.ts`
  - For POST/PUT/DELETE/PATCH requests, add Origin/Referer header validation
  - Compare Origin/Referer against the request's own host
  - If mismatch and no custom `X-Requested-With` header, return 403
  - Allow localhost/development to skip this check

  **Must NOT do**:
  - Do NOT break API calls from the frontend
  - Do NOT add CSRF tokens (out of scope)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single middleware file, add header validation logic
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 with Tasks 5-8, 10-13)
  - **Blocks**: None
  - **Blocked By**: Wave 1

  **References**:
  - `src/middleware.ts` — Current middleware implementation
  - `src/lib/config.ts` — APP_CONFIG for allowed origins

  **Acceptance Criteria**:
  - [ ] POST with matching Origin header passes
  - [ ] POST with mismatched Origin header returns 403
  - [ ] GET requests are not affected
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: CSRF attempt is blocked
    Tool: Bash (curl)
    Steps:
      1. curl -X POST -H "Origin: https://evil.com" http://localhost:3000/api/sessions
    Expected Result: Status 403
    Evidence: .omo/evidence/task-9-csrf.txt
  ```

  **Commit**: YES (groups with 8, 10)
  - Message: `fix(security): add Origin/Referer CSRF validation to middleware`
  - Files: `src/middleware.ts`
  - Pre-commit: `npx next build`

- [x] 10. Add range validation to session settings LLM parameters

  **What to do**:
  - Read `src/app/api/sessions/[id]/settings/route.ts` (lines 117-123)
  - Add range validation: temperature [0, 2], topP [0, 1], numCtx [512, 131072]
  - Return 400 if values are out of range

  **Must NOT do**:
  - Do NOT change the settings storage logic
  - Do NOT change the response shape

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, add range checks before existing assignment
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 with Tasks 5-9, 11-13)
  - **Blocks**: None
  - **Blocked By**: Wave 1

  **References**:
  - `src/lib/validation/length-validator.ts` — Validation pattern reference
  - `src/app/api/sessions/[id]/settings/route.ts:117-123` — Current parameter assignment

  **Acceptance Criteria**:
  - [ ] temperature=100 returns 400
  - [ ] temperature=0.7 is accepted
  - [ ] numCtx=999999999 returns 400
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Out-of-range temperature is rejected
    Tool: Bash (curl)
    Steps:
      1. Login, get session
      2. curl -X PUT with temperature=100
    Expected Result: Status 400
    Evidence: .omo/evidence/task-10-range.txt
  ```

  **Commit**: YES (groups with 8, 9)
  - Message: `fix(security): add range validation to session LLM parameters`
  - Files: `src/app/api/sessions/[id]/settings/route.ts`
  - Pre-commit: `npx next build`

- [x] 11. Add validation + rate limiting to TTS stream

  **What to do**:
  - Read `src/app/api/tts/stream/route.ts` (44 lines)
  - Add text length check (match `TTS_CONFIG.maxTextLength` from config)
  - Validate `format` is one of allowed values (mp3, wav, ogg)
  - Validate `speed` is in range [0.5, 2.0]
  - Add rate limiting using `checkRateLimit()` with a new tier `tts_stream`

  **Must NOT do**:
  - Do NOT change the streaming logic
  - Do NOT change the response headers

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple validation additions, rate limiter config update
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 with Tasks 5-10, 12-13)
  - **Blocks**: None
  - **Blocked By**: Wave 1

  **References**:
  - `src/lib/config.ts` — `TTS_CONFIG` with `maxTextLength`
  - `src/lib/rate-limiter.ts` — Rate limiting pattern
  - `src/app/api/tts/generate/route.ts` — Existing TTS validation pattern

  **Acceptance Criteria**:
  - [ ] Text exceeding maxTextLength returns 400
  - [ ] Invalid format returns 400
  - [ ] Speed outside [0.5, 2.0] returns 400
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Oversized text is rejected
    Tool: Bash (curl)
    Steps:
      1. Login
      2. curl -X POST with text of 100000 chars
    Expected Result: Status 400
    Evidence: .omo/evidence/task-11-oversized.txt
  ```

  **Commit**: YES (groups with 12, 13)
  - Message: `fix(security): add validation and rate limiting to TTS stream endpoint`
  - Files: `src/app/api/tts/stream/route.ts`, `src/lib/rate-limiter.ts`
  - Pre-commit: `npx next build`

- [x] 12. Fix wiki GET to not return all pages

  **What to do**:
  - Read `src/app/api/wiki/[...slug]/route.ts` (lines 256-269)
  - Remove `allPages` from the response, or replace with lightweight index (paths + titles only)
  - The `allPages` currently returns full content of every wiki page — excessive data exposure
  - If `allPages` is needed by the frontend, return only `{ path, frontmatter: { title, type } }` without `content`

  **Must NOT do**:
  - Do NOT break the wiki page rendering
  - Do NOT remove the `page` response (single page content is correct)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single route file, modify response shape
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 with Tasks 5-11, 13)
  - **Blocks**: None
  - **Blocked By**: Wave 1

  **References**:
  - `src/app/api/wiki/[...slug]/route.ts:256-269` — Current response
  - `src/components/wiki/` — Check which components consume `allPages`

  **Acceptance Criteria**:
  - [ ] Wiki GET single page returns only the requested page's content
  - [ ] `allPages` (if still returned) contains only paths and titles, no content
  - [ ] Wiki UI still renders correctly
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Wiki page response is lean
    Tool: Bash (curl)
    Steps:
      1. Login, request a wiki page
      2. Check response size and structure
    Expected Result: Response contains only requested page's content, allPages has no content field
    Evidence: .omo/evidence/task-12-response.txt
  ```

  **Commit**: YES (groups with 11, 13)
  - Message: `fix(security): remove full wiki content from allPages in single page response`
  - Files: `src/app/api/wiki/[...slug]/route.ts`
  - Pre-commit: `npx next build`

- [x] 13. Add auth to settings GET or redact infrastructure info

  **What to do**:
  - Read `src/app/api/settings/route.ts` (123 lines, focus on GET lines 11-28)
  - Option A: Require authentication for GET (simplest)
  - Option B: Return redacted server config for unauthenticated requests (show model names but hide host:port)
  - Choose Option A — settings should always require auth

  **Must NOT do**:
  - Do NOT break the settings page loading
  - Do NOT change the POST/PUT behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single route file, add auth check to GET
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 with Tasks 5-12)
  - **Blocks**: None
  - **Blocked By**: Wave 1

  **References**:
  - `src/app/api/settings/route.ts:11-28` — Current GET without auth
  - `src/app/api/users/route.ts` — Standard auth pattern

  **Acceptance Criteria**:
  - [ ] GET /api/settings without token returns 401
  - [ ] GET /api/settings with token returns settings
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Unauthenticated settings request is rejected
    Tool: Bash (curl)
    Steps:
      1. curl -s http://localhost:3000/api/settings
    Expected Result: Status 401
    Evidence: .omo/evidence/task-13-unauth.txt
  ```

  **Commit**: YES (groups with 11, 12)
  - Message: `fix(security): require authentication for settings GET endpoint`
  - Files: `src/app/api/settings/route.ts`
  - Pre-commit: `npx next build`

- [x] 14. Add rate limiting to remaining 76 routes

  **What to do**:
  - Read `src/lib/rate-limiter.ts` to understand existing tiers
  - Add new rate limiting tiers for:
    - `wiki_read` — wiki GET endpoints (100 req/min)
    - `wiki_query` — wiki query/LLM endpoints (10 req/min)
    - `tts_generate` — TTS generation (20 req/min)
    - `tts_stream` — TTS streaming (10 req/min)
    - `session_read` — session GET endpoints (60 req/min)
    - `session_write` — session POST/PUT/DELETE (30 req/min)
    - `relationship_write` — relationship CRUD (30 req/min)
    - `persona_write` — persona CRUD (20 req/min)
    - `npc_write` — NPC CRUD (20 req/min)
    - `universe_write` — universe CRUD (10 req/min)
    - `timeline_write` — timeline CRUD (20 req/min)
    - `narrative_write` — narrative memories/threads (20 req/min)
    - `group_write` — group CRUD (20 req/min)
    - `password_change` — auth/password (5 req/min)
    - `jobs_trigger` — jobs POST (10 req/min)
  - Add `checkRateLimit()` calls to all unprotected routes
  - Import `cleanupExpiredEntries` and call at start of each rate-limited route

  **Must NOT do**:
  - Do NOT add rate limiting to health/live/ready endpoints
  - Do NOT add rate limiting to auth/login/register (already covered)
  - Do NOT change existing rate limit tiers

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Many files to touch, need to be systematic
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3 with Tasks 15-19)
  - **Blocks**: None
  - **Blocked By**: Wave 2

  **References**:
  - `src/lib/rate-limiter.ts` — Existing rate limiter with tiers
  - `src/app/api/generate/[id]/route.ts:47` — Example of rate limiting usage
  - `src/app/api/sessions/[id]/messages/route.ts` — Example of rate limiting on message send

  **Acceptance Criteria**:
  - [ ] All 76 previously unprotected routes now have rate limiting
  - [ ] Rate limits are appropriate per endpoint type
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Rate limit is enforced on previously unprotected endpoint
    Tool: Bash (curl)
    Steps:
      1. Login
      2. Rapidly send 100+ requests to a previously unprotected endpoint
    Expected Result: Status 429 after limit exceeded
    Evidence: .omo/evidence/task-14-ratelimit.txt
  ```

  **Commit**: YES (groups with 15, 16)
  - Message: `fix(perf): add rate limiting to all unprotected API routes`
  - Files: `src/lib/rate-limiter.ts`, 76 route files
  - Pre-commit: `npx next build`

- [x] 15. Fix logger stack traces in production

  **What to do**:
  - Read `src/lib/logger.ts` (lines 64-66)
  - In production (when `!isDev`), include only `error.message` and `error.name`, NOT `error.stack`
  - Gate stack traces behind `DEBUG` env var: `if (process.env.DEBUG) metadata.stack = arg.stack;`

  **Must NOT do**:
  - Do NOT remove stack traces in development
  - Do NOT change the log output format

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 2-line change
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3 with Tasks 14, 16-19)
  - **Blocks**: None
  - **Blocked By**: Wave 2

  **References**:
  - `src/lib/logger.ts:64-66` — Current stack trace logging
  - `src/lib/logger.ts:1-10` — `isDev` detection

  **Acceptance Criteria**:
  - [ ] Production logs do not include stack traces
  - [ ] Development logs still include stack traces
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 14, 16)
  - Message: `fix(security): exclude stack traces from production logs`
  - Files: `src/lib/logger.ts`
  - Pre-commit: `npx next build`

- [x] 16. Fix `getWikiRoot` string interpolation

  **What to do**:
  - Read `src/lib/wiki/wiki-root.ts` (15 lines)
  - Replace string interpolation with `path.join()`
  - Sanitize `universeId` with `path.basename()` to prevent `../` injection
  - Validate resolved path is within `dataDir` using `isPathWithinRoot()`

  **Must NOT do**:
  - Do NOT change the function signature
  - Do NOT break existing callers

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 15 lines
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3 with Tasks 14, 15, 17-19)
  - **Blocks**: None
  - **Blocked By**: Wave 2

  **References**:
  - `src/lib/wiki/wiki-root.ts` — Current implementation
  - `src/lib/wiki/path-guard.ts` — `isPathWithinRoot()` function

  **Acceptance Criteria**:
  - [ ] `universeId` with `../` is sanitized
  - [ ] Resolved path is within dataDir
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 14, 15)
  - Message: `fix(security): use path.join and sanitize universeId in getWikiRoot`
  - Files: `src/lib/wiki/wiki-root.ts`
  - Pre-commit: `npx next build`

- [x] 17. Add input validation to search endpoint

  **What to do**:
  - Read `src/app/api/search/route.ts` (verify it exists, check current validation)
  - Cap `limit` to max 100: `Math.min(limit, 100)`
  - Validate `minScore` is in range [0, 1]
  - Validate `entityType` against allowed types enum
  - Add rate limiting with `search` tier

  **Must NOT do**:
  - Do NOT change the search algorithm
  - Do NOT change the response shape

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single route file, add validation checks
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3 with Tasks 14-16, 18-19)
  - **Blocks**: None
  - **Blocked By**: Wave 2

  **References**:
  - `src/app/api/search/route.ts` — Current implementation
  - `src/lib/rate-limiter.ts` — Add `search` tier

  **Acceptance Criteria**:
  - [ ] limit=9999 is capped to 100
  - [ ] minScore=2.0 is rejected
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 18, 19)
  - Message: `fix(security): add input validation and rate limiting to search endpoint`
  - Files: `src/app/api/search/route.ts`, `src/lib/rate-limiter.ts`
  - Pre-commit: `npx next build`

- [x] 18. Add input validation to jobs endpoint

  **What to do**:
  - Read `src/app/api/jobs/route.ts` (focus on POST lines 49-118)
  - Validate `type` against `JobType` enum
  - Validate `priority` against `JobPriority` enum
  - Validate `payload` has required fields based on job type
  - Add rate limiting with `jobs_trigger` tier

  **Must NOT do**:
  - Do NOT change the job processing logic
  - Do NOT change the response shape

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single route file, add validation checks
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3 with Tasks 14-17, 19)
  - **Blocks**: None
  - **Blocked By**: Wave 2

  **References**:
  - `src/app/api/jobs/route.ts:49-118` — Current job creation
  - `src/lib/job-processor.ts` — `JobType` and `JobPriority` enums

  **Acceptance Criteria**:
  - [ ] Invalid job type returns 400
  - [ ] Invalid priority returns 400
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 17, 19)
  - Message: `fix(security): add input validation to jobs endpoint`
  - Files: `src/app/api/jobs/route.ts`
  - Pre-commit: `npx next build`

- [x] 19. Add UUID validation utility and apply to ID parameters

  **What to do**:
  - Create `src/lib/validation/uuid-validator.ts` with `isValidUUID(id: string): boolean`
  - Apply to all routes that accept ID parameters: `universeId`, `sessionId`, `entityId`, `messageId`, etc.
  - Return 400 if ID is not a valid UUID
  - Focus on the most critical routes first (sessions, messages, wiki)

  **Must NOT do**:
  - Do NOT change the query logic
  - Do NOT break existing valid UUID formats

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Create utility + apply to routes
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3 with Tasks 14-18)
  - **Blocks**: None
  - **Blocked By**: Wave 2

  **References**:
  - `src/lib/validation/` — Validation utility directory
  - `src/app/api/sessions/[id]/route.ts` — Example route with ID parameter

  **Acceptance Criteria**:
  - [ ] Invalid UUID returns 400
  - [ ] Valid UUID passes validation
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 17, 18)
  - Message: `feat(validation): add UUID validation utility and apply to ID parameters`
  - Files: `src/lib/validation/uuid-validator.ts`, multiple route files
  - Pre-commit: `npx next build`

- [x] 20. Consolidate triple-duplicated relationship decay logic

  **What to do**:
  - Read `src/lib/relationship-decay.ts` — this is the canonical source
  - Read `src/lib/job-processor.ts` lines 468-525 — inline copy
  - Read `src/lib/idle-enrichment.ts` lines 434-467 — inline copy
  - In `job-processor.ts`: import `applyDecay`, `EMOTIONAL_STATES`, `RELATIONSHIP_STAGES`, `DEFAULT_DECAY_RATES` from `@/lib/relationship-decay`
  - In `idle-enrichment.ts`: same imports, delete inline copies
  - Verify behavior is identical after consolidation

  **Must NOT do**:
  - Do NOT change the decay algorithm
  - Do NOT change the decay rates
  - Do NOT introduce new dependencies

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple large files, need to ensure behavioral equivalence
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4 with Tasks 21-24)
  - **Blocks**: None
  - **Blocked By**: Wave 3

  **References**:
  - `src/lib/relationship-decay.ts` — Canonical decay logic
  - `src/lib/job-processor.ts:468-525` — Inline copy to remove
  - `src/lib/idle-enrichment.ts:434-467` — Inline copy to remove

  **Acceptance Criteria**:
  - [ ] `EMOTIONAL_STATES`, `RELATIONSHIP_STAGES`, `DEFAULT_DECAY_RATES` imported from `relationship-decay.ts` in both files
  - [ ] No inline copies remain in `job-processor.ts` or `idle-enrichment.ts`
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 21, 22)
  - Message: `refactor(relationships): consolidate triple-duplicated decay logic`
  - Files: `src/lib/job-processor.ts`, `src/lib/idle-enrichment.ts`, `src/lib/relationship-decay.ts`
  - Pre-commit: `npx next build`

- [x] 21. Deduplicate wiki index parsing/scoring/resolution

  **What to do**:
  - Read `src/lib/wiki/query.ts` lines 33, 82, 120 — `parseIndex`, `scoreEntry`, `resolvePagePath`
  - Read `src/lib/retrieval.ts` lines 126, 160, 190 — `parseWikiIndex`, `scoreWikiEntry`, `resolveWikiPagePath`
  - Create `src/lib/wiki/index-utils.ts` with shared functions
  - Update `query.ts` to import from `index-utils.ts`
  - Update `retrieval.ts` to import from `index-utils.ts`
  - Remove duplicate functions from both files

  **Must NOT do**:
  - Do NOT change the parsing/scoring/resolution algorithms
  - Do NOT break wiki query or retrieval functionality

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Extract shared logic, ensure behavioral equivalence
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4 with Tasks 20, 22-24)
  - **Blocks**: None
  - **Blocked By**: Wave 3

  **References**:
  - `src/lib/wiki/query.ts:33,82,120` — Duplicate functions
  - `src/lib/retrieval.ts:126,160,190` — Duplicate functions
  - `src/lib/wiki/` — Wiki subsystem directory

  **Acceptance Criteria**:
  - [ ] `parseIndex`, `scoreEntry`, `resolvePagePath` in single `index-utils.ts`
  - [ ] Both `query.ts` and `retrieval.ts` import from `index-utils.ts`
  - [ ] No duplicate functions remain
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 20, 22)
  - Message: `refactor(wiki): deduplicate index parsing/scoring/resolution utilities`
  - Files: `src/lib/wiki/query.ts`, `src/lib/retrieval.ts`, `src/lib/wiki/index-utils.ts` (new)
  - Pre-commit: `npx next build`

- [x] 22. Remove dead code files and functions

  **What to do**:
  - Verify `src/lib/markdown-renderer.ts` is truly unused (grep for imports)
  - Verify `getRetrievedContextWithFallback` in `src/lib/retrieval.ts` (lines 474-505) is never called
  - Verify re-exports in `src/lib/retrieval.ts` (lines 10-16) are never imported from `retrieval.ts`
  - Delete `src/lib/markdown-renderer.ts` if unused
  - Remove dead function and re-exports from `retrieval.ts`
  - Remove unused imports from `retrieval.ts`

  **Must NOT do**:
  - Do NOT delete files that are actually imported
  - Do NOT break any functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Grep for imports, delete unused code
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4 with Tasks 20, 21, 23-24)
  - **Blocks**: None
  - **Blocked By**: Wave 3

  **References**:
  - `src/lib/markdown-renderer.ts` — Potentially dead file
  - `src/lib/retrieval.ts:10-16,474-505` — Dead code sections
  - `src/components/wiki/markdown-renderer.tsx` — The actual renderer (different file)

  **Acceptance Criteria**:
  - [ ] `markdown-renderer.ts` deleted (if unused)
  - [ ] Dead functions removed from `retrieval.ts`
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 20, 21)
  - Message: `chore: remove dead code files and functions`
  - Files: `src/lib/markdown-renderer.ts` (delete), `src/lib/retrieval.ts`
  - Pre-commit: `npx next build`

- [x] 23. Consolidate duplicate `verifyToken` in middleware

  **What to do**:
  - Read `src/middleware.ts` lines 24-34 — duplicate `verifyToken`
  - Read `src/lib/auth.ts` — canonical `verifyToken`
  - Import `verifyToken` from `@/lib/auth` in middleware
  - Adapt the return type as needed (middleware needs `{ sub, username }`)
  - Remove the duplicate function from middleware

  **Must NOT do**:
  - Do NOT change the middleware behavior
  - Do NOT break auth flow

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, replace function with import
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4 with Tasks 20-22, 24)
  - **Blocks**: None
  - **Blocked By**: Wave 3

  **References**:
  - `src/middleware.ts:24-34` — Duplicate verifyToken
  - `src/lib/auth.ts` — Canonical verifyToken

  **Acceptance Criteria**:
  - [ ] Middleware imports `verifyToken` from `@/lib/auth`
  - [ ] No duplicate verifyToken in middleware
  - [ ] Auth flow works correctly
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 24)
  - Message: `refactor(auth): consolidate duplicate verifyToken in middleware`
  - Files: `src/middleware.ts`
  - Pre-commit: `npx next build`

- [x] 24. Remove overlapping `internalError`/`serverError`

  **What to do**:
  - Read `src/lib/error-response.ts` — `internalError()` (line 34) and `serverError()` (line 38)
  - Find all callers of `internalError()` (grep for usage)
  - Replace all `internalError()` calls with `serverError()` (all 500s should log)
  - Delete `internalError()` function
  - If any route specifically needs silent 500, document why

  **Must NOT do**:
  - Do NOT change the error response format
  - Do NOT break error handling

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file + grep/replace callers
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4 with Tasks 20-23)
  - **Blocks**: None
  - **Blocked By**: Wave 3

  **References**:
  - `src/lib/error-response.ts:34,38` — Both functions
  - `src/lib/with-error-handler.ts` — Uses `internalError()`

  **Acceptance Criteria**:
  - [ ] `internalError()` deleted
  - [ ] All callers use `serverError()`
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 23)
  - Message: `refactor(errors): remove overlapping internalError, standardize on serverError`
  - Files: `src/lib/error-response.ts`, `src/lib/with-error-handler.ts`
  - Pre-commit: `npx next build`

- [x] 25. Replace `err as Error` with `instanceof` checks (23 occurrences)

  **What to do**:
  - Grep for all `err as Error` occurrences (23 across 10 files)
  - Replace pattern: `(err as Error).message` → `err instanceof Error ? err.message : String(err)`
  - Replace pattern: `logger.error("...", err as Error)` → `logger.error("...", err)` (logger already handles unknown)
  - Files: `idle/wiki-tasks.ts` (7), `wiki/ingest.ts` (3), `health/route.ts` (3), `health/ready/route.ts` (3), `contradictions/route.ts` (2), `ollama.ts` (1), `tts.ts` (1), `api-client.ts` (1), `generate/[id]/route.ts` (1), `tts/stream/route.ts` (1)

  **Must NOT do**:
  - Do NOT change the error handling logic
  - Do NOT introduce new error types

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Systematic find-and-replace across 10 files
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 5 with Tasks 26-28)
  - **Blocks**: None
  - **Blocked By**: Wave 4

  **References**:
  - Grep results for `err as Error` — all 23 occurrences
  - `src/lib/logger.ts` — Logger handles `unknown` errors correctly

  **Acceptance Criteria**:
  - [ ] Zero `err as Error` occurrences remain
  - [ ] All error messages are properly extracted
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 26, 27)
  - Message: `fix(types): replace err as Error with instanceof checks across 10 files`
  - Files: 10 files with `err as Error`
  - Pre-commit: `npx next build`

- [x] 26. Replace `Record<string, any>` with proper types (12 occurrences)

  **What to do**:
  - Grep for all `Record<string, any>` occurrences (12 across 6 files)
  - In `src/lib/wiki/types.ts`, `WikiFrontmatter` already uses `[key: string]: unknown` — use this
  - In `src/lib/markdown-utils.ts`, use `Record<string, unknown>`
  - In `src/lib/relationship-types.ts`, use `Record<string, unknown>`
  - In route files, use `Record<string, unknown>` for DB row casts
  - In scripts, use `Record<string, unknown>` or proper interfaces

  **Must NOT do**:
  - Do NOT change runtime behavior
  - Do NOT break type compatibility

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Systematic type replacement across 6 files
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 5 with Tasks 25, 27-28)
  - **Blocks**: None
  - **Blocked By**: Wave 4

  **References**:
  - `src/lib/wiki/types.ts` — `WikiFrontmatter` with `unknown` index
  - Grep results for `Record<string, any>` — all 12 occurrences

  **Acceptance Criteria**:
  - [ ] Zero `Record<string, any>` in source files (scripts can be deferred)
  - [ ] `npx next build` passes with zero type errors

  **Commit**: YES (groups with 25, 27)
  - Message: `fix(types): replace Record<string, any> with Record<string, unknown>`
  - Files: 6 files with `Record<string, any>`
  - Pre-commit: `npx next build`

- [x] 27. Fix `useRef<any>` for typed libraries (2 occurrences)

  **What to do**:
  - Read `src/components/wiki/graph-view.tsx` line 113 — `useRef<any>(null)` for Cytoscape
  - Read `src/components/wiki/search.tsx` line 68 — `useRef<any>(null)` for FlexSearch
  - Replace with proper types: `useRef<Cytoscape.Core | null>(null)` and `useRef<FlexSearch.Document | null>(null)`
  - Add proper imports for types

  **Must NOT do**:
  - Do NOT change the component behavior
  - Do NOT break type compatibility

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two files, type annotation changes
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 5 with Tasks 25-26, 28)
  - **Blocks**: None
  - **Blocked By**: Wave 4

  **References**:
  - `src/components/wiki/graph-view.tsx:113` — Cytoscape ref
  - `src/components/wiki/search.tsx:68` — FlexSearch ref
  - `@types/cytoscape` — Cytoscape types
  - `flexsearch` — FlexSearch types

  **Acceptance Criteria**:
  - [ ] Zero `useRef<any>` in source files
  - [ ] `npx next build` passes with zero type errors

  **Commit**: YES (groups with 25, 26)
  - Message: `fix(types): add proper types to useRef for Cytoscape and FlexSearch`
  - Files: `src/components/wiki/graph-view.tsx`, `src/components/wiki/search.tsx`
  - Pre-commit: `npx next build`

- [x] 28. Fix JWT type casts (2 occurrences)

  **What to do**:
  - Read `src/lib/auth.ts` line 57 — `payload as unknown as AuthToken`
  - Read `src/middleware.ts` lines 28-29 — `payload.sub as string` and `payload.username as string`
  - In `auth.ts`: Add runtime validation — check required claims exist before casting
  - In `middleware.ts`: Add null checks before using `sub` and `username`

  **Must NOT do**:
  - Do NOT change the JWT verification logic
  - Do NOT break auth flow

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two files, add null checks
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 5 with Tasks 25-27)
  - **Blocks**: None
  - **Blocked By**: Wave 4

  **References**:
  - `src/lib/auth.ts:57` — JWT payload cast
  - `src/middleware.ts:28-29` — JWT claim casts

  **Acceptance Criteria**:
  - [ ] Zero `as unknown as` casts on JWT payloads
  - [ ] Missing claims handled gracefully
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 25, 26)
  - Message: `fix(types): add runtime validation for JWT payload claims`
  - Files: `src/lib/auth.ts`, `src/middleware.ts`
  - Pre-commit: `npx next build`

- [x] 29. Add logging to API route catch blocks

  **What to do**:
  - Grep for routes with `catch` blocks that don't log (return error response without `logger.error`)
  - Add `logger.error("[route] operation failed", err)` before every `return NextResponse.json({ error: ... }, { status: 500 })`
  - Focus on: auth/register, auth/login, relationships, tts/voices/refresh, tts/voices/combine, auth/logout, wiki/[...slug], wiki/recent, search
  - Use the existing `logger` import pattern from other routes

  **Must NOT do**:
  - Do NOT change the error response format
  - Do NOT log sensitive data (passwords, tokens)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Systematic addition of logging across ~15 routes
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 6 with Tasks 30-32)
  - **Blocks**: None
  - **Blocked By**: Wave 5

  **References**:
  - `src/lib/logger.ts` — Logger import pattern
  - `src/app/api/generate/[id]/route.ts` — Example of proper error logging

  **Acceptance Criteria**:
  - [ ] All catch blocks in API routes log errors
  - [ ] No sensitive data in logs
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 30, 31)
  - Message: `fix(reliability): add error logging to API route catch blocks`
  - Files: ~15 route files
  - Pre-commit: `npx next build`

- [x] 30. Fix inline functions breaking `MessageItem` memoization

  **What to do**:
  - Read `src/components/chat/chat-window.tsx` lines 152-171
  - `MessageItem` is wrapped in `memo()` but receives 6 inline arrow functions as props
  - Wrap handlers in `useCallback` in the parent component
  - Or consolidate to a single `onAction(type, id)` callback

  **Must NOT do**:
  - Do NOT change the MessageItem component interface
  - Do NOT break chat functionality

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: React optimization, need to understand component structure
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 6 with Tasks 29, 31-32)
  - **Blocks**: None
  - **Blocked By**: Wave 5

  **References**:
  - `src/components/chat/chat-window.tsx:152-171` — MessageItem with inline functions
  - `src/components/chat/streaming-text.tsx` — Related chat component

  **Acceptance Criteria**:
  - [ ] MessageItem memoization is effective (handlers don't change on every render)
  - [ ] Chat functionality unchanged
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 29, 31)
  - Message: `fix(perf): fix inline functions breaking MessageItem memoization`
  - Files: `src/components/chat/chat-window.tsx`
  - Pre-commit: `npx next build`

- [x] 31. Fix index-as-key in `.map()` calls (5 occurrences)

  **What to do**:
  - Grep for `key={i}` and `key={index}` in `.tsx` files (5 occurrences)
  - Replace with stable identifiers:
    - `src/components/relationships/relationship-web.tsx:119` — `${edge.source}-${edge.target}`
    - `src/components/wiki/outline-panel.tsx:133` — `h.slug`
    - `src/app/(app)/universe/page.tsx:264` — boundary text
    - `src/app/(app)/personas/page.tsx:531` — tag text
    - `src/components/wiki/file-tree.tsx` — file path
  - Also check `src/components/wiki/revision-history.tsx` and `src/components/wiki/outgoing-links-panel.tsx`

  **Must NOT do**:
  - Do NOT change the rendered output
  - Do NOT break list rendering

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Systematic key replacement across 5 files
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 6 with Tasks 29-30, 32)
  - **Blocks**: None
  - **Blocked By**: Wave 5

  **References**:
  - Grep results for `key={i}` and `key={index}` — all 5+ occurrences
  - React docs on list keys

  **Acceptance Criteria**:
  - [ ] Zero index-as-key in `.map()` calls
  - [ ] Lists render correctly
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 29, 30)
  - Message: `fix(react): replace index-as-key with stable identifiers in .map() calls`
  - Files: 5+ component files
  - Pre-commit: `npx next build`

- [x] 32. Extract TTS cache FS operations to lib

  **What to do**:
  - Read `src/app/api/tts/cache/route.ts` (326 lines)
  - Create `src/lib/tts-cache.ts` with: `getCacheStats()`, `clearCache()`, `refreshCache()`, `combineCache()`, `formatBytes()`
  - Move all filesystem operations (fs.readdirSync, fs.statSync, fs.unlinkSync, fs.writeFileSync, fs.readFileSync) to the lib module
  - Route handler becomes thin: extract auth, call lib functions, format response

  **Must NOT do**:
  - Do NOT change the API response format
  - Do NOT change the cache behavior

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Extract 326-line route into thin handler + lib module
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 6 with Tasks 29-31)
  - **Blocks**: None
  - **Blocked By**: Wave 5

  **References**:
  - `src/app/api/tts/cache/route.ts` — Current implementation
  - `src/lib/tts.ts` — Existing TTS lib module
  - `src/lib/wiki/file-io.ts` — Example of lib module with FS operations

  **Acceptance Criteria**:
  - [ ] Route handler is thin (< 50 lines per handler)
  - [ ] All FS operations in `tts-cache.ts`
  - [ ] API behavior unchanged
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 29, 30)
  - Message: `refactor(tts): extract FS operations from cache route to lib/tts-cache.ts`
  - Files: `src/app/api/tts/cache/route.ts`, `src/lib/tts-cache.ts` (new)
  - Pre-commit: `npx next build`

- [x] 33. Add LRU cache to `listWikiPages()`

  **What to do**:
  - Read `src/lib/wiki/file-io.ts` lines 322-341 — `listWikiPages()` function
  - Add an LRU cache with TTL (e.g., 30s) for `listWikiPages()` results
  - Invalidate cache on write/delete operations
  - Use a simple Map-based LRU (no npm dependency)

  **Must NOT do**:
  - Do NOT change the file reading logic
  - Do NOT break wiki consistency

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Add caching layer to critical wiki function
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 7 with Tasks 34-37)
  - **Blocks**: None
  - **Blocked By**: Wave 6

  **References**:
  - `src/lib/wiki/file-io.ts:322-341` — `listWikiPages()` function
  - `src/lib/rate-limiter.ts` — Example of Map-based caching pattern
  - `src/lib/wiki/file-io.ts` — `writeWikiPage()`, `deleteWikiPage()` for cache invalidation

  **Acceptance Criteria**:
  - [ ] Repeated calls to `listWikiPages()` return cached results within TTL
  - [ ] Write/delete operations invalidate the cache
  - [ ] Wiki content is consistent
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 34, 35)
  - Message: `perf(wiki): add LRU cache to listWikiPages with TTL invalidation`
  - Files: `src/lib/wiki/file-io.ts`
  - Pre-commit: `npx next build`

- [x] 34. Add `busy_timeout` pragma to SQLite

  **What to do**:
  - Read `src/lib/db.ts` (36 lines)
  - Add `db.pragma("busy_timeout = 5000")` after database initialization
  - This handles WAL lock contention gracefully

  **Must NOT do**:
  - Do NOT change the database initialization pattern
  - Do NOT change WAL mode

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 1-line addition
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 7 with Tasks 33, 35-37)
  - **Blocks**: None
  - **Blocked By**: Wave 6

  **References**:
  - `src/lib/db.ts` — Database initialization
  - better-sqlite3 docs on `busy_timeout` pragma

  **Acceptance Criteria**:
  - [ ] `busy_timeout = 5000` is set on database initialization
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 33, 35)
  - Message: `perf(db): add busy_timeout pragma to SQLite for WAL lock contention`
  - Files: `src/lib/db.ts`
  - Pre-commit: `npx next build`

- [x] 35. Fix unbounded Maps (fileLocks, lastProcessingTime, rate limiter)

  **What to do**:
  - Read `src/lib/wiki/file-io.ts` line 23 — `fileLocks` Map
  - Read `src/lib/idle-processing.ts` line 78 — `lastProcessingTime` Map
  - Read `src/lib/rate-limiter.ts` line 9 — rate limiter store Map
  - For `fileLocks`: Wrap `writeWikiPage()` in try/finally to guarantee unlock. Add periodic cleanup for stale locks (>30s).
  - For `lastProcessingTime`: Add periodic cleanup of entries older than 24 hours.
  - For rate limiter: Call `cleanupExpiredEntries()` at start of every rate-limited route (not just generate).

  **Must NOT do**:
  - Do NOT change the core logic of any Map
  - Do NOT break file locking or rate limiting

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Three files, add cleanup logic
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 7 with Tasks 33-34, 36-37)
  - **Blocks**: None
  - **Blocked By**: Wave 6

  **References**:
  - `src/lib/wiki/file-io.ts:23` — `fileLocks` Map
  - `src/lib/idle-processing.ts:78` — `lastProcessingTime` Map
  - `src/lib/rate-limiter.ts:9,72-79` — Rate limiter store and cleanup

  **Acceptance Criteria**:
  - [ ] `fileLocks` cleaned up on write completion and stale locks purged
  - [ ] `lastProcessingTime` entries older than 24h removed
  - [ ] Rate limiter cleanup called on every rate-limited route
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 33, 34)
  - Message: `perf(memory): fix unbounded Maps with periodic cleanup`
  - Files: `src/lib/wiki/file-io.ts`, `src/lib/idle-processing.ts`, `src/lib/rate-limiter.ts`
  - Pre-commit: `npx next build`

- [x] 36. Debounce wiki index regeneration

  **What to do**:
  - Read `src/lib/idle-enrichment.ts` — `generateIndex()` called after every wiki write (lines 93, 180, 229, 287, 354, 403, 505)
  - Read `src/lib/wiki/index-generator.ts` — `generateIndex()` function
  - Add debouncing: only regenerate index once per 5 seconds, even if called multiple times
  - Use `setImmediate()` or `setTimeout` for deferral

  **Must NOT do**:
  - Do NOT change the index generation algorithm
  - Do NOT break wiki index consistency

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Add debounce wrapper around existing function
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 7 with Tasks 33-35, 37)
  - **Blocks**: None
  - **Blocked By**: Wave 6

  **References**:
  - `src/lib/idle-enrichment.ts` — Multiple `generateIndex()` calls
  - `src/lib/wiki/index-generator.ts` — `generateIndex()` function
  - `src/lib/idle-processing.ts` — `setImmediate()` pattern for async deferral

  **Acceptance Criteria**:
  - [ ] Multiple wiki writes within 5s trigger only one index regeneration
  - [ ] Index is eventually consistent
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 33, 34)
  - Message: `perf(wiki): debounce wiki index regeneration to reduce I/O`
  - Files: `src/lib/wiki/index-generator.ts`, `src/lib/idle-enrichment.ts`
  - Pre-commit: `npx next build`

- [x] 37. Batch contradiction detector queries

  **What to do**:
  - Read `src/lib/contradiction-detector.ts` lines 216-237 — `detectAllContradictions()`
  - Replace N+1 pattern: instead of calling `detectContradictions()` per NPC/event, batch-fetch all entities in 2 queries
  - Perform in-memory contradiction checks
  - Reduce from O(N+M) queries to O(1)

  **Must NOT do**:
  - Do NOT change the contradiction detection algorithm
  - Do NOT change the response format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Refactor N+1 query pattern, ensure behavioral equivalence
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 7 with Tasks 33-36)
  - **Blocks**: None
  - **Blocked By**: Wave 6

  **References**:
  - `src/lib/contradiction-detector.ts:216-237` — N+1 pattern
  - `src/lib/contradiction-detector.ts` — `detectContradictions()` function to understand what data it needs

  **Acceptance Criteria**:
  - [ ] `detectAllContradictions()` uses 2 batch queries instead of N+1
  - [ ] Contradiction detection results are identical
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 33, 34)
  - Message: `perf(contradictions): batch queries in contradiction detector to eliminate N+1`
  - Files: `src/lib/contradiction-detector.ts`
  - Pre-commit: `npx next build`

- [x] 38. Fix naming inconsistencies (`data`, `err`)

  **What to do**:
  - Grep for `const data = await res.json()` — rename to descriptive names per context
  - Grep for `const err = await res.json()` — rename to `errorBody` or `responseJson`
  - Focus on the most confusing instances first: session page, settings page, universe page
  - Use AST-grep or systematic find-and-replace

  **Must NOT do**:
  - Do NOT change the logic
  - Do NOT break functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Systematic renaming across multiple files
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 8 with Tasks 39-42)
  - **Blocks**: None
  - **Blocked By**: Wave 7

  **References**:
  - Grep results for `const data = await res.json()` — ~49 occurrences
  - Grep results for `const err = await res.json()` — 2 occurrences

  **Acceptance Criteria**:
  - [ ] `data` variables renamed to descriptive names in critical files
  - [ ] `err` variables used for JSON responses renamed
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 39, 40)
  - Message: `chore(naming): rename generic data/err variables to descriptive names`
  - Files: Multiple component and hook files
  - Pre-commit: `npx next build`

- [x] 39. Fix settings page useState overuse

  **What to do**:
  - Read `src/app/(app)/settings/page.tsx` (624 lines, 20+ useState calls)
  - Group related state into objects: `const [ttsState, setTtsState] = useState({ voices: [], narratorVoice: "", ... })`
  - Add `AbortController` to fetch cleanup: `return () => controller.abort()`
  - Focus on the 7 parallel fetches with no cleanup

  **Must NOT do**:
  - Do NOT change the settings page behavior
  - Do NOT break any settings functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Refactor state management in single file
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 8 with Tasks 38, 40-42)
  - **Blocks**: None
  - **Blocked By**: Wave 7

  **References**:
  - `src/app/(app)/settings/page.tsx` — Current implementation
  - `src/app/(app)/personas/page.tsx` — Similar pattern (12 useState for form)

  **Acceptance Criteria**:
  - [ ] Related state grouped into objects
  - [ ] Fetch cleanup with AbortController
  - [ ] Settings page behavior unchanged
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 38, 40)
  - Message: `refactor(settings): group useState calls and add fetch cleanup`
  - Files: `src/app/(app)/settings/page.tsx`
  - Pre-commit: `npx next build`

- [x] 40. Fix subdirectory convention violations

  **What to do**:
  - Read `src/lib/jobs/` (6 files) and `src/lib/idle/` (2 files)
  - Per `lib/AGENTS.md`: "Flat structure — all utilities are siblings. Only `wiki/` has a subdirectory."
  - Option A: Move files to `lib/` root with prefixed names (`job-lore-extraction.ts`, `idle-wiki-tasks.ts`)
  - Option B: Update `AGENTS.md` to document the exception
  - Choose Option B — moving 8 files and updating all imports is high risk for low value

  **Must NOT do**:
  - Do NOT break any imports
  - Do NOT change any functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Update documentation to match reality
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 8 with Tasks 38-39, 41-42)
  - **Blocks**: None
  - **Blocked By**: Wave 7

  **References**:
  - `src/lib/AGENTS.md` — Convention documentation
  - `src/lib/jobs/` — 6 files
  - `src/lib/idle/` — 2 files

  **Acceptance Criteria**:
  - [ ] `lib/AGENTS.md` updated to document `jobs/` and `idle/` as allowed subdirectories
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 38, 39)
  - Message: `docs(lib): update AGENTS.md to document jobs/ and idle/ subdirectories`
  - Files: `src/lib/AGENTS.md`
  - Pre-commit: `npx next build`

- [x] 41. Fix remaining low-priority issues

  **What to do**:
  - Fix non-null assertions after `has` checks (8 occurrences) — use single lookup pattern
  - Fix `src/lib/job-processor.ts:291` — `console.log` → `logger.info`
  - Fix `src/components/participant-list.tsx` — duplicate `"use client"` directive
  - Fix `src/components/wiki/hover-preview.tsx:145` — non-null assertion after `has` check
  - Fix `src/lib/event-bus.ts:39` — Node.js-specific `unref()` cast with runtime check
  - Fix `src/lib/startup-check.ts:21` — JWT_SECRET presence log → generic "Auth: configured"

  **Must NOT do**:
  - Do NOT change any behavior
  - Do NOT introduce new issues

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Multiple small fixes across files
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 8 with Tasks 38-40, 42)
  - **Blocks**: None
  - **Blocked By**: Wave 7

  **References**:
  - Grep results for each specific issue
  - `src/lib/logger.ts` — Logger pattern

  **Acceptance Criteria**:
  - [ ] All low-priority issues fixed
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 38, 39)
  - Message: `chore: fix remaining low-priority code quality issues`
  - Files: Multiple files
  - Pre-commit: `npx next build`

- [x] 42. Remove unused exports and dead re-exports

  **What to do**:
  - Remove unused exports from `src/lib/logger.ts`: `setCorrelationId`, `runWithCorrelation` (lines 168, 180)
  - Remove dead `buildIntentContext` from `src/lib/intent-analyzer.ts` (line 75+)
  - Remove re-exports from `src/lib/retrieval.ts` (lines 10-16) if not already handled by Task 22
  - Verify no external consumers depend on these exports

  **Must NOT do**:
  - Do NOT remove exports that are actually used
  - Do NOT break any functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Grep for usage, remove unused exports
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 8 with Tasks 38-41)
  - **Blocks**: None
  - **Blocked By**: Wave 7

  **References**:
  - `src/lib/logger.ts:168,180` — Unused exports
  - `src/lib/intent-analyzer.ts:75+` — Dead function
  - `src/lib/retrieval.ts:10-16` — Re-exports

  **Acceptance Criteria**:
  - [ ] Unused exports removed
  - [ ] `npx next build` passes

  **Commit**: YES (groups with 38, 39)
  - Message: `chore: remove unused exports and dead re-exports`
  - Files: `src/lib/logger.ts`, `src/lib/intent-analyzer.ts`, `src/lib/retrieval.ts`
  - Pre-commit: `npx next build`

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
  Run `npx next build` + `npm run lint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1 (T1-T4)**: `fix(security): critical security fixes — auth, path traversal, validation` — 4 route files — `npx next build`
- **Wave 2 (T5-T13)**: `fix(security): high-severity security fixes — auth bypass, IDOR, CSRF, data exposure` — 9 files — `npx next build`
- **Wave 3 (T14-T19)**: `fix(security): medium security fixes — rate limiting, input validation, logging` — 7 files — `npx next build`
- **Wave 4 (T20-T24)**: `refactor: deduplicate code, remove dead code, consolidate auth` — 8 files — `npx next build`
- **Wave 5 (T25-T28)**: `fix(types): improve type safety — instanceof, unknown, useRef, JWT` — 12 files — `npx next build`
- **Wave 6 (T29-T32)**: `fix(reliability): error logging, React patterns, code organization` — 20 files — `npx next build`
- **Wave 7 (T33-T37)**: `perf: caching, SQLite, memory management, query optimization` — 5 files — `npx next build`
- **Wave 8 (T38-T42)**: `chore: naming, state management, docs, low-priority cleanup` — 15 files — `npx next build`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: exit 0, no errors
npm run lint    # Expected: exit 0, no warnings
```

### Final Checklist
- [ ] All 7 CRITICAL findings resolved
- [ ] All 19 HIGH findings resolved
- [ ] All 40 MEDIUM findings resolved or deferred with justification
- [ ] All 29 LOW findings resolved or deferred with justification
- [ ] `npx next build` passes
- [ ] Zero new TypeScript errors
- [ ] Zero `as any`, `@ts-ignore`, empty catch blocks introduced
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
