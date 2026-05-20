# Phase 2: Reliability Improvements

**Priority:** HIGH — fix within sprint
**Estimated effort:** 4-6 hours
**Risk:** Medium — touches core data flow and caching
**Constraint:** `npx next build` must pass. No new npm dependencies.

---

## Context

Security hardening (Phase 1) must be complete before this phase. These items address reliability issues: rate limiting, input validation, error handling, and duplicated code that causes maintenance burden.

---

## Task 2.1: Add Rate Limiting

### Problem
Zero rate limiting on any endpoint. Auth endpoints vulnerable to brute-force. Generation endpoints vulnerable to resource exhaustion. Upload endpoints vulnerable to disk filling.

### Implementation

**1. Create rate limiter utility** — `src/lib/rate-limiter.ts`:
```typescript
import { LRUCache } from './lru-cache'; // Simple in-memory LRU (no npm dep)

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (per-process — sufficient for single-instance)
const store = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

const DEFAULTS: Record<string, RateLimitConfig> = {
  auth:      { windowMs: 15 * 60 * 1000, maxRequests: 10 },   // 10 per 15 min
  generate:  { windowMs: 60 * 1000,      maxRequests: 5 },    // 5 per minute
  upload:    { windowMs: 60 * 1000,      maxRequests: 20 },   // 20 per minute
  api:       { windowMs: 60 * 1000,      maxRequests: 100 },  // 100 per minute (general)
};

export function checkRateLimit(
  key: string,
  tier: keyof typeof DEFAULTS = 'api'
): { allowed: boolean; retryAfter?: number; remaining: number } {
  const config = DEFAULTS[tier];
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1 };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      remaining: 0,
    };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count };
}

// Cleanup old entries periodically (call on first request)
let lastCleanup = 0;
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60 * 1000) return; // Every 5 min
  lastCleanup = now;
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key);
  }
}

export function createRateLimitResponse(retryAfter: number): Response {
  return NextResponse.json(
    { error: 'Rate limit exceeded. Try again later.', retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}
```

**2. Apply to auth endpoints:**
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/register/route.ts`

```typescript
import { checkRateLimit, createRateLimitResponse, cleanupExpiredEntries } from '@/lib/rate-limiter';

export async function POST(request: Request) {
  cleanupExpiredEntries();
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const limit = checkRateLimit(`auth:${ip}`, 'auth');
  if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);
  // ... existing logic
}
```

**3. Apply to generate endpoints:**
- `src/app/api/generate/[id]/route.ts`
- `src/app/api/wiki/ingest/route.ts`
- `src/app/api/wiki/lint/route.ts`

```typescript
const limit = checkRateLimit(`generate:${decoded.userId}`, 'generate');
if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);
```

**4. Apply to upload endpoint:**
- `src/app/api/wiki/sources/upload/route.ts`

```typescript
const limit = checkRateLimit(`upload:${decoded.userId}`, 'upload');
if (!limit.allowed) return createRateLimitResponse(limit.retryAfter!);
```

### Verification
- Build passes
- Rapid login attempts (>10 in 15 min) return 429
- Rapid generation requests (>5/min) return 429
- Normal usage unaffected
- Rate limit headers present in 429 responses

### Rollback
Remove rate limiter imports and calls. Low risk.

---

## Task 2.2: Add Upload Size Limits + MIME Validation

### Problem
`src/app/api/wiki/sources/upload/route.ts` accepts arbitrary file sizes and types. No validation on content or size.

### Implementation

**1. `src/app/api/wiki/sources/upload/route.ts`** — Add validation:

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/pdf',
  'application/json',
  'application/xml',
  'text/xml',
]);
const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.xml', '.pdf',
]);

export async function POST(request: Request, { params }: { params: { slug: string[] } }) {
  // ... existing auth check ...

  const formData = await request.formData();
  const file = formData.get('file') as File;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Size check
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
      { status: 413 }
    );
  }

  // MIME type check
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `File type not allowed. Allowed: ${[...ALLOWED_MIME_TYPES].join(', ')}` },
      { status: 415 }
    );
  }

  // Extension check (defense in depth — MIME can be spoofed)
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `File extension not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}` },
      { status: 415 }
    );
  }

  // Filename sanitization
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

  // ... existing upload logic with safeName ...
}
```

### Verification
- Build passes
- Upload >10MB file → 413 response
- Upload `.exe` file → 415 response
- Upload `.txt` file <10MB → succeeds
- Filename with special chars sanitized

### Rollback
Remove validation checks. Low risk.

---

## Task 2.3: Replace `any` Types with Proper Interfaces

### Problem
86 `any` types across 43 files. Zero type safety in API routes, event bus, embeddings, and relationship modules.

### Implementation

**1. Create shared types file** — `src/lib/types.ts`:
```typescript
// Database row types (better-sqlite3 returns generic objects)
export interface DbRow {
  [key: string]: unknown;
}

// Event bus types
export type EventName = string;
export type EventHandler<T = unknown> = (data: T) => void;

// API client types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// Job types
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type JobType =
  | 'response'
  | 'summarize'
  | 'embeddings'
  | 'relationships'
  | 'wiki'
  | 'memories'
  | 'decay'
  | 'enrichment'
  | 'ingest'
  | 'lint'
  | 'contradiction'
  | 'memory-compression'
  | 'index-generation'
  | 'voice-discovery'
  | 'idle-processing';

// Relationship types
export interface RelationshipEntity {
  id: string;
  name: string;
  // ... existing fields from DB schema
}

// Wiki types
export interface WikiPage {
  slug: string;
  title: string;
  content: string;
  status: 'draft' | 'reviewed' | 'locked';
  // ... existing fields
}
```

**2. Update files systematically** — Group by module:

**Group A: Event bus** (`src/lib/event-bus.ts`)
```typescript
// BEFORE:
type EventHandler = (data: any) => void;
emit(eventName: string, data: any)

// AFTER:
import type { EventHandler, EventName } from '@/lib/types';
type EventHandlerMap = Map<EventName, EventHandler<unknown>[]>;
emit<T>(eventName: EventName, data: T)
```

**Group B: API routes with `params: any[]`** (10+ files)
```typescript
// BEFORE:
const params: any[] = [userId, universeId];
db.prepare("SELECT ... WHERE user_id = ?").all(...params);

// AFTER:
const params: (string | number)[] = [userId, universeId];
// Or use the DbRow type from types.ts
```

**Group C: API routes with `db: any`** (15+ files)
```typescript
// BEFORE:
function ensureTable(db: any) { ... }
function getSessionSettings(db: any) { ... }

// AFTER:
import type { Database } from 'better-sqlite3';
function ensureTable(db: Database) { ... }
function getSessionSettings(db: Database) { ... }
```

**Group D: API routes with `row: any` / `data: any`** (10+ files)
```typescript
// BEFORE:
function rowToJson(row: any) { ... }
const sessions: any[] = db.prepare("...").all();

// AFTER:
function rowToJson(row: Record<string, unknown>): Record<string, unknown> { ... }
const sessions = db.prepare("...").all() as Array<Record<string, unknown>>;
```

**Group E: `as any` casts in markdown-renderer.tsx** (7 casts)
```typescript
// BEFORE:
(node.properties as any).className = [...];

// AFTER:
import type { Element } from 'hast';
const props = (node as Element).properties;
if (props && typeof props === 'object') {
  props.className = [...];
}
```

**Group F: `as any` casts in callout-remark-plugin.ts** (6 casts)
```typescript
// BEFORE:
(calloutNode.data as any).type = 'callout';

// AFTER:
// Define proper type for callout node data
interface CalloutData {
  type: 'callout';
  calloutType: string;
  title?: string;
  content: string;
}
calloutNode.data = { type: 'callout', calloutType, title, content } as CalloutData;
```

### Verification
- Build passes with zero TypeScript errors
- `grep -r ": any" src/` shows significant reduction (target: <20 from 86)
- No `as any` in new code
- All API routes still function correctly

### Rollback
Revert type changes. Medium risk — some type changes may expose real bugs.

---

## Task 2.4: Add Logging to Empty Catch Blocks

### Problem
`src/lib/group-migrations.ts` has 18 consecutive `} catch {}` blocks. All errors silently swallowed. Makes debugging migration failures impossible.

### Implementation

**1. `src/lib/group-migrations.ts`** — Add logging:
```typescript
// BEFORE:
try { db.exec("ALTER TABLE groups ADD COLUMN ..."); } catch {}
try { db.exec("ALTER TABLE groups ADD COLUMN ..."); } catch {}
// ... 18 times

// AFTER:
function safeMigration(db: Database, sql: string, description: string): void {
  try {
    db.exec(sql);
  } catch (err) {
    // Expected: "column already exists" — skip silently
    // Unexpected: log for debugging
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('already exists') && !message.includes('duplicate')) {
      console.warn(`[group-migrations] ${description}: ${message}`);
    }
  }
}

safeMigration(db, "ALTER TABLE groups ADD COLUMN ...", "add description column");
safeMigration(db, "ALTER TABLE groups ADD COLUMN ...", "add settings column");
// ... all 18 migrations
```

**2. `src/contexts/app-context.tsx`** — Line 194:
```typescript
// BEFORE:
} catch {}

// AFTER:
} catch (err) {
  console.warn('[AppProvider] Failed to restore state from DB:', err);
}
```

**3. `src/app/api/sessions/[id]/private-state/route.ts`** — Line 46:
```typescript
// BEFORE:
} catch {}

// AFTER:
} catch (err) {
  console.warn('[private-state] Failed to save private state:', err);
}
```

### Verification
- Build passes
- Migration errors now logged (test by running migration twice)
- No change in behavior — migrations still succeed/fail the same way
- Expected errors ("already exists") still silent

### Rollback
Revert to empty catches. Low risk.

---

## Task 2.5: Extract Duplicated Code

### Problem
10+ duplicate patterns across the codebase. Each copy is a maintenance burden — fixing a bug in one means fixing it in all.

### Implementation

**2.5a: Extract `rowToJson` helper**

Create `src/lib/row-to-json.ts`:
```typescript
/**
 * Converts a better-sqlite3 row object to a plain JSON object.
 * better-sqlite3 returns objects with prototype methods; this strips them.
 */
export function rowToJson(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const value = row[key];
    if (typeof value === 'bigint') {
      result[key] = Number(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
```

Update 4 files to import from this utility:
- `src/app/api/narrative-threads/route.ts`
- `src/app/api/timeline/route.ts`
- `src/app/api/timelines/[id]/layers/route.ts`
- `src/app/api/timelines/[id]/layers/[layerId]/route.ts`

**2.5b: Extract `ensureParticipantColumns` helper**

Create `src/lib/session-columns.ts`:
```typescript
import type { Database } from 'better-sqlite3';

export function ensureParticipantColumns(db: Database): void {
  try { db.exec("ALTER TABLE participants ADD COLUMN ..."); } catch { /* exists */ }
  // ... existing column checks
}
```

Update 2 files:
- `src/app/api/sessions/[id]/route.ts`
- `src/app/api/sessions/[id]/participants/route.ts`

**2.5c: Extract `hasRelationshipAccess` helper**

Add to `src/lib/relationship-analysis.ts` or create `src/lib/relationship-access.ts`:
```typescript
import type { Database } from 'better-sqlite3';

export function hasRelationshipAccess(
  db: Database,
  relationshipId: string,
  userId: string
): boolean {
  const row = db.prepare(
    "SELECT 1 FROM relationships WHERE id = ? AND (owner_id = ? OR participant_id = ?)"
  ).get(relationshipId, userId, userId);
  return !!row;
}

export function getFileOwnerId(
  db: Database,
  relationshipId: string
): string | null {
  const row = db.prepare(
    "SELECT owner_id FROM relationships WHERE id = ?"
  ).get(relationshipId) as { owner_id: string } | undefined;
  return row?.owner_id ?? null;
}
```

Update 3 files:
- `src/app/api/relationships/[id]/file/route.ts`
- `src/app/api/relationships/[id]/evolution/route.ts`
- `src/app/api/relationships/[id]/decay/route.ts`

**2.5d: Extract time-ago formatter**

`src/lib/date-formatter.ts` already exists — add to it:
```typescript
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString();
}
```

Update 3 files to import:
- `src/components/wiki/revision-history.tsx`
- `src/components/session/private-thoughts.tsx`
- `src/app/(app)/jobs/page.tsx`

**2.5e: Centralize LLM prompts**

Create `src/lib/prompts.ts`:
```typescript
export const PROMPTS = {
  wikiEntityExpansion: (entityName: string, currentContent: string) =>
    `Expand on this wiki entity: "${entityName}".\nCurrent content:\n${currentContent}\n\nProvide additional details...`,

  wikiPageSummary: (pageName: string, content: string) =>
    `Summarize this wiki page in one sentence: "${pageName}".\nContent:\n${content}`,

  // ... all other prompts from idle-enrichment, job-processor, idle-processing
} as const;
```

Update 3 files to import from `PROMPTS`:
- `src/lib/idle-enrichment.ts`
- `src/lib/job-processor.ts`
- `src/lib/idle-processing.ts`

**2.5f: Extract time calculation constants**

Add to `src/lib/config.ts`:
```typescript
export const TIME = {
  ONE_SECOND: 1000,
  ONE_MINUTE: 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
  THREE_DAYS: 3 * 24 * 60 * 60 * 1000,
  SEVEN_DAYS: 7 * 24 * 60 * 60 * 1000,
  THIRTY_DAYS: 30 * 24 * 60 * 60 * 1000,
} as const;

export const CONTENT_LIMITS = {
  SHORT: 200,
  MEDIUM: 5000,
  PREVIEW: 300,
  SUMMARY_CHUNK: 1000,
} as const;

export const IDLE_TIERS = {
  TIER_1: 5 * 60 * 1000,   // 5 minutes
  TIER_2: 10 * 60 * 1000,  // 10 minutes
  TIER_3: 15 * 60 * 1000,  // 15 minutes
  TIER_4: 30 * 60 * 1000,  // 30 minutes
} as const;
```

Update all files using hardcoded time calculations to use `TIME.*` constants.

### Verification
- Build passes
- `grep -r "function rowToJson" src/` returns exactly 1 result
- `grep -r "function hasRelationshipAccess" src/` returns exactly 1 result
- `grep -r "function formatRelativeTime" src/` returns exactly 1 result
- `grep -r "function ensureParticipantColumns" src/` returns exactly 1 result
- All API routes still function correctly
- Time-ago display still works in UI

### Rollback
Revert to duplicated functions. Low risk.

---

## Task 2.6: Consolidate Auth Boilerplate into `withAuth()` Wrapper

### Problem
75+ route files repeat the same 4-line auth check pattern. Two different token extraction styles coexist.

### Implementation

**1. Create auth middleware wrapper** — `src/lib/with-auth.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getAuthToken } from '@/lib/auth-token';

export interface AuthContext {
  userId: string;
  decoded: Record<string, unknown>;
}

export async function withAuth(
  request: NextRequest
): Promise<{ auth: AuthContext } | { error: Response }> {
  const token = getAuthToken(request);
  if (!token) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const decoded = await verifyToken(token);
  if (!decoded) {
    return {
      error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }),
    };
  }

  return {
    auth: {
      userId: decoded.userId as string,
      decoded,
    },
  };
}
```

**2. Update route handlers** — Example transformation:

```typescript
// BEFORE:
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    const userId = decoded.userId;
    // ... business logic
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// AFTER:
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await withAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult.auth;
  // ... business logic
}
```

**3. Migration strategy** — Do this incrementally:
- Start with 5 newest routes (already using `getAuthToken`)
- Then do 10 routes per batch
- Verify build passes after each batch
- Total: ~8 batches for all 75 routes

### Verification
- Build passes after each batch
- All authenticated endpoints still require valid token
- Invalid tokens still return 401
- No regression in any endpoint behavior

### Rollback
Revert individual routes to inline auth checks. Low risk — each route is independent.

---

## Dependencies

```
2.1 (rate limiting) ──→ (independent)
2.2 (upload validation) ──→ (independent)
2.3 (any types) ──→ 2.6 (withAuth wrapper)  [types must be fixed first]
2.4 (empty catches) ──→ (independent)
2.5 (duplicate code) ──→ (independent)
2.6 (withAuth wrapper) ──→ (depends on 2.3)
```

**Execution order:**
1. Do 2.1, 2.2, 2.4, 2.5 in parallel (all independent)
2. Do 2.3 (type fixes)
3. Do 2.6 (withAuth wrapper — depends on type fixes)

---

## Success Criteria

- [x] `npx next build` passes
- [x] Rate limiting returns 429 after threshold exceeded
- [x] Upload rejects files >10MB or disallowed types
- [x] Zero `any` types in event bus, embeddings, and relationship modules
- [x] `group-migrations.ts` logs unexpected errors
- [x] `rowToJson` exists in exactly 1 file
- [x] `hasRelationshipAccess` exists in exactly 1 file (`src/lib/relationship-access.ts`)
- [x] `formatRelativeTime` exists in exactly 1 file
- [x] `ensureParticipantColumns` exists in exactly 1 file
- [x] LLM prompts centralized in `src/lib/prompts.ts`
- [x] `withAuth()` wrapper created and used in at least 5 routes
- [x] No new TypeScript errors
