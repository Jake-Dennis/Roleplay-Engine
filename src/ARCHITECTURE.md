# Project Architecture Reference — Roleplay Engine

> **Purpose**: This is the AI agent's complete mental model of the project. Read this file first before any task. It documents architecture decisions, data flow, patterns, anti-patterns, and subsystem interactions.

---

## 1. Quick Start (For AI Context Loading)

**What this is**: A Next.js 16 App Router application for AI-assisted narrative roleplay. Users write stories with AI (Ollama, self-hosted), build a persistent wiki of their world, track character relationships, get TTS narration, and play in solo or group sessions.

```
Roleplay-Engine/
├── src/
│   ├── app/               # Next.js App Router (94 API routes + 31 frontend pages)
│   ├── components/        # 71 React components (12 feature dirs, 66% client)
│   ├── contexts/          # 2 context providers (app-context, active-universe shim)
│   ├── hooks/             # 10 custom hooks ({data, loading, error, refresh})
│   ├── lib/               # 37 flat utilities + wiki/ subsystem (14 files)
│   └── proxy.ts           # Next.js proxy (CSRF, IP extraction, request ID, replaces middleware)
├── data/                  # Runtime data (gitignored): SQLite DBs + wiki markdown
├── scripts/               # init-db.ts (DB schema + seed), migration scripts
├── docs/                  # Wiki migration guide + schema reference
└── graphify-out/          # Knowledge graph artifacts (codebase analysis)
```

**Key counts**: 333 source files, ~51k LOC, 94 API routes, 16 DB tables + 3 vec0 tables + 17 indexes, 8 external npm dependencies, 0 test framework (bun test ready).

**Run commands**:
```bash
npm run dev      # Next.js dev server, binds 0.0.0.0:3000
npm run build    # Production build
npm run start    # Production server, binds 0.0.0.0
npm run lint     # ESLint (flat config, core-web-vitals + typescript)
bun test         # If tests exist
```

---

## 2. System Architecture

### Narrative Pipeline (Conceptual)

```
User Input
    ↓
Intent Analysis (keyword → semantic)
    ↓
Scene Retrieval (active location, NPCs, tone)
    ↓
Relationship Retrieval (emotional state, shared history)
    ↓
Narrative Memory Retrieval (past events, threads)
    ↓
Lore Retrieval (nearby wiki entries, canon rules)
    ↓
Context Compression (budget: 8192 tokens total)
    ↓
Prompt Assembly (structured sections)
    ↓
LLM Generation (Ollama → Qwen3.5:9B)
    ↓
Store Interaction + Queue Background Jobs
    ↓
Return Response Immediately (async enrichment)
```

### Core Philosophy
- **Narrative-first**: Generate only what is narratively relevant. NOT a world simulator.
- **Incremental expansion**: The world deepens only when the story touches it.
- **Async by default**: Chat NEVER waits for embeddings, summarization, indexing, or enrichment.
- **Relationship-centric**: Character memory is organized by relationship, not chronology.

### Deployment Topology
```
[Windows Host]
├── Node.js + Next.js (dev/prod server, 0.0.0.0:3000)
├── SQLite (single file: data/global.db) — WAL mode, no connection pool
├── Per-user vector DBs (data/{userId}/embeddings.db) — sqlite-vec
└── Wiki markdown files (data/{userId}/wiki/)

[External Servers (192.168.4.2)]
├── Ollama (11434) — qwen3.5:9b generation, bge-m3 embeddings
└── Kokoro-FastAPI (8880) — Kokoro-82M TTS, OpenAI-compatible speech endpoint
```

### Request → Response Data Flow

```
Browser
  → Next.js Proxy (src/proxy.ts, replaces Edge middleware)
    → CSRF check, real-ip extraction, request ID generation
  → Route Handler (src/app/api/**/route.ts)
    → Auth check (withAuth() or getAuthToken())
    → Rate limit check (checkRateLimit())
    → Validation (requireJson() → returns Response | null)
    → Business logic (SQL queries, Ollama calls, etc.)
    → Response (NextResponse.json)
  → Error wrapper (withErrorHandler() catches thrown errors)
```

---

## 3. Database Layer

### Connection Management

**File**: `src/lib/db.ts`
- **Driver**: better-sqlite3 (synchronous, single-connection)
- **Singleton**: Module-level `let db: Database | null` — initialized on first call to `getDb()`
- **WAL mode**: Enabled for concurrent read performance
- **Foreign keys**: Enforced via `PRAGMA foreign_keys = ON`
- **No connection pool**: Single connection, synchronous. SQLite handles concurrency via WAL.

### Schema Overview

**Global DB** (`data/global.db`)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | Account storage | `id, username, password_hash, settings, password_changed_at` |
| `sessions` | Roleplay sessions | `id, user_id, title, universe_id, scene_state` |
| `session_participants` | Session membership | `session_id, user_id, character_name, role` |
| `messages` | Chat history | `id, session_id, user_id, speaker, content, parent_id, is_deleted` |
| `events` | Narrative events | `id, session_id, type, location, participants, outcome, importance` |
| `narrative_memories` | Persistent story memories | `id, session_id, type, content, importance_score` |
| `scene_states` | Current scene context | `id, session_id, location, active_npcs, emotional_tone, narrative_threads` |
| `relationships` | Character relationships | `id, user_id, character_a, character_b, emotional_state, stage, shared_history` |
| `relationship_evolution` | Relationship change log | `relationship_id, event_type, emotional_delta` |
| `relationship_files` | Relationship markdown | `relationship_id, content, updated_at` |
| `narrative_threads` | Active story threads | `id, session_id, title, status, escalation_level` |
| `job_queue` | Background job queue (referenced as `jobs` in some legacy code) | `id, user_id, type, status, priority, payload, retry_count, max_retries` |
| `invitations` | Group session invites | `id, session_id, inviter_id, invitee_id, status` |
| `token_denylist` | Revoked JWT tokens | `token_id, expires_at` |
| `voice_assignments` | TTS voice mapping | `id, user_id, entity_type, entity_id, voice_id` |
| `tts_cache` | Cached TTS audio | `id, user_id, text_hash, audio_path, last_used, use_count` |
| `backlinks` | Wiki link graph | `id, source_page, target_page, link_type` |
| `session_config` | Session turn mode/key-value config | `session_id, key, value` |
| `universes` | World-building definitions | `id, user_id, name, description, canon_mode, lore_source, tone, boundaries` |
| `timelines` | Timeline definitions | `id, user_id, universe_id, era, year, restrictions, active_factions` |
| `timeline_layers` | Eras, factions, active characters | `id, user_id, timeline_id, universe_id, layer_type, name, metadata` |
| `npcs` | NPC character definitions | `id, user_id, universe_id, name, description, personality_traits, is_canon` |
| `locations` | Location definitions | `id, user_id, universe_id, name, description, known_info, hidden_info, tags` |
| `message_summaries` | Per-message summary data | `id, source_message_id, summary_type, content, emotional_tone` |
| `embedding_index` | Embedding entity registry | `id, user_id, entity_type, entity_id, text_content` |
| `embedding_vectors` | Embedding vector (JSON) storage | `embedding_id, vector_data` |
| `wiki_versions` | Wiki page version history | `id, page_path, user_id, version_number, file_snapshot_path` |
| `entity_validations` | Lore validity state tracking | `id, user_id, entity_type, entity_id, state` |
| `contradiction_flags` | Wiki lint contradiction records | `id, user_id, entity_name, page_a, page_b, claim_a, claim_b, severity, status` |
| `entity_mentions` | Entity mention frequency tracking | `id, user_id, entity_name, source_table, source_id, frequency` |
| `narrative_anchors` | Irreversible story anchors | `id, relationship_id, user_id, anchor_type, description, irreversible` |
| `decision_points` | Story decision branch records | `id, session_id, user_id, prompt, choices_made, narrative_context` |
| `groups` | User groups | `id, owner_id, name, description` |
| `group_members` | Group membership | `group_id, user_id, role` |
| `personas` | Character cards (SillyTavern-style) | `id, user_id, name, description, personality, system_prompt, tags, is_active` |

**Total**: ~33 tables across the base schema (20 in `scripts/init-db.ts`) plus on-demand additions (groups, group_members, personas via `group-migrations.ts`) and a small number of tables created inline in route handlers (`session_config`, `invitations`).

**Virtual Tables**

| Table | Type | Purpose |
|-------|------|---------|
| `messages_fts` | FTS5 | Full-text search over message content (auto-synced via triggers on `messages`) |
| `vec_messages` | vec0 (sqlite-vec) | 1024-dim message vector embeddings for semantic search |
| `vec_npcs` | vec0 (sqlite-vec) | 1024-dim NPC vector embeddings |
| `vec_memories` | vec0 (sqlite-vec) | 1024-dim narrative memory vector embeddings |

> **Note**: `vec0` tables are created conditionally inside a try-catch — they only exist if the sqlite-vec extension loads successfully. Without the extension, vector search falls back to keyword-only. The `vec_lore` table for location embeddings was added to `scripts/init-db.ts` alongside `vec_messages`, `vec_npcs`, and `vec_memories`.

**Indexes**: 30+ total — covers `user_id`, `session_id`, `status`, `created_at`, plus compound indexes for frequent query patterns:

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_messages_session` | `(session_id, timestamp)` | Chat history listing |
| `idx_messages_session_deleted_ts` | `(session_id, is_deleted, timestamp)` | Filtered message queries |
| `idx_sessions_owner` | `(owner_id)` | User's session listing |
| `idx_job_queue_status` | `(status, priority)` | Job queue processing |
| `idx_jobs_user_status_type` | `(user_id, status, type, priority)` | Per-user job queries |
| `idx_embedding_user_type` | `(user_id, entity_type)` | Embedding lookups |
| `idx_contradiction_flags_user` | `(user_id)` | Contradiction queries |
| `idx_decision_points_session` | `(session_id)` | Decision point lookups |
| `idx_session_config_lookup` | `(session_id, key)` | Config key-value access |
| `idx_wiki_versions_page` | `(page_path, user_id)` | Wiki version history |
| `idx_memories_user_created_importance` | `(user_id, created_at, importance)` | Memory retrieval ranking |

### Basic Query Pattern
```typescript
import { getDb } from '@/lib/db';
const db = getDb();
// SELECT
const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
// INSERT
db.prepare("INSERT INTO sessions (id, name, owner_id) VALUES (?, ?, ?)").run(id, name, ownerId);
// Always use ? parameters — NO string interpolation in SQL
```

### Migration System

There is no formal migration framework. Instead, the project uses two complementary strategies:

**Startup Migrations** (`src/instrumentation.ts` → `src/lib/schema-migrations.ts`)

`instrumentation.ts` calls `runSchemaMigrations()` on every Node.js startup. This file contains 30+ individual migration steps, each wrapped in try-catch for idempotency:

```typescript
// Pattern: ALTER TABLE ADD COLUMN (idempotent via try-catch)
try {
  db.prepare("ALTER TABLE scene_states ADD COLUMN current_intent TEXT").run();
} catch {
  // Column already exists — safe to ignore
}

// Pattern: CREATE TABLE IF NOT EXISTS
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS contradiction_flags (...) `).run();
} catch {
  // Table already exists — safe to ignore
}
```

These migrations add:
- Tables added after initial schema: `token_denylist`, `events`, `entity_mentions`, `contradiction_flags`, `relationship_evolution`, `narrative_anchors`, `decision_points`
- Columns added to existing tables: `password_changed_at` (users), `current_intent`/`scene_type`/`scene_tension`/`conflict_type`/`stakes` (scene_states), `narrative_tension`/`pacing`/`narrative_phase`/`active_goals`/`active_conflicts` (sessions), `description`/`arc_type`/`updated_at`/`resolved_at`/`name`/`summary`/`key_entities`/`unresolved_items` (narrative_threads), `time_period` (universes), polymorphic fields `message_id`/`summary_type`/`content` (message_summaries)
- Indexes for performance

**On-Demand Migrations** (`src/lib/group-migrations.ts`)

Group-related schema changes are applied lazily via `ensureGroupSupport()` at the start of any API route that needs group features:

```typescript
export function ensureGroupSupport(db: DbDatabase) {
  db.exec("PRAGMA foreign_keys = OFF"); // Disable FK checks during migration
  db.exec("CREATE TABLE IF NOT EXISTS groups (...)");
  db.exec("CREATE TABLE IF NOT EXISTS group_members (...)");
  db.exec("CREATE TABLE IF NOT EXISTS personas (...)");
  // ALTER TABLE ADD COLUMN for: group_id, type, canon_layer, last_active_*_id, persona_id
  db.exec("PRAGMA foreign_keys = ON");
}
```

This pattern adds: `groups`, `group_members`, `personas` tables + alters `sessions`, `universes`, `messages`, `users`, `npcs`, `locations` and `personas` with new columns.

**Inline Table Creation**: Some routes create tables on-the-fly (`invitations` in the invite route) using `CREATE TABLE IF NOT EXISTS` before their first operation. This is an older pattern — newer tables go through `schema-migrations.ts` instead.

### Connection Lifecycle

```
Startup (instrumentation.ts)
  │
  ├── runSchemaMigrations()          # Idempotent ALTER TABLE / CREATE
  ├── runStartupChecks()             # JWT_SECRET, data dir writable, DB ping, Ollama warn
  ├── setupGracefulShutdown()        # Registers SIGTERM/SIGINT handlers
  └── recoverStaleJobs()             # Marks "processing" jobs as "failed"

First API call triggers getDb() in db.ts:
  │
  ├── 1. Check module-level `db` singleton — return if alive
  ├── 2. Create data/ directory if missing
  ├── 3. new Database(dbPath) — opens global.db
  ├── 4. PRAGMA journal_mode = WAL
  ├── 5. PRAGMA wal_autocheckpoint = 1000
  ├── 6. PRAGMA foreign_keys = ON
  ├── 7. PRAGMA cache_size = -64000 (64 MB)
  ├── 8. PRAGMA busy_timeout = 5000 (5s lock wait)
  ├── 9. Load sqlite-vec extension (try candidates per platform)
  │       └── Fallback: set vecLoaded = false if extension not found
  └── 10. Return db singleton

Shutdown (SIGTERM/SIGINT → shutdown.ts):
  │
  ├── drainEventBus()                # Close SSE streams
  ├── failProcessingJobs()           # UPDATE job_queue SET status='failed'
  ├── checkpointDb()                 # WAL checkpoint (TRUNCATE)
  └── closeDb()                      # db.close(), db = null
```

Key details:
- **Singleton**: Module-level `let db: Database.Database | null` — initialized once, never re-opened.
- **vec extension**: Tries platform-specific `.dll`/`.dylib`/`.so` from `node_modules/sqlite-vec-{platform}/`. Loaded at most once.
- **No connection pool**: Single synchronous connection. WAL mode handles concurrent reads via shared memory.
- **5s shutdown timeout**: All shutdown steps race against a 5-second timeout to prevent hanging.

### Query Patterns

The codebase uses 553+ `db.prepare()` calls across 97 files. The following 7 patterns cover the majority:

**1. Access-Check-Fetch (most common)**
```typescript
// Verify ownership/access before operating
const session = db.prepare(`
  SELECT * FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (
    SELECT session_id FROM session_participants WHERE user_id = ?
  ))
`).get(sessionId, userId, userId);
if (!session) return notFoundError("Session");
```

**2. Multi-Table JOIN**
```typescript
// Embedding lookup: index → vector
const result = db.prepare(`
  SELECT ev.vector_data
  FROM embedding_index ei
  JOIN embedding_vectors ev ON ei.id = ev.embedding_id
  WHERE ei.entity_type = ? AND ei.entity_id = ?
`).get(entityType, entityId);

// Evolution + relationship
const rows = db.prepare(`
  SELECT re.*, r.source_entity, r.target_entity
  FROM relationship_evolution re
  JOIN relationships r ON re.relationship_id = r.id
  WHERE r.universe_id = ?
  ORDER BY re.recorded_at DESC
`).all(universeId);

// FTS5 search
const results = db.prepare(`
  SELECT m.*, snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
  FROM messages m
  JOIN messages_fts f ON m.rowid = f.rowid
  WHERE m.session_id = ? AND messages_fts MATCH ?
  ORDER BY m.timestamp DESC LIMIT 50
`).all(sessionId, escapedQuery);
```

**3. Cursor-Based Pagination**
```typescript
// Used by narrative-threads, narrative-memories, backlinks, timeline, etc.
let query = "SELECT * FROM narrative_threads WHERE user_id = ?";
const params: unknown[] = [userId];

if (cursor) {
  const cursorRow = db.prepare(
    "SELECT updated_at FROM narrative_threads WHERE id = ? AND user_id = ?"
  ).get(cursor, userId);
  if (cursorRow) {
    query += " AND (updated_at, id) < (?, ?)";
    params.push(cursorRow.updated_at, cursor);
  }
}

query += " ORDER BY updated_at DESC, id DESC LIMIT ?";
params.push(limit + 1);

const rows = db.prepare(query).all(...params);
let nextCursor = rows.length > limit ? rows[rows.length - 1].id : null;
```

**4. Dynamic Query Building**
```typescript
// Gradual WHERE clause assembly — used in listing endpoints
let query = "SELECT id, session_id, type, content FROM narrative_memories WHERE user_id = ?";
const params: unknown[] = [userId];

if (sessionId) { query += " AND session_id = ?"; params.push(sessionId); }
if (universeId) { query += " AND universe_id = ?"; params.push(universeId); }
// ... more optional filters

query += " ORDER BY created_at DESC, id DESC LIMIT ?";
params.push(limit + 1);
const memories = db.prepare(query).all(...params);
```

**5. EXISTS Subqueries**
```typescript
// Find entities missing embeddings (used in embeddings.ts)
const missing = db.prepare(`
  SELECT 'message' as entity_type, m.id as entity_id
  FROM messages m
  WHERE m.session_id IN (SELECT id FROM sessions WHERE owner_id = ?)
    AND m.is_deleted = 0
    AND m.id NOT IN (SELECT entity_id FROM embedding_index WHERE entity_type = 'message')
  LIMIT 90
`).all(userId);
```

**6. GROUP BY Aggregation**
```typescript
// Job queue status breakdown
const counts = db.prepare(
  "SELECT status, COUNT(*) as count FROM job_queue WHERE user_id = ? GROUP BY status"
).all(userId);

// Embedding entity type distribution
const typeCounts = db.prepare(
  "SELECT entity_type, COUNT(*) as count FROM embedding_index WHERE user_id = ? GROUP BY entity_type"
).all(userId);

// Frequent entity mentions
const topEntities = db.prepare(
  "SELECT entity_name FROM entity_mentions WHERE user_id = ? AND frequency > 1 GROUP BY entity_name ORDER BY MAX(frequency) DESC LIMIT 5"
).all(userId);
```

**7. UNION ALL (composite entity queries)**
```typescript
// Find all entities needing embeddings across tables
const missing = db.prepare(`
  SELECT 'message' as entity_type, m.id as entity_id FROM messages m WHERE ...
  UNION ALL
  SELECT 'location' as entity_type, l.id as entity_id FROM locations l WHERE ...
  UNION ALL
  SELECT 'npc' as entity_type, n.id as entity_id FROM npcs n WHERE ...
  LIMIT 90
`).all(userId, ...params);
```

### Data Flow

**Write Path**
```
API Route → validate input → getDb() → db.prepare("INSERT/UPDATE/DELETE ...").run(...)
  ├── INSERT into messages → FTS5 triggers auto-sync messages_fts
  ├── INSERT with FK → SQLite enforces referential integrity
  ├── Jobs written to job_queue → idle-processing picks up on next heartbeat
  └── WAL mode → writes committed to WAL file, checkpointed periodically
```

**Read Path**
```
API Route → getDb() → db.prepare("SELECT ...").get()/.all()
  ├── Single row: .get() → returns first row or undefined
  ├── Multiple rows: .all() → returns array
  ├── Cursor pagination: query with (updated_at, id) < (?, ?) + LIMIT
  └── FTS5: MATCH clause with snippet() highlighting
```

**Background Job Flow**
```
idle-processing.ts heartbeat (5/10/15/30 min tiers)
  → job-processor.ts
  → db.prepare("SELECT * FROM job_queue WHERE status = 'queued' ORDER BY priority LIMIT 5")
  → Process each job (Ollama calls, wiki operations, etc.)
  → UPDATE job_queue SET status = 'completed'/'failed'
  → On shutdown: failProcessingJobs() marks in-flight as 'failed'
```

**Startup Flow** (see Connection Lifecycle diagram above)
```
instrumentation.ts → register()
  │
  ├── runSchemaMigrations()     # Idempotent ALTER TABLE / CREATE TABLE
  ├── runStartupChecks()        # JWT check, data dir, DB ping, Ollama
  ├── setupGracefulShutdown()   # SIGTERM/SIGINT handlers
  └── recoverStaleJobs()        # job_queue status='processing' → 'failed'
```

**Shutdown Flow** (see Connection Lifecycle diagram above)
```
SIGTERM/SIGINT → setupGracefulShutdown()
  │
  ├── 1. drainEventBus()        # Close all SSE ReadableStreams
  ├── 2. failProcessingJobs()   # UPDATE job_queue SET status='failed', error='server shutdown'
  ├── 3. checkpointDb()         # WAL checkpoint TRUNCATE
  └── 4. closeDb()              # db.close(), null the singleton
```

### Hot Tables (Write Frequency)

Based on 553+ `db.prepare()` calls across 97 files, the tables with the highest write volume:

| Table | Write Ops | Why |
|-------|-----------|-----|
| `messages` | Highest | Every user message + every AI response is INSERTed; edits and deletions also hit this table |
| `job_queue` | Very high | Jobs created on session activity, updated on completion — each beat creates/updates rows |
| `narrative_memories` | High | Generated/compressed on session turns and idle processing |
| `embedding_index` / `embedding_vectors` | High | Generated for every message, NPC, and location on idle cycles |
| `relationship_evolution` | Medium | Recorded on every relationship analysis pass |
| `contradiction_flags` | Medium | Created during wiki linting cycles |
| `event_bus` (SSE) | N/A (in-memory) | Not persisted in SQLite — all SSE events are in-process only |

Files with the most `db.prepare()` usage: `schema-migrations.ts` (44), `jobs/queue.ts` (24), `embeddings.ts` (18), `sessions/[id]/route.ts` (18), `memory-compression.ts` (14), `turn/route.ts` (13), `retrieval.ts` (12), `universes/[id]/route.ts` (12), `relationship-decay.ts` (12).

### Edge Cases & Issues

- **~~`vec_lore` gap~~ (RESOLVED)**: `src/lib/embeddings.ts` line 271 maps `entityType === "location"` to a vec0 table named `vec_lore`. This table is now created in `scripts/init-db.ts` alongside `vec_messages`, `vec_npcs`, and `vec_memories`. Location embeddings vector search now works correctly when sqlite-vec is available.

- **~~`session_config` legacy~~ (RESOLVED)**: The `session_config` schema has been standardized to `PRIMARY KEY (session_id, key)` in `scripts/init-db.ts`. The turn route's local `CREATE TABLE IF NOT EXISTS` (which already used the correct composite key) has been removed — init-db.ts is now the single source of truth for this table. Newly created databases get the correct schema; existing databases with the old `id TEXT PRIMARY KEY` schema remain functional but may still have the extraneous `id` column (see migration note below).

- **Missing vec0 fallback**: The three vec0 tables (`vec_messages`, `vec_npcs`, `vec_memories`) only exist if sqlite-vec loaded successfully at startup. Without them, vector search degrades to keyword-only via `embedding_vectors` JSON storage + brute-force similarity. The `isVecAvailable()` function in `db.ts` exposes this state but not all callers check it.

- **Migration version tracking**: There is no `schema_version` table or migration number tracking. All migrations are idempotent by design (try-catch for ALTER TABLE, IF NOT EXISTS for CREATE). This means there is no way to know which migrations have run or detect conflicting schemas across environments. A mismatch between the init-db.ts schema and what migrations assume already exists can cause silent failures (the catch block swallows all errors).

- **On-demand vs startup**: Group migrations run lazily in route handlers. If a route that calls `ensureGroupSupport()` is never hit, those tables never exist — yet other parts of the code may query them and get "no such table" errors.

---

## 4. API Layer

### Structure
94 route handlers across `src/app/api/`. Each route is a `route.ts` file exporting HTTP method handlers (GET, POST, PUT, DELETE, PATCH).

### Route Groups

| Group | Endpoints | Description |
|-------|-----------|-------------|
| `auth/` | login, register, logout, me, password | Authentication CRUD |
| `sessions/[id]/` | turn, stream, messages, scene, participants, invite, join, leave, kick, export, persona, private-state, retrieval-context, recap | Session management + chat |
| `sessions/[id]/messages/` | list, search, single, regenerate, edits | Message operations |
| `wiki/` | list, CRUD, query, ingest, lint, graph, history, templates, validate, file, sources, log, index, split-suggestions | Wiki subsystem |
| `relationships/` | CRUD, evolution, decay, file | Relationship management |
| `timelines/` | CRUD, layers | Timeline management |
| `personas/` | CRUD, active, activate | Character management |
| `npcs/` | CRUD | NPC management |
| `tts/` | generate, stream, voices, cache, combine | TTS generation |
| `admin/` | entities, contradictions | Admin operations |
| `jobs/` | list, create, stream | Background job management |
| `health/` | status, live, ready | Health checks |
| `generate/` | streaming generation | LLM generation |
| Other | universes, groups, settings, backlinks, search, contradictions, ollama | Misc |

### Auth Coverage
- **withAuth HOF** (preferred): Used by ~14 route files. Pattern: `const auth = await withAuth(request); if ('error' in auth) return auth.error;`
- **getAuthToken inline**: Used by remaining routes. Pattern: `const token = getAuthToken(request); if (!token) return unauthorizedError();`
- **Intentionally public**: login, register, health/* (no auth required)

### Error Handling Coverage
- **withErrorHandler HOF**: Wraps handler in try/catch. Used by 53/94 routes (~56%).
- **Inline try/catch**: Used by remaining ~41 routes.
- **Uncaught errors**: `requireJson()` used to throw (now returns Response|null). Routes without withErrorHandler could miss throws.

---

## 5. Auth & Security

### JWT Authentication Flow
```
Register/Login → Server hashes password (bcrypt, 12 rounds) → Creates JWT (jose, HS256)
  → Sets httpOnly cookie "auth-token" → Client sends cookie automatically
  → Route handler calls withAuth(request) → getAuthToken extracts from cookie
  → verifyToken decodes JWT, checks denylist, checks password_changed_at
  → Returns AuthContext { userId, decoded } or 401
```

### Token Structure
```typescript
interface AuthToken {
  sub: string;           // user.id (UUID)
  username: string;
  jti: string;           // Token ID (UUID, for revocation)
  iat: number;           // Issued at (epoch seconds)
  exp: number;           // Expiry (24 hours from iat)
  pwd_changed_at: string | null;  // For invalidating tokens after password change
}
```

### Cookie Configuration

| Property | Value |
|----------|-------|
| Name | `auth-token` |
| httpOnly | true |
| secure | `true` in production (`NODE_ENV === 'production'`) |
| sameSite | `strict` (CSRF defense in depth) |
| maxAge | 86400 (24 hours) |
| path | `/` |

There is no Authorization header support. Auth is cookie-only.

### Key Files
| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | Password hashing, JWT sign/verify, user CRUD, token denylist |
| `src/lib/auth-token.ts` | Extract token from httpOnly cookie or Authorization header |
| `src/lib/auth-edge.ts` | Lighter verify for Edge middleware (no fs access) |
| `src/lib/with-auth.ts` | Route HOF: `await withAuth(request)` → `{ auth } | { error }` |
| `src/proxy.ts` | CSRF, IP extraction, request ID for all routes (Next.js 16 proxy, replaces middleware) |

### Auth Patterns

Three auth verification patterns exist across route handlers:

**Pattern A: `withAuth()` HOF** (`src/lib/with-auth.ts`)
Used by 13 routes (14%). Wraps handler, returns `{ auth, handler }` or 401. Cleanest pattern for controllers.

**Pattern B: `getAuthToken()` utility** (`src/lib/auth-token.ts`)
Used by 67+ routes (71%). Inline pattern: `const token = getAuthToken(request); if (!token) return unauthorizedError();`.

**Pattern C: `verifyAuth()` local helper** (`src/app/api/tts/voices/route.ts`)
Used by 1 route. Defined locally in the route file:
```typescript
async function verifyAuth(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  return null; // success
}
```
Pattern C avoids the HOF wrapper for routes with non-standard error handling. It's a local helper rather than a shared import.

### Proxy (Next.js 16, replaces Edge middleware)
```typescript
// src/proxy.ts — Runs on every request matching the config matcher
// What it does:
// 1. Extracts real client IP (spoofing-resistant via request.ip)
// 2. Generates unique request ID (x-request-id header)
// 3. CSRF protection for state-changing methods (POST, PUT, DELETE, PATCH)
// 4. Redirects authenticated users away from login/register
// 5. Sets X-Real-Ip header for route handlers

// What it does NOT do:
// - Does NOT enforce auth on protected routes (handled client-side + per-route)
// - protectedRoutes array is intentionally empty []
```

#### Proxy Exclusions
The proxy matcher explicitly EXCLUDES:
- `_next/static`, `_next/image`, `favicon.ico` (Next.js internals)
- `/api/tts`, `/api/generate`, `/api/embed` (SSE/streaming endpoints bypass middleware)

SSE/streaming connections would be disrupted by proxy processing, so these paths are excluded at the matcher level.

### CSRF Protection
- Checked in proxy for POST/PUT/DELETE/PATCH
- Validates Origin header against Host header
- Fallback: checks X-Requested-With for same-origin AJAX
- **NOTE**: Currently skipped in dev mode (`NODE_ENV !== 'development'`)
- Falls back to X-Requested-With if no Origin/Referer

### Rate Limiter
- **File**: `src/lib/rate-limiter.ts`
- **Current**: In-memory Map<string, RateLimitEntry> — **NOT production-safe for multi-instance**
- **IP extraction**: Via `x-real-ip` header set by proxy (spoofing-resistant, replaces middleware)
- **Cleanup**: Periodic sweep every 5 minutes of expired entries

#### Rate Limiter Tiers

| Tier | Window | Max Req | Key Pattern | Used By |
|------|--------|---------|-------------|---------|
| auth | 15 min | 10 | `auth:${ip}` | Login, Register |
| generate | 1 min | 5 | `generate:${userId}` | LLM generation |
| upload | 1 min | 20 | `upload:${userId}` | Wiki upload |
| api | 1 min | 100 | `api:${ip}` | Default fallback |
| message_send | 1 min | 5 | `message_send:${userId}` | Session messages |
| wiki_write | 1 min | 10 | `wiki_write:${ip}` | Wiki page create/update/delete |
| user_search | 1 min | 20 | `user_search:${userId}` | User search |
| create_resource | 1 min | 5 | `create_resource:${userId}` | Group creation |
| persona_npc | 1 min | 10 | `persona_npc:${userId}` | NPC/Persona creation |
| invitations | 1 min | 5 | `invitations:${userId}` | Invitation listing |
| tts_stream | 1 min | 10 | `tts_stream:${userId}` | TTS streaming |
| wiki_read | 1 min | 100 | `wiki_read:${ip}` | Wiki read operations |
| wiki_query | 1 min | 10 | `wiki_query:${ip}` | Wiki LLM query |
| tts_generate | 1 min | 20 | `tts_generate:${ip}` | TTS generation |
| session_read | 1 min | 60 | `session_read:${ip}` | Session read |
| session_write | 1 min | 30 | `session_write:${ip}` | Session update |
| relationship_write | 1 min | 30 | `relationship_write:${ip}` | Relationship CRUD |
| persona_write | 1 min | 20 | `persona_write:${ip}` | Persona CRUD |
| npc_write | 1 min | 20 | `npc_write:${ip}` | NPC CRUD |
| universe_write | 1 min | 10 | `universe_write:${ip}` | Universe CRUD |
| timeline_write | 1 min | 20 | `timeline_write:${ip}` | Timeline CRUD |
| narrative_write | 1 min | 20 | `narrative_write:${ip}` | Narrative threads |
| group_write | 1 min | 20 | `group_write:${ip}` | Group CRUD |
| password_change | 1 min | 5 | `password_change:${ip}` | Password change |
| jobs_trigger | 1 min | 10 | `jobs_trigger:${ip}` | Job triggers |
| search | 1 min | 30 | `search:${ip}` | Search |
| health | 1 min | 30 | `health:${ip}` | Health probes |

#### Route Coverage Statistics

| Metric | Count |
|--------|-------|
| Total `route.ts` files | 94 |
| Files using `withAuth()` (Pattern A) | 13 (14%) |
| Files using `getAuthToken()` (Pattern B) | 67+ (71%) |
| Files using `verifyAuth()` (Pattern C) | 1 (1%) |
| Files using `withErrorHandler()` | 52 (55%) |
| Files using `checkRateLimit()` | 92 (98%) |
| Auth-specific routes | 5 (login, register, logout, me, password) |

### Error Response Patterns
```typescript
// Standard error responses — always { error: string, requestId: string }
errorResponse("message", 400)       // Bad request
notFoundError("resource")           // 404
unauthorizedError()                 // 401
forbiddenError()                    // 403
serverError(error)                  // 500
badRequestError("message")          // 400
requireJson(request)                // Returns Response|null (415 if not JSON)
```

### Graceful Degradation

The auth system includes several graceful degradation paths:

- **`revokeToken()`**: Catches DB failures silently. Logout always succeeds even if the denylist write fails.
- **`cleanupExpiredDenylistEntries()`**: Uses empty catch blocks. Expired entry cleanup is best-effort, never blocking.
- **Token verification fallback**: The denylist check happens AFTER JWT decode. If the DB check fails, the token is still accepted (degraded to allow access rather than deny).

---

## 6. Frontend Architecture

### Route Groups

```
src/app/
├── page.tsx               # Redirect → /login
├── login/                 # Outside (app) — no sidebar
├── register/              # Outside (app) — no sidebar
├── (app)/                 # Route group — authenticated, sidebar layout
│   ├── layout.tsx         # AppProvider + AppLayoutShell
│   ├── app-layout-shell.tsx  # Sidebar nav + main content (client component)
│   ├── error.tsx          # Group-level error boundary
│   ├── global-error.tsx   # Root error boundary (<html><body> required)
│   ├── not-found.tsx      # 404 page
│   ├── loading.tsx        # Suspense fallback
│   └── 13 route groups: dashboard, session, timeline, wiki, settings, etc.
```

### Component Tree
```
AppLayoutShell
├── Sidebar (navigation, universe selector, user menu)
└── Main Content
    ├── Dashboard (overview, active sessions, recent wiki)
    ├── Session View
    │   ├── ChatWindow (message list, streaming text)
    │   ├── MessageInput (text input, send button)
    │   ├── SessionSettings (participants, turn mode, TTS settings)
    │   └── SceneStatePanel (current location, active NPCs, narrative threads)
    ├── Wiki Browser
    │   ├── WikiPage (markdown renderer, backlinks panel)
    │   ├── WikiGraph (Cytoscape.js force-directed graph)
    │   ├── WikiSearch (FlexSearch-powered, keyboard navigation)
    │   └── WikiEditor (YAML frontmatter, markdown body)
    ├── Timeline Editor
    ├── Relationship Viewer
    │   ├── RelationshipWeb (force-directed graph)
    │   ├── EmotionBar (multi-axis emotion display)
    │   └── RelationshipHistory (timeline of events)
    └── Settings (TTS, generation, appearance)
```

### State Management
```
AppProvider (src/contexts/app-context.tsx)
├── User state (auth, profile, settings)
├── Universe state (active universe, canons)
└── Application state (theme, sidebar)
    ↓
Custom Hooks (src/hooks/)
├── useAuth() → { user, login, logout, refresh }
├── useSession() → { session, messages, sendMessage, ... }
├── useTTS() → { speak, stop, isPlaying, voices }
├── useEntityFetch<T>() → { data, loading, error, refresh }
├── useRenderLoop() → 30fps render subscription
├── useIdleTracker() → { idle, tier, heartbeat }
├── useConnectionStatus() → { ollama, kokoro, db }
├── useLocalStorage<T>() → get/set with type safety
├── useVoices() → { voices, assignVoice, ... }
└── useAudioPlayer() → { play, pause, stop, ... }
    ↓
Feature Components (src/components/{feature}/)
```

### Shared UI Primitives (`src/components/ui/`)
| Component | Props | Used By |
|-----------|-------|---------|
| `Modal` | size (sm/md/lg/xl), onClose, children | 18+ pages |
| `LoadingState` | icon (default Sparkles), message | 18+ pages |
| `EmptyState` | icon, title, description, action | 16+ pages |
| `StatusBadge` | variant (6), size (2) | 12+ pages |
| `PageHeader` | title, subtitle, action | 14+ pages |
| `ConfirmationDialog` | message, onConfirm, onCancel | 8+ pages |
| `ConnectionIndicator` | none (reads from context) | footer |

**Styling**: Tailwind v4 via `@tailwindcss/postcss`. No `tailwind.config` file. Dark theme tokens in `src/app/globals.css` `@theme` block.

```css
/* globals.css @theme tokens */
--color-bg-primary: #0a0a0a;     /* Main background */
--color-bg-raised: #141414;       /* Cards, panels */
--color-bg-elevated: #1e1e1e;    /* Modals, dropdowns */
--color-bg-hover: #282828;        /* Hover states */
--color-border: #2a2a2a;          /* Borders */
--color-border-strong: #3a3a3a;   /* Strong borders */
--color-text-primary: #e8e8e8;    /* Primary text */
--color-text-muted: #a0a0a0;      /* Secondary text */
--color-text-dim: #666666;        /* Muted text */
--color-accent: #4a9eff;          /* Accent */
```

### Client/Server Split
- **Server by default** — server-first architecture
- **"use client" only** when hooks or browser APIs needed
- **63% client** components, **37% server** (pure display)
- All wiki, session, chat, timeline, relationship, narrative, canon, tts → client
- `ui/LoadingState`, `ui/EmptyState`, `ui/StatusBadge`, `layout/PageHeader` → server

---

## 7. LLM & Generation

### Ollama Client (`src/lib/ollama.ts`)
- **Base URL**: `OLLAMA_CONFIG.baseUrl` (from `config.ts`, typically `http://192.168.4.2:11434`)
- **Default model**: `qwen3.5:4b` (or `OLLAMA_MODEL` env var, overridable per-user via `getUserModels()`)
- **Embedding model**: `bge-m3`
- **Default temperature**: 0.8, `top_p`: 0.9
- **Generation timeout**: 600,000 ms (10 minutes), via `OLLAMA_CONFIG.timeout`
- **Embedding timeout**: 120,000 ms (2 minutes), via `OLLAMA_CONFIG.embeddingTimeout`
- **Retry**: 3 attempts with linear backoff (2s, 4s, 6s)
- **`generateText(prompt, options?)** — Blocking generation with retry loop. Validates output via `validateLlmOutput()`.
- **`generateTextStream(prompt, onChunk, options?)** — SSE streaming, calls `onChunk` per token. NO retry.
- **`generateEmbedding(text, options?)** — POST `/api/embed` using bge-m3, returns vector array. Uses 120s timeout.
- **`validateLlmOutput(output)`** — Strips leaked `<user_content>` blocks, prompt section headers (`[CHARACTER INSTRUCTIONS]`, `[KNOWN WORLD]`, etc.), and injection protection text from output. Logs warning on detection.
- **`fetchLocalModels()`** — GET `/api/tags` with 30s timeout. Caches model list in-memory.
- **`getUserModels(userId)`** — Reads `users.settings` JSON for per-user model override. Falls back to `OLLAMA_CONFIG` defaults.
- **`isModelAvailable(model)`** — Checks cached local model list.
- **Health check**: `checkOllamaConnection()` — GET `/api/tags`, 30s timeout.

### Prompt Builder (`src/lib/prompt-builder.ts`)
**Context Budget**: 6000 tokens total (model context window is 8192, budget is 6000 with 500-token overhead)

The budget is 6000 total with 500 tokens reserved for overhead (system prompt + wikilink instruction + injection protection). Remaining 5500 tokens are allocated by percentage:

| Section | % of Remaining | Tokens | Source |
|---------|---------------|--------|--------|
| Overhead | — | 500 | System prompt + wikilink instruction + injection protection (always included) |
| Messages | 38% | 2090 | Recent conversation history (truncated from newest) |
| Lore | 20% | 1100 | Nearby wiki entries (truncated in priority order) |
| Memories | 15% | 825 | Narrative memories (highest importance first) |
| Relationships | 10% | 550 | Character relationships with emotional state |
| Active Threads | 10% | 550 | Narrative threads (highest escalation first) |
| Message Summaries | 5% | 275 | Summary of truncated messages (pass-through, no budget enforcement) |
| Decision Points | 2% | 110 | Recent narrative choices (naturally limited to 3) |

**Prompt Section Order** (12 sections, assembled by `assemblePrompt()`):

1. **System prompt** — Base system prompt + wikilink instruction + injection protection (always first)
2. **Character instructions** — Persona instructions, wrapped in `<user_content>` tags
3. **Canon context** — Universe description, narrative boundaries, emotional tone, narrative mode
4. **Narrative memories** — Format: `[TYPE] content (importance: N)`
5. **Message summaries** — Summaries of truncated conversation history
6. **Current scene** — Location, goal, tone, NPCs, scene type, tension, conflict, narrative phase
7. **Intent** — Format: `[INTENT: SOCIAL]` with description (from `buildIntentContext()`)
8. **Active threads** — Narrative threads with status and description
9. **Active entities** — Entities that have appeared in the narrative
10. **Known world / lore** — Wiki entries relevant to current context
11. **Relationships** — Source to target, stage, emotional state, shared history, decay indicators
12. **Recent history** — Most recent messages (user-provided content)

### Streaming Generation
```
POST /api/generate/[id]
  → SSE stream: "data: { token: "The", done: false }\n\n"
  → Client renders tokens in real-time
  → On complete: queue background jobs (summarize, embed, analyze)
```
- Endpoint: `src/app/api/generate/[id]/route.ts`
- Uses ReadableStream with SSE formatting
- AbortController for cancellation

### SSE Event Bus (`src/lib/event-bus.ts`)
In-process EventEmitter singleton for real-time updates. Events use colon-separated names with session/user ID suffixes for scoped delivery:

| Event Pattern | Description |
|---------------|-------------|
| `message:created:{sessionId}` | User or AI message saved to DB |
| `message:updated:{sessionId}` | Message content edited |
| `message:deleted:{sessionId}` | Message soft-deleted |
| `generation:started:{sessionId}` | AI generation begins |
| `generation:done:{sessionId}` | AI generation completes |
| `scene:updated:{sessionId}` | Scene state (location, NPCs, tone) changes |
| `thread:updated:{sessionId}` | Narrative thread status changes |
| `session:updated:{sessionId}` | Session metadata changes (title, settings) |
| `turn:updated:{sessionId}` | Turn order changes in group sessions |
| `participant:joined:{sessionId}` | User joins session |
| `participant:left:{sessionId}` | User leaves session |
| `participant:kicked:{sessionId}` | User removed from session |
| `participant:invited:{sessionId}` | Invitation sent |
| `participant:role_changed:{sessionId}` | Participant role updated |
| `tts:queued:{sessionId}` | TTS generation queued |
| `tts:completed:{sessionId}` | TTS audio ready for playback |
| `job:completed:{userId}` | Background job finishes (non-session) |
| `job:progress:{userId}` | Job progress update with percentage |
| `wiki:page_created:{userId}` | Wiki page created |
| `wiki:page_updated:{userId}` | Wiki page updated |

- Stores last 100 events per session for `Last-Event-ID` reconnection
- Max 50 concurrent SSE connections per session
- Periodic cleanup of abandoned session data every 60 seconds

### Persona System (`src/lib/ollama.ts`)
SillyTavern-style character cards that override the base system prompt with character-specific context:

**`PersonaContext` interface** (12 fields):
```typescript
interface PersonaContext {
  name: string;
  description: string | null;
  personality: string | null;
  scenario: string | null;
  firstMes: string | null;
  mesExample: string | null;
  creatorNotes: string | null;
  systemPrompt: string | null;
  postHistoryInstructions: string | null;
  tags: string[] | null;
  writingStyle: string | null;
  llmModel: string | null;
}
```

- **`getActivePersonaContext(userId)`** — Reads from `personas` table where `is_active = 1`. Returns `PersonaContext` or `null`.
- **`buildPersonaPrompt(persona, baseSystemPrompt)`** — Assembles SillyTavern-style prompt: character card → scenario → example dialogue → post-history instructions → creator notes → base system prompt → system override.

---

## 8. Wiki Subsystem

### Storage Architecture
**Key rule**: Wiki content is markdown-on-disk, NOT in SQLite.
```
data/{userId}/wiki/
├── entities/       # NPC, location, faction pages
├── concepts/       # Abstract concepts, lore entries
├── sources/        # Imported reference material
├── synthesis/      # AI-generated synthesis pages
└── _review/        # Pages pending review (draft status)
```

### YAML Frontmatter Schema
```yaml
---
id: npc_haleth
title: Haleth
type: entity          # entity | concept | source | synthesis
status: draft         # draft → reviewed → locked
universe: middle-earth
tags: [ranger, bree]
importance: 7
created_at: 2024-01-15
updated_at: 2024-01-20
---
Content in markdown...
```

### Wikilink Resolution
3-pass resolution algorithm:
1. **Same-universe**: `[[Page]]` → look in current universe's wiki
2. **Any-universe**: `[[Universe::Page]]` → namespace syntax for cross-universe links
3. **Filename fallback**: Match by filename if no universe match

### Search
- **FlexSearch** for full-text search of wiki content
- **sqlite-vec** for semantic search (fallback: keyword-only if vec unavailable)
- Keyboard navigation in search results
- Backlinks computed from wikilink graph

### Graph Visualization
- **Cytoscape.js** for force-directed graph of wiki pages
- Nodes = pages, edges = wikilinks
- Filtered by universe, type, or status
- Interactive: click node → navigate to page

### Validation Workflow
```
draft (LLM-created) → reviewed (human-approved) → locked (immutable)
```
- Concurrent edit protection via in-memory file locks
- Timestamp-based conflict detection with diff saving
- Status transitions enforced in API

### Wiki API Endpoints
| Endpoint | Methods | Query Params | Body | Purpose |
|----------|---------|-------------|------|---------|
| `/api/wiki` | GET | `universe_id` | — | List all pages + orphans with suggestions |
| `/api/wiki` | POST | — | `path, content, frontmatter, universeId` | Create page (sanitizes filename, regenerates index) |
| `/api/wiki/[...slug]` | GET | `universe_id` | — | Read page content + frontmatter, backlinks, embeds, orphan info |
| `/api/wiki/[...slug]` | PUT | `universe_id` | `content?, frontmatter?, expectedLastModified` | Update page with conflict detection (409 on conflict) |
| `/api/wiki/[...slug]` | DELETE | `universe_id` | — | Delete page, regenerate index |
| `/api/wiki/query` | POST | — | `query, universeId` | Natural language query with LLM synthesis (FlexSearch + vec) |
| `/api/wiki/ingest` | POST | — | `sourcePath, universeId` | LLM extracts wiki pages from source material |
| `/api/wiki/lint` | POST | — | `universeId?` | Wiki health check: contradictions, orphans, stale claims, missing pages |
| `/api/wiki/graph` | GET | `universe_id` | — | Wikilink graph data (nodes + edges + collisions) |
| `/api/wiki/history` | GET | `slug` | — | Page version history from SQLite wiki_versions |
| `/api/wiki/history` | POST | — | `action, slug, universeId, versionId?, changeSummary?` | Restore or record page version |
| `/api/wiki/recent` | GET | `universe_id, limit?` | — | Recently modified pages (sorted by mtime, default 10) |
| `/api/wiki/templates` | GET | — | — | List 5 markdown templates (character, location, faction, event, concept) |
| `/api/wiki/file` | POST | — | `query, answer, citations, universeId` | File LLM query answer as synthesis page |
| `/api/wiki/validate/[...slug]` | PUT | `universe_id` | — | Promote draft → reviewed status |
| `/api/wiki/lock/[...slug]` | PUT | `universe_id` | — | Lock reviewed → immutable status |
| `/api/wiki/reject/[...slug]` | PUT | `universe_id` | `reason` | Reject draft with reason |
| `/api/wiki/split-suggestions/[...slug]` | GET | `universe_id` | — | Page size check + AI-suggested H2-based subpage splits |
| `/api/wiki/sources/upload` | POST | — | `filename, content, universeId` | Upload source file to wiki/raw/ (validation: 10MB, allowed ext) |
| `/api/wiki/log` | GET | `universe_id, count?` | — | Wiki operation audit log (deprecated, uses logger.ts) |
| `/api/wiki/index` | GET | `universe_id` | — | Read auto-generated index.md (generates if missing) |
| `/api/wiki-revisions` | GET | `slug, id?, universe_id` | — | List or get specific file-based revision (deprecated) |
| `/api/wiki-revisions` | POST | `slug` | `universeId?` | Save a file-based revision snapshot (deprecated) |

> **Note**: `/api/wiki/search` does not exist as a server endpoint. Search is client-side via FlexSearch in `search.tsx` — all wiki page metadata is fetched via `/api/wiki` and indexed in-browser.

---

## 9. Session & Chat

### Session Lifecycle
```
1. Create session (POST /api/sessions)
2. Set universe, timeline, starting location
3. Add participants (solo or group)
4. Begin session → AI generates initial scene
5. Chat loop: user message → AI response → background jobs
6. End session (or idle → auto-pause)
```

### Message Flow
```
User types message
  → POST /api/sessions/[id]/turn
  → Context assembly (retrieval pipeline)
  → POST /api/generate/[id] (SSE stream)
  → Tokens streamed to client in real-time
  → On complete: message stored in DB
  → Background jobs queued:
    → summarize_message (high priority)
    → generate_embedding (high priority)
    → relationship_analysis (high priority)
    → extract_event (high priority)
    → thread_analysis (session milestone)
```

### SSE Event Stream
```
GET /api/sessions/[id]/stream
→ Long-lived SSE connection
→ Events: message, scene_update, thread_update, 
  participant_change, job_complete, generation_progress, tts_ready
→ Heartbeat every 30 seconds
→ Reconnection via Last-Event-ID header
```

### Message Actions
| Action | User Msg | AI Msg | System Msg | Effect |
|--------|----------|--------|------------|--------|
| TTS | ✅ | ✅ | ❌ | Read aloud via Kokoro |
| Copy | ✅ | ✅ | ✅ | Clipboard |
| Edit | ✅ | ✅ | ❌ | Edit + regenerate from this point |
| Regenerate | ❌ | ✅ | ❌ | Delete + re-generate AI response |
| Delete | ✅ | ✅ | ✅ | Delete + all messages after |

### Background Jobs Triggered Per Message
| Job | Priority | Timing |
|-----|----------|--------|
| summarize_message | High | Immediately |
| generate_embedding | High | Immediately |
| relationship_analysis | Medium | After significant interaction |
| extract_event | Medium | After narrative event |
| thread_analysis | Low | After session milestone |

---

## 10. Relationships & Narrative

### Relationship Model
```typescript
interface Relationship {
  character_a: string;
  character_b: string;
  emotional_state: {
    trust: number;        // 0.0 — 1.0
    suspicion: number;    // 0.0 — 1.0
    loyalty: number;      // 0.0 — 1.0
    resentment: number;   // 0.0 — 1.0
    attraction: number;   // 0.0 — 1.0
    respect: number;      // 0.0 — 1.0
    fear: number;         // 0.0 — 1.0
  };
  stage: 'strangers' | 'acquaintances' | 'allies' | 'friends' | 'close_friends' | 'lovers';
  shared_history: string[];
}
```

### Emotion Decay Rates
| Emotion | Half-Life | Decay Rate |
|---------|-----------|------------|
| trust | ~30 days | low |
| suspicion | ~60 days | very_low |
| loyalty | ~30 days | low |
| resentment | ~90 days | very_low (lingers) |
| attraction | ~14 days | medium |
| respect | ~30 days | low |
| fear | ~14 days | medium |

Formula: `new_value = current_value × (0.5 ^ (days_inactive / half_life_days))`

### Relationship Evolution Triggers
| Event | Effect |
|-------|--------|
| Shared combat | trust +0.1, respect +0.05 |
| Betrayal | trust -0.3, resentment +0.2 |
| Helpful action | trust +0.05, loyalty +0.03 |
| Broken promise | trust -0.15, suspicion +0.1 |
| Deep conversation | trust +0.08, attraction ±0.05 |
| Shared secret | trust +0.1, loyalty +0.05 |

### Canon Tier System
| Tier | Editable | Description |
|------|----------|-------------|
| immutable_canon | No | Cannot be contradicted |
| soft_canon | Yes | Expandable without contradiction |
| generated_lore | Yes | AI-generated, requires validation |
| session_lore | Yes | Temporary narrative state (session scope) |
| rumor | Yes | Unverified, may be false |

### Importance Scoring
```
score = (emotional × 0.35) + (local × 0.25) + (canonical × 0.20) + (recency × 0.20)
Values: low=1, medium=2, high=3, critical=4. Max = 16.
Archival threshold: ≤ 4 → cold storage
```

---

## 11. Job System

### Queue Architecture
**Primary file**: `src/lib/job-processor.ts` (orchestrator), `src/lib/jobs/queue.ts` (queue management), `src/lib/jobs/types.ts` (type definitions)

- **No persistent workers**: Jobs are on-demand via idle tiers or API triggers
- **Table**: `job_queue` with columns: `id, user_id, universe_id, type, priority, status (queued/processing/completed/failed/cancelled), payload (JSON), progress (0-100), progress_message, retry_count, max_retries, created_at, processed_at, error, result`
- **Priority ordering**: high (1) → medium (2) → low (3) → idle (4), then FIFO within same priority
- **Execution**: Jobs are polled and executed in-process on the main event loop
- **Cleanup**: `reapOldJobs()` deletes completed/failed/cancelled jobs older than 30 days (configurable via `JOB_RETENTION_DAYS`)

### Job State Machine
```
queued → processing → completed
                  → failed → (retry → queued) OR (permanent → failed)
queued → cancelled → deleted (via reapOldJobs)
```

### Dedup and Debounce
Two-layer protection against duplicate job creation:

**Dedup** (30-second window):
- `DEDUP_WINDOW_MS` = 30,000 ms
- Skips queueing if an identical job (same `type` + `user_id` + `sessionId/messageId/entityId` context) exists in `queued` or `processing` status within the last 30 seconds
- Returns the existing job ID instead of creating a duplicate

**Debounce** (burst-prone types only):
| Job Type | Min Interval |
|----------|-------------|
| `wiki_extract_event` | 60 seconds |
| `thread_analysis` | 60 seconds |
| `scene_state_extract` | 30 seconds |
| `analyze_relationships` | 30 seconds |

- Checks for any recent job (regardless of context) of the same type completed within the interval
- Prevents burst queueing from rapid user actions

### Retry Strategy
**Transient errors** (auto-retry with exponential backoff):
- Network issues: connection refused, reset, timeout
- Rate limits: 429, 503
- Ollama failures: fetch failures, service unavailable
- DB locks: SQLITE_BUSY
- Backoff: 1s, 2s, 4s, 8s, 16s (capped at 30s)
- `max_retries`: 3 (configurable per job row)
- Retry bumps `retry_count`, clears error, resets to `queued` with backoff-adjusted `created_at`

**Permanent errors** (immediately failed, no retry):
- Missing fields, invalid references, schema violations
- Unknown job types
- Non-transient errors

**Stale job recovery**:
- `recoverStaleJobs()`: Jobs stuck in `processing` > 5 minutes marked as `failed` with "Server crashed during processing"
- Called on startup or periodically

### Job Types (20 total)
| Type | Priority | Trigger | Handler |
|------|----------|---------|---------|
| `summarize_messages` | high / idle | After each message | `handleSummarizationJob` |
| `generate_embeddings` | high / idle | After new content | `handleGenerateEmbeddings` |
| `analyze_relationships` | medium / debounced 30s | After significant interaction | `handleAnalyzeRelationships` |
| `decay_relationships` | idle | Inactive > 30 min | `handleDecayRelationships` |
| `compress_memories` | idle | Inactive > 5 min | `handleSummarizationJob` |
| `refine_relationship_summary` | idle | Inactive > 5 min | `handleRefineRelationshipSummary` |
| `archival_processing` | idle | Inactive > 15 min | `handleArchivalProcessing` |
| `thread_analysis` | low / debounced 60s | Session milestones | `handleThreadAnalysis` |
| `scene_state_extract` | debounced 30s | Scene changes | `handleSceneStateExtract` |
| `wiki_ingest` | medium | Source material import | `handleWikiJob` |
| `wiki_enrich_entity` | idle | Inactive > 10 min | `handleWikiJob` |
| `wiki_generate_rumors` | idle | Inactive > 15 min | `handleWikiJob` |
| `wiki_deepen_page` | idle | Inactive > 10 min | `handleWikiJob` |
| `wiki_deepen_location` | idle | Inactive > 10 min | `handleWikiJob` |
| `wiki_extract_event` | debounced 60s | Narrative events | `handleWikiJob` |
| `wiki_auto_extract` | medium | After message generation | `handleWikiJob` |
| `universe_wiki_sync` | low | Universe switch | `handleWikiJob` |
| `npc_evolution` | medium | NPC relevance threshold | `handleNpcEvolutionJob` |
| `extract_lore_comprehensive` | medium | Periodic lore expansion | `handleLoreExtractionJob` |
| `generate_session_recap` | low | Session pause / milestones | `handleSessionRecapJob` |

### JOB CRUD API
All job management via `src/lib/jobs/queue.ts`:

| Action | Function | Effect |
|--------|----------|--------|
| Queue | `queueJob(userId, type, payload, priority)` | Creates job in `queued` status with dedup/debounce |
| Process | `processJob(job)` | Marks `processing`, dispatches to handler |
| Process next | `getNextJob(userId)` | Polls next job by priority + FIFO age |
| Cancel | `cancelJob(jobId)` | Sets `cancelled` (only if `queued`) |
| Cancel all | `cancelAllUserJobs(userId)` | Cancels all queued jobs for user |
| Retry | `retryJob(jobId)` | Resets `failed` → `queued`, respects `max_retries` |
| Retry all | `retryAllFailedJobs(userId)` | Retries all failed jobs under `max_retries` |
| Queue idle | `queueIdleJobs(userId)` | Queues 5+ idle-tier wiki jobs |
| Process idle | `processIdleTier(userId, tier)` | Client-driven tier-based processing |

### Idle Processing Tiers
Two entry points:

1. **Middleware-based** (`processIdleTime()` in `src/lib/idle-processing.ts`): Called on authenticated user requests when enough idle time has passed. Tracks `lastProcessingTime` per user in memory.

2. **Client heartbeat** (`processIdleTier()` in `src/lib/idle-processing.ts`): Called when the client-side `useIdleTracker()` hook detects user inactivity and reports a tier change.

| Tier | Duration | Middleware Jobs | Heartbeat Jobs |
|------|----------|----------------|----------------|
| 1 | > 5 min | Compress summaries (`wikiCompressSummaries`), refine relationships (`wikiRefineRelationships`) | `compress_memories`, `refine_relationship_summary` |
| 2 | > 10 min | Deepen pages (`wikiDeepenPages`), enrich entities (`wikiEnrichEntities`), process embeddings, relationship analysis, entity mention extraction | `wiki_deepen_page`, `wiki_enrich_entity`, `generate_embeddings` |
| 3 | > 15 min | Generate rumors (`wikiGenerateRumors`), archive low-importance pages (`wikiArchive`) | `wiki_generate_rumors`, `archival_processing` |
| 4 | > 30 min | Decay relationships (`wikiDecayRelationships`), memory compression, summarization queue, reap old jobs, backfill evolution | `decay_relationships`, `summarize_messages` |

### Enrichment Constraints
- Only enrich entities with importance score ≥ 5
- Never create facts contradicting immutable_canon
- Generated content starts as `generated_unverified`
- Enrichment is additive, never destructive
- All enrichment is logged for user review

---

## 12. TTS System

### Kokoro Integration
- **External server**: `192.168.4.2:8880` (Kokoro-FastAPI)
- **API**: OpenAI-compatible Speech endpoint (`POST /v1/audio/speech`)
- **Models**: kokoro-82M
- **Supported formats**: mp3, wav, opus, flac, m4a, pcm

### Voice Discovery
Auto-detected on startup by querying `GET /v1/audio/voices`. Prefix convention:
- `af_` = American Female (af_bella, af_sky, af_heart)
- `am_` = American Male (am_adam)
- `bf_` = British Female (bf_emma)
- `bm_` = British Male (bm_george)
- Plus Spanish, French, Italian, Portuguese, Hindi, Japanese, Chinese

### Voice Weighted Mixing
```json
"af_bella(2)+af_sky(1)"  // 67% bella, 33% sky
"am_adam+bm_george"       // 50/50 equal mix
```

### TTS Pipeline
```
Message received → Text determined (narrator/NPC/dialogue)
  → Check TTS cache (text_hash lookup)
  → If cached: play immediately
  → If not: send to Kokoro (POST /v1/audio/speech)
  → Audio file stored, path cached in tts_cache table
  → SSE event: tts_ready
  → Client plays via Web Audio API
```
Queue processes asynchronously — chat display is NEVER blocked by TTS generation.

---

## 13. Key Patterns and Conventions

### Auth Pattern (per-route)
```typescript
// Preferred — withAuth HOF
import { withAuth } from '@/lib/with-auth';
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;
  // ... handler logic
});

// Fallback — getAuthToken inline
import { getAuthToken } from '@/lib/auth-token';
const token = getAuthToken(request);
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

### Error Handling Pattern
```typescript
// Apply withErrorHandler to EVERY route handler
import { withErrorHandler } from '@/lib/with-error-handler';
export const GET = withErrorHandler(async () => {
  // ... handler — errors are caught and return 500
});

// For routes needing custom error handling, wrap selectively:
export const POST = withErrorHandler(async (request) => {
  const jsonError = requireJson(request);
  if (jsonError) return jsonError;  // 415 handling before business logic
  // ... handler
});
```

### Hook Pattern
```typescript
// ALL hooks return { data, loading, error, refresh }
function useSession(sessionId: string) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const refresh = useCallback(async () => { ... }, [sessionId]);
  
  useEffect(() => { refresh(); }, [refresh]);
  
  return { data, loading, error, refresh };
}
```

### Component Pattern
```typescript
// Feature components follow LoadingState/ErrorState/EmptyState triad
function WikiPage({ slug }: { slug: string }) {
  const { data, loading, error } = useWikiPage(slug);
  
  if (loading) return <LoadingState message="Loading wiki page..." />;
  if (error) return <EmptyState icon={AlertCircle} title="Error" description={error} />;
  if (!data) return <EmptyState icon={FileQuestion} title="Not found" description="Page doesn't exist" />;
  
  return <div>{/* page content */}</div>;
}
```

### Wiki File Operations Pattern
```typescript
// Wiki operations read/write markdown files — NOT SQLite
import { readWikiPage, writeWikiPage } from '@/lib/wiki/wiki-io';
const page = await readWikiPage(userId, universeId, slug);
// Returns: { frontmatter, body, raw }
```

### DB Query Pattern
```typescript
// Always use ? parameters. NEVER interpolate strings into SQL.
const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
const rows = db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC").all(userId);
db.prepare("INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)").run(uuid, userId, title);

// For bulk operations, use transaction:
const insert = db.transaction((items) => {
  for (const item of items) {
    db.prepare("INSERT INTO ... VALUES (?)").run(item);
  }
});
```

---

## 14. Anti-Patterns and Gotchas

### 🚫 BLOCKING — NEVER DO
- **No ORM or query builder** — Raw SQL via better-sqlite3 only (deliberate project choice)
- **No barrel exports** — Always import from specific file paths (`import { X } from '@/lib/y'`, not `import { X } from '@/lib'`)
- **No proxy.ts auth** — `protectedRoutes: []` is intentionally empty. Auth is per-route via `withAuth()` HOF
- **No `as any` or `@ts-ignore` / `@ts-expect-error`** — Type safety is enforced
- **No cookie-based proxy auth** — Auth is client-side + per-route. Proxy can't read localStorage
- **No wiki content in SQLite** — Wiki is markdown files on disk under `data/{userId}/wiki/`
- **No persistent background workers** — Jobs are on-demand via idle tiers/API triggers
- **No Prettier config** — Formatting not enforced in project
- **No tailwind.config.* file** — Tailwind v4 uses CSS-first `@theme` in `globals.css`
- **No store wiki files in SQLite** — Wiki is markdown-first on disk

### 🚫 MUST NOT — Project Violations
- **Do NOT move `app-layout-shell.tsx`** — Co-located inside `(app)/` route group by design
- **Do NOT merge `relationship/` and `relationships/`** — They contain different components
- **Do NOT use `active-universe.tsx` for new code** — It's a compat shim. Use `app-context.tsx`
- **Do NOT add server actions (`"use server"`)** — All server logic lives in route handlers
- **Do NOT add global error handler** — Per-route error handling is the pattern
- **Do NOT add CSS modules or styled-components** — Tailwind utility classes only
- **Do NOT add loading.tsx to every route** — Only at `(app)` group level
- **Do NOT put auth pages inside `(app)`** — They must be outside to avoid sidebar layout
- **Do NOT remove `force-dynamic`** — App relies on SSR for all routes (no SSG/ISR)
- **Do NOT add cookie-based proxy auth** — `protectedRoutes` is intentionally empty

### ⚠️ Known Issues (From Audit)
- **Rate limiter is in-memory** — Resets on every server restart. Not suitable for multi-instance/Vercel deployment. Needs Redis/Upstash.
- **`requireJson()` used to throw** — Was outside try/catch in routes without withErrorHandler. Now returns `Response | null`.
- **Dynamic SQL SET clauses** — Some queries use `${placeholders}` interpolation (message ID arrays, batch deletes). Currently appears safe (known arrays), but should use column allowlisting.
- **~200 non-null assertions** — Mostly `rateLimit.retryAfter!` where the type doesn't reflect the runtime guarantee.
- **`as unknown as X` casts** — In `auth.ts:57` (jwtVerify payload) and `proxy.ts:21` (proxy runtime IP property).
- **NODE_ENV in error responses** — Module-level `const isDev` evaluated at import time (defensive fix: make it a function).
- **CSRF disabled in dev** — Proxy skips CSRF when `NODE_ENV === 'development'`.
- **No security headers** — Missing `X-Content-Type-Options`, `X-Frame-Options`, CSP.
- **`getMessageSummaries()`** — Defined at retrieval.ts:228, called at retrieval.ts:852 during context retrieval for session queries. Not dead code.

### 🧠 Mental Model Notes
- **SSR everything** — `force-dynamic` at root layout means all routes SSR. No static generation.
- **SQLite is synchronous** — `better-sqlite3` is intentionally synchronous. All DB operations block the event loop but SQLite WAL mode handles concurrent reads.
- **No real-time DB** — SSE is in-process via EventBus, not pub/sub. Horizontal scaling would need Redis pub/sub.
- **Embeddings are per-user** — Each user has their own sqlite-vec database. No cross-user semantic search.
- **Wiki is NOT in DB** — Important distinction. Wiki content lives on disk as markdown files. SQLite stores wiki metadata (backlinks, indexes) only.
- **Auth is duplicated** — Two patterns coexist (`withAuth()` and `getAuthToken()`). `withAuth()` is the preferred/newer pattern.
- **Group sessions share state** — Group sessions have shared state (scene, NPCs) plus per-user private state (thoughts, personal relationships).

---

## 15. Appendix

### Dependencies (Production)
```json
{
  "next": "^16.2.6",
  "react": "^19.2.6",
  "react-dom": "^19.2.6",
  "better-sqlite3": "^11.8.1",
  "bcryptjs": "^2.4.3",
  "jose": "^6.0.10",
  "lucide-react": "^0.487.0",
  "next": "^16.2.6",
  "react": "^19.2.6",
  "tailwindcss": "^4.x",
  "clsx": "^2.x"
}
```

### Environment Variables (.env.local)
```bash
JWT_SECRET=base64-encoded-secret-here
# Optional for deployed environments:
REDIS_URL=redis://...  # For production rate limiting
TRUSTED_PROXIES=127.0.0.1,::1  # If behind reverse proxy
```

### Config Constants (`src/lib/config.ts`)
```typescript
OLLAMA_CONFIG: { baseUrl, model, embeddingModel }
TTS_CONFIG: { baseUrl, defaultVoice }
AUTH_CONFIG: { jwtSecret, jwtExpiry (24h), bcryptRounds (12), usernameMinLength (3), usernameMaxLength (20), passwordMinLength (8) }
APP_CONFIG: { dataDir }
TIMEOUTS: { HEALTH_CHECK (5s), GENERATION (30s), OLLAMA (30s), TTS (10s) }
TIME: { ONE_MINUTE, ONE_HOUR, ONE_DAY }
```
