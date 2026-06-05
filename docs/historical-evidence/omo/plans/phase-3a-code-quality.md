# Phase 3A: Code Quality & Maintainability

**Priority:** MEDIUM — fix within quarter
**Estimated effort:** 6-8 hours
**Risk:** Low — mostly refactoring, no behavior changes
**Constraint:** `npx next build` must pass. No new npm dependencies.

---

## Context

Phase 1 (security) and Phase 2 (reliability) must be complete before this phase. These items address code maintainability: large files, console cleanup, magic numbers, error handling consistency, and auth extraction consistency.

---

## Task 3A.1: Split Large Files

### Problem
10 files exceed 500 lines. The largest (`job-processor.ts` at 1475 lines) handles 15+ job types, imports from 10+ modules, and contains business logic for multiple subsystems.

### Implementation

**3A.1a: Split `job-processor.ts` (1475 lines)**

Create `src/lib/jobs/` directory with per-job-type modules:

```
src/lib/jobs/
├── processor.ts          # Main orchestrator (200 lines)
├── response-handler.ts   # Response generation jobs (150 lines)
├── summarization.ts      # Message/session summarization (150 lines)
├── embeddings.ts         # Vector embedding jobs (100 lines)
├── relationships.ts      # Relationship analysis/decay (200 lines)
├── wiki-jobs.ts          # Wiki ingest/lint/refresh (200 lines)
├── memory-jobs.ts        # Memory compression/management (150 lines)
├── enrichment.ts         # Idle enrichment jobs (150 lines)
├── contradiction.ts      # Semantic contradiction detection (100 lines)
├── voice-discovery.ts    # TTS voice discovery (75 lines)
└── types.ts              # Shared job types and interfaces (50 lines)
```

**`processor.ts`** (main orchestrator):
```typescript
import type { Database } from 'better-sqlite3';
import { handleResponseJob } from './response-handler';
import { handleSummarizationJob } from './summarization';
// ... imports for all job handlers
import type { JobRecord } from './types';

export async function processJob(db: Database, job: JobRecord): Promise<void> {
  switch (job.type) {
    case 'response':
      return handleResponseJob(db, job);
    case 'summarize':
      return handleSummarizationJob(db, job);
    // ... all job types
    default:
      console.warn(`[job-processor] Unknown job type: ${job.type}`);
  }
}

export async function processPendingJobs(db: Database, limit = 10): Promise<number> {
  // ... existing queue processing logic
}
```

Each handler module:
- Imports only what it needs
- Contains all business logic for that job type
- Exports a single `handleXxxJob(db, job)` function
- Has its own error handling

**Migration strategy:**
1. Create `src/lib/jobs/types.ts` with shared types
2. Create one handler module at a time
3. Update `job-processor.ts` to import from new module
4. Delete the old code from `job-processor.ts`
5. Verify build passes after each module

**3A.1b: Split `idle-processing.ts` (890 lines)**

Create `src/lib/idle/` directory:

```
src/lib/idle/
├── orchestrator.ts       # Main idle processing entry point (150 lines)
├── tiers.ts              # Tier definitions and timing logic (100 lines)
├── wiki-idle.ts          # Wiki-related idle tasks (150 lines)
├── relationship-idle.ts  # Relationship idle tasks (150 lines)
├── embedding-idle.ts     # Embedding idle tasks (100 lines)
├── memory-idle.ts        # Memory idle tasks (100 lines)
├── enrichment-idle.ts    # Enrichment idle tasks (150 lines)
└── state.ts              # In-memory state management (50 lines)
```

**3A.1c: Split `settings/page.tsx` (928 lines)**

```
src/app/(app)/settings/
├── page.tsx              # Main page layout (100 lines)
├── tts-settings.tsx      # TTS configuration panel (200 lines)
├── ollama-settings.tsx   # Ollama model configuration (150 lines)
├── cache-management.tsx  # Cache clearing controls (100 lines)
├── voice-assignments.tsx # Voice assignment UI (200 lines)
├── user-profile.tsx      # User profile settings (150 lines)
└── danger-zone.tsx       # Data deletion, reset (75 lines)
```

**3A.1d: Split `timeline/[id]/page.tsx` (928 lines)**

```
src/app/(app)/timeline/[id]/
├── page.tsx              # Main page layout (100 lines)
├── era-editor.tsx        # Era CRUD panel (200 lines)
├── faction-editor.tsx    # Faction CRUD panel (200 lines)
├── character-editor.tsx  # Character CRUD panel (200 lines)
├── timeline-toolbar.tsx  # Action toolbar (75 lines)
└── timeline-list.tsx     # Timeline entries list (150 lines)
```

### Verification
- Build passes after each split
- `wc -l src/lib/job-processor.ts` < 200 (down from 1475)
- `wc -l src/lib/idle-processing.ts` < 200 (down from 890)
- `wc -l src/app/(app)/settings/page.tsx` < 150 (down from 928)
- `wc -l src/app/(app)/timeline/[id]/page.tsx` < 150 (down from 928)
- All functionality preserved — no behavior changes

### Rollback
Revert to monolithic files. Low risk — each split is independent.

---

## Task 3A.2: Remove/Gate Console Statements in Production

### Problem
32 console statements across 19 files. Debug logs in `app-context.tsx` and response logging in `groups/new/page.tsx` are visible in production.

### Implementation

**1. Create logger utility** — `src/lib/logger.ts`:
```typescript
const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.log('[DEBUG]', ...args);
  },
  info: (...args: unknown[]) => {
    console.log('[INFO]', ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args);
  },
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
  },
};
```

**2. Update `app-context.tsx`** — Replace debug logs:
```typescript
// BEFORE:
console.log('[AppProvider] saveStateToDb:', updates);
console.log('[AppProvider] DB state:', dbState);
console.log('[AppProvider] Session not found, clearing state');
console.log('[AppProvider] Universe not found, clearing state');
console.log('[AppProvider] Restore complete:', { sessionId, universeId });

// AFTER:
logger.debug('saveStateToDb:', updates);
logger.debug('DB state:', dbState);
logger.debug('Session not found, clearing state');
logger.debug('Universe not found, clearing state');
logger.debug('Restore complete:', { sessionId, universeId });
```

**3. Update `groups/new/page.tsx`**:
```typescript
// BEFORE:
console.log("Create group response:", data);

// AFTER:
logger.debug("Create group response:", data);
```

**4. Keep `console.error` in error boundaries** — These are Next.js convention and acceptable:
- `src/app/(app)/error.tsx`
- `src/app/(app)/global-error.tsx`
- `src/app/(app)/wiki/error.tsx`
- `src/app/(app)/timeline/error.tsx`
- `src/app/(app)/session/error.tsx`

**5. Keep `console.warn` for operational issues** — These are useful in production:
- TTS/voice/model fetch failures
- State sync failures
- File lock warnings
- Turn config parse failures

**6. Replace `console.error` in API routes** with structured logging:
```typescript
// BEFORE:
console.error('Groups GET error:', error);

// AFTER:
logger.error('Groups GET failed', { userId: decoded?.userId, error: error instanceof Error ? error.message : String(error) });
```

### Verification
- Build passes
- `grep -r "console\.log" src/` returns only `logger.ts` and dev-only code
- `grep -r "console\.debug" src/` returns zero results (all converted to logger.debug)
- Production build shows no debug logs
- Dev build shows debug logs

### Rollback
Revert to direct console calls. Low risk.

---

## Task 3A.3: Centralize Magic Numbers into Constants

### Problem
20+ magic numbers hardcoded throughout the codebase: character limits, time constants, timeouts, tier durations.

### Implementation

**1. Extend `src/lib/config.ts`** with all constants:

```typescript
export const CONFIG = {
  // Auth
  jwtExpiry: 86400, // 24 hours in seconds
  bcryptRounds: 12,

  // Content limits
  content: {
    short: 200,       // Short text fields (names, titles)
    medium: 5000,     // Medium text fields (descriptions)
    long: 50000,      // Long text fields (content bodies)
    preview: 300,     // Preview snippets
    summaryChunk: 1000, // Chunk size for summarization
  },

  // Time constants (milliseconds)
  time: {
    oneSecond: 1000,
    oneMinute: 60 * 1000,
    oneHour: 60 * 60 * 1000,
    oneDay: 24 * 60 * 60 * 1000,
    threeDays: 3 * 24 * 60 * 60 * 1000,
    sevenDays: 7 * 24 * 60 * 60 * 1000,
    thirtyDays: 30 * 24 * 60 * 60 * 1000,
  },

  // Idle processing tiers
  idleTiers: {
    tier1: 5 * 60 * 1000,   // 5 minutes
    tier2: 10 * 60 * 1000,  // 10 minutes
    tier3: 15 * 60 * 1000,  // 15 minutes
    tier4: 30 * 60 * 1000,  // 30 minutes
  },

  // Rate limiting
  rateLimit: {
    auth: { windowMs: 15 * 60 * 1000, maxRequests: 10 },
    generate: { windowMs: 60 * 1000, maxRequests: 5 },
    upload: { windowMs: 60 * 1000, maxRequests: 20 },
    api: { windowMs: 60 * 1000, maxRequests: 100 },
  },

  // Upload
  upload: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ['text/plain', 'text/markdown', 'text/csv', 'application/pdf', 'application/json', 'application/xml'],
    allowedExtensions: ['.txt', '.md', '.csv', '.json', '.xml', '.pdf'],
  },

  // Relationship visualization
  relationship: {
    repulsion: 5000,
    edgeLength: 100,
  },

  // Cache
  cache: {
    maxAge: 3600, // 1 hour
    maxEntries: 1000,
  },

  // Ollama
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    defaultModel: process.env.OLLAMA_MODEL || 'qwen3.5:4b',
    timeout: 30 * 1000, // 30 seconds
  },

  // TTS (Kokoro)
  tts: {
    baseUrl: process.env.KOKORO_BASE_URL || 'http://localhost:5001',
    timeout: 5000, // 5 seconds
    voiceDiscoveryCooldown: 60 * 60 * 1000, // 1 hour
  },
} as const;
```

**2. Update all files using magic numbers:**

Example transformations:
```typescript
// BEFORE (idle-processing.ts):
const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
const content = message.content.slice(0, 1000);

// AFTER:
import { CONFIG } from '@/lib/config';
const fiveMinutesAgo = new Date(Date.now() - CONFIG.idleTiers.tier1);
const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / CONFIG.time.oneDay;
const content = message.content.slice(0, CONFIG.content.summaryChunk);
```

```typescript
// BEFORE (relationship-viz.ts):
repulsion: 5000,

// AFTER:
import { CONFIG } from '@/lib/config';
repulsion: CONFIG.relationship.repulsion,
```

```typescript
// BEFORE (ollama.ts):
const response = await fetch('http://localhost:11434/api/generate', {
  signal: AbortSignal.timeout(30000),
});

// AFTER:
import { CONFIG } from '@/lib/config';
const response = await fetch(`${CONFIG.ollama.baseUrl}/api/generate`, {
  signal: AbortSignal.timeout(CONFIG.ollama.timeout),
});
```

### Verification
- Build passes
- `grep -r "5 \* 60 \* 1000" src/` returns zero results (all use CONFIG)
- `grep -r "24 \* 60 \* 60 \* 1000" src/` returns zero results
- `grep -r "repulsion: 5000" src/` returns zero results
- All functionality preserved

### Rollback
Revert to magic numbers. Low risk.

---

## Task 3A.4: Remove Error Detail Leakage from Responses

### Problem
`src/app/api/sessions/[id]/messages/route.ts` returns `details: err.message` in 500 responses, exposing internal error messages to clients.

### Implementation

**1. Create error response utility** — `src/lib/error-response.ts`:
```typescript
import { NextResponse } from 'next/server';

const isDev = process.env.NODE_ENV === 'development';

export function errorResponse(message: string, status: number, details?: unknown): Response {
  const body: Record<string, unknown> = { error: message };
  if (isDev && details) {
    body.details = details instanceof Error ? details.message : String(details);
  }
  return NextResponse.json(body, { status });
}

export function notFoundError(resource: string): Response {
  return errorResponse(`${resource} not found`, 404);
}

export function unauthorizedError(): Response {
  return errorResponse('Unauthorized', 401);
}

export function forbiddenError(): Response {
  return errorResponse('Forbidden', 403);
}

export function badRequestError(message: string): Response {
  return errorResponse(message, 400);
}

export function internalError(): Response {
  return errorResponse('Internal server error', 500);
}
```

**2. Update `messages/route.ts`**:
```typescript
// BEFORE:
return NextResponse.json(
  { error: 'Internal server error', details: err.message },
  { status: 500 }
);

// AFTER:
import { internalError } from '@/lib/error-response';
// ...
return internalError();
```

**3. Update all route handlers** — Replace manual error responses:
```typescript
// BEFORE:
return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
return NextResponse.json({ error: "Not found" }, { status: 404 });
return NextResponse.json({ error: "Internal server error" }, { status: 500 });

// AFTER:
import { unauthorizedError, notFoundError, internalError } from '@/lib/error-response';
// ...
return unauthorizedError();
return notFoundError('Session');
return internalError();
```

### Verification
- Build passes
- 500 responses in production contain only `{ "error": "Internal server error" }`
- 500 responses in development contain `{ "error": "...", "details": "..." }`
- All error status codes (400, 401, 403, 404, 500) still correct

### Rollback
Revert to manual error responses. Low risk.

---

## Task 3A.5: Migrate All Routes to `getAuthToken()` for Consistent Auth

### Problem
70 routes use direct cookie access (`request.cookies.get("auth-token")`), 5 route groups use `getAuthToken(request)` utility. Inconsistent extraction could lead to security gaps.

### Implementation

**1. Verify `getAuthToken()` utility** — Read `src/lib/auth-token.ts` to ensure it handles all extraction cases (cookie + header fallback).

**2. Batch migration** — 10 routes per batch:

```typescript
// BEFORE:
const token = request.cookies.get("auth-token")?.value;
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// AFTER:
import { getAuthToken } from '@/lib/auth-token';
const token = getAuthToken(request);
if (!token) return unauthorizedError();
```

**3. Verify `getAuthToken()` handles both cookie and header:**
```typescript
// Should look like:
export function getAuthToken(request: Request): string | undefined {
  return request.cookies.get("auth-token")?.value
    ?? request.headers.get("Authorization")?.replace("Bearer ", "");
}
```

### Verification
- Build passes after each batch
- `grep -r 'cookies.get("auth-token")' src/app/api/` returns zero results
- All routes use `getAuthToken()` consistently
- No regression in auth behavior

### Rollback
Revert individual routes. Low risk.

---

## Dependencies

```
3A.1 (split files) ──→ (independent, but do after 2.5 to avoid moving duplicated code)
3A.2 (console cleanup) ──→ (independent)
3A.3 (magic numbers) ──→ (independent)
3A.4 (error responses) ──→ 3A.5 (auth migration)  [both use error-response utility]
3A.5 (auth migration) ──→ (depends on 2.6 withAuth wrapper)
```

**Execution order:**
1. Do 3A.2, 3A.3 in parallel (independent, low risk)
2. Do 3A.4 (error responses)
3. Do 3A.5 (auth migration — depends on 2.6 + 3A.4)
4. Do 3A.1 (split files — largest effort, do last)

---

## Success Criteria

- [x] `npx next build` passes
- [x] `job-processor.ts` split into `src/lib/jobs/` (12 handler files, 8 new + 4 existing)
- [x] `idle-processing.ts` split into `src/lib/idle/` (2 task files extracted: relationship, wiki)
- [x] `settings/page.tsx` reduced from 927 → 427 lines (4 sub-components extracted)
- [x] Zero `console.log`/`console.warn` in production code (except logger.ts, startup-check.ts, shutdown.ts)
- [x] All magic numbers replaced with CONFIG constants
- [x] 500 responses in production contain no internal details
- [x] All routes use `getAuthToken()` consistently
- [x] `error-response.ts` adopted across 9 route files
- [x] `logger.ts` adopted across 6+ files
- [x] No new TypeScript errors
