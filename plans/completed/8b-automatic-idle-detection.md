# Phase 8B: Automatic Idle Detection ✅ COMPLETE

## Goal
Replace the current API-triggered idle processing with true client-side idle detection that automatically triggers server-side enrichment jobs based on user inactivity duration.

## Status
All steps completed. Client-side idle tracker hooks user events, sends heartbeat to server, server processes tiered enrichment jobs.

## Current State
- [x] `src/hooks/use-idle-tracker.ts` — tracks mousemove/keydown/click/scroll, calculates idle time + tier
- [x] `src/lib/idle-processing.ts` — 4-tier processing coordinator with `processIdleTier`
- [x] `src/app/(app)/layout.tsx` — idle tracker integrated, idle status indicator shown
- [x] Idle status badge shows "Idle Xm · Tier Y" in bottom-left

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  IdleTracker (hooks mousemove, keydown, click, etc.) │   │
│  │  ↓                                                    │   │
│  │  Heartbeat every 30s → POST /api/idle/heartbeat      │   │
│  │  { lastActivity: timestamp, page: currentPath }      │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                        Server                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  /api/idle/heartbeat — updates user's lastActivity   │   │
│  │  ↓                                                    │   │
│  │  IdleProcessor — checks tiers on each heartbeat      │   │
│  │  ├─ 5 min: memory_compression, relationship_summary  │   │
│  │  ├─ 10 min: lore_deepening, enrich_npc, embeddings   │   │
│  │  ├─ 15 min: expand_rumors, archival_processing       │   │
│  │  └─ 30 min: decay_relationships                      │   │
│  │  ↓                                                    │   │
│  │  Job Queue — queues enrichment jobs                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Execution Plan

### Step 1: Create Idle Tracker Hook
**File**: `src/hooks/use-idle-tracker.ts`

```typescript
import { useEffect, useRef, useState, useCallback } from "react";

interface IdleConfig {
  heartbeatInterval?: number;  // default: 30000ms
  idleThresholds?: number[];   // default: [300000, 600000, 900000, 1800000]
}

export function useIdleTracker(config: IdleConfig = {}) {
  const { heartbeatInterval = 30000, idleThresholds = [300000, 600000, 900000, 1800000] } = config;
  const lastActivityRef = useRef(Date.now());
  const [idleTime, setIdleTime] = useState(0);
  const [currentTier, setCurrentTier] = useState(0);

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((evt) => window.addEventListener(evt, updateActivity));
    return () => events.forEach((evt) => window.removeEventListener(evt, updateActivity));
  }, [updateActivity]);

  // Heartbeat + idle tier check
  useEffect(() => {
    const interval = setInterval(async () => {
      const idle = Date.now() - lastActivityRef.current;
      setIdleTime(idle);

      // Determine tier
      let tier = 0;
      for (let i = idleThresholds.length - 1; i >= 0; i--) {
        if (idle >= idleThresholds[i]) { tier = i + 1; break; }
      }

      if (tier !== currentTier) {
        setCurrentTier(tier);
        // Notify server of tier change
        if (tier > 0) {
          await fetch("/api/idle/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idleTime: idle,
              tier,
              page: window.location.pathname,
            }),
          });
        }
      }
    }, heartbeatInterval);

    return () => clearInterval(interval);
  }, [heartbeatInterval, idleThresholds, currentTier]);

  return { idleTime, currentTier, isIdle: idleTime >= idleThresholds[0] };
}
```

### Step 2: Create Idle Heartbeat API Route
**File**: `src/app/api/idle/heartbeat/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { processIdleTier } from "@/lib/idle-processing";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { idleTime, tier, page } = body;

  const db = getDb();

  // Update user's last activity
  db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").run(decoded.sub);

  // Process idle tier jobs (only once per tier per session)
  if (tier > 0) {
    const lastTier = db.prepare(
      "SELECT last_idle_t FROM users WHERE id = ?"
    ).get(decoded.sub) as { last_idle_t: number } | undefined;

    if (!lastTier || tier > (lastTier.last_idle_t || 0)) {
      await processIdleTier(decoded.sub, tier, page);
      db.prepare("UPDATE users SET last_idle_t = ? WHERE id = ?").run(tier, decoded.sub);
    }
  }

  return NextResponse.json({ success: true, tier });
}
```

### Step 3: Add `last_idle_t` Column to Users Table
**File**: `scripts/init-db.js`

Add to users table:
```sql
last_idle_t INTEGER DEFAULT 0,  -- tracks highest idle tier processed
```

### Step 4: Enhance Idle Processing Library
**File**: `src/lib/idle-processing.ts`

Add `processIdleTier` function:
```typescript
export async function processIdleTier(
  userId: string,
  tier: number,
  currentPage: string
): Promise<void> {
  const db = getDb();

  switch (tier) {
    case 1: // 5 min
      await queueJob(userId, "memory_compression", { priority: "idle" });
      await queueJob(userId, "refine_relationship_summary", { priority: "idle" });
      break;
    case 2: // 10 min
      await queueJob(userId, "lore_deepening", { priority: "idle" });
      await queueJob(userId, "enrich_npc", { priority: "idle" });
      await queueJob(userId, "retrieval_optimization", { priority: "idle" });
      break;
    case 3: // 15 min
      await queueJob(userId, "expand_rumors", { priority: "idle" });
      await queueJob(userId, "archival_processing", { priority: "idle" });
      break;
    case 4: // 30 min
      await queueJob(userId, "decay_relationships", { priority: "idle" });
      break;
  }
}
```

### Step 5: Integrate into App Layout
**File**: `src/app/(app)/layout.tsx`

```typescript
// Inside AppLayout component
const { idleTime, currentTier, isIdle } = useIdleTracker();

// Show idle indicator in footer when idle
{isIdle && (
  <div className="text-xxs text-text-muted">
    Idle: {Math.floor(idleTime / 60000)}m (Tier {currentTier})
  </div>
)}
```

### Step 6: Add Idle Status to Footer
**File**: `src/app/(app)/layout.tsx` (footer section)

- Show idle status when user is inactive > 5 min
- Show tier number and time
- Reset display when user becomes active again

## Files Changed
- `src/hooks/use-idle-tracker.ts` (new)
- `src/app/api/idle/heartbeat/route.ts` (new)
- `src/lib/idle-processing.ts` (modify — add `processIdleTier`)
- `src/app/(app)/layout.tsx` (modify — integrate hook + footer)
- `scripts/init-db.js` (modify — add `last_idle_t` column)

## Tests
- Heartbeat fires every 30s
- Idle tier increments correctly at 5/10/15/30 min
- Activity events reset idle timer
- Server processes correct jobs per tier
- No duplicate job queuing (tier tracking works)
- Heartbeat stops when tab is hidden (Page Visibility API)

## Risk
- **MEDIUM**: Adds network traffic (heartbeat every 30s)
- Mitigate: Only send heartbeat when idle > 1 min, skip when tab hidden
- Mitigate: Use `navigator.sendBeacon` for final heartbeat on page unload
