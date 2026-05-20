# Phase 3B: Architecture Refactoring

**Priority:** MEDIUM — fix within quarter
**Estimated effort:** 8-12 hours
**Risk:** Medium — touches data flow, state management, and module structure
**Constraint:** `npx next build` must pass. No new npm dependencies.

---

## Context

Phases 1-3A must be complete before this phase. These items address structural architecture issues: service layer, module organization, error boundaries, state management consolidation, and AppProvider/AppLayoutShell deduplication.

---

## Task 3B.1: Add Service Layer Between Routes and Database

### Problem
API routes directly call `db.prepare()` and contain business logic. Routes do validation + DB queries + business logic + response formatting all in one function. No separation of concerns.

### Implementation

**1. Create service layer structure:**

```
src/services/
├── auth-service.ts       # User auth, token management
├── session-service.ts    # Session CRUD, messages, participants
├── universe-service.ts   # Universe CRUD, settings
├── wiki-service.ts       # Wiki page CRUD, validation, graph
├── relationship-service.ts # Relationship CRUD, analysis
├── timeline-service.ts   # Timeline layers, eras, factions
├── persona-service.ts    # Persona CRUD
├── group-service.ts      # Group CRUD, members
├── job-service.ts        # Job queue management
├── character-service.ts  # Character CRUD
├── thread-service.ts     # Narrative thread CRUD
├── tts-service.ts        # TTS voice, queue
└── index.ts              # Barrel export (ONLY service layer uses barrel)
```

**2. Example service implementation** — `src/services/session-service.ts`:

```typescript
import type { Database } from 'better-sqlite3';
import { rowToJson } from '@/lib/row-to-json';

export interface SessionRecord {
  id: string;
  name: string;
  universe_id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface SessionWithDetails extends SessionRecord {
  messages: Array<Record<string, unknown>>;
  participants: Array<Record<string, unknown>>;
  settings: Record<string, unknown> | null;
}

export class SessionService {
  constructor(private db: Database) {}

  getSession(id: string, userId: string): SessionRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM sessions WHERE id = ? AND owner_id = ?"
    ).get(id, userId) as SessionRecord | undefined;
    return row ?? null;
  }

  getFullSession(id: string, userId: string): SessionWithDetails | null {
    const session = this.getSession(id, userId);
    if (!session) return null;

    const messages = this.db.prepare(
      "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(id).map(rowToJson);

    const participants = this.db.prepare(
      "SELECT * FROM participants WHERE session_id = ?"
    ).all(id).map(rowToJson);

    const settings = this.db.prepare(
      "SELECT * FROM session_settings WHERE session_id = ?"
    ).get(id);

    return {
      ...session,
      messages,
      participants: participants as Array<Record<string, unknown>>,
      settings: settings ? rowToJson(settings as Record<string, unknown>) : null,
    };
  }

  createSession(data: { name: string; universeId: string; ownerId: string }): SessionRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(
      "INSERT INTO sessions (id, name, universe_id, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, data.name, data.universeId, data.ownerId, now, now);
    return this.getSession(id, data.ownerId)!;
  }

  deleteSession(id: string, userId: string): boolean {
    // Cascade delete all related data
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
      this.db.prepare("DELETE FROM participants WHERE session_id = ?").run(id);
      this.db.prepare("DELETE FROM session_settings WHERE session_id = ?").run(id);
      this.db.prepare("DELETE FROM private_thoughts WHERE session_id = ?").run(id);
      this.db.prepare("DELETE FROM sessions WHERE id = ? AND owner_id = ?").run(id, userId);
    })();
    return true;
  }

  listSessions(userId: string, universeId?: string): SessionRecord[] {
    const sql = universeId
      ? "SELECT * FROM sessions WHERE owner_id = ? AND universe_id = ? ORDER BY updated_at DESC"
      : "SELECT * FROM sessions WHERE owner_id = ? ORDER BY updated_at DESC";
    const params = universeId ? [userId, universeId] : [userId];
    return this.db.prepare(sql).all(...params) as SessionRecord[];
  }
}

// Singleton factory (DB is single connection anyway)
let _sessionService: SessionService | null = null;
export function getSessionService(db: Database): SessionService {
  if (!_sessionService) _sessionService = new SessionService(db);
  return _sessionService;
}
```

**3. Update route handler to use service:**

```typescript
// BEFORE (src/app/api/sessions/[id]/route.ts — GET):
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;

  try {
    const session = db.prepare("SELECT * FROM sessions WHERE id = ? AND owner_id = ?").get(id, userId);
    if (!session) return notFoundError('Session');
    const messages = db.prepare("SELECT * FROM messages WHERE session_id = ?").all(id);
    const participants = db.prepare("SELECT * FROM participants WHERE session_id = ?").all(id);
    const scene = db.prepare("SELECT * FROM scenes WHERE session_id = ?").get(id);
    const turnConfig = db.prepare("SELECT * FROM turn_config WHERE session_id = ?").get(id);
    return NextResponse.json({ session, messages, participants, scene, turnConfig });
  } catch (error) {
    return internalError();
  }
}

// AFTER:
import { getSessionService } from '@/services/session-service';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;
  const { id } = await params;

  try {
    const service = getSessionService(db);
    const fullSession = service.getFullSession(id, userId);
    if (!fullSession) return notFoundError('Session');
    return NextResponse.json(fullSession);
  } catch {
    return internalError();
  }
}
```

**4. Migration strategy:**
- Start with simplest service: `auth-service.ts` (2-3 methods)
- Then `session-service.ts` (most used — 75% of routes touch sessions)
- Then `universe-service.ts`
- Then remaining services
- Verify build passes after each service

### Verification
- Build passes after each service
- All API routes still return same response shape
- No `db.prepare()` calls in route handlers (only in services)
- Services are testable (can mock DB)

### Rollback
Revert routes to inline DB calls. Medium risk — requires careful reversion.

---

## Task 3B.2: Group `lib/` by Domain

### Problem
37 files in flat `src/lib/` directory. Only `wiki/` is a subdirectory. Related files scattered: `relationship-analysis.ts`, `relationship-decay.ts`, `relationship-markdown.ts`, `relationship-viz.ts` are 4 separate files for one domain.

### Implementation

**1. New directory structure:**

```
src/lib/
├── config.ts             # Stays at root (cross-cutting)
├── types.ts              # Stays at root (cross-cutting)
├── logger.ts             # Stays at root (cross-cutting)
├── error-response.ts     # Stays at root (cross-cutting)
├── with-auth.ts          # Stays at root (cross-cutting)
├── auth.ts               # Stays at root (auth is foundational)
├── auth-token.ts         # Stays at root
├── db.ts                 # Stays at root (foundational)
├── ollama.ts             # Stays at root (foundational)
├── event-bus.ts          # Stays at root (cross-cutting)
├── api-client.ts         # Stays at root (client-side)
├── render-loop.ts        # Stays at root (client-side)
├── tts-queue.ts          # Stays at root (client-side)
├── date-formatter.ts     # Stays at root (utility)
├── row-to-json.ts        # Stays at root (utility)
├── rate-limiter.ts       # Stays at root (cross-cutting)
├── prompts.ts            # Stays at root (cross-cutting)
│
├── auth/                 # NEW
│   └── (auth.ts, auth-token.ts move here if desired)
│
├── relationships/        # NEW
│   ├── analysis.ts       # from relationship-analysis.ts
│   ├── decay.ts          # from relationship-decay.ts
│   ├── markdown.ts       # from relationship-markdown.ts
│   ├── viz.ts            # from relationship-viz.ts
│   └── access.ts         # new: hasRelationshipAccess helper
│
├── jobs/                 # NEW (from Phase 3A.1)
│   ├── processor.ts
│   ├── response-handler.ts
│   ├── summarization.ts
│   ├── embeddings.ts
│   ├── relationships.ts
│   ├── wiki-jobs.ts
│   ├── memory-jobs.ts
│   ├── enrichment.ts
│   ├── contradiction.ts
│   ├── voice-discovery.ts
│   └── types.ts
│
├── idle/                 # NEW (from Phase 3A.1)
│   ├── orchestrator.ts
│   ├── tiers.ts
│   ├── wiki-idle.ts
│   ├── relationship-idle.ts
│   ├── embedding-idle.ts
│   ├── memory-idle.ts
│   ├── enrichment-idle.ts
│   └── state.ts
│
├── tts/                  # NEW
│   ├── client.ts         # from tts-client.ts (if exists)
│   └── voice-manager.ts  # from voice-discovery logic
│
├── wiki/                 # Already exists — expand
│   ├── file-io.ts        # already here
│   ├── query.ts          # already here
│   ├── lint.ts           # already here
│   ├── ingest.ts         # already here
│   ├── wikilinks.ts      # already here
│   ├── validation.ts     # already here
│   ├── path-guard.ts     # from Phase 1.5
│   └── sanitize-hrefs.ts # from Phase 1.4
│
├── retrieval/            # NEW
│   └── retrieval.ts      # from retrieval.ts
│
├── memory/               # NEW
│   └── compression.ts    # from memory-compression.ts
│
└── group/                # NEW
    └── migrations.ts     # from group-migrations.ts
```

**2. Update all imports** — After moving files, update every import path:

```typescript
// BEFORE:
import { analyzeRelationship } from '@/lib/relationship-analysis';
import { decayRelationship } from '@/lib/relationship-decay';

// AFTER:
import { analyzeRelationship } from '@/lib/relationships/analysis';
import { decayRelationship } from '@/lib/relationships/decay';
```

**3. Migration strategy:**
- Move one domain at a time
- Update all imports for that domain
- Verify build passes
- Repeat for next domain

### Verification
- Build passes after each domain move
- `ls src/lib/` shows organized subdirectories
- No orphaned files in root `lib/` (only cross-cutting utilities)
- All imports resolve correctly

### Rollback
Move files back to flat structure. Medium risk — import path changes.

---

## Task 3B.3: Add Error Boundaries to All Route Groups

### Problem
Only 5 of 15+ route groups have error boundaries. Missing: relationships, personas, narrative-threads, canon, graph, jobs, settings, groups, voice-combiner, characters, events, validations.

### Implementation

**1. Create reusable error boundary component** — `src/components/ui/error-boundary.tsx`:

```typescript
'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-8">
          <h2 className="text-xl font-semibold text-red-600">Something went wrong</h2>
          <p className="text-gray-600 text-sm">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**2. Add error boundary to each missing route group:**

For each route group, create `error.tsx`:

```typescript
// src/app/(app)/relationships/error.tsx
'use client';
import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function RelationshipsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorBoundary onError={() => {}}>
      <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-8">
        <h2 className="text-xl font-semibold text-red-600">Failed to load relationships</h2>
        <p className="text-gray-600 text-sm">{error.message}</p>
        <button onClick={reset} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          Try again
        </button>
      </div>
    </ErrorBoundary>
  );
}
```

Route groups needing `error.tsx`:
- `src/app/(app)/relationships/error.tsx`
- `src/app/(app)/personas/error.tsx`
- `src/app/(app)/narrative-threads/error.tsx`
- `src/app/(app)/canon/error.tsx`
- `src/app/(app)/graph/error.tsx`
- `src/app/(app)/jobs/error.tsx`
- `src/app/(app)/settings/error.tsx`
- `src/app/(app)/groups/error.tsx`
- `src/app/(app)/voice-combiner/error.tsx`
- `src/app/(app)/characters/error.tsx`
- `src/app/(app)/events/error.tsx`
- `src/app/(app)/validations/error.tsx`

### Verification
- Build passes
- Each route group has `error.tsx`
- Error in any feature shows friendly error UI instead of full page crash
- "Try again" button resets error state

### Rollback
Delete error boundary files. Low risk.

---

## Task 3B.4: Consolidate State Management — Remove AppProvider/AppLayoutShell Duplication

### Problem
`AppProvider` and `AppLayoutShell` both fetch user, sessions, and universes. Every page load makes 2x API calls. Three overlapping state systems (AppContext + localStorage + component state) with no single source of truth.

### Implementation

**1. Audit current data flow:**

Read both files to map:
- What `AppProvider` fetches and stores
- What `AppLayoutShell` fetches and stores
- Where they overlap
- What depends on each

**2. Make `AppProvider` the single source of truth:**

- `AppProvider` fetches: user, sessions, universes, active state
- `AppLayoutShell` reads from `AppProvider` context — NO independent fetching

**3. Update `AppLayoutShell`:**

```typescript
// BEFORE (app-layout-shell.tsx):
const [user, setUser] = useState(null);
const [localSessions, setLocalSessions] = useState([]);
const [localUniverses, setLocalUniverses] = useState([]);

useEffect(() => {
  fetch('/api/auth/me').then(r => r.json()).then(setUser);
}, []);

useEffect(() => {
  fetch('/api/sessions').then(r => r.json()).then(setLocalSessions);
}, []);

useEffect(() => {
  fetch('/api/universes').then(r => r.json()).then(setLocalUniverses);
}, []);

// AFTER:
'use client';
import { useApp } from '@/contexts/app-context';

export function AppLayoutShell({ children }: { children: ReactNode }) {
  const { user, sessions, universes, activeSession, activeUniverse } = useApp();

  // Use context values directly — no duplicate fetching
  // ... rest of component uses user, sessions, universes from context
}
```

**4. Remove localStorage state cache:**

Since Phase 1 moved auth to httpOnly cookies, localStorage is no longer needed for auth. Remove the state persistence layer:

```typescript
// Remove from app-context.tsx:
// - saveStateToDb() calls
// - restoreStateFromDb() calls
// - localStorage reads/writes for active state
```

**5. Make active state URL-driven:**

Instead of storing active session/universe in localStorage, derive from URL:

```typescript
// In app-context.tsx:
'use client';
import { usePathname } from 'next/navigation';

export function AppProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Derive active IDs from URL
  const activeSessionId = pathname.match(/\/session\/([^/]+)/)?.[1];
  const activeUniverseId = pathname.match(/\/universe\/([^/]+)/)?.[1];

  // Fetch data based on active IDs
  // ...
}
```

### Verification
- Build passes
- Network tab shows 1x API calls (not 2x) on page load
- User, sessions, universes available in all components via `useApp()`
- No `localStorage` auth references remain
- Active state correctly derived from URL

### Rollback
Revert to duplicate fetching. Medium risk — state flow changes.

---

## Task 3B.5: Fix Circular Processing Dependency Triangle

### Problem
`idle-processing.ts` → `job-processor.ts` → `idle-enrichment.ts` → `idle-processing.ts`. Circular dependency makes the codebase fragile.

### Implementation

**1. Analyze the circular dependency:**

Map exactly which functions are called across the triangle:
- What does `idle-processing` call in `job-processor`?
- What does `job-processor` call in `idle-enrichment`?
- What does `idle-enrichment` call in `idle-processing`?

**2. Break the cycle with event-driven architecture:**

Instead of direct function calls, use the `EventBus` for cross-module communication:

```typescript
// BEFORE (circular):
// idle-processing.ts
import { processJob } from './job-processor';
processJob(db, { type: 'enrichment', ... });

// job-processor.ts
import { generateIndex } from './idle-enrichment';
generateIndex(db, pageId);

// idle-enrichment.ts
import { appendLog } from './idle-processing';
appendLog(db, 'enrichment complete');

// AFTER (event-driven):
// idle-processing.ts
import { eventBus } from '@/lib/event-bus';
eventBus.emit('job:enqueue', { type: 'enrichment', ... });

// job-processor.ts
import { eventBus } from '@/lib/event-bus';
eventBus.emit('index:generate', { pageId });

// idle-enrichment.ts
import { eventBus } from '@/lib/event-bus';
eventBus.emit('log:append', { message: 'enrichment complete' });
```

**3. Alternative: Extract shared coordination layer:**

Create `src/lib/processing-coordinator.ts` that all three modules depend on (no circular deps):

```typescript
// processing-coordinator.ts
import { processJob } from './jobs/processor';
import { generateIndex, appendLog } from './idle/enrichment';
import { checkIdleTiers } from './idle/orchestrator';

export class ProcessingCoordinator {
  static processIdleTasks(db: Database, userId: string): void {
    const tiers = checkIdleTiers(userId);
    for (const tier of tiers) {
      processJob(db, tier.job);
    }
  }

  static enrichWiki(db: Database, pageId: string): void {
    generateIndex(db, pageId);
    appendLog(db, 'enrichment complete');
  }
}
```

Then all three modules import from `processing-coordinator` instead of from each other.

**Recommendation:** Alternative (coordination layer) is cleaner because:
- EventBus is in-memory and loses state on restart
- Coordination layer is explicit and testable
- No implicit data flow

### Verification
- Build passes
- No circular imports (verify with `npx madge --circular src/`)
- All processing still triggers correctly
- No duplicate processing after restart

### Rollback
Revert to circular imports. Medium risk.

---

## Dependencies

```
3B.1 (service layer) ──→ 3B.2 (lib/ reorganization)  [services need stable import paths]
3B.2 (lib/ reorg) ──→ (independent, but do after 3B.1)
3B.3 (error boundaries) ──→ (independent)
3B.4 (state consolidation) ──→ (depends on Phase 1.3 localStorage migration)
3B.5 (circular deps) ──→ (depends on Phase 3A.1 file splitting)
```

**Execution order:**
1. Do 3B.3 (error boundaries — independent, low risk)
2. Do 3B.1 (service layer)
3. Do 3B.2 (lib/ reorganization — after service layer)
4. Do 3B.4 (state consolidation — after Phase 1.3)
5. Do 3B.5 (circular deps — after Phase 3A.1 file splitting)

---

## Success Criteria

- [x] `npx next build` passes
- [ ] ~~Zero `db.prepare()` calls in route handlers (only in services)~~ — DEFERRED (3B.1): Requires service layer extraction, major refactoring beyond audit scope
- [ ] ~~`src/lib/` organized by domain subdirectories~~ — DEFERRED (3B.2): Requires domain grouping, major refactoring beyond audit scope
- [x] All 15+ route groups have `error.tsx` (16 files created)
- [x] `AppLayoutShell` makes zero independent API fetches
- [x] Network tab shows 1x API calls on page load (not 2x)
- [x] No circular imports (`madge --circular` returns clean)
- [x] No new TypeScript errors
