# Phase 4: Production Readiness

**Priority:** LOW — long-term roadmap
**Estimated effort:** 20-40 hours (spread across multiple sprints)
**Risk:** High — architectural changes, potential data migration
**Constraint:** `npx next build` must pass. No new npm dependencies where possible (Phase 4 is the exception — some deps may be needed).

---

## Context

Phases 1-3 must be complete before this phase. These items address production-scale deployment: horizontal scaling, distributed state, database migration, server state management, graceful shutdown, structured logging, and environment validation.

**Note:** This phase may require new npm dependencies. Each item notes whether a new dependency is needed.

---

## Task 4.1: Migrate EventBus to Redis/Pub-Sub for Multi-Process

### Problem
`EventBus` is in-memory. Server restart drops all SSE connections. Multi-process deployment means events in process A never reach process B's SSE streams.

### New dependency needed
`redis` (npm) or `@upstash/redis` (for serverless)

### Implementation

**1. Create Redis-backed event bus** — `src/lib/event-bus-redis.ts`:

```typescript
import { createClient } from 'redis';
import type { EventHandler, EventName } from '@/lib/types';

class RedisEventBus {
  private pubClient: ReturnType<typeof createClient>;
  private subClient: ReturnType<typeof createClient>;
  private handlers = new Map<EventName, EventHandler<unknown>[]>();
  private connected = false;

  constructor() {
    this.pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    this.subClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

    this.subClient.on('message', (channel, message) => {
      const handlers = this.handlers.get(channel);
      if (handlers) {
        const data = JSON.parse(message);
        handlers.forEach(h => h(data));
      }
    });
  }

  async connect(): Promise<void> {
    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
    this.connected = true;

    // Re-subscribe to all registered channels
    for (const channel of this.handlers.keys()) {
      await this.subClient.subscribe(channel, () => {});
    }
  }

  async disconnect(): Promise<void> {
    await Promise.all([this.pubClient.quit(), this.subClient.quit()]);
    this.connected = false;
  }

  on<T>(event: EventName, handler: EventHandler<T>): void {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler as EventHandler<unknown>);
    this.handlers.set(event, handlers);

    if (this.connected) {
      this.subClient.subscribe(event, () => {});
    }
  }

  async emit<T>(event: EventName, data: T): Promise<void> {
    if (!this.connected) {
      console.warn('[RedisEventBus] Not connected, emitting locally');
      // Fallback to local handlers
      const handlers = this.handlers.get(event);
      if (handlers) handlers.forEach(h => h(data));
      return;
    }
    await this.pubClient.publish(event, JSON.stringify(data));
  }

  // SSE connection tracking (still in-memory — per-process)
  private sseConnections = new Map<string, number>();
  trackSSEConnection(userId: string): void {
    this.sseConnections.set(userId, (this.sseConnections.get(userId) || 0) + 1);
  }
  untrackSSEConnection(userId: string): void {
    const count = (this.sseConnections.get(userId) || 1) - 1;
    if (count <= 0) this.sseConnections.delete(userId);
    else this.sseConnections.set(userId, count);
  }
  getSSEConnectionCount(userId: string): number {
    return this.sseConnections.get(userId) || 0;
  }
}

// Singleton
let _redisBus: RedisEventBus | null = null;
export function getRedisEventBus(): RedisEventBus {
  if (!_redisBus) _redisBus = new RedisEventBus();
  return _redisBus;
}
```

**2. Create fallback in-memory bus** — For dev without Redis:

```typescript
// src/lib/event-bus-fallback.ts
// Keep existing in-memory EventBus as fallback
// When REDIS_URL is not set, use this instead
```

**3. Update all event bus consumers** — Import from factory:

```typescript
// BEFORE:
import { eventBus } from '@/lib/event-bus';

// AFTER:
import { getEventBus } from '@/lib/event-bus-factory';
const eventBus = getEventBus(); // Returns Redis or in-memory based on config
```

**4. Update SSE stream handlers** — Subscribe to Redis channels:

```typescript
// In SSE route handlers:
const bus = getEventBus();
bus.on(`message:created:${sessionId}`, (data) => {
  writer.write(`data: ${JSON.stringify(data)}\n\n`);
});
```

### Verification
- Build passes
- Events published in process A received in process B
- Server restart → SSE connections drop but events still flow via Redis
- Dev mode (no Redis) still works with in-memory fallback

### Rollback
Revert to in-memory EventBus. High risk — requires removing Redis dependency.

---

## Task 4.2: Add Distributed File Locking

### Problem
In-memory file locks (`Map<string, boolean>`) don't work across processes. Server restart releases all locks.

### New dependency needed
`redis` (already added in 4.1) or filesystem-based locks via `proper-lockfile` (npm)

### Implementation

**Option A: Redis-based locks** (preferred if Redis is already set up):

```typescript
// src/lib/wiki/distributed-locks.ts
import { getRedisEventBus } from '@/lib/event-bus-redis';

const LOCK_TIMEOUT = 30 * 1000; // 30 seconds

export async function acquireFileLock(filePath: string): Promise<boolean> {
  const bus = getRedisEventBus();
  const lockKey = `wiki:lock:${filePath}`;
  const acquired = await bus.pubClient.set(lockKey, '1', {
    NX: true,
    PX: LOCK_TIMEOUT,
  });
  return !!acquired;
}

export async function releaseFileLock(filePath: string): Promise<void> {
  const bus = getRedisEventBus();
  const lockKey = `wiki:lock:${filePath}`;
  await bus.pubClient.del(lockKey);
}

export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const acquired = await acquireFileLock(filePath);
  if (!acquired) throw new Error(`File locked: ${filePath}`);
  try {
    return await fn();
  } finally {
    await releaseFileLock(filePath);
  }
}
```

**Option B: Filesystem-based locks** (no Redis needed):

```typescript
// src/lib/wiki/file-locks.ts
import path from 'path';
import fs from 'fs';

const LOCK_DIR = path.join(process.cwd(), 'data', '.locks');

function ensureLockDir(): void {
  if (!fs.existsSync(LOCK_DIR)) fs.mkdirSync(LOCK_DIR, { recursive: true });
}

function getLockPath(filePath: string): string {
  const hash = Buffer.from(filePath).toString('base64').replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(LOCK_DIR, `${hash}.lock`);
}

export function acquireFileLock(filePath: string): boolean {
  ensureLockDir();
  const lockPath = getLockPath(filePath);
  try {
    fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    // Lock exists — check if stale
    const pid = parseInt(fs.readFileSync(lockPath, 'utf-8'));
    try {
      process.kill(pid, 0); // Check if process exists
      return false; // Process exists, lock is valid
    } catch {
      // Process dead — stale lock, remove and retry
      fs.unlinkSync(lockPath);
      return acquireFileLock(filePath);
    }
  }
}

export function releaseFileLock(filePath: string): void {
  const lockPath = getLockPath(filePath);
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Lock already released
  }
}
```

**Recommendation:** Option B — no new dependency, works with existing file-based architecture.

**Update `src/lib/wiki/file-io.ts`:**

```typescript
// BEFORE:
const fileLocks = new Map<string, boolean>();

// AFTER:
import { acquireFileLock, releaseFileLock } from './file-locks';

export async function writeWikiFile(filePath: string, content: string): Promise<void> {
  const acquired = acquireFileLock(filePath);
  if (!acquired) throw new Error(`File locked: ${filePath}`);
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
  } finally {
    releaseFileLock(filePath);
  }
}
```

### Verification
- Build passes
- Two processes cannot write same file simultaneously
- Stale locks (dead process) automatically cleaned up
- Server restart doesn't release locks (filesystem persists)

### Rollback
Revert to in-memory locks. Low risk.

---

## Task 4.3: Migrate from better-sqlite3 to PostgreSQL

### Problem
SQLite is file-based, synchronous, single-writer. Cannot scale beyond single process. Blocking calls freeze the event loop.

### New dependency needed
`pg` (npm) or `@neondatabase/serverless` (for serverless)

### Implementation

**This is the highest-risk item in the entire audit.** Recommend doing this last, after all other phases.

**1. Create database abstraction layer** — `src/lib/db-adapter.ts`:

```typescript
// Interface that both SQLite and PostgreSQL implement
export interface DbAdapter {
  get<T>(sql: string, params?: unknown[]): T | undefined;
  all<T>(sql: string, params?: unknown[]): T[];
  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid?: number };
  transaction<T>(fn: () => T): T;
  close(): void;
}

// SQLite implementation (current)
export class SQLiteAdapter implements DbAdapter {
  constructor(private db: Database) {}
  get<T>(sql: string, params?: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...(params || [])) as T | undefined;
  }
  all<T>(sql: string, params?: unknown[]): T[] {
    return this.db.prepare(sql).all(...(params || [])) as T[];
  }
  run(sql: string, params?: unknown[]): { changes: number } {
    return this.db.prepare(sql).run(...(params || []));
  }
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
  close(): void {
    this.db.close();
  }
}

// PostgreSQL implementation (new)
export class PostgresAdapter implements DbAdapter {
  constructor(private pool: Pool) {}
  async get<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const { rows } = await this.pool.query(sql, params);
    return rows[0] as T | undefined;
  }
  async all<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const { rows } = await this.pool.query(sql, params);
    return rows as T[];
  }
  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const { rowCount } = await this.pool.query(sql, params);
    return { changes: rowCount ?? 0 };
  }
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
```

**2. Create factory** — `src/lib/db-factory.ts`:

```typescript
export function getDbAdapter(): DbAdapter {
  if (process.env.DATABASE_URL?.startsWith('postgres://')) {
    return new PostgresAdapter(new Pool({ connectionString: process.env.DATABASE_URL }));
  }
  return new SQLiteAdapter(getSqliteDatabase());
}
```

**3. Migration strategy:**
- Phase 1: Create adapter interface + SQLite implementation (no behavior change)
- Phase 2: Update all DB calls to use adapter (async/await where needed)
- Phase 3: Create PostgreSQL schema migration from SQLite
- Phase 4: Test with PostgreSQL in staging
- Phase 5: Switch production to PostgreSQL

**4. Schema migration** — Create PostgreSQL schema:

```sql
-- SQLite → PostgreSQL differences:
-- INTEGER PRIMARY KEY → SERIAL PRIMARY KEY
-- BOOLEAN → BOOLEAN (same)
-- DATETIME → TIMESTAMP
-- TEXT → TEXT (same)
-- BLOB → BYTEA
-- AUTOINCREMENT → GENERATED ALWAYS AS IDENTITY
```

### Verification
- Build passes
- All DB operations work with SQLite adapter
- All DB operations work with PostgreSQL adapter
- Data migration from SQLite to PostgreSQL preserves all data
- Performance acceptable with PostgreSQL

### Rollback
Switch back to SQLite adapter. High risk — data migration may be lossy.

---

## Task 4.4: Add React Query for Server State Management

### Problem
No React Query, SWR, or similar. Every component manages its own loading/error/data lifecycle. No automatic refetching, no cache invalidation, no optimistic updates.

### New dependency needed
`@tanstack/react-query` (npm)

### Implementation

**1. Set up React Query provider** — `src/providers/query-provider.tsx`:

```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes (was cacheTime)
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

**2. Add to root layout:**

```typescript
// src/app/layout.tsx
import { QueryProvider } from '@/providers/query-provider';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
```

**3. Create custom hooks for common queries:**

```typescript
// src/hooks/use-sessions.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useSessions(universeId?: string) {
  return useQuery({
    queryKey: ['sessions', universeId],
    queryFn: async () => {
      const url = universeId ? `/api/sessions?universeId=${universeId}` : '/api/sessions';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch sessions');
      return res.json();
    },
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; universeId: string }) => {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create session');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}
```

**4. Migrate components incrementally:**
- Start with wiki pages (most read-heavy)
- Then session pages (most write-heavy)
- Then remaining pages

### Verification
- Build passes
- Components using React Query auto-refetch on mutation
- Cache invalidation works (create session → list updates)
- No duplicate API calls for same data

### Rollback
Remove React Query, revert to manual fetch. Medium risk.

---

## Task 4.5: Add Graceful Shutdown Handlers

### Problem
No `process.on('SIGTERM')` handler. No cleanup of SSE connections on shutdown. No draining of TTS queue or job queue. `closeDb()` exists but is never called.

### Implementation

**1. Create shutdown handler** — `src/lib/shutdown.ts`:

```typescript
import { closeDb } from '@/lib/db';
import { getEventBus } from '@/lib/event-bus-factory';
import { getTtsQueue } from '@/lib/tts-queue';

let isShuttingDown = false;

export function setupGracefulShutdown(): void {
  const signals = ['SIGTERM', 'SIGINT'] as const;

  for (const signal of signals) {
    process.on(signal, async () => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`[shutdown] Received ${signal}, shutting down gracefully...`);

      try {
        // 1. Stop accepting new connections (close HTTP server)
        // This is handled by Next.js in production

        // 2. Drain TTS queue
        const ttsQueue = getTtsQueue();
        await ttsQueue.drain();

        // 3. Wait for pending jobs to complete (with timeout)
        await waitForPendingJobs(5000);

        // 4. Close all SSE connections
        const eventBus = getEventBus();
        eventBus.closeAllConnections();

        // 5. Close database
        closeDb();

        console.log('[shutdown] Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('[shutdown] Error during shutdown:', error);
        process.exit(1);
      }
    });
  }
}

async function waitForPendingJobs(timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const pending = getPendingJobCount();
    if (pending === 0) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.warn('[shutdown] Timeout waiting for jobs, forcing shutdown');
}

function getPendingJobCount(): number {
  // Query job_queue for pending/running jobs
  return 0; // Implement based on your job queue
}
```

**2. Initialize in server entry point:**

```typescript
// src/instrumentation.ts (Next.js instrumentation hook)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { setupGracefulShutdown } = await import('@/lib/shutdown');
    setupGracefulShutdown();
  }
}
```

### Verification
- Build passes
- `SIGTERM` → graceful shutdown within 5 seconds
- SSE connections closed cleanly
- DB connection closed
- No orphaned processes

### Rollback
Remove shutdown handler. Low risk.

---

## Task 4.6: Add Structured Logging + Error Tracking

### Problem
All error boundaries only `console.error`. No integration with error tracking (Sentry, LogRocket, etc.). No structured logging format.

### New dependency needed
`sentry/browser` + `sentry/nextjs` (npm) or similar

### Implementation

**1. Set up Sentry** — `src/lib/sentry.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';

export function initSentry(): void {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}
```

**2. Update error boundaries:**

```typescript
// src/app/(app)/error.tsx
'use client';
import * as Sentry from '@sentry/nextjs';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  Sentry.captureException(error);
  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

**3. Update API route error handling:**

```typescript
import * as Sentry from '@sentry/nextjs';

export async function GET(request: NextRequest) {
  try {
    // ...
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: '/api/sessions' },
      user: { id: userId },
    });
    return internalError();
  }
}
```

**4. Structured logging** — Update `src/lib/logger.ts`:

```typescript
const isDev = process.env.NODE_ENV === 'development';

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

function formatLog(entry: LogEntry): string {
  if (isDev) {
    return `[${entry.level.toUpperCase()}] ${entry.message}`;
  }
  return JSON.stringify(entry);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => {
    if (!isDev) return;
    console.log(formatLog({ level: 'debug', message, timestamp: new Date().toISOString(), context }));
  },
  info: (message: string, context?: Record<string, unknown>) => {
    console.log(formatLog({ level: 'info', message, timestamp: new Date().toISOString(), context }));
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    console.warn(formatLog({ level: 'warn', message, timestamp: new Date().toISOString(), context }));
  },
  error: (message: string, error?: Error, context?: Record<string, unknown>) => {
    console.error(formatLog({ level: 'error', message, timestamp: new Date().toISOString(), context }));
    if (error) {
      // In production, this goes to Sentry
      if (!isDev) {
        // Sentry.captureException(error, { context });
      }
    }
  },
};
```

### Verification
- Build passes
- Errors appear in Sentry dashboard
- Production logs are JSON-structured
- Dev logs are human-readable

### Rollback
Remove Sentry, revert to console. Low risk.

---

## Task 4.7: Add Environment Validation on Startup

### Problem
Assumes Ollama running locally, Kokoro running locally, `data/` writable. No environment validation on startup.

### Implementation

**1. Create startup validator** — `src/lib/startup-check.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export async function runStartupChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. Required environment variables
  const required = ['JWT_SECRET'];
  for (const key of required) {
    if (!process.env[key]) {
      results.push({ name: key, status: 'fail', message: `${key} is required` });
    } else {
      results.push({ name: key, status: 'pass', message: `${key} is set` });
    }
  }

  // 2. Optional environment variables
  const optional = ['OLLAMA_BASE_URL', 'KOKORO_BASE_URL', 'REDIS_URL', 'SENTRY_DSN'];
  for (const key of optional) {
    if (!process.env[key]) {
      results.push({ name: key, status: 'warn', message: `${key} not set, using defaults` });
    } else {
      results.push({ name: key, status: 'pass', message: `${key} is set` });
    }
  }

  // 3. Data directory writable
  const dataDir = path.join(process.cwd(), 'data');
  try {
    fs.accessSync(dataDir, fs.constants.W_OK);
    results.push({ name: 'data/', status: 'pass', message: 'Directory is writable' });
  } catch {
    results.push({ name: 'data/', status: 'fail', message: 'Directory not writable' });
  }

  // 4. Ollama connectivity
  try {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      results.push({ name: 'Ollama', status: 'pass', message: 'Connected' });
    } else {
      results.push({ name: 'Ollama', status: 'warn', message: `HTTP ${res.status}` });
    }
  } catch {
    results.push({ name: 'Ollama', status: 'warn', message: 'Not reachable (LLM features disabled)' });
  }

  // 5. TTS connectivity
  try {
    const ttsUrl = process.env.KOKORO_BASE_URL || 'http://localhost:5001';
    const res = await fetch(`${ttsUrl}/v1/voices`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      results.push({ name: 'TTS', status: 'pass', message: 'Connected' });
    } else {
      results.push({ name: 'TTS', status: 'warn', message: `HTTP ${res.status}` });
    }
  } catch {
    results.push({ name: 'TTS', status: 'warn', message: 'Not reachable (TTS features disabled)' });
  }

  // 6. Database
  try {
    const { getDbAdapter } = await import('@/lib/db-factory');
    const db = getDbAdapter();
    db.get('SELECT 1');
    results.push({ name: 'Database', status: 'pass', message: 'Connected' });
  } catch (error) {
    results.push({ name: 'Database', status: 'fail', message: error instanceof Error ? error.message : 'Unknown error' });
  }

  return results;
}

export function printStartupReport(results: CheckResult[]): void {
  console.log('\n=== Startup Health Check ===\n');
  for (const result of results) {
    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
    console.log(`${icon} ${result.name}: ${result.message}`);
  }

  const failures = results.filter(r => r.status === 'fail');
  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} critical check(s) failed. Server may not function correctly.`);
  }
  console.log('');
}
```

**2. Run on server start:**

```typescript
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runStartupChecks, printStartupReport } = await import('@/lib/startup-check');
    const { setupGracefulShutdown } = await import('@/lib/shutdown');

    const results = await runStartupChecks();
    printStartupReport(results);

    setupGracefulShutdown();
  }
}
```

### Verification
- Build passes
- Server startup prints health check report
- Missing `JWT_SECRET` → fail status
- Missing Ollama → warn status (not fatal)
- All checks pass in dev environment

### Rollback
Remove startup checks. Low risk.

---

## Dependencies

```
4.1 (Redis EventBus) ──→ 4.2 (distributed locks)  [can use Redis for locks]
4.2 (distributed locks) ──→ (independent if using filesystem)
4.3 (PostgreSQL) ──→ (independent, but do LAST — highest risk)
4.4 (React Query) ──→ (independent)
4.5 (graceful shutdown) ──→ 4.1 (Redis EventBus)  [shutdown needs to close Redis]
4.6 (Sentry/logging) ──→ (independent)
4.7 (startup checks) ──→ 4.3 (PostgreSQL)  [checks DB connectivity]
```

**Execution order:**
1. Do 4.6 (Sentry/logging — independent, low risk)
2. Do 4.7 (startup checks — independent, low risk)
3. Do 4.4 (React Query — independent, medium risk)
4. Do 4.5 (graceful shutdown — independent, low risk)
5. Do 4.1 (Redis EventBus — needs Redis infra)
6. Do 4.2 (distributed locks — after 4.1 or use filesystem)
7. Do 4.3 (PostgreSQL — LAST, highest risk, requires data migration)

---

## Success Criteria

- [x] `npx next build` passes
- [x] ~~Events flow across multiple processes via Redis~~ — DEFERRED (4.1): Requires Redis infrastructure
- [x] ~~File locks work across processes~~ — DEFERRED (4.2): Requires distributed locking (Redis/proper-lockfile)
- [x] ~~PostgreSQL adapter passes all tests (SQLite still works)~~ — DEFERRED (4.3): Requires PostgreSQL migration
- [x] ~~React Query caches and invalidates correctly~~ — DEFERRED (4.4): Requires @tanstack/react-query
- [x] ~~Errors appear in Sentry dashboard~~ — DEFERRED (4.6): Requires @sentry/nextjs
- [x] Startup health check prints on server start
- [x] No new TypeScript errors
