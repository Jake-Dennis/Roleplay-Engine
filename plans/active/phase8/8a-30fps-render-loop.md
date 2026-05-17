# Phase 8A: True 30fps Render Loop

## Goal
Wire the existing `RenderLoop` class into React components so animated elements (streaming text, typing indicators, scroll, FPS counter) update at a capped 30fps instead of relying on React's default render cycle.

## Current State
- `src/lib/render-loop.ts` exists with a `RenderLoop` class (RAF-based, 30fps cap)
- Not imported or used anywhere in the app
- Session chat page uses `useEffect` + state updates for streaming (uncontrolled render rate)
- No FPS counter visible in UI

## Architecture

```
┌─────────────────────────────────────────────────┐
│              RenderLoop (singleton)              │
│  targetFPS: 30  |  interval: 33.33ms            │
├─────────────────────────────────────────────────┤
│  Subscribers:                                    │
│  1. StreamingText — cursor blink, char reveal    │
│  2. ScrollManager — smooth auto-scroll           │
│  3. FPSCounter — frame timing display            │
│  4. TypingIndicator — animated dots              │
│  5. ConnectionStatus — live pulse indicator      │
└─────────────────────────────────────────────────┘
```

## Execution Plan

### Step 1: Create `useRenderLoop` Hook
**File**: `src/hooks/use-render-loop.ts`

```typescript
import { useEffect, useRef, useCallback } from "react";
import { renderLoop } from "@/lib/render-loop";

export function useRenderLoop(
  callback: (delta: number) => void,
  enabled: boolean = true
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = renderLoop.subscribe((delta) => {
      callbackRef.current(delta);
    });

    return unsubscribe;
  }, [enabled]);
}
```

### Step 2: Create FPS Counter Component
**File**: `src/components/ui/fps-counter.tsx`

- Small overlay in bottom-right corner
- Shows current FPS (capped at 30)
- Color-coded: green (28-30), yellow (20-27), red (<20)
- Uses `useRenderLoop` to track frame timing
- Toggleable via localStorage setting

### Step 3: Integrate into Session Chat Page
**File**: `src/app/(app)/session/[id]/page.tsx`

Changes:
- Replace `useEffect`-based auto-scroll with `useRenderLoop`-driven scroll
- Streaming text cursor blink driven by render loop (not CSS animation)
- FPS counter added to session header (hidden by default, toggle with `Ctrl+Shift+F`)

```typescript
// Auto-scroll via render loop
useRenderLoop(() => {
  if (shouldScrollRef.current) {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }
}, streaming || newMessageAdded);
```

### Step 4: Streaming Text Component
**File**: `src/components/chat/streaming-text.tsx`

- Extract streaming text into dedicated component
- Uses `useRenderLoop` for cursor blink timing
- Character-by-character reveal synced to 30fps tick
- Prevents React re-rendering entire message list on each chunk

### Step 5: Start RenderLoop on App Mount
**File**: `src/app/(app)/layout.tsx`

```typescript
useEffect(() => {
  renderLoop.start();
  return () => renderLoop.stop();
}, []);
```

### Step 6: What Updates at 30fps vs React State

| Component | Update Mechanism | Reason |
|-----------|-----------------|--------|
| Streaming cursor | `useRenderLoop` | Smooth blink, no React re-render |
| Auto-scroll | `useRenderLoop` | Direct DOM manipulation, no state |
| FPS counter | `useRenderLoop` | Frame timing, no state |
| Message list | React state | Data-driven, only on new messages |
| Input field | React state | User interaction |
| Sidebar | React state | Navigation, static |

## Files Changed
- `src/hooks/use-render-loop.ts` (new)
- `src/components/ui/fps-counter.tsx` (new)
- `src/components/chat/streaming-text.tsx` (new)
- `src/app/(app)/session/[id]/page.tsx` (modify)
- `src/app/(app)/layout.tsx` (modify)
- `src/lib/render-loop.ts` (verify, no changes needed)

## Tests
- FPS counter displays correct value
- Streaming text renders at 30fps (not faster)
- Auto-scroll works during streaming
- Render loop starts/stops correctly on mount/unmount
- No memory leaks from subscriber cleanup

## Risk
- **LOW**: Isolated change, doesn't affect data flow
- Render loop may conflict with React 19 concurrent features — mitigate by using refs for DOM manipulation instead of state
