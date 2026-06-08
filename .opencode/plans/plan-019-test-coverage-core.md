# Plan 019: Test Coverage — Core Infrastructure

## Goal
Add unit tests for 7 critically untested modules: retrieval.ts, ollama.ts, prompt-builder.ts, auth.ts, event-bus.ts, job-processor.ts, and jobs/queue.ts. These are the modules where bugs could cause data loss, auth bypass, incorrect AI output, or system-wide failure.

## Tasks

### Layer 1 (parallel, no deps)

- [ ] **1a: Add tests for lib/retrieval.ts** (assigned: @tester)
  - Read `src/lib/retrieval.ts` (825 lines) — understand the context retrieval pipeline
  - Create `src/lib/__tests__/retrieval.test.ts`
  - Test:
    - `getRetrievedContext()` — mock DB queries, verify context assembly
    - `getWikiContext()` — verify keyword extraction, relevance scoring
    - `getMemoryContext()` — verify memory retrieval and sorting
    - `getSceneContext()` — verify scene state formatting
    - Budget truncation logic
    - Empty state handling
  - Mock DB using `mock.module()` for `@/lib/db`

- [ ] **1b: Add tests for lib/ollama.ts** (assigned: @tester)
  - Read `src/lib/ollama.ts` (543 lines) — understand the LLM client
  - Create `src/lib/__tests__/ollama.test.ts`
  - Test:
    - `generateText()` — mock fetch, verify request/response
    - `generateTextStream()` — mock SSE stream, verify chunk parsing
    - `getEmbeddings()` — verify embedding extraction
    - Error handling: timeout, network error, invalid response
    - Model fallback logic
    - URL construction (custom vs default)
  - Use `mock.module()` for `@/lib/config`, mock `global.fetch`

- [ ] **1c: Add tests for lib/prompt-builder.ts** (assigned: @tester)
  - Read `src/lib/prompt-builder.ts` (357 lines) — understand 10-section prompt assembly
  - Create `src/lib/__tests__/prompt-builder.test.ts`
  - Test:
    - `buildStructuredPrompt()` — verify all 10 sections present
    - Token counting and budget enforcement
    - Section assembly order
    - Empty section handling
    - Content truncation logic

- [ ] **1d: Add tests for lib/auth.ts** (assigned: @tester)
  - Read `src/lib/auth.ts` (286 lines) — understand auth core
  - Create `src/lib/__tests__/auth.test.ts`
  - Test:
    - `authenticateUser()` — valid/invalid credentials
    - `createToken()` / `verifyToken()` — JWT creation and verification
    - `hashPassword()` / `verifyPassword()` — bcrypt hashing and comparison
    - Token expiry (valid + expired)
    - Token denylist
    - Password change invalidation
    - User CRUD (create, get, delete)
  - Mock DB using `mock.module()`

- [ ] **1e: Add tests for lib/event-bus.ts** (assigned: @tester)
  - Read `src/lib/event-bus.ts` (228 lines) — understand event bus
  - Create `src/lib/__tests__/event-bus.test.ts`
  - Test:
    - `on()` / `emit()` — basic event subscription and emission
    - Multiple subscribers for same event
    - `off()` — unsubscription
    - History replay
    - Controller registration
    - Error isolation (one listener error doesn't break others)
    - Cleanup on `off()`

- [ ] **1f: Add tests for lib/job-processor.ts + lib/jobs/queue.ts** (assigned: @tester)
  - Read `src/lib/job-processor.ts` (172 lines) and `src/lib/jobs/queue.ts` (368 lines)
  - Create `src/lib/jobs/__tests__/job-processor.test.ts`
  - Test:
    - `queueJob()` — job creation with correct state
    - `getUserJobs()` — job listing and filtering
    - `updateJob()` — state transitions (pending → running → completed/failed)
    - `processUserJobs()` — handler dispatch
    - Error handling in handlers
    - Priority ordering
    - Job timeout handling
  - Mock handler functions and DB

## Layer 2 (depends on Layer 1)
- [ ] **2a: Run full test suite and fix issues** (assigned: @tester, depends on all Layer 1)
  - Run `npm test`
  - Fix any TypeScript errors in test files
  - Fix any test failures
  - Verify all new tests pass alongside existing 253 tests
  - Verify `npm run build` still compiles clean

## Verification
- [ ] 1a: `retrieval.test.ts` created with 15+ tests covering context assembly, scoring, budget truncation, empty states
- [ ] 1b: `ollama.test.ts` created with 15+ tests covering stream parsing, error handling, fallback, embedding
- [ ] 1c: `prompt-builder.test.ts` created with 10+ tests covering section assembly, tokens, budget
- [ ] 1d: `auth.test.ts` created with 15+ tests covering JWT, bcrypt, user CRUD, denylist
- [ ] 1e: `event-bus.test.ts` created with 10+ tests covering on/emit/off, history, isolation
- [ ] 1f: `job-processor.test.ts` created with 15+ tests covering queue, state transitions, dispatch, errors
- [ ] 2a: All tests pass, build compiles clean — total test count increased by ~80+
