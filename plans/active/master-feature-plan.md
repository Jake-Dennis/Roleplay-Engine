# Master Plan: Complete Roleplay-Engine Feature Set

## Overview
This plan covers all unbuilt and partially-built features from `spec.md`, organized into 4 phases for incremental delivery. Each phase builds on the previous one and ends with a verified `npm run build` + `tsc --noEmit`.

---

## Phase 1: Core Generation Loop (The Biggest Gap)

**Goal:** Wire together retrieval → prompt assembly → LLM generation → response streaming into a single working flow.

### 1.1 Retrieval Pipeline (`src/lib/retrieval-pipeline.ts`)

**New file.** Orchestrates the full retrieval chain:

```
User Input → Intent Analysis → Scene Retrieval → Relationship Retrieval → Narrative Memory Retrieval → Lore Retrieval → Context Compression → Prompt Assembly
```

**Functions:**
- `runRetrievalPipeline(sessionId: string, userInput: string, userId: string): Promise<RetrievalResult>`
- `retrieveSceneState(sessionId: string): Promise<SceneState>` — fetches active location, NPCs, emotional tone, threads
- `retrieveRelationships(sessionId: string, userId: string, limit?: number): Promise<Relationship[]>` — active relationships sorted by importance
- `retrieveNarrativeMemories(sessionId: string, limit?: number): Promise<NarrativeMemory[]>` — recent discoveries, promises, betrayals
- `retrieveLore(sessionId: string, intent: Intent, limit?: number): Promise<LoreEntry[]>` — location lore, NPC profiles, canon rules filtered by intent
- `retrieveRecentMessages(sessionId: string, limit?: number): Promise<Message[]>` — last N messages for conversation context

**Dependencies:** `intent-analyzer.ts`, `db.ts`, `semantic-intent-fallback.ts`

### 1.2 Context Compression (`src/lib/context-compression.ts`)

**New file.** Compresses retrieved context to fit the 8192 token budget.

**Functions:**
- `compressContext(retrieval: RetrievalResult, budget: number): Promise<CompressedContext>`
- `estimateTokenCount(text: string): number` — rough estimate (chars / 4 for English)
- `truncateByPriority(sections: ContextSection[], budget: number): ContextSection[]` — drops lowest-importance sections first
- `summarizeSection(section: ContextSection, targetTokens: number): Promise<string>` — uses small LLM call to compress if needed

**Budget Table (from spec):**
| Section | Allocation |
|---------|-----------|
| System prompt | 500 |
| Canon rules | 300 |
| Scene state | 200 |
| Active relationships | 400 |
| Relevant memories | 2000 |
| Active lore | 1500 |
| Recent messages | 2000 |
| User input | 500 |
| Reserved for output | 792 |

### 1.3 Prompt Assembly (`src/lib/prompt-assembly.ts`)

**New file.** Assembles structured prompt from compressed context.

**Functions:**
- `assemblePrompt(context: CompressedContext, userInput: string): string`
- Returns structured text:
```
[SCENE STATE]
...
[ACTIVE RELATIONSHIPS]
...
[RELEVANT MEMORIES]
...
[ACTIVE LORE]
...
[CANON RULES]
...
[NARRATIVE RULES]
...
[USER INPUT]
...
```

**System prompt template** (from spec):
```
You are a narrative AI for a persistent roleplay engine. Generate story responses that:
- Maintain emotional continuity with established relationships
- Respect canon constraints (immutable canon cannot be contradicted)
- Use only the provided context — do not invent facts outside retrieved lore
- Write in third-person narrative prose
- Keep responses concise (200-500 words)
- Advance the story based on user intent
```

### 1.4 Realtime RP Pipeline (`src/app/api/sessions/[id]/chat/route.ts`)

**New API endpoint.** The main chat generation flow.

**POST `/api/sessions/[id]/chat`**
1. Authenticate user, verify session access
2. Store user message in `messages` table
3. Run retrieval pipeline
4. Compress context to budget
5. Assemble prompt
6. Call Ollama (`qwen3.5:9b`) with streaming
7. Stream response back via SSE
8. Store AI response in `messages` table
9. Queue background jobs (summarize, embed, relationship analysis)
10. Return immediately

**Streaming:** Use `ReadableStream` to send chunks as they arrive from Ollama.

### 1.5 Ollama Streaming Client (`src/lib/ollama.ts` — extend)

**Extend existing file.** Add streaming generation:

- `generateStream(prompt: string, model?: string): AsyncIterable<string>` — calls Ollama `/api/generate` with `stream: true`
- Handle connection errors, retry with backoff
- Timeout after 60 seconds

---

## Phase 2: Background Processing

**Goal:** Complete the async job system for post-message processing and idle-time enrichment.

### 2.1 Message Summaries (`src/lib/message-summarizer.ts`)

**New file.** Generates summaries after each message.

**Job type:** `summarize_message` (high priority)

**Functions:**
- `summarizeMessage(messageId: string): Promise<void>`
- Generates 4 summary types stored in `message_summaries` table:
  - `semantic` — what happened in plain language
  - `emotional` — emotional tone detected
  - `relationship_impact` — how relationships changed (trust ±X, etc.)
  - `lore_extracted` — new facts/lore discovered
- Uses LLM call with structured output prompt

**Table:** `message_summaries` (already exists, verify schema):
```sql
CREATE TABLE IF NOT EXISTS message_summaries (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES messages(id),
  summary_type TEXT,  -- semantic, emotional, relationship_impact, lore_extracted
  content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2.2 Narrative Importance Scoring (`src/lib/importance-scoring.ts`)

**New file.** Computes composite importance scores for retrieval ranking.

**Functions:**
- `calculateImportanceScore(entity: { emotional: string, local: string, canonical: string, recency: string }): number`
- Formula: `(emotional × 0.35) + (local × 0.25) + (canonical × 0.20) + (recency × 0.20)`
- Values: `low=1`, `medium=2`, `high=3`, `critical=4`. Max = 16.
- `getArchivalAction(score: number): 'archive' | 'low_priority' | 'normal' | 'always_include'`
- `updateImportanceScores(entityType: string, entityId: string): Promise<void>` — recalculates and stores

**Integration:** Add `importance_score` column to relevant tables (messages, relationships, lore entries).

### 2.3 Idle-Time Enrichment Workers (`src/lib/idle-enrichment.ts`)

**New file.** Background workers triggered by user inactivity.

**Functions:**
- `runIdleEnrichment(userId: string, idleMinutes: number): Promise<void>`
- Dispatches based on idle duration:

| Idle Duration | Actions |
|---------------|---------|
| > 5 min | `compressOldSummaries()`, `refineRelationshipSummaries()` |
| > 10 min | `deepenActiveLocations()`, `enrichNPCBackstories()`, `optimizeRetrievalIndexes()` |
| > 15 min | `expandRumors()`, `archiveLowImportanceMemories()` |
| > 30 min | `applyRelationshipDecay()` |

**Constraints:**
- Only enrich entities with importance score ≥ 5
- Never contradict `immutable_canon`
- Generated content starts as `generated_unverified`
- Additive only (except archival)
- All enrichment logged

**Trigger:** Called from middleware on authenticated requests when `lastActivity > threshold`.

### 2.4 Relationship Decay Scheduler (`src/lib/relationship-decay.ts` — extend)

**Extend existing file.** Add scheduled decay application.

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

**Function:** `applyDecayToAllRelationships(userId: string): Promise<void>` — runs during >30min idle enrichment.

### 2.5 Job Processor Integration (`src/lib/job-processor.ts` — extend)

**Extend existing file.** Add new job type handlers:

- `summarize_message` → calls `summarizeMessage()`
- `generate_embedding` → calls embedding generation
- `relationship_analysis` → updates emotional states
- `extract_event` → creates event records
- `expand_location_lore` → generates location details
- `enrich_npc` → generates NPC backstory
- `generate_rumors` → creates rumor entries
- `thread_analysis` → analyzes narrative threads
- `memory_compression` → compresses old summaries
- `lore_deepening` → expands active locations
- `archival_processing` → archives low-importance memories
- `refine_relationship_summary` → updates relationship summaries
- `decay_relationships` → applies decay formula

---

## Phase 3: TTS & Audio

**Goal:** Complete the TTS experience with UI controls, auto-play, and voice mixing.

### 3.1 TTS in Chat (`src/components/chat/tts-controls.tsx`)

**New component.** Per-message TTS controls.

**Features:**
- Auto-play on AI responses (configurable)
- Playing indicator on message during playback
- Click to stop playback
- Skip messages >500 chars (configurable)
- Volume control per voice type (narrator, NPC, user)
- Per-session TTS toggle

**State:**
- `isPlaying: boolean`
- `currentMessageId: string | null`
- `volume: number` (0-1)
- `autoPlay: boolean`
- `skipLongMessages: boolean`

### 3.2 Message Action Buttons (`src/components/chat/message-actions.tsx`)

**New component.** Hover action buttons on each message.

**Buttons:**
| Button | Icon | Visibility |
|--------|------|------------|
| TTS | 🔊 | User + AI messages |
| Copy | 📋 | All messages |
| Edit | ✏️ | User + AI messages |
| Regenerate | 🔄 | AI messages only |
| Delete | 🗑️ | All messages |

**Behavior:**
- Show on hover (opacity transition)
- Copy → clipboard + "Copied" tooltip (1.5s)
- Edit → inline edit mode (textarea + confirm/cancel)
- Regenerate → delete message + all after, regenerate
- Delete → confirmation dialog → delete + all after

### 3.3 Voice Combination UI (`src/components/settings/voice-combiner.tsx`)

**New component.** UI for mixing Kokoro voices.

**Features:**
- Voice selector (dropdown with available voices)
- Weight slider for each selected voice (1-10)
- Preview button (generates sample audio)
- Save combined voice (stored per-user)
- Display saved combinations list
- Format: `af_bella(2)+af_sky(1)` → 67% bella, 33% sky

### 3.4 Settings Page (`src/app/(app)/settings/page.tsx` — extend)

**Extend existing page.** Add TTS settings section.

**Settings:**
| Setting | Type | Default |
|---------|------|---------|
| Enable TTS | Toggle | Off |
| Narrator voice | Dropdown | `af_heart` |
| Speech speed | Slider (0.5-2.0) | 1.0 |
| Output format | Dropdown | `mp3` |
| Auto-play | Toggle | On |
| Volume | Slider (0-100) | 80% |
| Skip long messages | Toggle | On (>500 chars) |
| Voice discovery refresh | Button | — |

**Storage:** `settings` table (per-user key-value store).

---

## Phase 4: UI Polish & Advanced Features

**Goal:** Complete remaining UI features, validation workflows, and graph enhancements.

### 4.1 Lore Validation Workflow UI (`src/components/lore/validation-queue.tsx`)

**New component.** Shows lore awaiting review.

**Features:**
- List of `generated_unverified` and `under_review` entries
- Each entry shows: title, type, generated content, potential contradiction
- Actions: Validate → `validated`, Reject → `rejected`
- Filter by type (location, NPC, event)
- Sort by importance score
- Bulk validate/reject

**Integration:** Add to lore page as a tab or sidebar section.

### 4.2 Contradiction Detection (`src/lib/contradiction-detector.ts`)

**New file.** Automated canon consistency checking.

**Functions:**
- `checkContradictions(entityType: string, entityId: string, content: string): Promise<Contradiction[]>`
- Compare against `immutable_canon` entries
- Check for conflicting facts (character alive vs dead)
- Flag temporal impossibilities (event before timeline start)
- Use embedding similarity to find related canon entries
- Returns: `{ type: 'temporal' | 'factual' | 'character', severity: 'high' | 'medium' | 'low', explanation: string }`

**Integration:** Called during lore validation workflow and idle-time enrichment.

### 4.3 User Override System (`src/lib/user-overrides.ts`)

**New file.** Tracks and enforces user edits over AI-generated content.

**Functions:**
- `setOverride(entityType: string, entityId: string, field: string, value: string): Promise<void>`
- `getOverrides(entityType: string, entityId: string): Promise<Override[]>`
- `shouldRespectOverride(entityType: string, entityId: string, field: string): Promise<boolean>`
- `logOverride(userId: string, entityType: string, entityId: string, field: string, oldValue: string, newValue: string): Promise<void>`

**Database:** `user_overrides` table:
```sql
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
```

**UI:** Show override indicator on lore entries, allow viewing edit history.

### 4.4 30fps Status Indicators (`src/components/status-bar.tsx`)

**New component.** Persistent status bar at bottom of app.

**Indicators:**
- FPS counter (live, updates at 30fps)
- Connection status (🟢 Connected / 🔴 Disconnected / 🟡 Reconnecting)
- TTS status (🔊 Connected / 🔇 Unavailable)
- Ollama status (🟢 Ready / 🔴 Offline)
- Active job count (📋 3 jobs processing)

**Implementation:** Use `useRenderLoop` hook for 30fps updates. Poll health endpoint every 30s.

### 4.5 Backlink Graph Link Type Inference (`src/lib/backlink-inference.ts`)

**New file.** Infers link types from context patterns in markdown.

**Functions:**
- `inferLinkType(sourceContent: string, targetId: string): LinkType`
- Pattern matching:
  - Location name → `located_in` / `nearby`
  - NPC name → `mentions`
  - Event name → `related_to`
  - "caused by", "result of" → `caused_by`
  - "part of", "within" → `part_of`
- Update `backlinks` table with inferred `link_type`

**Integration:** Run during lore save and idle-time enrichment.

### 4.6 Typing Indicator (`src/components/chat/typing-indicator.tsx`)

**New component.** Animated dots during AI generation.

**Features:**
- Three bouncing dots animation
- Updates at 30fps via `useRenderLoop`
- Shows "AI is thinking..." text
- Disappears when response starts streaming

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
