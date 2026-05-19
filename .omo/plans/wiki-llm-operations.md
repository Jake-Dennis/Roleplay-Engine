# Wiki LLM Operations — API Endpoints

## TL;DR

> **Quick Summary**: Wire the existing wiki library functions (ingest, query, lint, file) to HTTP API endpoints, bootstrap log.md and index.md, and add a raw sources layer. This connects the LLM engine to the frontend.
>
> **Deliverables**:
> - `POST /api/wiki/ingest` — Process a source file into wiki pages
> - `POST /api/wiki/query` — Query the wiki with LLM synthesis
> - `POST /api/wiki/lint` — Health-check the wiki for contradictions, orphans, stale claims
> - `POST /api/wiki/file` — Save a query answer as a synthesis page
> - `GET /api/wiki/log` — Retrieve recent operation logs
> - `GET /api/wiki/index` — Retrieve the wiki index
> - `POST /api/wiki/sources/upload` — Upload raw source files to immutable `raw/` directory
> - Bootstrap `log.md` and fix `index.md` generation
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — endpoints are independent
> **Critical Path**: T1 (auth helper) → T2-T6 (endpoints) → T7 (integration test)

---

## Context

### Current Architecture
- **Library functions**: `ingestSource()`, `queryWiki()`, `lintWiki()`, `fileAnswer()`, `appendLog()`, `generateIndex()` — all fully implemented in `src/lib/wiki/`
- **Existing API routes**: CRUD only — `GET/POST /api/wiki`, `GET/PUT/DELETE /api/wiki/[...slug]`
- **Auth pattern**: `verifyToken()` from `@/lib/auth`, token from `auth-token` cookie
- **Data path**: `data/{userId}/wiki/`
- **Ollama**: `generateText()` from `@/lib/ollama` — used by ingest, query, lint

### Key Gap
All library functions exist but have **no HTTP interface**. The LLM operations are unreachable from the frontend.

### Metis Review
**Identified Gaps** (addressed):
- Ingest needs source file path — solved by upload endpoint + raw/ directory
- Query can be slow (LLM synthesis) — endpoint returns structured result with timeout handling
- Lint is expensive (pairwise LLM comparisons) — endpoint returns report, can be async
- File answer needs citations — wired to query result structure

---

## Work Objectives

### Core Objective
Create API endpoints for all wiki LLM operations and bootstrap the missing infrastructure files.

### Definition of Done
- [ ] All 6 endpoints respond correctly with proper auth
- [ ] `npx next build` passes
- [ ] No new external dependencies
- [ ] log.md and index.md are bootstrapped and populated

### Must Have
- Auth on every endpoint (same pattern as existing routes)
- Proper error responses (401, 400, 500)
- Path traversal protection
- JSON request/response bodies

### Must NOT Have
- No new npm dependencies
- No changes to existing library function signatures
- No breaking changes to existing CRUD endpoints

---

## TODOs

- [ ] 1. Create shared auth helper for wiki API routes
- [ ] 2. POST /api/wiki/ingest endpoint
- [ ] 3. POST /api/wiki/query endpoint
- [ ] 4. POST /api/wiki/lint endpoint
- [ ] 5. POST /api/wiki/file endpoint
- [ ] 6. GET /api/wiki/log + GET /api/wiki/index endpoints
- [x] 7. POST /api/wiki/sources/upload + raw/ directory bootstrap
- [x] 8. Fix index.md generation to include all page types

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
- [ ] F2. **Code Quality Review** — `unspecified-high`
- [ ] F3. **Real Manual QA** — `unspecified-high`
- [ ] F4. **Scope Fidelity Check** — `deep`
