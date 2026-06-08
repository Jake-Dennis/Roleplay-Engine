# Plan 017: Performance Optimization

## Goal
Implement the most impactful performance improvements: add React.memo to hot-path components, consolidate useSession state into a single object, throttle stream content updates, fix duplicated queries, and dynamic-load heavy dependencies.

## Tasks

### Layer 1 (parallel, no deps)

- [ ] **1a: Add React.memo to hot-path components** (assigned: @perf)
  Add `React.memo` to these components (read each file first):
  - `src/components/chat/MessageBubble.tsx` — memoize individual message bubbles
  - `src/components/chat/MessageInput.tsx` — memoize input area
  - `src/components/wiki/file-tree.tsx` — memoize file/folder tree items
  - `src/components/wiki/markdown-editor.tsx` — memoize editor and preview panes separately  
  - `src/components/wiki/wiki-quick-switcher.tsx` — memoize results list
  - `src/components/session/scene-state-panel.tsx` — memoize panel
  - `src/components/session/session-recap-panel.tsx` — memoize panel
  - `src/components/relationships/relationship-timeline.tsx` — memoize timeline items
  - `src/components/timeline/` components — memoize timeline entries
  - Wrap with `React.memo` and ensure props are primitive or use `React.useMemo` for callback props

- [ ] **1b: Consolidate useSession state** (assigned: @perf)
  - Read `src/hooks/use-session.ts`
  - Replace 6 individual `setState` calls with a single state object:
    ```typescript
    const [state, setState] = useState<SessionState>({
      session: null, messages: [], sceneState: null,
      participants: [], turnConfig: null, isOwner: false
    });
    setState({ session: data.session, messages: data.messages, sceneState: data.sceneState, ... });
    ```
  - Update all consumers to use `state.session`, `state.messages`, etc.
  - Verify: session page still works correctly

- [ ] **1c: Throttle stream content updates** (assigned: @perf)
  - Read `src/app/(app)/session/[id]/page.tsx` SSE handler (around line 409)
  - Replace direct `setStreamContent()` per-token with throttled updates:
    ```typescript
    const streamAccumulator = useRef("");
    const lastFlushTime = useRef(0);
    // In SSE loop:
    streamAccumulator.current += parsed.chunk;
    const now = Date.now();
    if (now - lastFlushTime.current > 100) {
      setStreamContent(streamAccumulator.current);
      lastFlushTime.current = now;
    }
    // Flush remaining on stream end
    ```
  - Verify: streaming still renders smoothly during generation

- [ ] **1d: Fix duplicated queries** (assigned: @perf)
  - Read `src/lib/retrieval.ts` — find duplicated `entity_mentions` fetch (check ~lines 516-575)
  - Move the entity_mentions fetch OUTSIDE both try/catch blocks, cache in a local variable
  - Read `src/app/api/sessions/[id]/turn/route.ts` — fix `getTurnConfig()` to use single query with `WHERE key IN (?, ?, ?)`
  - Verify: generation endpoint uses fewer DB round-trips

- [ ] **1e: Dynamic import cytoscape** (assigned: @perf)
  - Read `src/components/relationships/relationship-graph.tsx` and `src/components/relationships/relationship-web.tsx`
  - Check if they use `react-cytoscapejs` or `cytoscape`
  - Add `next/dynamic` with `ssr: false` for the graph component:
    ```typescript
    const RelationshipGraph = dynamic(() => import("@/components/relationships/relationship-graph"), { ssr: false });
    ```
  - Verify: non-graph pages don't bundle cytoscape (can check with `npm run analyze`)

## Verification
- [ ] 1a: `powershell -NoProfile -Command "if ((Select-String -Path src/components/chat/MessageBubble.tsx -Pattern 'memo' -SimpleMatch) -and (Select-String -Path src/components/wiki/file-tree.tsx -Pattern 'memo' -SimpleMatch) -and (Select-String -Path src/components/session/scene-state-panel.tsx -Pattern 'memo' -SimpleMatch)) { exit 0 } else { exit 1 }"` — should exit 0 (React.memo present in hot-path components)
- [ ] 1b: `powershell -NoProfile -Command "if ((Select-String -Path src/hooks/use-session.ts -Pattern 'SessionState' -SimpleMatch) -and (Select-String -Path src/hooks/use-session.ts -Pattern 'state.session' -SimpleMatch)) { exit 0 } else { exit 1 }"` — should exit 0 (useSession returns single state object)
- [ ] 1c: `powershell -NoProfile -Command "if (Get-ChildItem -Recurse -Filter 'page.tsx' | Select-String -Pattern 'streamAccumulator' -SimpleMatch) { exit 0 } else { exit 1 }"` — should exit 0 (stream throttling in place)
- [ ] 1d: `powershell -NoProfile -Command "$retrieval = Select-String -Path src/lib/retrieval.ts -Pattern 'mentionNames' -SimpleMatch; $turn = Select-String -LiteralPath 'src/app/api/sessions/[id]/turn/route.ts' -Pattern 'key IN' -SimpleMatch; if ($retrieval -and $turn) { exit 0 } else { exit 1 }"` — should exit 0 (duplicated queries fixed)
- [ ] 1e: `npm run build` — should exit 0 (everything compiles clean; 1e was already optimized)
