# Scene State Auto-Update — Learnings

## 2026-05-21: Wave 1 — extractAndApplySceneState

### File Created
- `src/lib/scene-extraction.ts`

### Function Signature
```ts
export async function extractAndApplySceneState(
  sessionId: string,
  userId: string
): Promise<void>
```

### Design Decisions
- **Inline execution** — not queued, called directly after AI response
- **All-or-nothing upsert** — no partial updates; LLM returns full state, we write all fields
- **Low temperature (0.3)** — deterministic extraction, not creative generation
- **Messages reversed** — fetched DESC (newest first) but reversed to chronological order for LLM context
- **Continuity prompt** — current scene state included so LLM only changes what messages indicate
- **Error handling** — try/catch around entire function, `logger.warn` on failure, no retry
- **JSON parsing** — `safeParseWarn` with null fallback; invalid JSON logs warning preview (200 chars)

### Patterns Followed
- Upsert: check exists → UPDATE or INSERT (matches `scene/route.ts`)
- DB: `getDb()`, `db.prepare().all/get/run()` with `?` params
- LLM: `generateText()` from `@/lib/ollama`
- Logging: `logger.warn()` / `logger.debug()` from `@/lib/logger`
- JSON: `safeParseWarn()` from `@/lib/safe-json`

### Schema (unchanged)
`scene_states`: id, session_id, active_location_id, current_goal, emotional_tone, active_npcs (JSON), active_threads (JSON), scene_summary, updated_at

## 2026-05-21: Wave 2 — SSE scene:updated event

### Change Made
- Added `"scene:updated"` to `allEvents` array in `src/app/(app)/session/[id]/page.tsx:230`
- Existing `refreshSession()` handler now fires on scene state changes via SSE

### Why This Works
- `SCENE_UPDATED` event (`"scene:updated"`) is emitted by `event-bus.ts`
- `refreshSession()` re-fetches full session data via `GET /api/sessions/[id]`, which includes scene state
- No new handler needed — `allEvents` already maps every event to `refreshSession`

## 2026-05-21: Wave 3 — Integration into generate/[id]/route.ts

### Changes Made
- Added import: `import { extractAndApplySceneState } from "@/lib/scene-extraction";`
- Inserted extraction call after `GENERATION_DONE` emit (line 204), before `queueJob` (line 217)
- Emits `SCENE_UPDATED` SSE event on successful extraction
- Wrapped in try/catch — failure logs internally, doesn't break generation flow

### Placement Rationale
- **After GENERATION_DONE**: AI message content is fully written to DB before extraction reads it
- **Before queueJob**: extraction is inline (not queued), runs synchronously in the stream
- **Uses `decoded.sub`**: authenticated user ID from JWT, matches `extractAndApplySceneState` signature
- **Not queued**: scene extraction needs to complete before downstream jobs (summarize, embed) see updated state

### Verification
- `npx next build` passes cleanly (272 lines total)
- No other parts of the generation flow modified
