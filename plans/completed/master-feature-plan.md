# Master Plan: Complete Roleplay-Engine Feature Set

## Overview
This plan covers all unbuilt and partially-built features from `spec.md`, organized into 4 phases for incremental delivery. Each phase builds on the previous one and ends with a verified `npm run build` + `tsc --noEmit`.

---

## Phase 1: Core Generation Loop ✅ COMPLETE

**Goal:** Wire together retrieval → prompt assembly → LLM generation → response streaming into a single working flow.

**Status:** Already built — fixed type mismatches and added job queuing.

### 1.1 Retrieval Pipeline ✅
- **File:** `src/lib/retrieval.ts` (already existed)
- **Fix:** Changed `sessionId` from `number` to `string` (UUIDs, not integers)
- **Functions:** `getRetrievedContext()`, `getRetrievedContextWithFallback()`, `getSceneContext()`, `getLoreContext()`, `getRelationshipContext()`, `getRecentMessages()`, `getCanonContext()`

### 1.2 Context Compression ✅
- **File:** `src/lib/context-compression.ts` (already existed)
- **Functions:** `compressContext()`, `compressMessages()`, `compressLore()`, `compressRelationships()`, `summarizeText()`

### 1.3 Prompt Assembly ✅
- **File:** `src/lib/prompt-builder.ts` (already existed)
- **Functions:** `assemblePrompt()`, `assemblePromptWithBudget()`, `applyContextBudget()`, `estimateTokens()`, `buildIntentContext()`

### 1.4 Chat Generation API ✅
- **File:** `src/app/api/generate/[id]/route.ts` (already existed)
- **Fix:** Removed `parseInt(sessionId)` — session IDs are UUIDs
- **Added:** Background job queuing after generation (summarize, embed, relationship analysis)

### 1.5 Ollama Streaming Client ✅
- **File:** `src/lib/ollama.ts` (already existed)
- **Functions:** `generateTextStream()` — streaming with chunk callbacks, retry logic

### Additional: Message API Job Queuing ✅
- **File:** `src/app/api/sessions/[id]/messages/route.ts`
- **Added:** Background job queuing for user messages (summarize, embed)
- **Added:** SSE event emission (`MESSAGE_CREATED`)
---

## Phase 2: Background Processing ✅ COMPLETE

**Goal:** Complete the async job system for post-message processing and idle-time enrichment.

### 2.1 Message Summaries (`src/lib/message-summarizer.ts`) ✅

**New file.** Generates summaries after each message.

**Job type:** `summarize_message` (high priority)

**Functions:**
- [x] `summarizeMessage(messageId: string): Promise<void>`
- [x] Generates 4 summary types stored in `message_summaries` table:
  - `semantic` — what happened in plain language
  - `emotional` — emotional tone detected
  - `relationship_impact` — how relationships changed (trust ±X, etc.)
  - `lore_extracted` — new facts/lore discovered
- [x] Uses LLM call with structured output prompt

### 2.2 Narrative Importance Scoring (`src/lib/importance-scoring.ts`) ✅

**New file.** Computes composite importance scores for retrieval ranking.

**Functions:**
- [x] `calculateImportanceScore(entity: { emotional: string, local: string, canonical: string, recency: string }): number`
- [x] Formula: `(emotional × 0.35) + (local × 0.25) + (canonical × 0.20) + (recency × 0.20)`
- [x] Values: `low=1`, `medium=2`, `high=3`, `critical=4`. Max = 16.
- [x] `getArchivalAction(score: number): 'archive' | 'low_priority' | 'normal' | 'always_include'`
- [x] `updateImportanceScores(entityType: string, entityId: string): Promise<void>` — recalculates and stores

### 2.3 Idle-Time Enrichment Workers (`src/lib/idle-enrichment.ts`) ✅

**New file.** Background workers triggered by user inactivity.

**Functions:**
- [x] `runIdleEnrichment(userId: string, idleMinutes: number): Promise<void>`
- [x] Dispatches based on idle duration:

| Idle Duration | Actions |
|---------------|---------|
| > 5 min | `compressOldSummaries()`, `refineRelationshipSummaries()` |
| > 10 min | `deepenActiveLocations()`, `enrichNPCBackstories()`, `optimizeRetrievalIndexes()` |
| > 15 min | `expandRumors()`, `archiveLowImportanceMemories()` |
| > 30 min | `applyRelationshipDecay()` |

### 2.4 Relationship Decay Scheduler (`src/lib/relationship-decay.ts` — extend) ✅

**Extended existing file.** Added scheduled decay application.

**Decay rates (from spec):**
| Emotion | Half-Life |
|---------|-----------|
| trust | ~30 days |
| suspicion | ~60 days |
| loyalty | ~30 days |
| resentment | ~90 days |
| attraction | ~14 days |
| respect | ~30 days |
| fear | ~14 days |

**Formula:** `new_value = current_value × (0.5 ^ (days_inactive / half_life_days))`

**Function:** [x] `applyDecayToAllRelationships(userId: string): Promise<void>` — runs during >30min idle enrichment.

### 2.5 Job Processor Integration (`src/lib/job-processor.ts` — extend) ✅

**Extended existing file.** Added new job type handlers:

- [x] `summarize_message` → calls `summarizeMessage()`
- [x] `extract_event` → creates event records from recent messages
- [x] `expand_location_lore` → generates location details
- [x] `thread_analysis` → analyzes narrative threads
- [x] `lore_deepening` → expands existing lore entries
- [x] `idle_enrichment` → orchestrates tiered idle enrichment

---

## Phase 3: TTS & Audio ✅ COMPLETE

**Goal:** Complete the TTS experience with UI controls, auto-play, and voice mixing.

### 3.1 TTS in Chat ✅
- **File:** `src/components/tts/tts-controls.tsx` (generic playback controls)
- **File:** `src/components/tts/tts-indicator.tsx` (per-message playback status with waveform)
- **File:** `src/hooks/use-tts.ts` (playback state management)
- **Integration:** `src/app/(app)/session/[id]/page.tsx` — TTS streaming via MediaSource, per-message play/stop
- **Features:**
  - [x] Auto-play on AI responses (configurable in settings)
  - [x] Playing indicator on message during playback
  - [x] Click to stop playback
  - [x] Skip messages >500 chars (configurable)
  - [x] Volume control
  - [x] Per-session TTS toggle (via localStorage settings)

### 3.2 Message Action Buttons ✅
- **File:** `src/components/chat/chat-window.tsx` (inline action buttons)
- **Buttons:**
  - [x] TTS (🔊) — User + AI messages
  - [x] Copy (📋) — All messages, with "Copied" feedback
  - [x] Edit (✏️) — User messages, inline edit mode
  - [x] Regenerate (🔄) — Last AI message only
  - [x] Delete (🗑️) — All messages, with confirmation
  - [x] Edit History (📜) — All messages

### 3.3 Voice Combination UI ✅
- **File:** `src/app/(app)/voice-combiner/page.tsx`
- **Features:**
  - [x] Voice selector (dropdown with available voices)
  - [x] Weight slider for each selected voice (0-100%)
  - [x] Preview button (generates sample audio)
  - [x] Save combined voice profiles (per-universe, localStorage)
  - [x] Display saved combinations list with load/delete
  - [x] Format: `af_bella(67%) + af_sky(33%)`
  - [x] Normalize weights to 100%

### 3.4 Settings Page ✅
- **File:** `src/app/(app)/settings/page.tsx`
- **Settings:**
  - [x] Enable TTS (via auto-play toggle)
  - [x] Narrator voice (dropdown, saved via API)
  - [x] Speech speed (slider 0.5-2.0x)
  - [x] Output format (MP3/WAV/OGG/FLAC)
  - [x] Auto-play (toggle)
  - [x] Volume (slider 0-100%)
  - [x] Skip long messages (toggle + threshold slider)
  - [x] TTS cache management (clear expired/unused/all)
  - [x] Connection status (Ollama + Kokoro)

---

## Phase 4: UI Polish & Advanced Features ✅ COMPLETE

**Goal:** Complete remaining UI features, validation workflows, and graph enhancements.

### 4.1 Lore Validation Workflow UI ✅
- **File:** `src/app/(app)/validations/page.tsx` (full page)
- **File:** `src/components/lore/validation-queue.tsx` (embeddable component)
- **File:** `src/components/validation/validation-badge.tsx` (status badge)
- **Features:**
  - [x] List of `generated_unverified` and `under_review` entries
  - [x] Each entry shows: title, type, generated content, contradiction flags
  - [x] Actions: Validate → `validated`, Reject → `rejected`
  - [x] Filter by state (all, unverified, under review, validated, rejected)
  - [x] Filter by type (location, npc, event, lore)
  - [x] Bulk validate/reject with checkbox selection
  - [x] Expandable details with validation notes

### 4.2 Contradiction Detection ✅
- **File:** `src/lib/contradiction-detector.ts` (rule-based engine)
- **Rules:**
  - [x] Alive/Dead conflict — entity marked alive but appears in death event
  - [x] Temporal impossibility — event occurred before timeline start
  - [x] Location conflict — NPC appears in multiple locations simultaneously
- **Functions:**
  - [x] `detectContradictions(entityType, entityId, userId)` — per-entity check
  - [x] `detectAllContradictions(userId)` — full scan with type breakdown
  - [x] Auto-creates `under_review` validation records on detection

### 4.3 User Override System ✅
- **File:** `src/lib/user-overrides.ts`
- **Functions:**
  - [x] `setOverride(entityType, entityId, field, newValue)` — records user edit
  - [x] `getOverrides(entityType, entityId)` — retrieves all overrides for entity
  - [x] `shouldRespectOverride(entityType, entityId, field)` — checks if field is user-edited
  - [x] `getOverrideValue(entityType, entityId, field)` — gets user's manual value
  - [x] `logOverride(userId, entityType, entityId, field, oldValue, newValue)` — full audit trail
  - [x] `applyOverrides(entityType, entityId, baseData)` — merges overrides onto entity data
  - [x] `getOverrideStats(userId)` — user override statistics
  - [x] `deleteEntityOverrides(entityType, entityId)` — cleanup on entity deletion

### 4.4 30fps Status Indicators ✅
- **Files:**
  - `src/components/ui/fps-counter.tsx` — FPS overlay (Ctrl+Shift+F toggle)
  - `src/components/ui/connection-indicator.tsx` — Ollama + Kokoro status footer
  - `src/lib/render-loop.ts` — 30fps render loop engine
  - `src/hooks/use-render-loop.ts` — React hook for render loop subscription
- **Indicators:**
  - [x] FPS counter (live, color-coded: green/yellow/red)
  - [x] Ollama connection (🟢 Connected / 🔴 Unavailable / 🟡 Loading)
  - [x] Kokoro TTS connection (🟢 Connected / 🔴 Unavailable / 🟡 Loading)
  - [x] Idle status indicator (bottom-left, shows idle time + tier)
  - [x] Last checked timestamp on hover

### 4.5 Backlink Graph Link Type Inference ✅
- **File:** `src/lib/backlinks.ts`
- **Functions:**
  - [x] `parseWikilinks(content)` — extracts `[[wikilink]]` syntax with context
  - [x] `inferLinkType(name, context, entityType)` — pattern-based type inference:
    - "caused by", "result of" → `caused_by`
    - "part of", "within" → `part_of`
    - "near", "nearby" → `nearby`
    - "located in", "inside" → `located_in`
    - "related to" → `related_to`
    - "mentions", "said" → `mentions`
  - [x] `resolveWikilink(userId, name)` — resolves link name to entity ID
  - [x] `storeBacklinks(userId, sourceType, sourceId, sourceName, content)` — persists links
  - [x] `getBacklinks(userId, targetType, targetId)` — incoming links
  - [x] `getOutgoingLinks(userId, sourceType, sourceId)` — outgoing links

### 4.6 Typing Indicator ✅
- **File:** `src/components/chat/typing-indicator.tsx`
- **Integration:** `src/app/(app)/session/[id]/page.tsx` — shown during AI generation
- **Features:**
  - [x] Three bouncing dots animation (CSS `animate-bounce` with staggered delays)
  - [x] "Narrator is thinking..." text
  - [x] Appears when `streaming` state is true
  - [x] Disappears when response starts streaming or completes

---

## Execution Order & Dependencies

```
Phase 1 (Core Generation Loop)
├── 1.1 Retrieval Pipeline
├── 1.2 Context Compression
├── 1.3 Prompt Assembly
├── 1.4 Realtime RP Pipeline (API)
└── 1.5 Ollama Streaming Client

Phase 2 (Background Processing)
├── 2.1 Message Summaries
├── 2.2 Narrative Importance Scoring
├── 2.3 Idle-Time Enrichment Workers
├── 2.4 Relationship Decay Scheduler
└── 2.5 Job Processor Integration

Phase 3 (TTS & Audio)
├── 3.1 TTS in Chat
├── 3.2 Message Action Buttons
├── 3.3 Voice Combination UI
└── 3.4 Settings Page

Phase 4 (UI Polish & Advanced)
├── 4.1 Lore Validation Workflow UI
├── 4.2 Contradiction Detection
├── 4.3 User Override System
├── 4.4 30fps Status Indicators
├── 4.5 Backlink Graph Link Type Inference
└── 4.6 Typing Indicator
```

---

## Database Schema Changes

### New Tables
```sql
-- Message summaries (verify/extend existing)
CREATE TABLE IF NOT EXISTS message_summaries (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES messages(id),
  summary_type TEXT,
  content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User overrides
CREATE TABLE IF NOT EXISTS user_overrides (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  entity_type TEXT,
  entity_id TEXT,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Settings (per-user key-value)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT REFERENCES users(id),
  key TEXT,
  value TEXT,
  PRIMARY KEY (user_id, key)
);

-- Saved voice combinations
CREATE TABLE IF NOT EXISTS voice_combinations (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  name TEXT,
  voices TEXT,  -- JSON array of {voice, weight}
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Column Additions
```sql
-- Importance scores
ALTER TABLE messages ADD COLUMN importance_score REAL DEFAULT 0;
ALTER TABLE relationships ADD COLUMN importance_score REAL DEFAULT 0;
ALTER TABLE events ADD COLUMN importance_score REAL DEFAULT 0;

-- Backlink link types
ALTER TABLE backlinks ADD COLUMN link_type TEXT DEFAULT 'mentions';

-- Lore validation states
ALTER TABLE lore_edits ADD COLUMN validation_state TEXT DEFAULT 'generated_unverified';
ALTER TABLE lore_edits ADD COLUMN contradiction_flags TEXT;  -- JSON array

-- User activity tracking
ALTER TABLE users ADD COLUMN last_active DATETIME;
```

---

## Risk Assessment

| Phase | Risk | Mitigation |
|-------|------|------------|
| Phase 1 | HIGH — Core generation loop is complex | Build incrementally: retrieval first, then compression, then assembly, then streaming |
| Phase 2 | MEDIUM — Background jobs are additive | Each job type is independent; can be tested in isolation |
| Phase 3 | LOW — TTS backend already works | UI-only changes, no new backend logic |
| Phase 4 | LOW — UI polish and extensions | All features are additive, no breaking changes |

---

## Validation Checklist

After each phase:
- [ ] `npm run build` passes
- [ ] `tsc --noEmit` passes
- [ ] All new API endpoints return correct responses
- [ ] No regressions in existing features
- [ ] Plan file updated with `[x]` checkboxes
- [ ] Move to `plans/completed/` when all phases done

---

## Rollback Strategy

Each phase is independently revertible:
- Phase 1: Remove `/api/sessions/[id]/chat` endpoint, delete new lib files
- Phase 2: Remove new job types from processor, delete new lib files
- Phase 3: Remove new components, revert settings page
- Phase 4: Remove new components and lib files

No database migrations are destructive — all `ALTER TABLE ADD COLUMN` are safe.
