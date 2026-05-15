# Roleplay-Engine: Full Implementation Plan

## Overview

A persistent narrative roleplay engine supporting multiple users with isolated data, group sessions, username/password authentication, external Ollama inference, and a dark-themed GUI with a 30fps refresh system. Runs via `run.bat` on Windows — no Docker.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        run.bat                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  Next.js    │  │  Background   │  │  Ollama Client         │  │
│  │  API Server │  │  Worker       │  │  (192.168.4.2)         │  │
│  │  (:3000)    │  │  Process      │  │  Qwen3.5:9B            │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬────────────┘  │
│         │                │                       │               │
│  ┌──────┴────────────────┴───────────────────────┴──────────┐  │
│  │                    Data Layer                              │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │  SQLite      │  │  sqlite-vec  │  │  Markdown FS   │  │  │
│  │  │  (metadata)  │  │  (embeddings)│  │  (lore files)  │  │  │
│  │  └──────────────┘  └──────────────┘  └────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │
┌────────┴────────┐
│   Web Browser   │
│   Dark Theme    │
│   30fps Render  │
└─────────────────┘
```

---

## 2. Multi-User Data Isolation

### 2.1 Data Ownership Model

Every entity in the system is owned by a `user_id`. Data isolation is enforced at:
- **Database level**: Every table has a `user_id` column with foreign key constraints
- **Filesystem level**: Each user gets a dedicated directory under `data/<user_id>/`
- **API level**: Middleware validates `user_id` from JWT against requested resources

### 2.2 User Data Directory Structure

```
data/
├── <user_id>/
│   ├── universe/          # Universe definitions
│   ├── locations/         # Location lore (markdown)
│   ├── npcs/              # NPC definitions
│   ├── relationships/     # Relationship-centric pairwise dirs
│   │   ├── Player_Haleth/
│   │   ├── Player_Aragorn/
│   │   ├── Haleth_Aragorn/
│   │   └── ...
│   ├── events/            # Discrete event records
│   ├── story_arcs/        # Narrative threads
│   ├── canon/             # Canon reference material
│   ├── generated/         # AI-generated lore (unverified)
│   ├── tts_cache/         # Cached TTS audio files
│   └── embeddings.db      # Per-user vector database
├── shared/                # Shared group session data
│   └── <session_id>/
│       ├── messages/
│       ├── context/
│       └── embeddings.db
└── global.db              # Global SQLite (users, sessions, metadata)
```

### 2.3 Database Schema (global.db)

```sql
-- Users
CREATE TABLE users (
    id TEXT PRIMARY KEY,              -- UUID
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,      -- bcrypt
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    settings JSON                     -- theme, preferences
);

-- Sessions (owned by a user, can have participants)
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    universe_id TEXT,
    timeline_id TEXT,
    status TEXT DEFAULT 'active',     -- active, paused, archived
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- Session participants (group sessions)
CREATE TABLE session_participants (
    session_id TEXT REFERENCES sessions(id),
    user_id TEXT REFERENCES users(id),
    role TEXT DEFAULT 'participant',  -- owner, participant, observer
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, user_id)
);

-- Universe definitions
CREATE TABLE universes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    canon_mode TEXT DEFAULT 'strict', -- strict, soft, custom
    lore_source TEXT,
    tone TEXT,
    boundaries JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Timeline definitions
CREATE TABLE timelines (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    universe_id TEXT REFERENCES universes(id),
    era TEXT,
    year INTEGER,
    restrictions JSON,
    active_factions JSON
);

-- Scene state (active narrative context)
CREATE TABLE scene_states (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    active_location_id TEXT REFERENCES locations(id),
    current_goal TEXT,
    emotional_tone TEXT,
    active_npcs JSON,                  -- array of npc_ids currently in scene
    active_threads JSON,               -- array of narrative_thread_ids
    scene_summary TEXT,                -- brief description of current scene
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Locations (metadata, actual content in markdown)
CREATE TABLE locations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,          -- relative to data/<user_id>/locations/
    importance TEXT DEFAULT 'medium', -- low, medium, high, critical
    parent_location_id TEXT REFERENCES locations(id),
    known_info JSON,
    hidden_info JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- NPCs
CREATE TABLE npcs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    canon_status TEXT DEFAULT 'generated', -- immutable_canon, soft_canon, generated, session, rumor
    location_id TEXT REFERENCES locations(id),
    importance TEXT DEFAULT 'medium',
    tags JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Relationships
CREATE TABLE relationships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    source_entity TEXT NOT NULL,      -- npc, character, etc.
    target_entity TEXT NOT NULL,
    emotional_state JSON,             -- {trust: 0.62, suspicion: 0.31, ...}
    shared_history JSON,
    relationship_stage TEXT,
    decay_rates JSON,
    updated_at DATETIME
);

-- Narrative memories
CREATE TABLE narrative_memories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    session_id TEXT REFERENCES sessions(id),
    type TEXT NOT NULL,               -- discovery, conversation, betrayal, promise, mystery, choice, consequence
    content TEXT NOT NULL,
    importance JSON,                  -- {emotional, local, canonical, recency}
    related_entities JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages (raw chat)
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    sender_id TEXT REFERENCES users(id),  -- NULL for AI
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    location_context TEXT,
    emotional_tone TEXT,
    parent_message_id TEXT REFERENCES messages(id),  -- for branching after edit/regenerate
    is_deleted INTEGER DEFAULT 0,           -- soft delete for audit trail
    deleted_at DATETIME
);

-- Message summaries (async generated)
CREATE TABLE message_summaries (
    id TEXT PRIMARY KEY,
    source_message_id TEXT REFERENCES messages(id),
    summary TEXT,
    emotional_tone JSON,
    relationship_effects JSON,
    lore_extracted JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Narrative threads/arcs
CREATE TABLE narrative_threads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    session_id TEXT REFERENCES sessions(id),
    title TEXT NOT NULL,
    status TEXT DEFAULT 'active',     -- active, resolved, abandoned
    escalation_level TEXT DEFAULT 'low',
    unresolved_items JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Events (discrete narrative occurrences)
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    session_id TEXT REFERENCES sessions(id),
    title TEXT NOT NULL,
    event_type TEXT NOT NULL,          -- combat, discovery, conversation, betrayal, journey, ritual, death, alliance
    location_id TEXT REFERENCES locations(id),
    participants JSON,                 -- array of entity ids involved
    outcome TEXT,
    consequences JSON,                 -- what changed as a result
    importance JSON,                   -- {emotional, local, canonical, recency}
    occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Background job queue
CREATE TABLE job_queue (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,               -- summarize_message, generate_embedding, relationship_analysis, etc.
    priority TEXT DEFAULT 'medium',   -- high, medium, low, idle
    status TEXT DEFAULT 'queued',     -- queued, processing, completed, failed
    payload JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    error TEXT
);

-- Embedding metadata (actual vectors in sqlite-vec)
CREATE TABLE embedding_index (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    entity_type TEXT NOT NULL,        -- location, npc, memory, message, thread, event
    entity_id TEXT NOT NULL,
    text_content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Lore validation (contradiction prevention)
CREATE TABLE lore_validations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    entity_type TEXT NOT NULL,        -- location, npc, event, thread
    entity_id TEXT NOT NULL,
    state TEXT DEFAULT 'generated_unverified', -- generated_unverified, under_review, validated, rejected
    generated_by TEXT,                 -- AI model or user
    validation_notes TEXT,
    validated_by TEXT,                 -- user who validated (NULL if auto-validated)
    validated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Backlinks (Obsidian-style graph relationships)
CREATE TABLE backlinks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    source_type TEXT NOT NULL,        -- location, npc, event, memory, thread
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    link_type TEXT,                    -- mentions, located_in, related_to, caused_by, part_of
    context_snippet TEXT,              -- brief excerpt showing the connection
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_type, source_id, target_type, target_id)
);

-- TTS voice assignments
CREATE TABLE voice_assignments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    entity_type TEXT NOT NULL,        -- npc, character, narrator, location
    entity_id TEXT NOT NULL,
    voice_name TEXT NOT NULL,          -- e.g., "af_bella", "am_adam"
    voice_speed REAL DEFAULT 1.0,      -- playback speed (0.5 - 2.0)
    volume REAL DEFAULT 0.8,           -- volume (0.0 - 1.0)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    UNIQUE(user_id, entity_type, entity_id)
);

-- TTS audio cache (avoid re-generating same text)
CREATE TABLE tts_cache (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    text_hash TEXT NOT NULL,           -- SHA256 of text + voice + speed
    voice_name TEXT NOT NULL,
    text_content TEXT,
    audio_format TEXT DEFAULT 'mp3',
    audio_path TEXT,                   -- path to cached audio file
    duration_ms INTEGER,               -- audio duration in milliseconds
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used DATETIME,
    use_count INTEGER DEFAULT 1
);
```

---

## 3. Authentication System

### 3.1 Design

- **Username + password only** — no email required
- **bcrypt** password hashing (cost factor 12)
- **JWT** tokens for session management
- **HttpOnly cookies** for token storage (XSS protection)
- **Username constraints**: 3-20 chars, alphanumeric + underscore, case-insensitive uniqueness

### 3.2 Auth Flow

```
┌──────────┐     POST /api/auth/login      ┌──────────┐
│  Client  │ ────────────────────────────► │  Server  │
│          │                               │          │
│          │  1. Validate username format  │          │
│          │  2. bcrypt.compare()          │          │
│          │  3. Generate JWT (user_id)    │          │
│          │  4. Set HttpOnly cookie       │          │
│          │                               │          │
│          │ ◄──────────────────────────── │          │
│          │    { success, user: {id, username} }     │
└──────────┘                               └──────────┘
```

### 3.3 JWT Structure

```json
{
  "sub": "<user_id>",
  "username": "<username>",
  "iat": 1715000000,
  "exp": 1715086400
}
```

### 3.4 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Authenticate |
| POST | `/api/auth/logout` | Invalidate session |
| GET | `/api/auth/me` | Get current user info |
| PUT | `/api/auth/password` | Change password |

### 3.5 Registration Validation

```
username: 3-20 chars, [a-zA-Z0-9_], unique (case-insensitive)
password: 8+ chars, at least 1 letter + 1 number
```

---

## 4. Group Session System

### 4.1 Session Types

| Type | Description |
|------|-------------|
| **Solo** | Single user, single character, private narrative |
| **Group** | Multiple users, shared narrative, turn-based or freeform |
| **Observer** | Users can watch but not participate |

### 4.2 Group Session Architecture

```
Session: "The Eastern Ruins Expedition"
├── Owner: user_alice
├── Participants:
│   ├── user_alice (owner) - playing "Aragorn"
│   ├── user_bob (participant) - playing "Legolas"
│   └── user_charlie (observer) - watching only
├── Shared State:
│   ├── Current scene context
│   ├── Active NPCs
│   ├── Relationship web (cross-character)
│   └── Narrative threads
└── Per-User State:
    ├── Private thoughts (not visible to others)
    ├── Personal relationship views
    └── Individual narrative memories
```

### 4.3 Group Session Flow

```
1. Owner creates session, invites users by username
2. Invited users accept/decline
3. Owner sets: universe, timeline, starting location
4. Each participant declares their character
5. Session begins — messages are visible to all participants
6. AI generates responses considering ALL active characters
7. Background jobs process per-user and shared data
```

### 4.4 Turn Management (Optional)

```yaml
turn_mode: freeform    # freeform or ordered
turn_order:            # only if ordered
  - user_alice
  - user_bob
  - ai_narrator
```

### 4.5 Group Session API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions` | Create session |
| GET | `/api/sessions` | List user's sessions |
| GET | `/api/sessions/:id` | Get session details |
| POST | `/api/sessions/:id/invite` | Invite user by username |
| POST | `/api/sessions/:id/join` | Accept invitation |
| POST | `/api/sessions/:id/leave` | Leave session |
| POST | `/api/sessions/:id/kick` | Remove participant (owner only) |
| PUT | `/api/sessions/:id` | Update session settings |

---

## 5. Narrative Systems

### 5.1 Scene State Layer

The active scene context that bridges timeline and relationships.

**Schema**: `scene_states` table (see Section 2.3)

**Fields**:
- `active_location_id` — current location
- `current_goal` — what the party is trying to do
- `emotional_tone` — tense, calm, hostile, mysterious, etc.
- `active_npcs` — JSON array of NPC IDs present in scene
- `active_threads` — JSON array of narrative thread IDs relevant to scene
- `scene_summary` — brief prose description

**UI**: Scene state panel in the session view showing:
```
┌─ Scene State ─────────────────────────┐
│ Location: Eastern Ruins               │
│ Goal: Track Orcs                      │
│ Tone: Tense                           │
│                                       │
│ Active NPCs:                          │
│  ● Haleth (Ranger)                    │
│  ● Innkeeper                          │
│                                       │
│ Active Threads:                       │
│  ⚑ Missing traveler                   │
│  ⚑ Orc sightings                      │
└───────────────────────────────────────┘
```

**Lifecycle**:
- Created when session starts or location changes
- Updated after each significant narrative event
- Persisted to `scene_states` table
- Retrieved as first step in context assembly

### 5.2 Contradiction Prevention System

Generated lore remains provisional until validated.

**States**:
| State | Description |
|-------|-------------|
| `generated_unverified` | AI-generated, not yet reviewed |
| `under_review` | Flagged for user review |
| `validated` | Confirmed consistent with canon |
| `rejected` | Contradicts canon, discarded |

**Workflow**:
```
1. AI generates lore (location detail, NPC backstory, event)
2. Lore stored with state: generated_unverified
3. Background job checks against immutable_canon rules
4. If potential contradiction found → state: under_review
5. User reviews in Lore Editor → validates or rejects
6. Validated lore becomes part of soft_canon or generated_lore
```

**Contradiction Detection**:
- Compare generated lore against `immutable_canon` entries
- Check for conflicting facts (e.g., character alive vs dead)
- Flag temporal impossibilities (event before timeline start)
- Use embedding similarity to find related canon entries for comparison

**UI**: Validation badge on lore items:
```
🟢 Validated    🟡 Under Review    🔴 Rejected    ⚪ Unverified
```

**Schema**: `lore_validations` table (see Section 2.3)

### 5.3 Canon Layers

Five-tier canon system applied to all entities (locations, NPCs, events, lore).

| Layer | Description | Can Be Contradicted? |
|-------|-------------|---------------------|
| `immutable_canon` | Source material facts | Never |
| `soft_canon` | Expandable without contradiction | No, but can be extended |
| `generated_lore` | AI-generated, validated | Only by user override |
| `session_lore` | Temporary narrative state | Yes, session-scoped |
| `rumors` | Unverified information | Yes, may be true or false |

**Canon Enforcement**:
- `immutable_canon` entries are read-only in the UI
- AI prompts include canon rules as hard constraints
- Contradiction detection (5.2) checks against immutable_canon first
- User can promote/demote entities between layers

**UI**: Canon layer selector on each entity:
```
┌─ Canon Layer ─────────────────────────┐
│ ○ Immutable Canon (locked)            │
│ ○ Soft Canon                          │
│ ● Generated Lore                      │
│ ○ Session Lore                        │
│ ○ Rumor                               │
└───────────────────────────────────────┘
```

### 5.4 Narrative Importance System

Every entity and memory tracks 4-axis importance for retrieval ranking and archival.

**Axes**:
| Axis | Values | Purpose |
|------|--------|---------|
| `emotional` | low, medium, high, critical | How emotionally significant |
| `local` | low, medium, high, critical | How relevant to current location |
| `canonical` | low, medium, high, critical | How important to canon/story |
| `recency` | low, medium, high, critical | How recently referenced |

**Composite Score** (for retrieval ranking):
```
score = (emotional × 0.35) + (local × 0.25) + (canonical × 0.20) + (recency × 0.20)
```
Values mapped: low=1, medium=2, high=3, critical=4. Max score = 16.

**Archival Thresholds**:
| Score | Action |
|-------|--------|
| ≤ 4 | Archive to cold storage (not retrieved by default) |
| 5-8 | Keep in database, low retrieval priority |
| 9-12 | Normal retrieval priority |
| 13-16 | Always include in context if relevant |

**Decay**: Recency axis decays over time. Other axes are stable unless explicitly changed by narrative events.

### 5.5 Relationship Decay & Evolution

Relationships evolve dynamically with time-based decay.

**Decay Rates**:
| Emotion | Decay Rate | Half-Life |
|---------|-----------|-----------|
| `trust` | low | ~30 days of inactivity |
| `suspicion` | very_low | ~60 days |
| `loyalty` | low | ~30 days |
| `resentment` | very_low | ~90 days (lingers) |
| `attraction` | medium | ~14 days |
| `respect` | low | ~30 days |
| `fear` | medium | ~14 days |

**Decay Formula**:
```
new_value = current_value × (0.5 ^ (days_inactive / half_life_days))
```

**Evolution Triggers** (increase/decrease):
| Event | Effect |
|-------|--------|
| Shared combat | trust +0.1, respect +0.05 |
| Betrayal | trust -0.3, resentment +0.2 |
| Helpful action | trust +0.05, loyalty +0.03 |
| Broken promise | trust -0.15, suspicion +0.1 |
| Deep conversation | trust +0.08, attraction ±0.05 |
| Shared secret | trust +0.1, loyalty +0.05 |

**Scheduled Decay Job**:
- Runs every 24 hours (idle-time)
- Calculates days since last interaction per relationship
- Applies decay formula to all emotion values
- Updates `relationships.updated_at`
- Triggers `refine_relationship_summary` job if significant change

**Schema**: `decay_rates` JSON column in `relationships` table:
```json
{
  "trust": "low",
  "suspicion": "very_low",
  "loyalty": "low",
  "resentment": "very_low",
  "attraction": "medium",
  "respect": "low",
  "fear": "medium"
}
```

### 5.6 Intent Analysis

First step in the retrieval pipeline — classifies user input to guide context retrieval.

**Intent Categories**:
| Intent | Description | Retrieval Focus |
|--------|-------------|-----------------|
| `exploration` | Investigating, traveling, discovering | Location lore, nearby NPCs, hidden info |
| `combat` | Fighting, confronting, defending | Combat-relevant NPCs, weapons, tactics lore |
| `social` | Talking, negotiating, persuading | Relationship memory, NPC personality, dialogue history |
| `investigation` | Searching for clues, solving mysteries | Narrative threads, past events, rumors |
| `rest` | Sleeping, camping, downtime | Idle-time enrichment triggers |
| `travel` | Moving between locations | Path lore, destination info, journey events |
| `ritual` | Magic, ceremonies, special actions | Canon rules, ritual lore, universe rules |

**Classification Method**:
1. Keyword matching (fast path): combat words → `combat`, travel words → `travel`
2. Semantic embedding comparison (fallback): compare input embedding to intent prototype embeddings
3. Default: `social` if no clear signal

**Intent Prototype Embeddings** (pre-computed):
```
exploration: "explore the area, look around, search, investigate the ruins"
combat: "attack, fight, defend, strike, battle, draw weapon"
social: "talk to, ask, convince, persuade, greet, negotiate"
investigation: "find clues, who did this, what happened, search for evidence"
rest: "rest, sleep, camp, wait, take a break"
travel: "go to, head toward, journey, travel to, move to"
ritual: "cast spell, perform ritual, pray, use magic, channel"
```

### 5.7 Idle-Time Narrative Enrichment

When user is inactive, workers perform specific enrichment behaviors:

| Idle Duration | Enrichment Actions |
|---------------|-------------------|
| > 5 min | `memory_compression` — compress old message summaries |
| > 5 min | `refine_relationship_summary` — update relationship emotional summaries |
| > 10 min | `lore_deepening` — add detail to active location (hidden info revealed) |
| > 10 min | `enrich_npc` — expand backstory for NPCs in current scene |
| > 10 min | `retrieval_optimization` — rebuild embedding indexes for active entities |
| > 15 min | `expand_rumors` — generate new rumors based on recent events |
| > 15 min | `archival_processing` — archive low-importance memories |
| > 30 min | `decay_relationships` — apply time-based decay to all relationships |

**Enrichment Constraints**:
- Only enrich entities with importance score ≥ 5
- Never create facts that contradict immutable_canon
- Generated content starts as `generated_unverified`
- Enrichment is additive, never destructive (except archival)
- All enrichment is logged for user review

### 5.8 User Overrides & Conflict Resolution

Users can edit any lore entry, overriding AI-generated content.

**Override Workflow**:
```
1. User edits a lore entry (location, NPC, event)
2. System marks entry as user_override: true
3. AI-generated content for that field is discarded
4. Future AI generation respects the override
5. Override is logged in lore_validations as validated
```

**Conflict Resolution**:
| Scenario | Resolution |
|----------|-----------|
| User edits validated lore | User edit wins, re-validate against canon |
| User edits unverified lore | User edit wins, skip validation (user is authority) |
| AI generates conflicting lore after user override | AI output discarded, override preserved |
| Multiple users edit same lore (group session) | Last writer wins, with edit history preserved |

**Edit History**:
```
┌─ Edit History: Eastern Ruins ─────────────┐
│ 2026-05-16 14:30 — AI generated           │
│   "Ancient watchtower on the ridge"       │
│                                           │
│ 2026-05-16 15:45 — user_alice edited      │
│   "Crumbling watchtower, elven markings"  │
│                                           │
│ 2026-05-16 16:00 — AI attempted update    │
│   BLOCKED (user override active)          │
└───────────────────────────────────────────┘
```

### 5.9 Obsidian Backlinks

Markdown lore files support backlinks for graph-style navigation.

**Backlink Format** (in markdown files):
```markdown
---
id: loc_eastern_ruins
name: Eastern Ruins
---

The ruins contain an [[Ancient Watchtower]] built by the elves.
Nearby: [[Bree]], [[Weather Hills]].

See also: [[Orc Activity in the East]], [[Haleth's Report]]
```

**Backlink Processing**:
1. Parse `[[wikilink]]` syntax from all markdown files
2. Resolve links to entity IDs via name lookup
3. Store in `backlinks` table with link type inference
4. Render as clickable links in Lore Browser

**Link Type Inference**:
| Context Pattern | Inferred Link Type |
|----------------|-------------------|
| Location name | `located_in` / `nearby` |
| NPC name | `mentions` |
| Event name | `related_to` |
| "caused by", "result of" | `caused_by` |
| "part of", "within" | `part_of` |

**Backlink UI** (Lore Browser):
```
┌─ Eastern Ruins ─────────────────────────┐
│                                         │
│ [Markdown content with live links]      │
│                                         │
│ ── Backlinks (3) ─────────────────────  │
│ ← Haleth's Report (mentions)            │
│ ← Orc Activity in the East (related)    │
│ ← Bree (nearby)                         │
│                                         │
│ ── Links To (2) ──────────────────────  │
│ → Ancient Watchtower (located_in)       │
│ → Weather Hills (nearby)                │
└─────────────────────────────────────────┘
```

### 5.10 Group Session Real-Time Sync

Multiple users in a group session see updates in real-time.

**Technology**: Server-Sent Events (SSE) — simpler than WebSockets, sufficient for one-way server→client updates.

**Architecture**:
```
┌──────────┐     SSE Connection      ┌──────────┐
│  Client 1 │ ◄───────────────────── │          │
│  (Alice)  │                        │          │
├──────────┤                        │  Next.js │
│  Client 2 │ ◄───────────────────── │  API     │
│  (Bob)    │                        │  Server  │
├──────────┤                        │          │
│  Client 3 │ ◄───────────────────── │          │
│  (Charlie)│                        │          │
└──────────┘                        └────┬─────┘
                                         │
                                    ┌────┴─────┐
                                    │  SQLite  │
                                    │  (WAL)   │
                                    └──────────┘
```

**SSE Endpoint**: `GET /api/sessions/:id/stream`

**Event Types**:
```javascript
// New message from another participant
event: message
data: {"id": "MSG-1043", "sender": "user_bob", "content": "...", "timestamp": "..."}

// Scene state changed
event: scene_update
data: {"location": "Eastern Ruins", "tone": "tense", "active_npcs": [...]}

// Narrative thread updated
event: thread_update
data: {"id": "ARC-104", "status": "resolved", "title": "Missing Ranger"}

// Participant joined/left
event: participant_change
data: {"user": "user_charlie", "action": "joined"}

// Background job completed (visible to all)
event: job_complete
data: {"type": "summarize_message", "message_id": "MSG-1042"}
```

**Client-Side SSE Handler**:
```javascript
const eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);

eventSource.addEventListener('message', (e) => {
  const data = JSON.parse(e.data);
  addMessageToChat(data);
});

eventSource.addEventListener('scene_update', (e) => {
  const data = JSON.parse(e.data);
  updateSceneState(data);
});

eventSource.addEventListener('thread_update', (e) => {
  const data = JSON.parse(e.data);
  updateNarrativeThread(data);
});
```

**Message Flow** (user sends message in group session):
```
1. User A sends message → POST /api/sessions/:id/messages
2. Server stores message in SQLite
3. Server generates AI response (streaming)
4. Server sends SSE event to ALL connected clients
5. Each client displays the message
6. Background jobs queued for async processing
```

**Connection Management**:
- SSE connections tracked per session in memory
- Reconnection with `Last-Event-ID` header
- Heartbeat every 30 seconds to keep connection alive
- Max 50 concurrent connections per session

- Max 50 concurrent connections per session

### 5.11 Message Actions

Every message in the chat displays action buttons on hover.

#### Button Layout

```
┌─────────────────────────────────────────────┐
│ AI: The ranger nods slowly.                 │
│     "The path ahead is dangerous."          │
│                                             │
│     [🔊 TTS] [📋 Copy] [✏️ Edit] [🔄 Regen] [🗑️]  │
└─────────────────────────────────────────────┘
```

#### Button Visibility Matrix

| Message Type | TTS | Copy | Edit | Regenerate | Delete |
|--------------|-----|------|------|------------|--------|
| User message | ✅ | ✅ | ✅ | ❌ | ✅ |
| AI message | ✅ | ✅ | ✅ | ✅ | ✅ |
| System message | ❌ | ✅ | ❌ | ❌ | ✅ |

#### Regenerate Flow

```
1. User clicks [🔄 Regenerate] on AI message MSG-1043
2. Server identifies all messages with timestamp > MSG-1043
3. Server soft-deletes MSG-1043 and all subsequent messages
4. Server cleans up:
   - message_summaries for deleted messages
   - embedding_index entries for deleted messages
   - tts_cache entries referencing deleted messages
5. Server re-queues background jobs that referenced deleted messages
6. Server generates new AI response using conversation history up to MSG-1042
7. New message MSG-1044 created with parent_message_id = MSG-1042
8. SSE event sent to all session participants: message_regenerated
9. New background jobs queued for MSG-1044
```

**API**: `POST /api/sessions/:id/messages/:messageId/regenerate`

#### Edit Flow

```
1. User clicks [✏️ Edit] on message MSG-1042
2. Message text becomes inline editable textarea
3. User modifies text, clicks [Save] or presses Ctrl+Enter
4. Server updates MSG-1042 content
5. Server identifies all messages with timestamp > MSG-1042
6. Server soft-deletes all subsequent messages
7. Server cleans up summaries, embeddings, TTS cache for deleted messages
8. Server generates new AI response based on edited message + prior history
9. New message MSG-1045 created with parent_message_id = MSG-1042
10. SSE event sent: message_edited
11. New background jobs queued for MSG-1045
```

**API**: `PUT /api/sessions/:id/messages/:messageId`

Request body:
```json
{
  "content": "Let's search the crypt instead.",
  "regenerate": true
}
```

When `regenerate: true`, the server deletes all subsequent messages and generates a new AI response. When `regenerate: false`, only the message is updated (used for editing old messages without affecting the conversation).

#### Delete Flow

```
1. User clicks [🗑️ Delete] on message MSG-1043
2. Confirmation dialog: "Delete this message and all messages after it?"
3. On confirm:
   - Server soft-deletes MSG-1043 and all subsequent messages
   - Cleans up summaries, embeddings, TTS cache
   - SSE event sent: messages_deleted
```

**API**: `DELETE /api/sessions/:id/messages/:messageId`

#### TTS from Message Button

```
1. User clicks [🔊 TTS] on message
2. Client checks if audio is cached locally
3. If not cached → POST /api/tts/generate with message text + assigned voice
4. Audio plays via Web Audio API
5. Playing indicator shown on message
6. Clicking TTS again stops playback
```

#### Copy from Message Button

```
1. User clicks [📋 Copy]
2. navigator.clipboard.writeText(message.content)
3. Brief "Copied" tooltip appears (1.5s)
4. No server interaction
```

#### Database: Soft Delete & Branching

Messages use soft delete to preserve audit trail:
- `is_deleted = 1` marks message as deleted
- `deleted_at` records when deletion occurred
- `parent_message_id` tracks conversation branching after edit/regenerate

**Query for active messages**:
```sql
SELECT * FROM messages
WHERE session_id = ? AND is_deleted = 0
ORDER BY timestamp ASC;
```

**Cascade delete cleanup**:
```sql
-- When deleting messages, also clean up related data
DELETE FROM message_summaries WHERE source_message_id IN (deleted_ids);
DELETE FROM embedding_index WHERE entity_type = 'message' AND entity_id IN (deleted_ids);
DELETE FROM tts_cache WHERE text_hash IN (hashes_of_deleted_messages);
```

#### UI Components

**MessageBubble.js** — enhanced with action bar:
```jsx
function MessageBubble({ message, onAction }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="message-bubble" data-id={message.id}>
      <div className="message-content">
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                onAction('edit', message.id, editContent);
                setIsEditing(false);
              }
            }}
          />
        ) : (
          <MarkdownRenderer content={message.content} />
        )}
      </div>

      <div className="message-actions">
        <button onClick={() => onAction('tts', message.id)}>🔊</button>
        <button onClick={() => onAction('copy', message.id)}>📋</button>
        <button onClick={() => {
          setEditContent(message.content);
          setIsEditing(true);
          onAction('edit', message.id);
        }}>✏️</button>
        {message.sender_id === null && (
          <button onClick={() => onAction('regenerate', message.id)}>🔄</button>
        )}
        <button onClick={() => onAction('delete', message.id)}>🗑️</button>
      </div>
    </div>
  );
}
```

#### SSE Events for Message Actions

| Event | Payload | Trigger |
|-------|---------|---------|
| `message_regenerated` | `{ messageId, newMessageId, deletedCount }` | Regenerate action |
| `message_edited` | `{ messageId, newMessageId, deletedCount }` | Edit action |
| `messages_deleted` | `{ fromMessageId, deletedCount }` | Delete action |

---

## 6. TTS System (Kokoro)

### 6.1 Configuration

```javascript
// config/tts.js
export const TTS_CONFIG = {
  host: '192.168.4.2',
  port: 8880,
  baseUrl: 'http://192.168.4.2:8880',
  model: 'kokoro',
  defaultFormat: 'mp3',
  defaultSpeed: 1.0,
  defaultVoice: 'af_heart',         // narrator default
  timeout: 30000,                   // 30 sec for TTS generation
  retryAttempts: 3,
  retryDelay: 2000,
  maxTextLength: 500,               // skip TTS for messages longer than this
  cacheEnabled: true,
  cacheMaxAge: 7 * 24 * 60 * 60,   // 7 days
};
```

### 6.2 Voice Auto-Discovery

On application startup, the system queries available voices:

```
GET http://192.168.4.2:8880/v1/audio/voices
```

Response stored in memory and database:
```json
{
  "voices": ["af_bella", "af_sky", "af_heart", "am_adam", "bf_emma", ...]
}
```

**Discovery Flow**:
```
1. App starts → GET /v1/audio/voices
2. Parse voice list → store in memory + database
3. Infer metadata from voice ID prefix:
   - af_ = American Female
   - am_ = American Male
   - bf_ = British Female
   - bm_ = British Male
   - ef_ = Spanish Female
   - ff_ = French Female
   - if_ = Italian Female
   - pf_ = Portuguese Female
   - hf_ = Hindi Female
   - jf_ = Japanese Female
   - zf_ = Chinese Female
4. Display in Voice Picker UI
5. Re-discovery available via Settings → "Refresh Voices"
```

### 6.3 TTS Client

```
┌──────────────┐     HTTP POST      ┌──────────────────┐
│  RP Engine   │ ─────────────────► │  Kokoro Server   │
│  (localhost) │                    │  192.168.4.2     │
│              │                    │  :8880           │
│  TTS Queue   │ ◄───────────────── │                  │
│  Audio Cache │ ─────────────────► │                  │
└──────────────┘                    └──────────────────┘
```

**Speech Generation**:
```
POST http://192.168.4.2:8880/v1/audio/speech
{
  "model": "kokoro",
  "input": "The ranger nods slowly.",
  "voice": "af_bella",
  "response_format": "mp3",
  "speed": 1.0
}
```

**Voice Combination**:
```
POST http://192.168.4.2:8880/v1/audio/voices/combine
Content-Type: application/json

"af_bella(2)+af_sky(1)"   # 67% bella, 33% sky
```

Returns a `.pt` voice file that can be saved and reused.

### 6.4 Voice Assignment System

**Per-Entity Voice Assignment**:
| Entity | Voice Scope | Default |
|--------|-------------|---------|
| NPC | Per-NPC | Auto-assigned from available voices |
| User Character | Per-character | User-selected |
| Narrator | Per-session or global | `af_heart` |
| Location | Optional | None (silent) |

**Assignment UI**:
```
┌─ Voice Assignment: Haleth ────────────┐
│                                         │
│ Voice: [af_bella ▼]                     │
│   af_bella (American Female)            │
│   af_sky   (American Female)            │
│   af_heart (American Female)            │
│   am_adam  (American Male)              │
│   bf_emma  (British Female)             │
│   ...                                   │
│                                         │
│ Speed: [────●────] 1.0x                │
│ Volume: [───●──────] 80%               │
│                                         │
│ [Preview Voice]  [Save]                 │
└─────────────────────────────────────────┘
```

### 6.5 TTS Queue & Playback

**Non-blocking TTS Flow**:
```
1. AI generates text response
2. Text displayed in chat immediately
3. TTS job queued (async)
4. When audio ready → play via Web Audio API
5. If TTS unavailable → text-only mode (no error)
```

**TTS Queue Processing**:
```javascript
// lib/tts-queue.js
class TTSQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.currentAudio = null;
  }

  async enqueue(text, voice, speed = 1.0) {
    const job = { text, voice, speed, status: 'queued' };
    this.queue.push(job);
    this.process();
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      job.status = 'processing';

      // Check cache first
      const cached = await this.checkCache(job.text, job.voice, job.speed);
      if (cached) {
        this.playAudio(cached);
        job.status = 'completed';
        continue;
      }

      // Generate via Kokoro
      const audio = await this.generate(job.text, job.voice, job.speed);
      if (audio) {
        this.cacheAudio(job.text, job.voice, job.speed, audio);
        this.playAudio(audio);
        job.status = 'completed';
      } else {
        job.status = 'failed';
      }
    }

    this.processing = false;
  }
}
```

### 6.6 Audio Caching

**Cache Key**: SHA256 hash of `text + voice + speed + format`

**Cache Storage**:
- Audio files stored in `data/<user_id>/tts_cache/`
- Metadata in `tts_cache` table
- Max age: 7 days (configurable)
- Eviction: LRU when cache exceeds size limit

**Cache Hit Flow**:
```
1. Hash(text + voice + speed) → lookup in tts_cache
2. If hit → load audio file → play immediately
3. If miss → generate via Kokoro → cache → play
```

### 6.7 TTS in Chat

**Voice Routing**:
| Message Source | Voice Used |
|----------------|------------|
| AI narration | Narrator voice (session or global) |
| NPC dialogue | NPC's assigned voice |
| User message | Not spoken (configurable) |
| System messages | Narrator voice |

**TTS Controls in Chat**:
```
┌─ Chat Header ─────────────────────────┐
│ Session: Eastern Ruins    [🔊] [⚙]   │
└───────────────────────────────────────┘

[🔊] = TTS toggle (on/off)
[⚙] = TTS settings (voice, speed, volume)
```

**Per-Message TTS Indicator**:
```
┌───────────────────────────────────────┐
│ Haleth: "The path is dangerous."      │
│ [🔊 Playing...]                       │
└───────────────────────────────────────┘
```

### 6.8 TTS API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tts/voices` | List available voices (from Kokoro) |
| POST | `/api/tts/voices/refresh` | Re-discover voices from Kokoro |
| POST | `/api/tts/generate` | Generate speech (proxy to Kokoro) |
| POST | `/api/tts/voices/combine` | Combine voices (proxy to Kokoro) |
| GET | `/api/tts/cache/stats` | Cache statistics |
| DELETE | `/api/tts/cache/clear` | Clear TTS cache |
| PUT | `/api/tts/voice/:entityType/:entityId` | Assign voice to entity |
| GET | `/api/tts/voice/:entityType/:entityId` | Get entity's voice assignment |
| DELETE | `/api/tts/voice/:entityType/:entityId` | Remove voice assignment |

### 6.9 TTS Health Check

- Ping `GET /v1/audio/voices` on startup
- Display status in footer: `🔊 Connected` or `🔇 Unavailable`
- Retry with exponential backoff (2s, 4s, 8s, 16s, max 60s)
- Auto-reconnect when server becomes available
- SSE event `tts_status` broadcast to all clients on status change

---

## 7. Ollama Integration

### 5.1 Configuration

```javascript
// config/ollama.js
export const OLLAMA_CONFIG = {
  host: '192.168.4.2',
  port: 11434,
  baseUrl: 'http://192.168.4.2:11434',
  model: 'qwen3.5:9b',
  embeddingModel: 'bge-m3',
  timeout: 120000,        // 2 min for generation
  embeddingTimeout: 30000, // 30 sec for embeddings
  retryAttempts: 3,
  retryDelay: 2000
};
```

### 5.2 Ollama Client

```
┌──────────────┐     HTTP POST      ┌──────────────────┐
│  RP Engine   │ ─────────────────► │  Ollama Server   │
│  (localhost) │                    │  192.168.4.2     │
│              │                    │  :11434          │
│  Generation  │ ◄───────────────── │                  │
│  Embeddings  │ ─────────────────► │                  │
└──────────────┘                    └──────────────────┘
```

### 5.3 API Usage

**Generation:**
```
POST http://192.168.4.2:11434/api/generate
{
  "model": "qwen3.5:9b",
  "prompt": "<assembled prompt>",
  "stream": true,
  "options": {
    "temperature": 0.8,
    "top_p": 0.9,
    "num_ctx": 8192
  }
}
```

**Embeddings:**
```
POST http://192.168.4.2:11434/api/embed
{
  "model": "bge-m3",
  "input": "<text to embed>"
}
```

### 5.4 Connection Health Check

- Ping Ollama on startup
- Retry with exponential backoff on failure
- Display connection status in UI
- Queue generation requests if Ollama is temporarily unavailable

---

## 8. Dark Theme UI

### 6.1 Color Palette

```css
/* Tailwind config - Dark Theme */
{
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0a0a0a',    // Main background
          elevated: '#141414',   // Cards, panels
          raised: '#1e1e1e',     // Modals, dropdowns
          overlay: '#282828',    // Hover states
        },
        border: {
          DEFAULT: '#2a2a2a',
          strong: '#3a3a3a',
        },
        text: {
          primary: '#e8e8e8',
          secondary: '#a0a0a0',
          muted: '#666666',
        },
        accent: {
          DEFAULT: '#4a9eff',    // Subtle blue accent
          hover: '#3a8eef',
        },
        status: {
          success: '#22c55e',
          warning: '#eab308',
          error: '#ef4444',
          info: '#3b82f6',
        }
      }
    }
  }
}
```

### 6.2 UI Layout

```
┌────────────────────────────────────────────────────────────┐
│  [☰]  Roleplay Engine                    [user] [⚙] [⏻]   │  ← Header (#141414)
├──────────┬─────────────────────────────────────────────────┤
│          │                                                 │
│ Sidebar  │          Main Content Area                      │
│ (#141414)│          (#0a0a0a)                              │
│          │                                                 │
│ Sessions │  ┌─────────────────────────────────────────┐   │
│ Universe │  │                                         │   │
│ Locations│  │  Chat / Narrative Display               │   │
│ NPCs     │  │                                         │   │
│ Lore     │  │  [AI narrative text...]                 │   │
│ Settings │  │  [Player input...]                      │   │
│          │  │                                         │   │
│          │  └─────────────────────────────────────────┘   │
│          │  ┌─────────────────────────────────────────┐   │
│          │  │ [Type your action...]        [Send ▶]   │   │  ← Input (#1e1e1e)
│          │  └─────────────────────────────────────────┘   │
├──────────┴─────────────────────────────────────────────────┤
│  Status: ● Connected to Ollama  |  FPS: 30  |  Jobs: 3    │  ← Footer (#141414)
└────────────────────────────────────────────────────────────┘
```

---

## 9. 30fps Refresh Rate System

### 7.1 Design Philosophy

The GUI renders at a capped 30fps to:
- Reduce CPU/GPU usage during long sessions
- Provide smooth but not excessive animation
- Keep narrative text rendering consistent
- Allow background processing without UI stutter

### 7.2 Implementation

```javascript
// lib/render-loop.js
class RenderLoop {
  constructor(targetFPS = 30) {
    this.targetFPS = targetFPS;
    this.interval = 1000 / targetFPS;  // 33.33ms
    this.lastFrame = 0;
    this.callbacks = [];
    this.running = false;
    this.rafId = null;
  }

  start() {
    this.running = true;
    this.tick();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  tick = () => {
    if (!this.running) return;

    const now = performance.now();
    const delta = now - this.lastFrame;

    if (delta >= this.interval) {
      this.lastFrame = now - (delta % this.interval);

      // Execute all registered callbacks
      for (const cb of this.callbacks) {
        cb(delta);
      }
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  subscribe(callback) {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }
}

export const renderLoop = new RenderLoop(30);
```

### 7.3 React Integration

```javascript
// hooks/useRenderLoop.js
import { useEffect, useRef } from 'react';
import { renderLoop } from '@/lib/render-loop';

export function useRenderLoop(callback, deps = []) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    const unsubscribe = renderLoop.subscribe((delta) => {
      savedCallback.current(delta);
    });
    return unsubscribe;
  }, deps);
}
```

### 7.4 What Updates at 30fps

| Component | Update Reason |
|-----------|---------------|
| Chat scroll position | Smooth auto-scroll during streaming |
| Typing indicators | Animated dots |
| Streaming text | Character-by-character reveal |
| FPS counter | Status bar display |
| Connection status | Live indicator |
| Job queue progress | Background job progress bars |
| Relationship visualizations | Animated emotion graphs |

### 7.5 What Does NOT Update at 30fps

| Component | Update Trigger |
|-----------|---------------|
| Message list | New message received |
| Sidebar navigation | User interaction |
| Settings panels | User interaction |
| Lore editor | User interaction |
| Static content | Data change only |

---

## 10. Background Job System

### 8.1 Architecture

```
┌─────────────────────────────────────────────┐
│              Job Worker (Node.js)            │
├─────────────────────────────────────────────┤
│                                             │
│  ┌───────────┐  ┌───────────┐  ┌─────────┐ │
│  │ High Pri  │  │ Med Pri   │  │ Idle    │ │
│  │ Queue     │  │ Queue     │  │ Queue   │ │
│  │ (2 workers)│ │ (1 worker)│  │ (1 worker)│ │
│  └───────────┘  └───────────┘  └─────────┘ │
│                                             │
│  Worker picks jobs from SQLite job_queue    │
│  Processes them, updates status             │
│  Results stored back to database            │
└─────────────────────────────────────────────┘
```

### 8.2 Job Types & Priorities

| Priority | Job Type | Trigger |
|----------|----------|---------|
| **High** | `summarize_message` | After each message |
| **High** | `generate_embedding` | After new content |
| **High** | `relationship_analysis` | After significant interaction |
| **High** | `extract_event` | After narrative events |
| **Medium** | `expand_location_lore` | When location becomes active |
| **Medium** | `enrich_npc` | When NPC becomes relevant |
| **Medium** | `generate_rumors` | Periodic, idle-time |
| **Medium** | `thread_analysis` | After session milestones |
| **Idle** | `memory_compression` | User inactive > 5 min |
| **Idle** | `lore_deepening` | User inactive > 10 min |
| **Idle** | `archival_processing` | User inactive > 15 min |
| **Idle** | `retrieval_optimization` | User inactive > 10 min |

### 8.3 Idle Detection

```javascript
// Track user activity
let lastActivity = Date.now();

const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
activityEvents.forEach(evt => {
  document.addEventListener(evt, () => { lastActivity = Date.now(); });
});

function getIdleTime() {
  return Date.now() - lastActivity;
}

function isIdle(thresholdMs = 300000) { // 5 minutes
  return getIdleTime() > thresholdMs;
}
```

---

## 11. Retrieval Pipeline

### 9.1 Flow

```
User Input
    ↓
Intent Analysis (keyword + semantic)
    ↓
Scene Retrieval (current location, active NPCs)
    ↓
Relationship Retrieval (emotional state, shared history)
    ↓
Narrative Memory Retrieval (sqlite-vec similarity)
    ↓
Lore Retrieval (relevant locations, canon rules)
    ↓
Context Compression (trim to fit context window)
    ↓
Prompt Assembly (structured sections)
    ↓
LLM Generation (Ollama streaming)
    ↓
Response Display (30fps render)
    ↓
Store Raw Interaction
    ↓
Queue Background Jobs
```

### 9.2 Context Budget

```
Total context window: 8192 tokens (Qwen3.5:9B)

Allocation:
- System prompt:          500 tokens
- Canon rules:            300 tokens
- Scene state:            200 tokens
- Active relationships:   400 tokens
- Relevant memories:     2000 tokens
- Active lore:           1500 tokens
- Recent messages:       2000 tokens
- User input:             500 tokens
- Reserved for output:    792 tokens
```

---

## 12. Project Structure

```
Roleplay-Engine/
├── run.bat                          # Startup script
├── package.json
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
├── jsconfig.json
│
├── src/
│   ├── app/                         # Next.js App Router
│   │   ├── layout.js                # Root layout (dark theme)
│   │   ├── page.js                  # Landing / login redirect
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.js
│   │   │   └── register/
│   │   │       └── page.js
│   │   ├── (app)/
│   │   │   ├── dashboard/
│   │   │   │   └── page.js          # Session list, quick start
│   │   │   ├── session/
│   │   │   │   └── [id]/
│   │   │   │       └── page.js      # Active roleplay session
│   │   │   ├── universe/
│   │   │   │   └── page.js          # Universe management
│   │   │   ├── lore/
│   │   │   │   └── page.js          # Lore browser/editor
│   │   │   ├── characters/
│   │   │   │   └── page.js          # NPC management
│   │   │   ├── relationships/
│   │   │   │   └── page.js          # Relationship viewer
│   │   │   └── settings/
│   │   │       └── page.js          # User settings
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── register/route.js
│   │       │   ├── login/route.js
│   │       │   ├── logout/route.js
│   │       │   ├── me/route.js
│   │       │   └── password/route.js
│   │       ├── sessions/
│   │       │   ├── route.js
│   │       │   └── [id]/
│   │       │       ├── route.js
│   │       │       ├── messages/
│   │       │       │   ├── route.js         # GET list, POST new
│   │       │       │   └── [id]/
│   │       │       │       ├── route.js     # GET, PUT (edit), DELETE
│   │       │       │       └── regenerate/route.js  # POST regenerate
│   │       │       ├── invite/route.js
│   │       │       └── stream/route.js   # SSE real-time events
│   │       ├── generate/route.js    # Ollama generation proxy
│   │       ├── embed/route.js       # Embedding proxy
│   │       ├── jobs/route.js        # Job queue management
│   │       ├── tts/
│   │       │   ├── voices/route.js  # List/refresh voices
│   │       │   ├── generate/route.js # TTS generation proxy
│   │       │   ├── cache/route.js   # Cache management
│   │       │   └── voice/
│   │       │       └── [entityType]/
│   │       │           └── [entityId]/route.js # Voice assignment
│   │       ├── lore/
│   │       │   ├── route.js         # CRUD for lore entities
│   │       │   └── [id]/
│   │       │       ├── route.js
│   │       │       ├── validate/route.js  # Lore validation
│   │       │       └── backlinks/route.js # Backlink resolution
│   │       ├── relationships/
│   │       │   ├── route.js
│   │       │   └── [id]/
│   │       │       ├── route.js
│   │       │       └── decay/route.js     # Decay calculation
│   │       └── events/
│   │           └── route.js         # Event CRUD
│   │
│   ├── components/
│   │   ├── auth/
│   │   │   ├── LoginForm.js
│   │   │   └── RegisterForm.js
│   │   ├── tts/
│   │   │   ├── VoicePicker.js       # Voice selection dropdown
│   │   │   ├── VoicePreview.js      # Preview button + playback
│   │   │   ├── TTSControls.js       # Chat header TTS toggle
│   │   │   ├── TTSIndicator.js      # Per-message playing indicator
│   │   │   ├── TTSSettings.js       # Speed, volume, format settings
│   │   │   └── VoiceCombiner.js     # Voice mixing UI
│   │   ├── chat/
│   │   │   ├── ChatWindow.js        # Main chat display
│   │   │   ├── MessageBubble.js     # Individual message with action buttons
│   │   │   ├── MessageInput.js      # Input area
│   │   │   ├── StreamingText.js     # 30fps streaming text
│   │   │   ├── TypingIndicator.js   # Animated dots
│   │   │   └── MessageActionBar.js  # TTS, Copy, Edit, Regenerate, Delete
│   │   ├── layout/
│   │   │   ├── Header.js
│   │   │   ├── Sidebar.js
│   │   │   └── Footer.js
│   │   ├── session/
│   │   │   ├── SessionList.js
│   │   │   ├── SessionCreator.js
│   │   │   ├── ParticipantList.js
│   │   │   ├── SceneStatePanel.js   # Active scene context display
│   │   │   └── SSEConnection.js     # Real-time sync handler
│   │   ├── lore/
│   │   │   ├── LoreBrowser.js       # With backlink navigation
│   │   │   ├── LoreEditor.js        # With override support
│   │   │   ├── LoreCard.js
│   │   │   ├── BacklinkPanel.js     # Incoming/outgoing links
│   │   │   ├── CanonLayerSelector.js # 5-tier canon picker
│   │   │   └── ValidationBadge.js   # Lore validation status
│   │   ├── relationship/
│   │   │   ├── RelationshipGraph.js
│   │   │   ├── EmotionBar.js        # Animated emotion values
│   │   │   ├── RelationshipHistory.js # Shared history timeline
│   │   │   └── DecayIndicator.js    # Time-based decay display
│   │   ├── narrative/
│   │   │   ├── ThreadTracker.js     # Active narrative threads
│   │   │   ├── ImportanceMeter.js   # 4-axis importance display
│   │   │   └── EventTimeline.js     # Discrete event history
│   │   └── ui/                      # Reusable UI components
│   │       ├── Button.js
│   │       ├── Input.js
│   │       ├── Card.js
│   │       ├── Modal.js
│   │       ├── Badge.js
│   │       └── StatusIndicator.js
│   │
│   ├── lib/
│   │   ├── auth.js                  # JWT, password hashing
│   │   ├── db.js                    # SQLite connection
│   │   ├── ollama.js                # Ollama client
│   │   ├── tts.js                   # Kokoro TTS client
│   │   ├── tts-queue.js             # TTS job queue + playback
│   │   ├── tts-cache.js             # TTS audio cache management
│   │   ├── voice-discovery.js       # Auto-detect available voices
│   │   ├── render-loop.js           # 30fps render loop
│   │   ├── retrieval.js             # Context retrieval pipeline
│   │   ├── prompt-builder.js        # Prompt assembly
│   │   ├── embeddings.js            # Embedding management
│   │   ├── idle-tracker.js          # User idle detection
│   │   ├── intent-analyzer.js       # Intent classification
│   │   ├── backlinks.js             # Wikilink parsing & resolution
│   │   ├── importance.js            # Narrative importance scoring
│   │   ├── decay.js                 # Relationship decay calculations
│   │   ├── contradiction.js         # Canon contradiction detection
│   │   └── sse.js                   # Server-Sent Events handler
│   │
│   ├── hooks/
│   │   ├── useRenderLoop.js         # 30fps hook
│   │   ├── useAuth.js               # Auth state
│   │   ├── useSession.js            # Session state
│   │   ├── useStreaming.js          # Streaming text state
│   │   ├── useTTS.js                # TTS state + playback
│   │   └── useVoices.js             # Voice list + assignment
│   │
│   ├── middleware.js                # Auth middleware, route guards
│   │
│   └── workers/
│       ├── job-worker.js            # Background job processor
│       ├── summarizer.js            # Message summarization
│       ├── embedder.js              # Embedding generation
│       ├── relationship-analyzer.js # Relationship analysis
│       ├── lore-expander.js         # Idle-time lore expansion
│       ├── decay-scheduler.js       # 24-hour relationship decay
│       ├── contradiction-checker.js # Canon validation
│       ├── archiver.js              # Memory compression & archival
│       └── tts-worker.js            # TTS generation + cache management
│
├── data/                            # Runtime data directory
│   ├── global.db                    # Main SQLite database
│   ├── <user_id>/                   # Per-user data
│   └── shared/                      # Group session data
│
├── config/
│   └── ollama.js                    # Ollama configuration
│
└── scripts/
    ├── init-db.js                   # Database initialization
    └── seed.js                      # Optional seed data
```

---

## 13. run.bat

```batch
@echo off
title Roleplay Engine
echo ========================================
echo   Roleplay Engine - Starting...
echo ========================================
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed.
    echo Download from https://nodejs.org/
    pause
    exit /b 1
)

:: Check Ollama connectivity
echo Checking Ollama connection at 192.168.4.2:11434...
curl -s http://192.168.4.2:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo WARNING: Cannot reach Ollama at 192.168.4.2:11434
    echo The engine will start but generation will fail until Ollama is reachable.
    echo.
)

:: Check Kokoro TTS connectivity
echo Checking Kokoro TTS connection at 192.168.4.2:8880...
curl -s http://192.168.4.2:8880/v1/audio/voices >nul 2>&1
if errorlevel 1 (
    echo WARNING: Cannot reach Kokoro TTS at 192.168.4.2:8880
    echo The engine will start but TTS will be unavailable.
    echo.
) else (
    echo TTS: Connected - voices available.
    echo.
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

:: Initialize database if needed
if not exist "data\global.db" (
    echo Initializing database...
    mkdir data 2>nul
    call node scripts\init-db.js
    echo.
)

:: Start the application
echo Starting Roleplay Engine...
echo Server: http://localhost:3000
echo Ollama: http://192.168.4.2:11434
echo TTS:    http://192.168.4.2:8880
echo.
echo Press Ctrl+C to stop.
echo.

:: Start Next.js dev server (or use `npm start` for production)
call npm run dev
```

---

## 14. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Project setup (Next.js, Tailwind, dependencies)
- [ ] Dark theme configuration
- [ ] Database schema creation (all 18 tables including TTS)
- [ ] run.bat startup script (Ollama + TTS health checks)
- [ ] Ollama client with health check
- [ ] Kokoro TTS client with voice auto-discovery
- [ ] 30fps render loop system
- [ ] Per-user data directory initialization
- [ ] TTS audio cache system

### Phase 2: Authentication (Week 2-3)
- [ ] User registration (username + password)
- [ ] Login/logout with JWT
- [ ] Auth middleware
- [ ] Password change
- [ ] Session persistence

### Phase 3: Core Session (Week 3-4)
- [ ] Session CRUD
- [ ] Chat interface
- [ ] Message storage with soft delete and branching support
- [ ] Ollama generation integration
- [ ] Streaming text with 30fps render
- [ ] Context retrieval pipeline
- [ ] Intent analysis (keyword + semantic classification)
- [ ] Scene state management
- [ ] TTS integration (generate + play AI responses)
- [ ] TTS queue system (non-blocking)
- [ ] Voice assignment for NPCs and narrator
- [ ] Message action buttons (TTS, Copy, Edit, Regenerate, Delete)
- [ ] Regenerate flow (delete subsequent + re-generate)
- [ ] Edit flow (inline edit + delete subsequent + re-generate)
- [ ] Delete flow (cascade delete with cleanup)
- [ ] SSE events for message actions

### Phase 4: Narrative Systems (Week 4-5)
- [ ] Universe management with canon layers
- [ ] Location/NPC management
- [ ] Markdown lore storage with backlinks
- [ ] Relationship tracking with pairwise directories
- [ ] Narrative memory with importance scoring
- [ ] Events system
- [ ] Prompt assembly with context budget
- [ ] Contradiction prevention (lore validation workflow)
- [ ] User override system with edit history

### Phase 5: Group Sessions (Week 5-6)
- [ ] Session invitations
- [ ] Participant management
- [ ] Shared vs private state
- [ ] Multi-user chat
- [ ] Turn management (optional)
- [ ] SSE real-time sync for group sessions
- [ ] Connection management and reconnection

### Phase 6: Background Jobs (Week 6-7)
- [ ] Job queue system
- [ ] Message summarization
- [ ] Embedding generation
- [ ] Relationship analysis
- [ ] Idle-time processing (5min/10min/15min/30min tiers)
- [ ] Lore expansion with contradiction checks
- [ ] Relationship decay scheduler (24-hour cycle)
- [ ] Memory compression and archival

### Phase 7: Polish (Week 7-8)
- [ ] Vector search with sqlite-vec
- [ ] Context compression
- [ ] Backlink graph visualization
- [ ] Relationship evolution UI (emotion bars, history)
- [ ] Canon layer editor
- [ ] Lore validation review UI
- [ ] Voice combiner UI (weighted voice mixing)
- [ ] TTS settings panel (speed, volume, format)
- [ ] TTS cache management UI
- [ ] UI refinements
- [ ] Performance optimization
- [ ] Error handling

---

## 15. Dependencies

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "better-sqlite3": "^11.0.0",
    "sqlite-vec": "^0.1.0",
    "lucide-react": "^0.460.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

---

## 16. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **SQLite over PostgreSQL** | Single-user LAN deployment, no DB server needed, sqlite-vec integration |
| **Username-only auth** | User requirement, simpler UX, no email dependency |
| **Next.js App Router** | Built-in API routes, SSR for initial load, clean file routing |
| **Per-user data directories** | Clean isolation, easy backup/export, Obsidian-compatible |
| **30fps cap** | Reduces resource usage, sufficient for narrative UI, prevents GPU waste |
| **run.bat over Docker** | User requirement, simpler Windows deployment, direct hardware access |
| **External Ollama** | Offloads GPU requirements, shared inference server |
| **External Kokoro TTS** | Offloads TTS processing, shared server at 192.168.4.2 |
| **Markdown + SQLite hybrid** | Human-readable lore files, fast metadata queries, vector search |
| **SSE over WebSockets** | Simpler implementation, sufficient for one-way server→client updates, native browser support |
| **Pairwise relationship dirs** | Matches spec's relationship-centric retrieval model |
| **4-axis importance scoring** | Enables nuanced retrieval ranking and archival decisions |
| **Provisional lore validation** | Prevents canon corruption from AI hallucinations |
| **TTS audio caching** | Avoids re-generating same text, reduces latency and server load |
| **Non-blocking TTS queue** | Chat never waits for audio generation, text displays immediately |
| **Soft delete for messages** | Preserves audit trail, enables undo, clean cascade cleanup |
| **Branching via parent_message_id** | Tracks conversation forks after edit/regenerate |

---

## 17. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ollama server unreachable | High | Health checks, queued requests, user notification |
| Kokoro TTS server unreachable | Low | Non-blocking queue, text-only fallback, auto-reconnect |
| SQLite concurrency limits | Medium | WAL mode, connection pooling, single-writer pattern |
| Context window overflow | Medium | Strict budget allocation, compression fallback |
| Group session sync issues | Medium | Server-authoritative state, SSE reconnection with Last-Event-ID |
| Embedding performance | Low | Async processing, batch operations |
| Contradiction detection false positives | Medium | User review step before rejection, confidence thresholds |
| Relationship decay feels unnatural | Low | Tunable half-lives, user-adjustable decay rates |
| SSE connection limits (browser max 6) | Medium | Connection pooling, heartbeat optimization |
| Backlink parsing errors | Low | Fallback to manual linking, validation on save |
| TTS cache disk growth | Low | LRU eviction, 7-day max age, manual clear option |
| Voice combination artifacts | Low | Server-side validation, preview before save |
| Orphaned data after message delete | Medium | Transactional cascade deletes, cleanup jobs |
| Regenerate in group session conflicts | Medium | Server-authoritative, lock during regeneration |

---

## Confidence

- **MEDIUM**

### Uncertainty Sources:
- Ollama API compatibility with Qwen3.5:9B (model availability may vary)
- sqlite-vec performance characteristics at scale
- Exact token counts for context budget (requires empirical testing)
- BGE-M3 embedding model availability on the target Ollama instance
