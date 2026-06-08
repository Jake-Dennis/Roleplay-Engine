# Component Dependency Map

**Last Updated**: 2026-05-27

**Total Components**: 71 (63 client, 8 server)  
**Total Hooks**: 10  
**Total Contexts**: 2  

---

## Table of Contents

- [1. Hooks](#1-hooks)
- [2. Contexts](#2-contexts)
- [3. Component Tables by Feature Domain](#3-component-tables-by-feature-domain)
- [4. Full Chain Summary](#4-full-chain-summary)
- [5. Key Observations](#5-key-observations)

---

## 1. Hooks

All hooks live in `src/hooks/` and follow the naming convention `use-*.ts`.

### useAuth

- **File**: `src/hooks/use-auth.ts`
- **Returns**: `{ user, loading, isAuthenticated, login, logout, refresh }`
- **API Calls**:
  - `GET /api/auth/me` — fetch current user
  - `POST /api/auth/login` — authenticate credentials
  - `POST /api/auth/logout` — end session

### useConnectionStatus

- **File**: `src/hooks/use-connection-status.ts`
- **Returns**: `{ ollama, kokoro, lastChecked, loading, refresh }`
- **API Calls**:
  - `GET /api/health` — service health check
  - Polls at `TIMEOUTS.HEALTH_CHECK_INTERVAL`

### useEntityFetch\<T\>

- **File**: `src/hooks/use-entity-fetch.ts`
- **Returns**: `{ data: T[], loading, error, refetch }`
- **API Calls**: Takes `endpoint` string parameter, calls as generic GET
- **Notes**: Generic hook for arbitrary entity fetching

### useIdleTracker

- **File**: `src/hooks/use-idle-tracker.ts`
- **Returns**: `{ idleTime, currentTier, isIdle }`
- **API Calls**:
  - `POST /api/idle/heartbeat` — activity ping
- **Storage**: Reads `localStorage` key `"active-universe-id"`

### useLocalStorage\<T\>

- **File**: `src/hooks/use-local-storage.ts`
- **Returns**: `[value, setValue]`
- **API Calls**: None
- **Notes**: Generic localStorage wrapper with safe JSON parse/stringify

### useRenderLoop

- **File**: `src/hooks/use-render-loop.ts`
- **Returns**: Callback subscription to `renderLoop` lib
- **API Calls**: None
- **Also exports**: `useMeasuredFPS()` returning `{ fps }`

### useSession

- **File**: `src/hooks/use-session.ts`
- **Returns**: `{ session, messages, sceneState, participants, turnConfig, isOwner, isObserver, loading, error, claimTurn, advanceTurn, refresh }`
- **API Calls**:
  - `GET /api/sessions/${sessionId}` — session data
  - `SSE /api/sessions/${sessionId}/stream` — real-time updates
  - `POST /api/sessions/${sessionId}/turn` — turn management

### useTTS

- **File**: `src/hooks/use-tts.ts`
- **Returns**: `{ isPlaying, currentMessageId, speed, volume, play, stop, setSpeed, setVolume }`
- **API Calls**: None (uses `ttsQueue` lib internally)

### useVoices

- **File**: `src/hooks/use-voices.ts`
- **Returns**: `{ voices, loading, error, assignVoice, getVoice, removeVoice, refresh }`
- **API Calls**:
  - `GET /api/tts/voices` — list available voices
  - `POST /api/voice-assignments` — assign a voice
  - `GET /api/voice-assignments` — get assignments
  - `DELETE /api/voice-assignments` — remove assignment

### useAudioPlayer

- **File**: `src/hooks/use-audio-player.ts`
- **Returns**: `{ isPlaying, duration, play, stop }`
- **API Calls**: None (HTML5 Audio API wrapper)

---

## 2. Contexts

### AppProvider / useApp

- **File**: `src/contexts/app-context.tsx`
- **On mount calls**:
  - `GET /api/auth/me` — authenticate user
  - `GET /api/universes` — list universes
  - `GET /api/sessions` — list sessions
  - `GET /api/groups` — list groups
- **On setActive calls**:
  - `PUT /api/settings/active-state` — persist active selection
- **Provides**: `{ user, activeUniverse, universes, setActiveUniverse, loading, activeSession, sessions, setActiveSession, activeGroup, groups, setActiveGroup, refreshAll }`

### active-universe.tsx (compat shim)

- **File**: `src/contexts/active-universe.tsx`
- **Role**: Wraps `AppProvider` and `useApp()` into the legacy `useActiveUniverse()` shape
- **Adds**: `sessionUniverse` (derived from `activeSession.universe_id`), `refreshSessions`
- **Notes**: Do NOT use for new code. Prefer `useApp()` from `app-context.tsx`.

---

## 3. Component Tables by Feature Domain

### Wiki (15 components)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `markdown-renderer.tsx` | client | `useHoverPreview` (inline) | — | — |
| `graph-view.tsx` | client | — | — | — |
| `search.tsx` | client | — | — | — |
| `file-tree.tsx` | client | — | — | — |
| `backlink-panel.tsx` | client | — | — | — |
| `outgoing-links-panel.tsx` | client | — | — | — |
| `outline-panel.tsx` | client | — | — | — |
| `hover-preview.tsx` | client | — | `GET /api/wiki/{slug}` (lazy) | — |
| `callout.tsx` | client | — | — | — |
| `embed-transclusion.tsx` | client | — | — | — |
| `revision-history.tsx` | client | — | `GET /api/wiki-revisions?slug=` | — |
| `recent-changes-widget.tsx` | client | — | `GET /api/wiki/recent` | `useApp` |
| `template-selector.tsx` | client | — | `GET /api/wiki/templates` | — |
| `version-history.tsx` | client | — | `GET /api/wiki/history`, `POST /api/wiki/history` | `useApp` |
| `lore-extraction-trigger.tsx` | client | — | `POST /api/jobs`, `SSE /api/jobs/stream` | — |

**Notes**: `graph-view.tsx` uses `buildLinkGraph` lib (Cytoscape.js). `search.tsx` uses FlexSearch directly with keyboard navigation. `file-tree.tsx` is a collapsible tree with orphan badges. `outgoing-links-panel.tsx` uses `parseWikilinks` lib. `outline-panel.tsx` uses IntersectionObserver for heading TOC. `callout.tsx` supports 12 foldable callout types. `embed-transclusion.tsx` supports image + recursive note embeds with max depth = 2. `revision-history.tsx` includes a line-by-line diff viewer. `template-selector.tsx` is a modal with template grid. `hover-preview.tsx` renders via portal popover. `lore-extraction-trigger.tsx` is a trigger button with SSE progress.

### Chat (6 components)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `chat-window.tsx` | client | — | — | — |
| `chat-search.tsx` | client | — | `GET /api/sessions/${sessionId}/messages/search` | — |
| `chat-export.tsx` | client | — | `window.open(/api/sessions/${sessionId}/export)` | — |
| `edit-history.tsx` | client | — | `GET /api/sessions/${sessionId}/messages/${messageId}/edits` | — |
| `streaming-text.tsx` | client | `useRenderLoop` | — | — |
| `typing-indicator.tsx` | server | — | — | — |

**Notes**: `chat-window.tsx` renders `StreamingText` and `EditHistory` internally.

### Session (10 components)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `session-list.tsx` | client | — | — | — |
| `session-creator.tsx` | client | — | — | — |
| `participant-list.tsx` | client | — | — | — |
| `scene-state-panel.tsx` | client | — | — | — |
| `private-state-panel.tsx` | client | — | `GET /api/sessions/${sessionId}/private-state`, `PUT /api/sessions/${sessionId}/private-state` | — |
| `private-thoughts.tsx` | client | — | — | — |
| `individual-memories.tsx` | client | — | — | — |
| `personal-relationships.tsx` | client | — | — | — |
| `character-declaration-modal.tsx` | client | — | — | — |
| `session-recap-panel.tsx` | client | — | `POST /api/sessions/${sessionId}/recap`, `GET /api/jobs` | — |

**Notes**: `session-creator.tsx` calls parent `onCreate` callback. `participant-list.tsx` calls parent `onInvite`/`onKick`/`onLeave` callbacks. `scene-state-panel.tsx` calls parent `onSave` callback. `character-declaration-modal.tsx` calls parent `onJoin` callback. `session-recap-panel.tsx` contains `JobProgress` internally.

### Settings (4 components)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `change-password-section.tsx` | client | — | — | — |
| `connection-status-section.tsx` | client | — | — | — |
| `narrator-voice-section.tsx` | client | — | — | — |
| `server-info-section.tsx` | client | — | — | — |

**Notes**: All four components receive data or callbacks via parent props. No hooks or direct API calls.

### Relationship — singular (3 components)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `emotion-bar.tsx` | server | — | — | — |
| `relationship-graph.tsx` | client | — | — | — |
| `relationship-history.tsx` | client | — | — | — |

**Notes**: `relationship-history.tsx` renders `EmotionBar` internally.

### Relationship — plural (4 components)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `decay-indicator.tsx` | server | — | — | — |
| `emotion-graph.tsx` | client | — | — | — |
| `relationship-timeline.tsx` | client | — | `GET /api/relationships`, `GET /api/relationships/${id}/evolution` | — |
| `relationship-web.tsx` | client | — | — | — |

**Notes**: `decay-indicator.tsx` uses `getDecayStatus` lib (pure utility). `relationship-web.tsx` uses `buildRelationshipGraph` lib.

### Timeline (4 components)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `layer-manager.tsx` | client | — | `GET /api/timelines/${timelineId}/layers` | — |
| `era-editor.tsx` | client | — | `POST /api/timelines/${timelineId}/layers`, `DELETE /api/timelines/${timelineId}/layers` | — |
| `faction-editor.tsx` | client | — | `POST /api/timelines/${timelineId}/layers`, `DELETE /api/timelines/${timelineId}/layers` | — |
| `character-editor.tsx` | client | — | `POST /api/timelines/${timelineId}/layers`, `DELETE /api/timelines/${timelineId}/layers` | — |

**Notes**: `layer-manager.tsx` contains `EraEditor`, `FactionEditor`, and `CharacterEditor` internally. All three editor components use `ConfirmationDialog` for destructive actions.

### TTS (3 components)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `tts-controls.tsx` | client | — | — | — |
| `tts-indicator.tsx` | client | — | — | — |
| `voice-picker.tsx` | client | — | — | — |

### Narrative (3 components)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `event-timeline.tsx` | client | — | — | — |
| `importance-meter.tsx` | server | — | — | — |
| `thread-tracker.tsx` | client | — | — | — |

**Notes**: `importance-meter.tsx` uses `calculateImportance` lib.

### NPCs (2 components)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `npc-list.tsx` | client | — | — | — |
| `npc-editor.tsx` | client | — | `GET /api/auth/me`, `POST /api/jobs` | — |

### Canon (3 components)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `canon-layer-selector.tsx` | client | — | — | — |
| `layer-viewer.tsx` | client | — | — | — |
| `promotion-dialog.tsx` | client | — | — | — |

### Debug (2 components)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `narrative-state-panel.tsx` | client | — | `GET /api/sessions/${sessionId}/scene` | — |
| `retrieval-inspector.tsx` | client | — | `GET /api/sessions/${sessionId}/retrieval-context` | — |

### Jobs (1 component)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `job-progress.tsx` | client | `useRenderLoop` | — | — |

### Backlinks (1 component)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `backlink-panel.tsx` (backlinks/) | client | — | — | — |

**Notes**: This is a separate component from `backlink-panel.tsx` under `wiki/`. Located in `src/components/backlinks/`.

### Layout (1 component)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `page-header.tsx` | server | — | — | — |

### UI Primitives (9 components)

| Component | Type | Hooks Used | Direct API Calls | Context Used |
|---|---|---|---|---|
| `modal.tsx` | client | — | — | — |
| `loading-state.tsx` | server | — | — | — |
| `empty-state.tsx` | server | — | — | — |
| `status-badge.tsx` | server | — | — | — |
| `confirmation-dialog.tsx` | client | — | — | — |
| `connection-indicator.tsx` | client | `useConnectionStatus` | — | — |
| `error-boundary.tsx` | client (class) | — | — | — |
| `fps-counter.tsx` | client | `useRenderLoop` | — | — |
| `wiki-toast.tsx` | client | — | — | — |

---

## 4. Full Chain Summary

### Hook → API → Component Chains

| Hook | API Endpoint(s) | Consumed By |
|---|---|---|
| `useConnectionStatus` | `GET /api/health` | `ConnectionIndicator` |
| `useRenderLoop` | (no API) | `StreamingText`, `JobProgress`, `FPSCounter` |
| `useSession` | `GET /api/sessions/${id}`, `SSE /api/sessions/${id}/stream`, `POST /api/sessions/${id}/turn` | page files (not in `src/components/`) |
| `useAuth` | `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/logout` | page files (not in `src/components/`) |
| `useVoices` | `GET /api/tts/voices`, `POST /api/voice-assignments`, `GET /api/voice-assignments`, `DELETE /api/voice-assignments` | page files (not in `src/components/`) |
| `useTTS` | (no API, uses `ttsQueue` lib) | page files |
| `useAudioPlayer` | (no API, HTML5 Audio API) | page files |
| `useEntityFetch` | generic `endpoint` parameter | page files |
| `useIdleTracker` | `POST /api/idle/heartbeat` | page files |
| `useLocalStorage` | (no API) | page files |

### Direct Fetch Chains (by API Domain)

**Wiki API calls:**
- `GET /api/wiki/{slug}` → `HoverPreview` (lazy)
- `GET /api/wiki/recent` → `RecentChangesWidget`
- `GET /api/wiki/templates` → `TemplateSelector`
- `GET /api/wiki/history`, `POST /api/wiki/history` → `VersionHistory`
- `GET /api/wiki-revisions?slug=` → `RevisionHistory`

**Session API calls:**
- `GET /api/sessions/${sessionId}/messages/search` → `ChatSearch`
- `GET /api/sessions/${sessionId}/messages/${messageId}/edits` → `EditHistory`
- `GET /api/sessions/${sessionId}/private-state`, `PUT /api/sessions/${sessionId}/private-state` → `PrivateStatePanel`
- `POST /api/sessions/${sessionId}/recap`, `GET /api/jobs` → `SessionRecapPanel`
- `window.open(/api/sessions/${sessionId}/export)` → `ChatExport`
- `GET /api/sessions/${sessionId}/scene` → `NarrativeStatePanel` (debug)
- `GET /api/sessions/${sessionId}/retrieval-context` → `RetrievalInspector` (debug)

**Timeline API calls:**
- `GET /api/timelines/${timelineId}/layers` → `LayerManager`
- `POST /api/timelines/${timelineId}/layers`, `DELETE /api/timelines/${timelineId}/layers` → `EraEditor`, `FactionEditor`, `CharacterEditor`

**Relationship API calls:**
- `GET /api/relationships`, `GET /api/relationships/${id}/evolution` → `RelationshipTimeline`

**Jobs API calls:**
- `POST /api/jobs` → `LoreExtractionTrigger`, `NpcEditor`
- `GET /api/jobs` → `SessionRecapPanel`
- `SSE /api/jobs/stream` → `LoreExtractionTrigger`

**Auth API calls (from components):**
- `GET /api/auth/me` → `NpcEditor`

**Settings API calls (from context):**
- `PUT /api/settings/active-state` → `AppProvider` (on `setActive`)

**Context on mount chains:**
- `AppProvider` → `GET /api/auth/me`, `GET /api/universes`, `GET /api/sessions`, `GET /api/groups` (parallel on mount)

### Cross-Component Import Chains

| Parent | Children/Internals |
|---|---|
| `LayerManager` | `EraEditor`, `FactionEditor`, `CharacterEditor` |
| `EraEditor` | `ConfirmationDialog` |
| `FactionEditor` | `ConfirmationDialog` |
| `CharacterEditor` | `ConfirmationDialog` |
| `ChatWindow` | `StreamingText`, `EditHistory` |
| `SessionRecapPanel` | `JobProgress` |
| `LoreExtractionTrigger` | `JobProgress` |
| `PrivateStatePanel` | `PrivateThoughts`, `PersonalRelationships`, `IndividualMemories` |
| `RelationshipHistory` | `EmotionBar` |

---

## 5. Key Observations

1. **Most components are pure display.** Fewer than 25 of 71 components make direct API calls. The majority receive data through props or context and render it.

2. **No hook is used by more than 3 components.** `useRenderLoop` is the most widely used hook (3 consumers: `StreamingText`, `JobProgress`, `FPSCounter`). All other hooks have 1 or 0 consumers within `src/components/`.

3. **`useSession` is NOT imported by any component in `src/components/`.** Despite being the most complex hook (SSE stream, turn management), it is consumed exclusively by page files under `src/app/`.

4. **Wiki domain is the largest (15 components) and makes the most API calls.** Wiki components touch 6 distinct API endpoints across 7 components, covering fetch, revision history, templates, and job-triggered lore extraction.

5. **`useApp` context is only used by 2 wiki components.** `RecentChangesWidget` and `VersionHistory` are the only components that consume the `AppProvider` context directly. All other components either use props or make standalone API calls.

6. **Server components (8 total):** `TypingIndicator`, `EmotionBar`, `DecayIndicator`, `ImportanceMeter`, `PageHeader`, `LoadingState`, `EmptyState`, `StatusBadge`. These render without client-side interactivity.

7. **Cross-directory component imports are concentrated in Session and Timeline domains.** `RelationshipTimeline` imports `EmotionBar`. `ChatWindow` imports `StreamingText` and `EditHistory`. `SessionRecapPanel` and `LoreExtractionTrigger` both import `JobProgress`. The three timeline editors (`EraEditor`, `FactionEditor`, `CharacterEditor`) all import `ConfirmationDialog`. `PrivateStatePanel` composes `PrivateThoughts`, `PersonalRelationships`, and `IndividualMemories`.
