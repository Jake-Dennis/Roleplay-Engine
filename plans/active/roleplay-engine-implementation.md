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
│   ├── relationships/     # Relationship data
│   ├── sessions/          # Session data
│   ├── events/            # Event records
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
    emotional_tone TEXT
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
    entity_type TEXT NOT NULL,        -- location, npc, memory, message, thread
    entity_id TEXT NOT NULL,
    text_content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

## 5. Ollama Integration

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

## 6. Dark Theme UI

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

## 7. 30fps Refresh Rate System

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

## 8. Background Job System

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

## 9. Retrieval Pipeline

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

## 10. Project Structure

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
│   │       │       ├── messages/route.js
│   │       │       └── invite/route.js
│   │       ├── generate/route.js    # Ollama generation proxy
│   │       ├── embed/route.js       # Embedding proxy
│   │       └── jobs/route.js        # Job queue management
│   │
│   ├── components/
│   │   ├── auth/
│   │   │   ├── LoginForm.js
│   │   │   └── RegisterForm.js
│   │   ├── chat/
│   │   │   ├── ChatWindow.js        # Main chat display
│   │   │   ├── MessageBubble.js     # Individual message
│   │   │   ├── MessageInput.js      # Input area
│   │   │   ├── StreamingText.js     # 30fps streaming text
│   │   │   └── TypingIndicator.js   # Animated dots
│   │   ├── layout/
│   │   │   ├── Header.js
│   │   │   ├── Sidebar.js
│   │   │   └── Footer.js
│   │   ├── session/
│   │   │   ├── SessionList.js
│   │   │   ├── SessionCreator.js
│   │   │   └── ParticipantList.js
│   │   ├── lore/
│   │   │   ├── LoreBrowser.js
│   │   │   ├── LoreEditor.js
│   │   │   └── LoreCard.js
│   │   ├── relationship/
│   │   │   ├── RelationshipGraph.js
│   │   │   └── EmotionBar.js
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
│   │   ├── render-loop.js           # 30fps render loop
│   │   ├── retrieval.js             # Context retrieval pipeline
│   │   ├── prompt-builder.js        # Prompt assembly
│   │   ├── embeddings.js            # Embedding management
│   │   └── idle-tracker.js          # User idle detection
│   │
│   ├── hooks/
│   │   ├── useRenderLoop.js         # 30fps hook
│   │   ├── useAuth.js               # Auth state
│   │   ├── useSession.js            # Session state
│   │   └── useStreaming.js          # Streaming text state
│   │
│   ├── middleware.js                # Auth middleware, route guards
│   │
│   └── workers/
│       ├── job-worker.js            # Background job processor
│       ├── summarizer.js            # Message summarization
│       ├── embedder.js              # Embedding generation
│       ├── relationship-analyzer.js # Relationship analysis
│       └── lore-expander.js         # Idle-time lore expansion
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

## 11. run.bat

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
echo.
echo Press Ctrl+C to stop.
echo.

:: Start Next.js dev server (or use `npm start` for production)
call npm run dev
```

---

## 12. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Project setup (Next.js, Tailwind, dependencies)
- [ ] Dark theme configuration
- [ ] Database schema creation
- [ ] run.bat startup script
- [ ] Ollama client with health check
- [ ] 30fps render loop system

### Phase 2: Authentication (Week 2-3)
- [ ] User registration (username + password)
- [ ] Login/logout with JWT
- [ ] Auth middleware
- [ ] Password change
- [ ] Session persistence

### Phase 3: Core Session (Week 3-4)
- [ ] Session CRUD
- [ ] Chat interface
- [ ] Message storage
- [ ] Ollama generation integration
- [ ] Streaming text with 30fps render
- [ ] Context retrieval pipeline

### Phase 4: Narrative Systems (Week 4-5)
- [ ] Universe management
- [ ] Location/NPC management
- [ ] Markdown lore storage
- [ ] Relationship tracking
- [ ] Narrative memory
- [ ] Prompt assembly

### Phase 5: Group Sessions (Week 5-6)
- [ ] Session invitations
- [ ] Participant management
- [ ] Shared vs private state
- [ ] Multi-user chat
- [ ] Turn management (optional)

### Phase 6: Background Jobs (Week 6-7)
- [ ] Job queue system
- [ ] Message summarization
- [ ] Embedding generation
- [ ] Relationship analysis
- [ ] Idle-time processing
- [ ] Lore expansion

### Phase 7: Polish (Week 7-8)
- [ ] Vector search with sqlite-vec
- [ ] Context compression
- [ ] Contradiction detection
- [ ] UI refinements
- [ ] Performance optimization
- [ ] Error handling

---

## 13. Dependencies

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

## 14. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **SQLite over PostgreSQL** | Single-user LAN deployment, no DB server needed, sqlite-vec integration |
| **Username-only auth** | User requirement, simpler UX, no email dependency |
| **Next.js App Router** | Built-in API routes, SSR for initial load, clean file routing |
| **Per-user data directories** | Clean isolation, easy backup/export, Obsidian-compatible |
| **30fps cap** | Reduces resource usage, sufficient for narrative UI, prevents GPU waste |
| **run.bat over Docker** | User requirement, simpler Windows deployment, direct hardware access |
| **External Ollama** | Offloads GPU requirements, shared inference server |
| **Markdown + SQLite hybrid** | Human-readable lore files, fast metadata queries, vector search |

---

## 15. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ollama server unreachable | High | Health checks, queued requests, user notification |
| SQLite concurrency limits | Medium | WAL mode, connection pooling, single-writer pattern |
| Context window overflow | Medium | Strict budget allocation, compression fallback |
| Group session sync issues | Medium | Server-authoritative state, optimistic UI updates |
| Embedding performance | Low | Async processing, batch operations |

---

## Confidence

- **MEDIUM**

### Uncertainty Sources:
- Ollama API compatibility with Qwen3.5:9B (model availability may vary)
- sqlite-vec performance characteristics at scale
- Exact token counts for context budget (requires empirical testing)
- BGE-M3 embedding model availability on the target Ollama instance
