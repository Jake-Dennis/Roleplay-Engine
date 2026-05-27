# EventBus Event Registry

**Last Updated:** 2026-05-27

## Architecture Overview

The EventBus is an in-process singleton (`src/lib/event-bus.ts`) used for real-time SSE notifications. API routes emit events, SSE stream routes consume them and forward to connected clients.

**Key properties:**
- **Event naming convention**: `type:context` (e.g., `message:created:sessionId`). The part after the second `:` is extracted as the sessionId for event history storage and reconnection replay.
- **Capacity**: Max 100 events stored per session in memory (`EVENT_BUS_CONFIG.MAX_HISTORY`). Max concurrent connections per session enforced via `EVENT_BUS_CONFIG.MAX_CONNECTIONS`.
- **Event IDs**: Auto-incrementing counter. Each emitted event gets a unique `_eventId` and `_eventName` injected into the payload (stripped before SSE delivery).
- **Reconnection**: Supports `Last-Event-ID` header. Missed events are replayed from in-memory history.
- **Cleanup**: Periodic 60s interval removes stale session data (event history and connection counts for sessions with no active connections).
- **Drain**: `drainAll()` closes all tracked SSE controllers and clears all handlers. Used for graceful shutdown.
- **Controller tracking**: All SSE `ReadableStreamDefaultController` instances are registered for forced shutdown capability.

## Per-Event Registry

### 1. MESSAGE_CREATED — `"message:created"`

- **Constant**: `SessionEvents.MESSAGE_CREATED`
- **Status**: ✅ Live
- **Emitted by**:
  - `src/app/api/sessions/[id]/messages/route.ts:148` (POST — user sends a message)
- **Payload**:
  ```ts
  { messageId: string, sessionId: string, senderId: string, content: string }
  ```
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:124` (SSE subscription for session stream)
- **Client listeners**: SSE `message:created` event consumed by session page
- **Notes**: Emitted with session-scoped namespace: `message:created:${sessionId}`. Only emitted for user messages, NOT for AI placeholder messages (see GENERATION_STARTED).

---

### 2. MESSAGE_UPDATED — `"message:updated"`

- **Constant**: `SessionEvents.MESSAGE_UPDATED`
- **Status**: ✅ Live
- **Emitted by**:
  - `src/app/api/sessions/[id]/messages/[messageId]/route.ts:134` (PUT — edit message)
- **Payload**:
  ```ts
  { messageId: string, sessionId: string, regenerate: boolean, content: string }
  ```
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:125` (SSE subscription)
- **Client listeners**: SSE `message:updated` event consumed by session page

---

### 3. MESSAGE_DELETED — `"message:deleted"`

- **Constant**: `SessionEvents.MESSAGE_DELETED`
- **Status**: ✅ Live
- **Emitted by**:
  - `src/app/api/sessions/[id]/messages/[messageId]/route.ts:227` (DELETE — delete messages)
  - `src/app/api/sessions/[id]/messages/[messageId]/regenerate/route.ts:75` (POST — regenerate deletes old messages)
- **Payload**:
  ```ts
  { messageId: string, sessionId: string }
  ```
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:126` (SSE subscription)
- **Client listeners**: SSE `message:deleted` event consumed by session page
- **Notes**: Emitted once per deleted message ID in a loop when bulk deletion occurs (deleting a message and all subsequent ones).

---

### 4. GENERATION_STARTED — `"generation:started"`

- **Constant**: `SessionEvents.GENERATION_STARTED`
- **Status**: ✅ Live
- **Emitted by**:
  - `src/app/api/generate/[id]/route.ts:130` (POST — AI generation begins)
- **Payload**:
  ```ts
  { messageId: string, sessionId: string }
  ```
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:127` (SSE subscription)
- **Client listeners**: SSE `generation:started` event consumed by session page
- **Notes**: Emitted AFTER inserting the empty AI message placeholder but BEFORE streaming begins. The placeholder has empty content intentionally — the UI shows a streaming indicator instead.

---

### 5. GENERATION_DONE — `"generation:done"`

- **Constant**: `SessionEvents.GENERATION_DONE`
- **Status**: ✅ Live
- **Emitted by**:
  - `src/app/api/generate/[id]/route.ts:186` (POST — AI generation completes)
- **Payload**:
  ```ts
  { messageId: string, sessionId: string, intent: string | null, contentLength: number }
  ```
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:128` (SSE subscription)
- **Client listeners**: SSE `generation:done` event consumed by session page
- **Notes**: Emitted after the full response is written to the DB. The `intent` field is the scene intent detected before generation. `contentLength` is the total character count of the generated response.

---

### 6. PARTICIPANT_JOINED — `"participant:joined"`

- **Constant**: `SessionEvents.PARTICIPANT_JOINED`
- **Status**: ✅ Live
- **Emitted by**:
  - `src/app/api/sessions/[id]/join/route.ts:92` (POST — accept invitation and join session)
- **Payload**:
  ```ts
  { sessionId: string, userId: string, username: string, characterName: string | null, action: "joined" }
  ```
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:129` (SSE subscription)
- **Client listeners**: SSE `participant:joined` event consumed by session page

---

### 7. PARTICIPANT_LEFT — `"participant:left"`

- **Constant**: `SessionEvents.PARTICIPANT_LEFT`
- **Status**: ✅ Live
- **Emitted by**:
  - `src/app/api/sessions/[id]/leave/route.ts:43` (POST — leave session)
- **Payload**:
  ```ts
  { sessionId: string, userId: string, username: string, action: "left" }
  ```
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:130` (SSE subscription)
- **Client listeners**: SSE `participant:left` event consumed by session page

---

### 8. PARTICIPANT_KICKED — `"participant:kicked"`

- **Constant**: `SessionEvents.PARTICIPANT_KICKED`
- **Status**: ✅ Live
- **Emitted by**:
  - `src/app/api/sessions/[id]/kick/route.ts:57` (POST — kick participant)
- **Payload**:
  ```ts
  { sessionId: string, targetUserId: string, username: string, action: "kicked" }
  ```
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:131` (SSE subscription)
- **Client listeners**: SSE `participant:kicked` event consumed by session page

---

### 9. PARTICIPANT_INVITED — `"participant:invited"`

- **Constant**: `SessionEvents.PARTICIPANT_INVITED`
- **Status**: ✅ Live
- **Emitted by**:
  - `src/app/api/sessions/[id]/invite/route.ts:102` (POST — invite user)
- **Payload**:
  ```ts
  { sessionId: string, userId: string, username: string, inviterId: string, action: "invited" }
  ```
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:132` (SSE subscription)
- **Client listeners**: SSE `participant:invited` event consumed by session page

---

### 10. PARTICIPANT_ROLE_CHANGED — `"participant:role_changed"`

- **Constant**: `SessionEvents.PARTICIPANT_ROLE_CHANGED`
- **Status**: ✅ Live
- **Emitted by**:
  - `src/app/api/sessions/[id]/participants/role/route.ts:56` (PUT — change participant role)
- **Payload**:
  ```ts
  { sessionId: string, participantId: string, username: string, role: string, action: "role_changed" }
  ```
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:133` (SSE subscription)
- **Client listeners**: SSE `participant:role_changed` event consumed by session page

---

### 11. TURN_UPDATED — `"turn:updated"`

- **Constant**: `SessionEvents.TURN_UPDATED`
- **Status**: ✅ Live
- **Emitted by**:
  - `src/app/api/sessions/[id]/turn/route.ts:114` (PUT — update turn config)
  - `src/app/api/sessions/[id]/turn/route.ts:176` (POST — advance or claim turn)
- **Payload**:
  ```ts
  {
    turnOrder: string[],       // ordered list of usernames/participant IDs
    currentTurn: string | null, // current active turn
    // Full turn config object returned by getTurnConfig()
  }
  ```
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:134` (SSE subscription)
- **Client listeners**: SSE `turn:updated` event consumed by session page
- **Notes**: The exact payload shape depends on `getTurnConfig()` return value from `src/app/api/sessions/[id]/turn/route.ts`, which reads `turn_order` and `current_turn` from `session_config`.

---

### 12. SCENE_UPDATED — `"scene:updated"`

- **Constant**: `SessionEvents.SCENE_UPDATED`
- **Status**: ✅ Live
- **Emitted by**:
  - `src/app/api/sessions/[id]/scene/route.ts:119` (POST/PUT — update scene state)
  - `src/lib/jobs/scene-handler.ts:39` (deferred scene extraction job)
- **Payload**:
  ```ts
  { sessionId: string }
  ```
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:136` (SSE subscription)
- **Client listeners**: SSE `scene:updated` event consumed by session page
- **Notes**: The payload is minimal (`{ sessionId }`) — the client is expected to re-fetch scene state on receipt.

---

### 13. JOB_PROGRESS — `"job:progress"`

- **Constant**: `SessionEvents.JOB_PROGRESS`
- **Status**: ✅ Live
- **Emitted by**:
  - `src/lib/jobs/queue.ts:247` (in `updateJobProgress()`)
- **Payload**:
  ```ts
  { jobId: string, progress: number, message: string | null }
  ```
  - `progress`: Integer 0-100
  - `message`: Human-readable progress description
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:139` (SSE subscription — session stream)
  - `src/app/api/jobs/stream/route.ts:43` (SSE subscription — job stream)
- **Client listeners**: SSE `job:progress` event consumed by session page and job status UI
- **Notes**: This is the ONLY event emitted without a session-scoped namespace (no `:sessionId` suffix). The jobs SSE stream subscribes to the bare event name. The session SSE stream subscribes to `job:progress:${sessionId}` — since JOB_PROGRESS is emitted without a namespace, session stream clients will NOT receive it.

---

### 14. WIKI_PAGE_CREATED — `"wiki:page_created"`

- **Constant**: `SessionEvents.WIKI_PAGE_CREATED`
- **Status**: ✅ Live
- **Emitted by**:
  - `src/lib/jobs/wiki-handler.ts:530` (wiki auto-extract job — session-scoped)
  - `src/lib/jobs/wiki-handler.ts:607` (universe wiki sync job — universe-scoped)
- **Payload** (auto-extract, line 530):
  ```ts
  { sessionId: string, created: string[], updated: string[] }
  ```
- **Payload** (universe sync, line 607):
  ```ts
  { universeId: string, page: string }
  ```
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:141` (SSE subscription)
- **Client listeners**: SSE `wiki:page_created` event consumed by session page for toast notifications
- **Notes**: Emitted with varying namespaces. The auto-extract handler emits `wiki:page_created:${sessionId}` (session-scoped). The universe sync handler emits `wiki:page_created:${universeId}` (universe-scoped). The session SSE stream subscription uses `${SessionEvents.WIKI_PAGE_CREATED}:${sessionId}`, so the universe-scoped emit may not reach session-stream clients.

---

### 15. JOB_COMPLETED — `"job:completed"`

- **Constant**: `SessionEvents.JOB_COMPLETED`
- **Status**: ⚠️ **Never emitted**
- **Emitted by**: _(none — never called)_
- **Payload**: _(never constructed)_
- **Server listeners**:
  - `src/app/api/jobs/stream/route.ts:60` (SSE subscription)
  - `src/app/api/sessions/[id]/stream/route.ts:138` (SSE subscription)
- **Client listeners**: Job stream clients subscribe but never receive this event
- **Notes**: Declared and subscribed by both SSE streams, but no code path calls `eventBus.emit(SessionEvents.JOB_COMPLETED, ...)`. The `markJobCompleted()` function in `src/lib/jobs/queue.ts` only updates the DB — it does NOT emit any EventBus event.

---

### 16. THREAD_UPDATED — `"thread:updated"`

- **Constant**: `SessionEvents.THREAD_UPDATED`
- **Status**: ⚠️ **Never emitted**
- **Emitted by**: _(none — never called)_
- **Payload**: _(never constructed)_
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:137` (SSE subscription)
- **Client listeners**: Session stream clients subscribe but never receive this event
- **Notes**: Declared at `SessionEvents.THREAD_UPDATED = "thread:updated"` as part of "D5: New SSE events". Subscribed by the session SSE stream, but no emitter exists in the codebase.

---

### 17. WIKI_PAGE_UPDATED — `"wiki:page_updated"`

- **Constant**: `SessionEvents.WIKI_PAGE_UPDATED`
- **Status**: ⚠️ **Never emitted**
- **Emitted by**: _(none — never called)_
- **Payload**: _(never constructed)_
- **Server listeners**:
  - `src/app/api/sessions/[id]/stream/route.ts:142` (SSE subscription)
- **Client listeners**: Session stream clients subscribe but never receive this event
- **Notes**: Declared at `SessionEvents.WIKI_PAGE_UPDATED = "wiki:page_updated"`. Subscribed by the session SSE stream, but no emitter exists in the codebase. Wiki page updates (enrich, deepen, etc.) do not emit this event — they only call `markJobCompleted()` and optionally emit `WIKI_PAGE_CREATED`.

---

### 18. TTS_QUEUED — `"tts:queued"`

- **Constant**: `SessionEvents.TTS_QUEUED`
- **Status**: 🟡 **Unused declaration**
- **Emitted by**: _(none)_
- **Payload**: _(never constructed)_
- **Server listeners**: _(none)_
- **Client listeners**: _(none)_
- **Notes**: Fully unused — no emitter, no subscriber, no reference outside the `SessionEvents` object definition. Appears to have been reserved for a future TTS queue system.

---

### 19. TTS_COMPLETED — `"tts:completed"`

- **Constant**: `SessionEvents.TTS_COMPLETED`
- **Status**: 🟡 **Unused declaration**
- **Emitted by**: _(none)_
- **Payload**: _(never constructed)_
- **Server listeners**: _(none)_
- **Client listeners**: _(none)_
- **Notes**: Fully unused — no emitter, no subscriber, no reference outside the `SessionEvents` object definition. Appears to have been reserved for a future TTS queue system.

---

### 20. SESSION_UPDATED — `"session:updated"` (SSE-Synthetic)

- **Constant**: `SessionEvents.SESSION_UPDATED`
- **Status**: 🔷 **SSE-synthetic (not EventBus-emitted)**
- **Emitted by EventBus**: _(never — not emitted via eventBus.emit())_
- **Generated by**: `src/app/api/sessions/[id]/stream/route.ts:174` (heartbeat polling fallback)
- **Payload**:
  ```ts
  { timestamp: string, connections: number }
  ```
- **Server listeners via EventBus**: _(none — not subscribed via eventBus.on())_
- **Delivery mechanism**: Generated directly by the SSE stream's heartbeat interval, NOT through the EventBus. The interval polls `MAX(timestamp)` from the messages table and emits an SSE `session:updated` event directly to the controller if the timestamp changed.
- **Client listeners**: SSE `session:updated` event consumed by session page
- **Notes**: This event bypasses EventBus entirely. It exists as a polling fallback to catch message state changes that bypass the normal event bus (e.g., direct DB writes). The SSE event string is constructed manually using `eventBus.getCurrentEventId()` for the SSE `id:` field but the payload is written directly to the controller, not routed through the emit/subscribe system.

## SSE Connection Lifecycle

### Session Stream (`/api/sessions/[id]/stream`)

```
1. CONNECT
   ↓
2. AUTH ──→ withAuth(request) ──→ 401 if invalid
   ↓
3. RATE LIMIT ──→ session_read rate limit ──→ 429 if exceeded
   ↓
4. ACCESS CHECK ──→ Verify user is owner or participant
   ↓
5. CAPACITY CHECK ──→ eventBus.canConnect(sessionId) ──→ 429 if full
   ↓
6. CONNECTION TRACKING ──→ eventBus.addConnection(sessionId)
   ↓
7. REPLAY (if Last-Event-ID > 0) ──→ eventBus.getEventsSince(sessionId, lastEventId)
   ↓
8. SEND `connected` EVENT ──→ { sessionId, connectionId, connections }
   ↓
9. SUBSCRIBE to 14 event types via eventBus.on(`${eventType}:${sessionId}`, handler)
   ↓
10. HEARTBEAT (every 30s)
    ├── Poll messages table for timestamp changes
    │   └── If changed → emit `session:updated` (synthetic, not EventBus)
    └── Emit `heartbeat` event with connection count
   ↓
11. CLEANUP (on abort signal)
    ├── clearInterval(heartbeat)
    ├── unsubscribers.forEach(unsub)
    ├── eventBus.removeConnection(sessionId)
    └── eventBus.unregisterController(controller)
```

### Job Stream (`/api/jobs/stream`)

```
1. CONNECT
   ↓
2. AUTH ──→ withAuth(request) ──→ 401 if invalid
   ↓
3. RATE LIMIT ──→ api rate limit ──→ 429 if exceeded
   ↓
4. SEND `connected` EVENT ──→ { userId }
   ↓
5. SUBSCRIBE to JOB_PROGRESS (bare event name)
   ↓
6. SUBSCRIBE to JOB_COMPLETED (bare event name) ⚠️ never emitted
   ↓
7. HEARTBEAT (every 30s) ──→ `heartbeat` event
   ↓
8. CLEANUP (on abort signal)
    ├── clearInterval(heartbeat)
    ├── unsubProgress()
    ├── unsubCompleted()
    └── eventBus.unregisterController(controller)
```

### SSE System Events

| SSE Event | Source | When |
|-----------|--------|------|
| `connected` | Session & Job streams | On stream open, before subscriptions |
| `heartbeat` | Session & Job streams | Every 30s |
| `session:updated` | Session stream only | On heartbeat, when message timestamp changed (polling fallback) |

### Event Delivery Flow

```
┌──────────────┐     eventBus.emit()     ┌──────────────────┐
│  API Route   │ ──────────────────────→ │    EventBus      │
│  (emitter)   │                         │  (singleton)     │
└──────────────┘                         │                  │
                                         │  handlers Map    │
                                         │  ┌─ key: event   │
                                         │  │ └─ Set<fn>    │
                                         │  └─ ...          │
                                         │                  │
                                         │  eventHistory    │
                                         │  (per session)   │
                                         └──────┬───────────┘
                                                │
                                     ┌──────────┴──────────┐
                                     ▼                     ▼
                            ┌─────────────────┐  ┌─────────────────┐
                            │  SSE Stream 1   │  │  SSE Stream 2   │
                            │  (session SSE)  │  │  (jobs SSE)     │
                            │                 │  │                 │
                            │ on(eventType:   │  │ on(JOB_PROGRESS)│
                            │   sessionId)    │  │ on(JOB_COMPL.)  │
                            │ 14 subscriptions│  │ 2 subscriptions │
                            └─────────────────┘  └─────────────────┘
                                     │                     │
                                     ▼                     ▼
                            ┌─────────────────┐  ┌─────────────────┐
                            │  Client Browser │  │  Client Browser │
                            │  (EventSource)  │  │  (EventSource)  │
                            └─────────────────┘  └─────────────────┘
```

## Dead Event Summary

| # | Event | Status | Emitter | Server Listener(s) | Gap |
|---|-------|--------|---------|-------------------|-----|
| 15 | JOB_COMPLETED | ⚠️ Never emitted | None | jobs/stream, session/stream | `markJobCompleted()` only updates DB, no emit |
| 16 | THREAD_UPDATED | ⚠️ Never emitted | None | session/stream | Reserved for future thread system |
| 17 | WIKI_PAGE_UPDATED | ⚠️ Never emitted | None | session/stream | Wiki enrich/deepen handlers skip the emit |
| 18 | TTS_QUEUED | 🟡 Unused | None | None | No TTS queue was ever wired to EventBus |
| 19 | TTS_COMPLETED | 🟡 Unused | None | None | No TTS completion was ever wired to EventBus |

### Legend
- ✅ **Live** — emitted AND subscribed
- ⚠️ **Never emitted** — has subscribers but no emitter
- 🟡 **Unused declaration** — no emitter AND no subscriber
- 🔷 **SSE-synthetic** — not emitted via EventBus, generated directly in SSE stream
