# Persistent Narrative RP Engine Specification

## Overview

This system is a persistent narrative roleplay engine designed for:

- Long-form AI-assisted roleplay
    
- Canon-aware storytelling
    
- Persistent relationship memory
    
- Incremental lore expansion
    
- Retrieval-driven context assembly
    
- Structured narrative continuity
    
- Obsidian-style lore organization
    
- Asynchronous memory processing
    
- Multi-user support with data isolation
    
- Group roleplay sessions
    
- Dark-themed modern interface
    
- Lightweight 30fps rendering
    
- Text-to-Speech with Kokoro (voice assignment per character/NPC)


The system is NOT a world simulator.

The goal is to create:

- believable narrative continuity,
    
- emotionally persistent characters,
    
- evolving storylines,
    
- localized lore generation,
    
- responsive roleplay.
    

The system should behave like an adaptive narrative framework rather than a simulated autonomous universe.

---

# Core Philosophy

## Narrative First

The system should generate and expand only what is narratively relevant.

The world exists through:

- player interaction,
    
- story progression,
    
- relationship development,
    
- discoveries,
    
- narrative relevance.
    

The system should avoid:

- full world simulation,
    
- unnecessary procedural systems,
    
- global autonomous activity,
    
- simulated economies,
    
- excessive background world state.
    

---

# Design Principles

## 1. Localized Context

The AI should only receive:

- active scene context,
    
- nearby lore,
    
- relevant memories,
    
- active relationships,
    
- recent events,
    
- current narrative threads.
    

Avoid:

- massive lore dumps,
    
- entire world context,
    
- irrelevant historical information,
    
- inactive NPC retrieval.
    

---

## 2. Incremental Expansion

The world should deepen only when the story touches it.

Example:

Initial retrieval:

```yaml
location:
  name: Eastern Ruins

known_information:
  - Orc activity
```

Later expansion:

```yaml
location:
  name: Eastern Ruins

known_information:
  - Orc activity
  - Ancient watchtower

hidden_information:
  - Buried Angmar relics
```

---

## 3. Persistent Narrative Consequence

The most important persistence layer is:

- what happened,
    
- who remembers,
    
- how relationships changed,
    
- unresolved tensions,
    
- emotional continuity.
    

Not simulation state.

---

# High-Level Architecture

```text
Universe Layer
    ↓
Timeline Layer
    ↓
Location Layer
    ↓
Scene State
    ↓
Relationship Memory
    ↓
Narrative Memory
    ↓
Context Retrieval
    ↓
Prompt Assembly
    ↓
LLM Generation
    ↓
Memory Persistence
    ↓
Background Enrichment
```

---

# Core Stack

|Layer|Technology|
|---|---|
|Frontend|Next.js|
|UI|React|
|Styling|Tailwind CSS|
|Icons|Lucide React|
|Database|SQLite|
|Embeddings|BGE-M3|
|Generation|Qwen3.5:9B|
|Inference Backend|Ollama|
|Vector Search|sqlite-vec|
|Storage|Markdown + SQLite metadata|
|Text-to-Speech|Kokoro-82M (Kokoro-FastAPI)|
|Audio Playback|Web Audio API|

---

# Deployment

## Runtime

- Runs via `run.bat` on Windows
- No Docker required
- Node.js runtime
- Next.js development or production server

## Inference

- External Ollama server at `192.168.4.2:11434`
- Generation model: `qwen3.5:9b`
- Embedding model: `bge-m3`
- Connection health check on startup
- Retry with exponential backoff on failure

## Text-to-Speech

- External Kokoro-FastAPI server at `192.168.4.2:8880`
- Model: Kokoro-82M
- Auto-detect available voices on startup
- OpenAI-compatible Speech endpoint
- Connection health check on startup
- Retry with exponential backoff on failure

---

# Authentication

## Method

- Username and password only — no email required
- bcrypt password hashing (cost factor 12)
- JWT tokens for session management
- HttpOnly cookies for token storage (XSS protection)

## Username Constraints

- 3-20 characters
- Alphanumeric and underscore only: `[a-zA-Z0-9_]`
- Case-insensitive uniqueness

## Password Constraints

- Minimum 8 characters
- At least 1 letter and 1 number

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Authenticate |
| POST | `/api/auth/logout` | Invalidate session |
| GET | `/api/auth/me` | Get current user info |
| PUT | `/api/auth/password` | Change password |

---

# Multi-User Data Isolation

## Data Ownership Model

Every entity in the system is owned by a `user_id`. Data isolation is enforced at:

- **Database level**: Every table has a `user_id` column with foreign key constraints
- **Filesystem level**: Each user gets a dedicated directory under `data/<user_id>/`
- **API level**: Middleware validates `user_id` from JWT against requested resources

## User Data Directory Structure

```
data/
├── <user_id>/
│   ├── universe/          # Universe definitions
│   ├── locations/         # Location lore (markdown)
│   ├── npcs/              # NPC definitions
│   ├── relationships/     # Pairwise relationship directories
│   │   ├── Player_Haleth/
│   │   ├── Player_Aragorn/
│   │   └── Haleth_Aragorn/
│   ├── events/            # Discrete event records
│   ├── story_arcs/        # Narrative threads
│   ├── canon/             # Canon reference material
│   ├── generated/         # AI-generated lore (unverified)
│   └── embeddings.db      # Per-user vector database
├── shared/                # Shared group session data
│   └── <session_id>/
│       ├── messages/
│       ├── context/
│       └── embeddings.db
└── global.db              # Global SQLite (users, sessions, metadata)
```

---

# Group Sessions

## Session Types

| Type | Description |
|------|-------------|
| **Solo** | Single user, single character, private narrative |
| **Group** | Multiple users, shared narrative, turn-based or freeform |
| **Observer** | Users can watch but not participate |

## Group Session Architecture

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

## Group Session Flow

1. Owner creates session, invites users by username
2. Invited users accept/decline
3. Owner sets: universe, timeline, starting location
4. Each participant declares their character
5. Session begins — messages are visible to all participants
6. AI generates responses considering ALL active characters
7. Background jobs process per-user and shared data

## Real-Time Sync

- Server-Sent Events (SSE) for server-to-client updates
- Endpoint: `GET /api/sessions/:id/stream`
- Event types: `message`, `scene_update`, `thread_update`, `participant_change`, `job_complete`
- Reconnection with `Last-Event-ID` header
- Heartbeat every 30 seconds

## Turn Management (Optional)

```yaml
turn_mode: freeform    # freeform or ordered
turn_order:            # only if ordered
  - user_alice
  - user_bob
  - ai_narrator
```

## Group Session API

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

# System Scope

## The System Is

- a narrative engine,
    
- a continuity system,
    
- a lore memory framework,
    
- an adaptive storytelling platform.
    

## The System Is NOT

- a civilization simulator,
    
- a real-time world simulator,
    
- a procedural economy engine,
    
- an autonomous AI world.
    

---

# Canon-Aware Roleplay

The system should support settings such as:

- Middle-earth
    
- Elder Scrolls
    
- Warhammer
    
- Original settings
    

Canon consistency should remain a primary concern.

---

# Canon Layers

```yaml
canon_layers:
  immutable_canon:
    description: Cannot be contradicted
    editable: false

  soft_canon:
    description: Expandable without contradiction
    editable: true

  generated_lore:
    description: AI-generated persistent lore
    requires_validation: true

  session_lore:
    description: Temporary narrative state
    scope: session

  rumors:
    description: Unverified information
    may_be_false: true
```

## Canon Enforcement

- `immutable_canon` entries are read-only in the UI
- AI prompts include canon rules as hard constraints
- Contradiction detection checks against `immutable_canon` first
- Users can promote/demote entities between layers

---

# Narrative Retrieval Philosophy

The system retrieves:

- nearby lore,
    
- active NPCs,
    
- relationship memories,
    
- recent events,
    
- active narrative threads,
    
- current scene context.
    

The system avoids retrieving:

- distant irrelevant lore,
    
- inactive characters,
    
- unrelated timelines,
    
- unnecessary world detail.
    

---

# Intent Analysis

The first step in the retrieval pipeline — classifies user input to guide context retrieval.

## Intent Categories

| Intent | Description | Retrieval Focus |
|--------|-------------|-----------------|
| `exploration` | Investigating, traveling, discovering | Location lore, nearby NPCs, hidden info |
| `combat` | Fighting, confronting, defending | Combat-relevant NPCs, weapons, tactics lore |
| `social` | Talking, negotiating, persuading | Relationship memory, NPC personality, dialogue history |
| `investigation` | Searching for clues, solving mysteries | Narrative threads, past events, rumors |
| `rest` | Sleeping, camping, downtime | Idle-time enrichment triggers |
| `travel` | Moving between locations | Path lore, destination info, journey events |
| `ritual` | Magic, ceremonies, special actions | Canon rules, ritual lore, universe rules |

## Classification Method

1. Keyword matching (fast path): combat words → `combat`, travel words → `travel`
2. Semantic embedding comparison (fallback): compare input embedding to intent prototype embeddings
3. Default: `social` if no clear signal

---

# Core Narrative Layers

# 1. Universe Layer

Defines:

- franchise,
    
- world rules,
    
- canon source,
    
- tone,
    
- narrative boundaries.
    

Example:

```yaml
universe:
  name: Middle-earth
  canon_mode: strict
  lore_source: Tolkien
```

---

# 2. Timeline Layer

Defines:

- current era,
    
- timeline restrictions,
    
- available factions,
    
- active canon characters.
    

Example:

```yaml
time_period:
  age: Third Age
  year: 3018
```

---

# 3. Scene State Layer

Tracks immediate narrative context.

Example:

```yaml
scene_state:
  active_location: Bree
  current_goal: Track Orcs

  active_npcs:
    - Haleth
    - Innkeeper

  emotional_tone: tense

  active_threads:
    - Missing traveler
    - Orc sightings
```

This layer is critical for:

- immersion,
    
- pacing,
    
- contextual retrieval,
    
- immediate continuity.
    

## Scene State Lifecycle

- Created when session starts or location changes
- Updated after each significant narrative event
- Persisted to `scene_states` table
- Retrieved as first step in context assembly

---

# 4. Relationship Memory

Relationships are one of the most important persistence systems.

The system should track:

- trust,
    
- suspicion,
    
- loyalty,
    
- resentment,
    
- attraction,
    
- respect,
    
- fear,
    
- shared history.
    

Example:

```yaml
relationship:
  source: haleth
  target: player

emotional_state:
  trust: 0.62
  suspicion: 0.31
  respect: 0.71

shared_history:
  - Shared campfire discussion
  - Orc ambush survival

relationship_stage:
  cautious_allies
```

---

# 5. Narrative Memory

The system stores:

- discoveries,
    
- conversations,
    
- betrayals,
    
- promises,
    
- mysteries,
    
- important choices,
    
- consequences.
    

Narrative memory should be prioritized over raw chat logs.

---

# 6. Events

Discrete narrative occurrences that change the story state.

## Event Types

- `combat` — battles, skirmishes, duels
- `discovery` — finding items, locations, secrets
- `conversation` — significant dialogues
- `betrayal` — trust violations
- `journey` — travel between locations
- `ritual` — magical or ceremonial acts
- `death` — character deaths
- `alliance` — forming partnerships

## Event Structure

```yaml
event:
  id: EVT-2041
  type: combat
  location: eastern_ruins
  participants:
    - player
    - haleth
    - orc_leader
  outcome: victory
  consequences:
    - orc_leader defeated
    - haleth trust increased
    - eastern_ruins secured
  importance:
    emotional: high
    local: high
    canonical: medium
    recency: high
```

---

# Chat Memory Structure

## Raw Messages

Stores exact conversation history.

Example:

```yaml
message:
  id: MSG-1042
  speaker: player
  location: bree

content: |
  Have Rangers passed through recently?
```

---

## Message Summaries

Every important interaction should generate:

- semantic summaries,
    
- emotional summaries,
    
- relationship impact summaries,
    
- lore extraction summaries.
    

Example:

```yaml
message_summary:
  source_message: MSG-1042

summary:
  Player questioned the innkeeper about Rangers.

emotional_tone:
  - cautious
  - investigative

relationship_effects:
  trust: +0.02

lore_extracted:
  - Rangers seen east of Bree
```

---

## Message Actions

Every message in the chat displays action buttons on hover:

### Available Actions

| Button | Icon | Description |
|--------|------|-------------|
| **TTS** | 🔊 | Read this message aloud using the assigned voice |
| **Copy** | 📋 | Copy message text to clipboard |
| **Edit** | ✏️ | Edit this message and regenerate from this point |
| **Regenerate** | 🔄 | Re-generate this AI response (AI messages only) |
| **Delete** | 🗑️ | Delete this message and all messages after it |

### Button Visibility

| Message Type | TTS | Copy | Edit | Regenerate | Delete |
|--------------|-----|------|------|------------|--------|
| User message | ✅ | ✅ | ✅ | ❌ | ✅ |
| AI message | ✅ | ✅ | ✅ | ✅ | ✅ |
| System message | ❌ | ✅ | ❌ | ❌ | ✅ |

### Regenerate Behavior

When a user clicks **Regenerate** on an AI message:

1. The selected AI message is deleted
2. All messages after it are deleted (both user and AI)
3. The conversation rewinds to the message before the regenerated one
4. A new AI response is generated based on the full conversation history up to that point
5. The new response replaces the old one
6. Background jobs (summarization, embeddings, relationship analysis) are re-queued for the new response
7. Old message summaries and embeddings for deleted messages are cleaned up

```
Before:
  User: "What do you think of the ruins?"
  AI:   "The stonework is ancient..."        ← [Regenerate]
  User: "Let's search the tower."
  AI:   "You find a hidden passage..."

After Regenerate:
  User: "What do you think of the ruins?"
  AI:   "The walls bear elven markings..."   ← NEW response
  (all messages after this point are gone)
```

### Edit Behavior

When a user clicks **Edit** on any message:

1. The message text becomes editable inline
2. User modifies the text and confirms
3. The edited message is saved
4. All messages after it are deleted (both user and AI)
5. A new AI response is generated based on the edited message and prior history
6. Background jobs are re-queued for the new response
7. Old message summaries and embeddings for deleted messages are cleaned up

```
Before:
  User: "What do you think of the ruins?"
  AI:   "The stonework is ancient..."
  User: "Let's search the tower."            ← [Edit] → "Let's search the crypt instead."

After Edit:
  User: "What do you think of the ruins?"
  AI:   "The stonework is ancient..."
  User: "Let's search the crypt instead."    ← EDITED
  AI:   "The crypt entrance is sealed..."    ← NEW response
  (all messages after this point are gone)
```

### Delete Behavior

When a user clicks **Delete** on any message:

1. A confirmation prompt appears: "Delete this message and all messages after it?"
2. On confirm:
   - The selected message is deleted
   - All messages after it are deleted
   - Background job references to deleted messages are cleaned up
   - Message summaries and embeddings for deleted messages are removed
3. The conversation rewinds to the message before the deleted one

### TTS Behavior

When a user clicks **TTS** on any message:

1. The message text is sent to the Kokoro TTS server
2. The assigned voice is used (NPC voice for NPC dialogue, narrator for AI narration, user's voice for user messages)
3. Audio plays immediately via Web Audio API
4. If the message is already cached, playback starts instantly
5. A playing indicator shows on the message during playback
6. Clicking TTS again while playing stops playback

### Copy Behavior

When a user clicks **Copy**:

1. Message text is copied to clipboard
2. A brief "Copied" tooltip appears
3. No server interaction needed

---

# Narrative Thread Tracking

The system should track:

- unresolved mysteries,
    
- active tensions,
    
- recurring conflicts,
    
- ongoing investigations,
    
- emotional arcs.
    

Example:

```yaml
narrative_state:
  active_arc:
    id: ARC-104

  unresolved_threads:
    - Missing Ranger
    - Eastern Orc activity

  escalation_level: medium
```

---

# Retrieval Pipeline

```text
User Input
    ↓
Intent Analysis
    ↓
Scene Retrieval
    ↓
Relationship Retrieval
    ↓
Narrative Memory Retrieval
    ↓
Lore Retrieval
    ↓
Context Compression
    ↓
Prompt Assembly
    ↓
LLM Generation
```

---

# Prompt Assembly

Prompt sections should remain structured.

Example:

```text
[SCENE STATE]

[ACTIVE RELATIONSHIPS]

[RELEVANT MEMORIES]

[ACTIVE LORE]

[CANON RULES]

[NARRATIVE RULES]

[USER INPUT]
```

## Context Budget

Total context window: 8192 tokens (Qwen3.5:9B)

| Section | Allocation |
|---------|-----------|
| System prompt | 500 tokens |
| Canon rules | 300 tokens |
| Scene state | 200 tokens |
| Active relationships | 400 tokens |
| Relevant memories | 2000 tokens |
| Active lore | 1500 tokens |
| Recent messages | 2000 tokens |
| User input | 500 tokens |
| Reserved for output | 792 tokens |

---

# Async Processing Philosophy

Realtime roleplay should remain lightweight.

The chat system should NEVER wait for:

- embeddings,
    
- summarization,
    
- indexing,
    
- lore expansion,
    
- memory compression,
    
- relationship analysis.
    

These should happen asynchronously.

---

# Realtime RP Pipeline

```text
User Message
    ↓
Retrieve Relevant Context
    ↓
Generate Narrative Response
    ↓
Store Raw Interaction
    ↓
Queue Background Jobs
    ↓
Return Response Immediately
```

---

# Background Job System

The system should use asynchronous workers.

Example job:

```yaml
queue_task:
  id: TASK-2041
  type: summarize_message
  priority: high
  status: queued
```

---

# Recommended Job Types

## High Priority

- `summarize_message` — after each message
- `generate_embedding` — after new content
- `relationship_analysis` — after significant interaction
- `extract_event` — after narrative events

## Medium Priority

- `expand_location_lore` — when location becomes active
- `enrich_npc` — when NPC becomes relevant
- `generate_rumors` — periodic, idle-time
- `thread_analysis` — after session milestones

## Idle-Time Only

- `memory_compression` — user inactive > 5 min
- `lore_deepening` — user inactive > 10 min
- `archival_processing` — user inactive > 15 min
- `retrieval_optimization` — user inactive > 10 min
- `refine_relationship_summary` — user inactive > 5 min
- `decay_relationships` — user inactive > 30 min (24-hour cycle)

---

# Important Constraint

Background jobs should NOT simulate the world.

They should only:

- enrich narrative potential,
    
- deepen active lore,
    
- improve continuity,
    
- strengthen retrieval quality.
    

---

# Idle-Time Narrative Enrichment

When the user is inactive, workers may:

| Idle Duration | Enrichment Actions |
|---------------|-------------------|
| > 5 min | Compress old message summaries, refine relationship summaries |
| > 10 min | Deepen active locations, enrich NPC backstories, optimize retrieval indexes |
| > 15 min | Expand rumors, archive low-importance memories |
| > 30 min | Apply relationship decay calculations |

The world should not autonomously evolve without narrative relevance.

## Enrichment Constraints

- Only enrich entities with importance score ≥ 5
- Never create facts that contradict `immutable_canon`
- Generated content starts as `generated_unverified`
- Enrichment is additive, never destructive (except archival)
- All enrichment is logged for user review

---

# Relationship-Centric Retrieval

The system should organize interaction histories by relationship.

Example:

```text
Relationships/
 ├── Player_Haleth/
 ├── Player_Aragorn/
 ├── Haleth_Aragorn/
```

This allows retrieval of:

- emotional history,
    
- recurring topics,
    
- unresolved tensions,
    
- shared experiences,
    
- trust progression.
    

---

# Relationship Evolution

Relationships should evolve dynamically.

## Decay Rates

| Emotion | Decay Rate | Half-Life |
|---------|-----------|-----------|
| `trust` | low | ~30 days of inactivity |
| `suspicion` | very_low | ~60 days |
| `loyalty` | low | ~30 days |
| `resentment` | very_low | ~90 days (lingers) |
| `attraction` | medium | ~14 days |
| `respect` | low | ~30 days |
| `fear` | medium | ~14 days |

## Decay Formula

```
new_value = current_value × (0.5 ^ (days_inactive / half_life_days))
```

## Evolution Triggers

| Event | Effect |
|-------|--------|
| Shared combat | trust +0.1, respect +0.05 |
| Betrayal | trust -0.3, resentment +0.2 |
| Helpful action | trust +0.05, loyalty +0.03 |
| Broken promise | trust -0.15, suspicion +0.1 |
| Deep conversation | trust +0.08, attraction ±0.05 |
| Shared secret | trust +0.1, loyalty +0.05 |

The goal is persistent emotional continuity.

---

# Obsidian-Style Storage

The system should support:

- markdown entries,
    
- backlinks (`[[wikilink]]` syntax),
    
- metadata (YAML frontmatter),
    
- graph relationships,
    
- editable lore,
    
- user overrides.
    

Example structure:

```text
Universe/
Locations/
NPCs/
Relationships/
Events/
Sessions/
StoryArcs/
Canon/
Generated/
```

## Backlink Format

```markdown
---
id: loc_eastern_ruins
name: Eastern Ruins
---

The ruins contain an [[Ancient Watchtower]] built by the elves.
Nearby: [[Bree]], [[Weather Hills]].

See also: [[Orc Activity in the East]], [[Haleth's Report]]
```

## Link Types

| Context Pattern | Inferred Link Type |
|----------------|-------------------|
| Location name | `located_in` / `nearby` |
| NPC name | `mentions` |
| Event name | `related_to` |
| "caused by", "result of" | `caused_by` |
| "part of", "within" | `part_of` |

---

# Metadata Example

```yaml
id: npc_haleth
name: Haleth
entity_type: npc
canon_status: generated
location: bree
importance: medium

relationships:
  - player
  - bree_rangers

tags:
  - ranger
  - suspicious
```

---

# Narrative Importance System

Every entity and memory should track importance.

Example:

```yaml
narrative_importance:
  emotional: high
  local: medium
  canonical: low
  recency: high
```

## Composite Score (for retrieval ranking)

```
score = (emotional × 0.35) + (local × 0.25) + (canonical × 0.20) + (recency × 0.20)
```

Values mapped: `low=1`, `medium=2`, `high=3`, `critical=4`. Max score = 16.

## Archival Thresholds

| Score | Action |
|-------|--------|
| ≤ 4 | Archive to cold storage (not retrieved by default) |
| 5-8 | Keep in database, low retrieval priority |
| 9-12 | Normal retrieval priority |
| 13-16 | Always include in context if relevant |

This helps:

- retrieval ranking,
    
- memory compression,
    
- archival decisions,
    
- context prioritization.
    

---

# Contradiction Prevention

Generated lore should remain provisional until validated.

## Validation States

| State | Description |
|-------|-------------|
| `generated_unverified` | AI-generated, not yet reviewed |
| `under_review` | Flagged for user review |
| `validated` | Confirmed consistent with canon |
| `rejected` | Contradicts canon, discarded |

## Workflow

1. AI generates lore (location detail, NPC backstory, event)
2. Lore stored with state: `generated_unverified`
3. Background job checks against `immutable_canon` rules
4. If potential contradiction found → state: `under_review`
5. User reviews in Lore Editor → validates or rejects
6. Validated lore becomes part of `soft_canon` or `generated_lore`

## Contradiction Detection

- Compare generated lore against `immutable_canon` entries
- Check for conflicting facts (e.g., character alive vs dead)
- Flag temporal impossibilities (event before timeline start)
- Use embedding similarity to find related canon entries for comparison

Example:

```yaml
state: generated_unverified
```

Later:

```yaml
state: validated
```

This prevents:

- canon corruption,
    
- recursive hallucinations,
    
- unstable lore continuity.
    

---

# User Overrides

Users can edit any lore entry, overriding AI-generated content.

## Override Workflow

1. User edits a lore entry (location, NPC, event)
2. System marks entry as `user_override: true`
3. AI-generated content for that field is discarded
4. Future AI generation respects the override
5. Override is logged in lore validations as `validated`

## Conflict Resolution

| Scenario | Resolution |
|----------|-----------|
| User edits validated lore | User edit wins, re-validate against canon |
| User edits unverified lore | User edit wins, skip validation (user is authority) |
| AI generates conflicting lore after user override | AI output discarded, override preserved |
| Multiple users edit same lore (group session) | Last writer wins, with edit history preserved |

---

# UI Specification

## Theme

- Dark modern theme with black and greys
- No bright colors except subtle accents

## Color Palette

| Role | Color |
|------|-------|
| Main background | `#0a0a0a` |
| Cards, panels | `#141414` |
| Modals, dropdowns | `#1e1e1e` |
| Hover states | `#282828` |
| Borders | `#2a2a2a` |
| Strong borders | `#3a3a3a` |
| Primary text | `#e8e8e8` |
| Secondary text | `#a0a0a0` |
| Muted text | `#666666` |
| Accent | `#4a9eff` |

## 30fps Refresh Rate System

The GUI renders at a capped 30fps to:

- Reduce CPU/GPU usage during long sessions
- Provide smooth but not excessive animation
- Keep narrative text rendering consistent
- Allow background processing without UI stutter

### What Updates at 30fps

| Component | Update Reason |
|-----------|---------------|
| Chat scroll position | Smooth auto-scroll during streaming |
| Typing indicators | Animated dots |
| Streaming text | Character-by-character reveal |
| FPS counter | Status bar display |
| Connection status | Live indicator |
| Job queue progress | Background job progress bars |
| Relationship visualizations | Animated emotion graphs |

### What Does NOT Update at 30fps

| Component | Update Trigger |
|-----------|---------------|
| Message list | New message received |
| Sidebar navigation | User interaction |
| Settings panels | User interaction |
| Lore editor | User interaction |
| Static content | Data change only |

---

# Text-to-Speech (TTS)

## Engine

- **Kokoro-82M** via [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)
- External server at `192.168.4.2:8880`
- OpenAI-compatible Speech endpoint
- CPU or GPU inference (server-side)

## Voice Discovery

The system auto-detects all available voices on startup by querying:

```
GET http://192.168.4.2:8880/v1/audio/voices
```

Response:
```json
{
  "voices": [
    "af_bella",
    "af_sky",
    "af_heart",
    "am_adam",
    "bf_emma",
    "bm_george",
    "ef_dora",
    "ff_siwis",
    "if_sara",
    "pf_dora",
    "hf_alpha",
    "jf_alpha",
    "zf_xiaobei"
  ]
}
```

- Voice discovery runs on application startup
- Re-discovery triggered manually via settings
- Unavailable voices are grayed out in the UI
- Voice metadata (language, gender) inferred from voice ID prefix:
  - `af_` = American Female
  - `am_` = American Male
  - `bf_` = British Female
  - `bm_` = British Male
  - `ef_` = Spanish Female
  - `ff_` = French Female
  - `if_` = Italian Female
  - `pf_` = Portuguese Female
  - `hf_` = Hindi Female
  - `jf_` = Japanese Female
  - `zf_` = Chinese Female

## Voice Assignment

Voices can be assigned to:

- **NPCs** — each NPC has a default voice
- **User characters** — players choose their character's voice
- **Narrator** — a separate voice for AI narration
- **Locations** — optional ambient voice for location descriptions

### NPC Voice Assignment

```yaml
npc:
  id: npc_haleth
  name: Haleth
  voice: af_bella
  voice_speed: 1.0
```

### User Character Voice

```yaml
character:
  name: Aragorn
  voice: am_adam
  voice_speed: 0.95
```

### Narrator Voice

- Configurable per-session or globally in user settings
- Default: `af_heart`

## Voice Combination

Kokoro supports weighted voice mixing for unique character voices:

```
"af_bella(2)+af_sky(1)"   # 67% bella, 33% sky
"am_adam+bm_george"       # 50/50 mix
```

The system supports:
- Simple combinations: `voice1+voice2` (equal weights)
- Weighted combinations: `voice1(3)+voice2(1)` (75%/25%)
- Saved combined voices stored per-user for reuse

## Speech Generation

### API Endpoint

```
POST http://192.168.4.2:8880/v1/audio/speech
```

Request:
```json
{
  "model": "kokoro",
  "input": "The ranger nods slowly.",
  "voice": "af_bella",
  "response_format": "mp3",
  "speed": 1.0
}
```

### Supported Output Formats

| Format | Use Case |
|--------|----------|
| `mp3` | Default, compressed, good quality |
| `wav` | Uncompressed, highest quality |
| `opus` | Low bandwidth, good for streaming |
| `flac` | Lossless compression |
| `m4a` | Apple devices |
| `pcm` | Raw audio for real-time playback |

### Streaming TTS

For real-time playback during narrative generation:

```
POST http://192.168.4.2:8880/v1/audio/speech
```

With `stream: true` — audio chunks returned as they're generated, enabling playback to begin before full generation completes.

### TTS in Chat

- AI-generated narrative text is automatically spoken using the assigned voice
- NPC dialogue is spoken using the NPC's assigned voice
- User messages are NOT spoken by default (configurable)
- TTS can be toggled per-session or globally
- Volume control per voice type (narrator, NPC, user)

## TTS Queue

TTS generation is asynchronous and queued:

1. AI response generated (text)
2. Text displayed immediately in chat
3. TTS job queued in background
4. Audio plays when ready (no blocking)
5. If TTS server unavailable, text-only mode activates automatically

## TTS Settings

| Setting | Scope | Default |
|---------|-------|---------|
| Enable TTS | Global / Per-session | Off |
| Narrator voice | Global | `af_heart` |
| NPC voice | Per-NPC | Auto-assigned |
| Speech speed | Global / Per-voice | 1.0 |
| Output format | Global | `mp3` |
| Auto-play | Per-session | On |
| Volume | Global | 80% |
| Skip TTS for long messages | Global | On (>500 chars) |

## TTS Health Check

- Ping `http://192.168.4.2:8880/v1/audio/voices` on startup
- Display TTS status in footer: `🔊 Connected` or `🔇 Unavailable`
- Retry with exponential backoff on failure
- Auto-reconnect when server becomes available

---

# Core System Goal

The final experience should feel like:

- a persistent narrative world,
    
- a living lore archive,
    
- an adaptive storytelling engine,
    
- a canon-aware roleplay framework.
    

The system should:

- remember important narrative events,
    
- preserve emotional continuity,
    
- retrieve only relevant context,
    
- expand lore carefully,
    
- maintain consistent characterization,
    
- generate only what the story needs.
    

The system should NOT attempt to fully simulate reality.
