# Performance Audit — Roleplay-Engine

**Date:** 2026-06-08
**Scope:** Bundle analysis, DB query patterns, rendering performance, API route performance
**Severity:** 3 critical, 5 high, 4 medium, 5 low

---

## Bundle Analysis

### Build setup
- `ANALYZE=true` is wired in `package.json` scripts (`npm run analyze`) and `next.config.ts` conditionally activates `@next/bundle-analyzer` when `ANALYZE=true` env var is set.
- Bundle analysis has **never been run** — `.next/analyze/` directory does not exist.
- **Recommendation:** Run `npm run analyze` to establish baseline bundle size per page.

### Largest dependencies (disk size in node_modules)

| Package | Size | Page Impact |
|---------|------|-------------|
| `next` (core) | 147 MB | All pages |
| `@next/*` (sub-deps) | 130 MB | All pages |
| `lucide-react` | 28.7 MB | Every page (icon imports) |
| `typescript` | 22.5 MB | Dev only |
| `@img/*` | 19.0 MB | Image optimization |
| `better-sqlite3` | 11.7 MB | All API routes |
| `@esbuild` | 11.1 MB | Dev only |
| `react-dom` | 7.0 MB | All pages |
| `cytoscape` + `react-cytoscapejs` | 5.4 MB + deps | Relationship graph page only |
| `zod` | 4.4 MB | Imported in multiple modules |

### Tree-shaking opportunities
- **lucide-react:** The session page imports 24 individual icons (`ArrowLeft, MapPin, Compass, Swords, MessageCircle, Search, Moon, Footprints, Wand2, Users, Heart, Sparkles, Lock, User, Loader2, ChevronDown, ChevronUp`). Next.js production builds tree-shake these, so runtime impact is minimal, but the import list is fragile and every new page adds more.
- **cytoscape + react-cytoscapejs (5.4 MB):** Loaded on relationship graph pages. Consider dynamic `next/dynamic` import with `ssr: false` since this is only used for graph visualization on a single route. Currently imported eagerly (check `src/components/relationships/`).
- **rehype-raw, rehype-sanitize, remark-gfm (estimated 2-3 MB combined):** Loaded on every wiki page. These could be dynamically loaded only when viewing/rendering wiki content, not on list pages.
- **zod (4.4 MB):** Used across multiple modules. Verify tree-shaking effectiveness in production builds.

### Bundle size of key pages (estimated)

| Page | Risk Factors |
|------|-------------|
| `/session/[id]/page.tsx` (1012 lines) | 24 lucide icons, ChatWindow, SceneStatePanel, RelationshipTimeline, NarrativeStatePanel — heavy import graph |
| `/wiki/[...slug]/page.tsx` (526 lines) | FileTree, MarkdownRenderer, MarkdownEditor, WikiQuickSwitcher, BacklinkPanel, VersionHistory, OutlinePanel — 7+ wiki components + rehype/remark ecosystem |
| `/wiki/page.tsx` | FileTree, NewFolderModal, WikiQuickSwitcher |
| `/session` | Session list with ChatSearch, ChatExport |

---

## Database Performance

### DB configuration (db.ts)
- WAL mode: ✓
- Cache size: 64 MB (`cache_size = -64000`) ✓
- Busy timeout: 5000 ms ✓
- WAL autocheckpoint: 1000 pages (~1 MB) ✓
- sqlite-vec extension: Attempted load every startup, falls back gracefully ✓

### Missing indexes (CRITICAL)

The following tables are queried by frequently-used columns but lack indexes:

| Table | Query Pattern | Used In | Impact |
|-------|--------------|---------|--------|
| `scene_states` | `WHERE session_id = ? ORDER BY updated_at DESC` | `getSceneContext()` (every generation) | **Full table scan** on every LLM prompt assembly |
| `narrative_memories` | `WHERE user_id = ? AND session_id = ? AND universe_id = ?` | `getMemoryContext()` (every generation) | Full table scan filtered by user_id only (no session_id/universe_id index) |
| `narrative_anchors` | `WHERE user_id = ? AND r.universe_id = ?` (JOIN relationships) | `getRetrievedContext()` (every generation) | Full table scan on user_id, then secondary filter in JS |
| `entity_mentions` | `WHERE user_id = ? AND frequency > 1 ORDER BY frequency DESC` | `getWikiContext()` (every generation) | No composite index for frequency ordering |
| `relationships` | `WHERE universe_id = ? ORDER BY updated_at DESC` | `getRelationshipContext()` (every generation) | Sort without index — uses filesort |

**Critical fix:** Add these indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_scene_states_session ON scene_states(session_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_narrative_memories_lookup ON narrative_memories(user_id, session_id, universe_id);
CREATE INDEX IF NOT EXISTS idx_narrative_anchors_user_universe ON narrative_anchors(user_id, universe_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_user_freq ON entity_mentions(user_id, frequency DESC);
```

### N+1 and repeated query patterns

**1. `getTurnConfig()` — 3 separate queries (HIGH)**
In `sessions/[id]/turn/route.ts` lines 22-34:
```typescript
const turnMode = db.prepare("SELECT value FROM session_config WHERE session_id = ? AND key = 'turn_mode'").get(sessionId);
const turnOrder = db.prepare("SELECT value FROM session_config WHERE session_id = ? AND key = 'turn_order'").get(sessionId);
const currentTurn = db.prepare("SELECT value FROM session_config WHERE session_id = ? AND key = 'current_turn'").get(sessionId);
```
**Fix:** Single query with `WHERE key IN ('turn_mode', 'turn_order', 'current_turn')`, pivot in JS.

**2. `getRelationshipEvolution()` — JS-side grouping (MEDIUM)**
Fetches ALL evolution rows and groups by `relationship_id` in a Map (line 663-685). For sessions with hundreds of evolutions, this fetches more data than needed.
**Fix:** Use SQL window function:
```sql
SELECT * FROM (
  SELECT re.*, r.source_entity, r.target_entity,
    ROW_NUMBER() OVER (PARTITION BY re.relationship_id ORDER BY re.recorded_at DESC) as rn
  FROM relationship_evolution re
  JOIN relationships r ON re.relationship_id = r.id
  WHERE r.universe_id = ?
) WHERE rn <= 3
```

**3. `getWikiContext()` — duplicated entity_mentions query (MEDIUM)**
Lines 516-523 fetch `entity_mentions` for vector scoring, then lines 557-575 fetch the *same* data again for entity boost fallback. If the first block fails silently (caught in try/catch), the second runs redundantly.
**Fix:** Move the entity_mentions fetch outside both try blocks, cache in a variable.

**4. Session access check duplicated in every route (LOW)**
Every session API route does:
```sql
SELECT id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (SELECT session_id FROM session_participants WHERE user_id = ?))
```
Pattern repeated across ~15 route files. Each route also does its own `getDb()` call.
**Fix:** Extract into `verifySessionAccess(sessionId, userId)` utility.

### Prepared statement reuse
`db.prepare(...)` is called fresh every time a query runs — there is no prepared statement caching or reuse. While better-sqlite3 caches statement compilation internally, the `.prepare()` call itself has overhead.
- **Impact:** Low (better-sqlite3 memoizes prepared statements internally)
- **Opportunity:** The `db` singleton could expose a statement cache for hot-path queries

---

## Rendering Performance

### Zero React.memo usage (CRITICAL)
Across all 71 components, **zero uses of `React.memo`** were found. The only memoized components are `NavItem`, `GroupSelector`, `SessionSelector`, and `UniverseSelector` (all internal to `app-layout-shell.tsx`).

**Impact:**
- `ChatWindow` re-renders **every message bubble** on every SSE chunk/state change
- `FileTree` re-renders every folder and page on any wiki state change
- `MarkdownEditor` re-renders on every keystroke (no memo on editor or preview panes)
- `WikiQuickSwitcher` re-renders results list on every input change (no memo on filtered results)

### Session page — 35 state variables + massive file (CRITICAL)
`session/[id]/page.tsx` is a 1012-line single component with 35+ `useState` calls. Every state update cascades through the entire component tree:
- State: `input, streaming, streamContent, editingId, editContent, copiedId, ttsPlayingId, defaultVoice, generationError, choices, isRegeneratingChoices, showScenePanel, showParticipantPanel, showPrivatePanel, showRelationshipTimeline, showRecapPanel, inviteUsername, editHistoryMessageId, confirmAction, showCharacterModal, personas, personasLoading, activePersonaId, showPersonaSelector, wikiToasts` + session hook state (8 vars) + context state (5+ vars)
- **Every SSE event** triggers `refreshSession()` which calls 6 `set*` functions → 6+ synchronous re-renders
- **Every stream chunk** calls `setStreamContent()` → re-render of entire page

**Fix:** Extract panels into memoized sub-components. Each panel (`SceneStatePanel`, `ParticipantList`, `PrivateStatePanel`, etc.) should be wrapped with `React.memo` and receive minimal props. Use `useMemo` for computed values.

### force-dynamic at root layout (INTENTIONAL)
Root layout (`src/app/layout.tsx`) exports `dynamic = "force-dynamic"`. This disables all RSC caching, SSG, and ISR. Every page request renders server-side.

- **Tradeoff documented:** The app design requires fresh server state (auth, session data, other users' messages).
- **Impact:** No pages benefit from static optimization. Even static pages like `/login` render on every request.
- **Mitigation:** Consider per-route `force-dynamic` instead of root-level. Login and register pages could be static with client-side auth check.

### useSession hook — cascading state updates (HIGH)
`use-session.ts` lines 98-103:
```typescript
setSession(data.session || null);
setMessages(data.messages || []);
setSceneState(data.sceneState || null);
setParticipants(data.participants || []);
setTurnConfig(data.turnConfig || null);
setIsOwner(data.isOwner || false);
```
Each `set*` call triggers a separate render pass (React 19 batches them in event handlers, but not in async callbacks unless wrapped in `unstable_batchedUpdates`).

**Fix:** Combine into a single state object:
```typescript
const [state, setState] = useState<SessionState>({ session: null, messages: [], ... });
setState({ session: data.session, messages: data.messages, ... });
```

### Chat SSE stream — per-chunk re-render (HIGH)
In `session/[id]/page.tsx` line 409:
```typescript
setStreamContent((prev) => prev + parsed.chunk);
```
This is called for **every token** from the LLM, causing a full component re-render. The streaming text component should use `useRef` for the accumulator and only update state periodically (every N chunks or every 100ms).

**Fix:** Throttle stream content updates:
```typescript
const streamAccumulator = useRef("");
const lastFlushTime = useRef(0);
// In the SSE loop:
streamAccumulator.current += parsed.chunk;
const now = Date.now();
if (now - lastFlushTime.current > 100) {
  setStreamContent(streamAccumulator.current);
  lastFlushTime.current = now;
}
```

### Wiki page — full re-fetch on save (MEDIUM)
Wiki page save (lines 138-176) does 3 API round-trips:
1. PUT to save the page
2. GET to refresh page data
3. Implicit re-fetch in the dependency effect

**Fix:** Optimistically update local state instead of re-fetching. Only re-fetch on conflict (409).

### set-state-in-effect lint warnings
Found 3 warnings (all intentionally suppressed with eslint-disable):

1. **`settings/ollama-settings.tsx:206`** — Async fetch with setState in callback (intentional)
2. **`components/session/scene-state-panel.tsx:58`** — Avoids useEffect for scene state sync (correct approach)
3. **`components/session/session-recap-panel.tsx:88`** — Inline polling instead of effect (acceptable)

None of these are actual bugs, but additional hidden `set-state-in-effect` issues may exist:
- `useSession` hook: fetches session data directly in `useEffect` and calls multiple setState
- `session/[id]/page.tsx`: multiple effects that call setState based on `session` dependency

---

## API Route Performance

### Generation endpoint — blocking DB writes in stream (MEDIUM)
`generate/[id]/route.ts` line 183:
```typescript
if (chunkCount % 50 === 0) {
  db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(fullResponse, aiMessageId);
}
```
Writing to DB every 50 chunks adds synchronous I/O latency inline in the streaming path. For a 2000-token response at 50-chunk intervals, that's ~40 DB writes.

**Fix:** Use a debounced writer that flushes to DB only when the chunk buffer is idle for 200ms or exceeds a size threshold.

### Choice generation blocks stream close (MEDIUM)
Line 319: `const choicesRaw = await generateText(choicesPrompt, ...)` — a **synchronous** (non-streaming) Ollama call that blocks the SSE controller from closing. This adds 5-15+ seconds of latency after the main response is done.

**Fix:** Queue choice generation as a background job, emit via SSE event.

### Multiple Ollama calls per generation (MEDIUM)
Every `POST /api/generate/[id]` triggers:
1. Generate text stream (main response)
2. Generate choices (`generateText` — synchronous)
3. (From background cascade) Relationship analysis (`generateText`)
4. (From background cascade) Thread analysis (`generateText`)
5. (From background jobs) Message summarization (`generateText`)
6. (From background jobs) Embedding generation (`generateEmbedding`)
7. (From background jobs) Relationship analysis (`generateText`)
8. (From background jobs) Wiki extraction (`generateText`)

Each call hits Ollama sequentially through the `ollama-busy` mutex. Total: 6-8 Ollama calls per user message. Since Ollama processes requests serially per-host, this serializes to **30-120 seconds of cumulative LLM time per user message**.

**Fix:** Batch summarization/embedding requests. Reduce priority of non-critical jobs. Consider a separate Ollama host for background jobs (`ollama.jobModel` exists in config but is not used consistently).

### SSE event bus — in-memory singleton (MEDIUM)
`event-bus.ts` is a singleton with in-memory handler map. This means:
- **Does not scale horizontally** — only works for single-process Next.js
- **No persistence** — events lost on restart
- **No cross-process communication** — if deployed with multiple workers, SSE clients miss events from other workers

**Mitigation:** Acceptable for a self-hosted single-user app. Document as intentional limitation.

### SSE stream — synchronous DB poll in heartbeat (LOW)
`sessions/[id]/stream/route.ts` line 172: Every 30s heartbeat does a synchronous DB query. For 50 concurrent SSE connections, this is 50 DB queries every 30 seconds.

**Impact:** Low for typical usage (1-5 concurrent sessions).

### Rate limiter — in-memory Map (LOW)
`rate-limiter.ts` uses an in-memory `Map<string, RateLimitEntry>` with no persistence. This means:
- Rate limits reset on server restart
- Doesn't work across workers
- No cleanup of stale entries until next check (max 5min retention)

**Impact:** Low for single-user usage. Fine for self-hosted.

---

## Key Findings

### Critical (fix immediately)

| # | Finding | Impact | Effort |
|---|---------|--------|--------|
| C1 | **Zero React.memo usage** | Every state change re-renders entire component trees unnecessarily | Medium (add memo to 20+ hot-path components) |
| C2 | **Missing indexes on scene_states, narrative_memories, narrative_anchors** | Full table scans on every generation request | Low (4 CREATE INDEX statements) |
| C3 | **Session page 35+ state vars, 1012 lines** | Cascading re-renders, maintainability risk, cannot profile individual sections | High (extract panels, combine state) |

### High

| # | Finding | Impact | Effort |
|---|---------|--------|--------|
| H1 | `useSession.refresh()` calls 6 separate `setState()` calls | 6+ renders per SSE event | Low (combine into one state object) |
| H2 | `setStreamContent()` per-token during streaming | Full page re-render per token | Low (throttle or use ref) |
| H3 | Duplicated `entity_mentions` query in `getWikiContext()` | Database query runs twice per generation | Low (hoist query) |
| H4 | `getTurnConfig()` makes 3 separate DB queries | 3 round-trips where 1 suffices | Low (single query with IN clause) |
| H5 | Choice generation blocks SSE stream from closing (synchronous generateText) | 5-15s added latency after main response | Medium (move to background job) |

### Medium

| # | Finding | Impact | Effort |
|---|---------|--------|--------|
| M1 | 6-8 Ollama calls per user message (busy-mutex serialized) | 30-120s cumulative LLM time per message | High (batch, prioritize, separate host) |
| M2 | `getRelationshipEvolution` fetches all rows, groups in JS | Unbounded data transfer from DB | Low (window function) |
| M3 | Wiki page save does 3 API round-trips | 3x latency on save | Low (optimistic updates) |
| M4 | No bundle analysis baseline | Cannot measure improvement impact | Low (run `npm run analyze`) |

### Low

| # | Finding | Impact | Effort |
|---|---------|--------|--------|
| L1 | `force-dynamic` at root (not per-route) | Login/register pages not cacheable | Low (per-route granularity) |
| L2 | cytoscape (5.4 MB) eagerly imported | Loaded on every page that imports relationships | Low (dynamic import) |
| L3 | DB writes every 50 chunks during streaming | ~40 writes per response | Low (debounced writer) |
| L4 | Session access check duplicated in 15+ route files | Code duplication, minor overhead | Low (shared utility) |
| L5 | Prepared statements not explicitly cached | Minor overhead (better-sqlite3 caches internally) | Very Low |

---

## Recommendations (Priority Order)

### Immediate (Week 1)
1. **Add 4 missing indexes** to `scripts/init-db.ts`:
   - `scene_states(session_id, updated_at)`
   - `narrative_memories(user_id, session_id, universe_id)`
   - `narrative_anchors(user_id, universe_id)`
   - `entity_mentions(user_id, frequency DESC)`
2. **Run `npm run analyze`** to establish bundle size baseline
3. **Fix duplicated entity_mentions query** in `retrieval.ts` (hoist outside try/catch)
4. **Fix `getTurnConfig`** — single query with IN clause

### Short-term (Week 2)
5. **Add React.memo** to hot-path components:
   - `ChatWindow` → memoize MessageBubble list
   - `FileTree` → memoize folder/page items
   - `MarkdownEditor` → memoize preview pane
   - `WikiQuickSwitcher` → memoize results list
   - All panel components (`SceneStatePanel`, `ParticipantList`, `PrivateStatePanel`, `RelationshipTimeline`, `SessionRecapPanel`)
6. **Combine state in useSession hook** — single state object instead of 6 individual `setState` calls
7. **Throttle stream content updates** — update UI every 100ms instead of per-token
8. **Fix `getRelationshipEvolution`** — use SQL window function

### Medium-term (Week 3-4)
9. **Extract session page panels** — split 1012-line component into smaller memoized sub-components
10. **Move choice generation to background** — emit choices via SSE instead of blocking stream close
11. **Add prepared statement utility** — cache hot-path queries in a `StatementCache` object
12. **Dynamic import cytoscape** — only load on relationship graph pages

### Long-term
13. **Evaluate removing root `force-dynamic`** — make login/register pages static with client-side auth
14. **Batch background job Ollama calls** — reduce from 6-8 calls per message
15. **Evaluate event bus persistence** — for multi-worker deployment

---

## Measurement targets

| Metric | Before (estimated) | After (target) |
|--------|-------------------|----------------|
| Generation endpoint latency (excl. LLM) | 200-500ms (DB + context assembly) | < 100ms |
| SSE event → UI update latency | 50-150ms (cascading re-renders) | < 30ms |
| Wiki page save (client perceived) | 600-1200ms (3 round-trips) | < 300ms |
| Session page initial render | 500-800ms (JS bundle parse + execute) | < 400ms |
| getTurnConfig query count per request | 3 queries | 1 query |
| Stale entries cleaned from rate-limiter | Every 5min | Every 1min |
