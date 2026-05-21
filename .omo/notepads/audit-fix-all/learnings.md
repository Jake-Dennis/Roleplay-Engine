# Audit Fix Learnings

## XSS in FTS5 Snippet (2026-05-21)

**Vulnerability:** FTS5's `snippet()` function returns raw HTML with `<mark>` tags. When message content contains XSS payloads like `<img src=x onerror="alert(1)">`, the snippet renders it unescaped via `dangerouslySetInnerHTML` in `chat-search.tsx`.

**Fix:** Added `escapeHtmlPreservingMarks()` helper in `src/app/api/sessions/[id]/messages/search/route.ts`:
1. Replace `<mark>`/`</mark>` with null-byte placeholders
2. Escape `&`, `<`, `>`, `"`, `'` to HTML entities
3. Restore `<mark>`/`</mark>` from placeholders

**Pattern:** Server-side sanitization before response, not client-side escaping. Matches the existing pattern from phase-1-security-hardening (XSS in markdown renderer fixed with URL scheme whitelist).

**Files changed:**
- `src/app/api/sessions/[id]/messages/search/route.ts` — added helper + applied to snippet field

**Files NOT changed (by design):**
- `src/components/chat/chat-search.tsx` — client-side `dangerouslySetInnerHTML` is safe once server sanitizes input

## Missing Auth on Infrastructure Endpoints (2026-05-21)

**Vulnerability:** `/api/models/ollama` and `/api/tts/voices` had no authentication check, exposing sensitive infrastructure info (Ollama host:port, model names, parameter sizes) and TTS voice list to unauthenticated requests.

**Fix:** Added `getAuthToken()` + `verifyToken()` auth check to both endpoints:
- `src/app/api/models/ollama/route.ts` — `GET()` now requires valid JWT
- `src/app/api/tts/voices/route.ts` — `GET()` and `POST()` now require valid JWT

**Pattern:** Standard project auth pattern — extract token from httpOnly cookie, verify JWT, return 401 if missing or invalid.

**Files NOT changed (by design):**
- `/api/health`, `/api/health/live`, `/api/health/ready` — intentionally public
- `/api/auth/login`, `/api/auth/register` — must remain public for authentication flow

## Error Message Leakage (2026-05-21)

**Vulnerability:** API error responses exposed internal error details (`err.message`, `String(error)`) to clients, leaking SQL errors, file paths, and stack traces.

**Fix:** Replaced all error message leakage with generic "Internal server error" responses. Added `logger.error()` calls before each return to preserve server-side debugging capability.

**Pattern:** 
- Import `logger` from `@/lib/logger`
- Replace `{ error: err.message }` with `{ error: "Internal server error" }`
- Add `logger.error("Description of operation", err)` before the return
- Keep existing status codes

**Files changed (12 files, 18 occurrences):**
- `src/app/api/wiki/[...slug]/route.ts` — 3 catch blocks (GET/PUT/DELETE)
- `src/app/api/contradictions/route.ts` — 2 catch blocks (POST/PUT)
- `src/app/api/health/route.ts` — 3 health check functions (Ollama/Kokoro/DB)
- `src/app/api/health/ready/route.ts` — 3 readiness check functions (Ollama/Kokoro/DB)
- `src/app/api/wiki-revisions/route.ts` — 1 catch block (POST)
- `src/app/api/wiki/validate/[...slug]/route.ts` — 1 catch block (PUT)
- `src/app/api/wiki/reject/[...slug]/route.ts` — 1 catch block (PUT)
- `src/app/api/wiki/lock/[...slug]/route.ts` — 1 catch block (PUT)
- `src/app/api/generate/[id]/route.ts` — 1 catch block (SSE stream error)
- `src/app/api/tts/stream/route.ts` — 1 catch block (TTS stream error)
- `src/app/api/jobs/route.ts` — 1 catch block (queue-idle action)
- `src/app/api/backlinks/route.ts` — added logging (message used internally for UNIQUE constraint check, not leaked)

**Verification:** `npx next build` passes cleanly. Grep confirms no `err.message` or `String(error)` in API error responses.

## Catch Block Standardization (2026-05-21)

**Issue:** Inconsistent catch block variable naming across the codebase. Mix of `catch (e)`, `catch (error)`, `catch (err)` without type annotations.

**Fix:** Standardized all catch blocks to use `catch (err: unknown)` pattern:
- `catch (e)` → `catch (err: unknown)` (9 occurrences)
- `catch (error)` → `catch (err: unknown)` (23 occurrences)
- `catch (err)` → `catch (err: unknown)` (21 occurrences)
- Updated all internal references: `e.message` → `err.message`, `error as Error` → `err as Error`, etc.

**Pattern:** 
- Catch variable always named `err` with explicit `: unknown` type annotation
- Type guards used before accessing properties: `err instanceof Error ? err.message : String(err)`
- Bare `catch {` blocks (no variable binding) left unchanged — 211 occurrences, intentional

**Files changed (57 files, 89 catch blocks):**
- All `src/app/api/**/*.ts` route handlers
- All `src/lib/**/*.ts` utilities (ollama, tts, job-processor, wiki/ingest, wiki/filing, idle/wiki-tasks, etc.)
- All `src/hooks/*.ts` (use-voices, use-session, use-entity-fetch)
- Selected `src/components/**/*.tsx` and `src/app/(app)/**/*.tsx` pages

**Verification:** `npx next build` passes TypeScript compilation. `npx run lint` passes (pre-existing lint warnings unrelated to catch blocks remain). Grep confirms zero `catch (e)`, `catch (error)`, or untyped `catch (err)` remain.

## Non-Blocking Idle Processing (2026-05-21)

**Issue:** `processIdleTime()` was called synchronously in the `process-idle` action of `/api/jobs`, blocking the HTTP response while idle jobs executed. This added latency to every request that triggered idle processing.

**Fix:** Wrapped `processIdleTime()` call in `setImmediate()` to defer execution to the next event loop tick, making it fire-and-forget. Response returns immediately with `{ success: true, message: "Idle processing started" }`. Errors are caught and logged via `logger.error()` — idle processing is best-effort and never crashes the request.

**Pattern:**
- `setImmediate(async () => { try { await processIdleTime(...) } catch (err: unknown) { logger.error(...) } })`
- Return immediate acknowledgment response instead of awaiting results
- `logger` already imported at module level, no dynamic import needed

**Files changed:**
- `src/app/api/jobs/route.ts` — `process-idle` case (line 103-106)

**Note:** `processIdleTime()` was NOT called in middleware as initially assumed. It was only called in the `/api/jobs` route handler's `process-idle` action. No other callers exist.

**Verification:** `npx next build` passes cleanly.
## Remove unused _pagePath parameter (2026-05-21)
- Removed _pagePath from updateIndexEntry(wikiRoot) and emoveIndexEntry(wikiRoot) in src/lib/wiki/index-generator.ts
- No external call sites existed � functions were exported but never imported elsewhere
- 
px next build passes cleanly
- Both functions simply delegate to generateIndex(wikiRoot), so the parameter was truly unused

## Duplicate Canvas Graph Removal (2026-05-21)

**Issue:** `src/app/(app)/graph/page.tsx` was a duplicate canvas-based graph view with O(n²) force-directed simulation that blocks the main thread. The superior Cytoscape-based implementation already exists at `src/components/wiki/graph-view.tsx`, accessible via the `/wiki` page's "Graph" tab.

**Fix:** Deleted `src/app/(app)/graph/` directory (page.tsx + error.tsx). No navigation links needed updating — the sidebar `navItems` in `app-layout-shell.tsx` never included `/graph`. The Cytoscape graph remains fully accessible through the wiki page's browse/graph tab toggle.

**Files deleted:**
- `src/app/(app)/graph/page.tsx` — canvas-based duplicate (272 lines)
- `src/app/(app)/graph/error.tsx` — error boundary for deleted page

**Files NOT changed (by design):**
- `src/components/wiki/graph-view.tsx` — Cytoscape implementation, kept
- `src/app/(app)/wiki/page.tsx` — uses GraphView component, kept
- `src/app/(app)/app-layout-shell.tsx` — no `/graph` nav link existed

**Verification:** `npx next build` passes cleanly (required `.next` cache clean due to stale type declarations referencing deleted page).

## DbResult: `Record<string, any>` → `Record<string, unknown>` (2026-05-21)

**Issue:** `DbResult` was typed as `Record<string, any>`, which disables TypeScript type checking on all database query result property accesses. Changing to `Record<string, unknown>` enforces explicit type assertions at access points.

**Fix:** Changed `DbResult` definition in `src/lib/types.ts` from `Record<string, any>` to `Record<string, unknown>`. Removed the `eslint-disable-next-line @typescript-eslint/no-explicit-any` comment since `unknown` is the safe default.

**Impact analysis:**
- `as DbResult` / `as DbResult[]` casts remain valid — casting TO `unknown` is always safe
- Most usage sites pass results through `camelizeKeys()` or spread operators — no direct property access, no breakage
- Two functions required explicit type assertions at property access points:

**Files changed:**
- `src/lib/types.ts` — type definition + removed eslint-disable comment
- `src/app/api/relationships/[id]/route.ts` — `hasEntityAccess()`: added `as string` assertions on `entity.user_id` and `entity.group_id`
- `src/app/api/relationships/route.ts` — `getUniverseOwnerId()`: added `as string` assertions on `universe.group_owner_id` and `universe.user_id`

**Files NOT changed (by design):**
- `src/app/api/universes/route.ts` — uses `u.boundaries as string | null` (already asserted)
- `src/app/api/sessions/route.ts` — passes results to `camelizeKeys()`, no direct property access
- `src/app/api/relationships/[id]/file/route.ts` — import only, no usage
- `src/app/api/relationships/[id]/decay/route.ts` — import only, no usage
- `src/app/api/relationships/[id]/evolution/route.ts` — import only, no usage

**Pattern:** When accessing properties on `DbResult` (now `Record<string, unknown>`), use explicit type assertions at the access point: `row.column_name as string`. This is safer than `as any` because it only loosens the specific property, not the entire object.

**Verification:** `npx next build` passes cleanly with no TypeScript errors.
