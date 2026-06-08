# Plan 022: Longer-term Improvements

## Goal
Address the lower-priority, higher-effort findings: extract the session page into manageable sub-components, move choice generation to background jobs, add CSRF tokens, evaluate TypeScript 6 and ESLint 10 upgrades, and optimize force-dynamic granularity.

## Tasks

### Layer 1 (parallel, no deps)

- [ ] **1a: Extract session page panels** (assigned: @refactor)
  - `src/app/(app)/session/[id]/page.tsx` is 1012 lines with 35+ `useState` calls
  - Extract these into separate memoized sub-components:
    - `SceneStatePanel` — already exists, ensure it's memoized
    - `ParticipantList` — extract inline participant rendering
    - `PrivateStatePanel` — extract inline private state
    - `RelationshipTimelinePanel` — extract inline timeline
    - `SessionRecapPanel` — extract inline recap
    - `MessageList` — extract message rendering with virtual scrolling
    - `StreamingArea` — extract streaming content display
    - `CharacterModal` — already exists but might be inlined
  - Each extracted component should:
    - Be in its own file under `src/components/session/`
    - Use `React.memo`
    - Receive minimal props
  - After extraction: verify page.tsx is < 400 lines

- [ ] **1b: Move choice generation to background job** (assigned: @builder)
  - In `src/app/api/generate/[id]/route.ts`:
    - Move the synchronous `generateText()` call for choices (around line 319) to a background job
    - Create a new job type in `src/lib/jobs/types.ts` (e.g., `GENERATE_CHOICES`)
    - Create `src/lib/jobs/choices-handler.ts` that generates choices
    - Queue the job after the main stream completes
    - Emit choice results via SSE (`event: choices`) instead of blocking the stream close
  - Verify: generation endpoint returns faster (no 5-15s wait after stream ends)

- [ ] **1c: Add CSRF tokens** (assigned: @security)
  - Implement Double Submit Cookie pattern:
    - Server sets a CSRF token cookie (non-httpOnly) on login
    - Client reads the cookie and sends it as `X-CSRF-Token` header on state-changing requests
    - Server validates the header matches the cookie
  - Add to all POST/PUT/DELETE endpoints
  - Update `src/lib/api-client.ts` (if used) or all fetch calls
  - Verify: authenticated requests still work; curl requests without CSRF token are rejected

- [ ] **1d: Evaluate TS 6 and ESLint 10** (assigned: @architect)
  - Research TypeScript 6.0 breaking changes
  - Research ESLint 10 breaking changes
  - Check compatibility:
    - `typescript-eslint@8.59.3` with TS 6
    - `eslint-config-next@16.2.x` with ESLint 10
  - Create a migration plan document: `docs/migrations/typescript-6.md`
  - Create a migration plan document: `docs/migrations/eslint-10.md`

- [ ] **1e: Per-route force-dynamic** (assigned: @perf)
  - Read `src/app/layout.tsx` — currently has `dynamic = "force-dynamic"` at root
  - Move this to a per-route basis:
    - Pages that need dynamic rendering: session pages, API routes, user-specific pages
    - Pages that CAN be static: login, register, about pages
    - Remove root `force-dynamic`
    - Add `dynamic = "force-dynamic"` only to the routes that need it
  - Verify: dynamic pages still render fresh data; static pages are cached

## Verification
- [ ] 1a: Session page extracted into sub-components — page.tsx < 400 lines
- [ ] 1b: Choice generation runs as background job — stream closes immediately after main response
- [ ] 1c: CSRF protection added — state-changing requests require valid token
- [ ] 1d: Migration plans created in `docs/migrations/`
- [ ] 1e: `force-dynamic` scoped to dynamic routes only — login/register pages cacheable
- [ ] Full: `npm test` passes, `npm run build` compiles
