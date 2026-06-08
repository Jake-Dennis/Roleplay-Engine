# Defer Blocking Wiki/Scene Extractions to Queued Jobs

## TL;DR

> **Quick Summary**: Move two synchronous Ollama calls (`extractAndApplySceneState` and `extractAndCreateWikiEntities`) that run inside the SSE stream callback in `generate/[id]/route.ts` into the job queue system so they execute during idle time instead of blocking the chat response from completing.
>
> **Deliverables**:
> - 2 new job types: `scene_state_extract`, `wiki_auto_extract`
> - 2 job handlers wrapping existing functions + SSE event emission
> - Modified generate route: inline `await` → `queueJob()` 
>
> **Estimated Effort**: Small (3 files, ~80 lines total)
> **Parallel Execution**: YES — 2 tasks
> **Critical Path**: Job registry → Handlers → Generate route

---

## Context

### Original Request
"can we make the wiki tasks queued jobs" / "i dont want it to bog down the flow of chat so i want those tasks to be done later or when idle so chat can still flow"

### Investigation Findings

**The Problem**:
In `src/app/api/generate/[id]/route.ts` (inside `ReadableStream.start()`), after the AI finishes streaming:

1. **`extractAndApplySceneState()`** (line 222-228) — Fetches last 10 messages, calls Ollama (`generateText`) to extract scene state (`temperature: 0.3`), upserts into `scene_states`
2. **`extractAndCreateWikiEntities()`** (line 232-250) — Calls Ollama with entity extraction prompt (`temperature: 0.3, num_ctx: 8192`), parses JSON, creates/updates wiki draft pages, regenerates index, appends log

Both are synchronous `await` calls. The SSE connection stays open while they run — the client sees a hanging/spinning state.

**What Already Works**:
- 3 jobs are already queued after these blocking calls (summarize_messages, generate_embeddings, analyze_relationships)
- `queueJob()`, `processUserJobs()`, `processJobsByType()` all work
- SSE stream at `stream/route.ts` already subscribes to `SCENE_UPDATED`, `JOB_COMPLETED`, `JOB_PROGRESS`, `WIKI_PAGE_CREATED`, `WIKI_PAGE_UPDATED`
- Idle processing tiers (5min/10min/15min/30min) call `processUserJobs()` to drain the queue
- Wiki job handlers exist in `jobs/wiki-handler.ts` (wiki_ingest, wiki_enrich_entity, etc.)

### Key Design Decision

**Queue as `"low"` priority** — these tasks should run during idle processing, not immediately. The existing pattern shows post-generation jobs are queued at `"high"`/`"medium"` which means they get picked up sooner, but still don't block the response. Using `"low"` makes them idle-tier targets.

SSE events (`SCENE_UPDATED`, `WIKI_PAGE_CREATED`) are emitted **inside the job handlers** rather than inline — the stream route already subscribes to these events by session ID.

---

## Work Objectives

### Core Objective
Eliminate post-generation blocking by deferring scene state extraction and wiki entity extraction to the job queue.

### Concrete Deliverables
- `src/lib/job-processor.ts`: Add `scene_state_extract` and `wiki_auto_extract` to `JobType` union + `processJob()` switch
- `src/lib/jobs/wiki-handler.ts`: Add `handleWikiAutoExtract()` handler
- New `src/lib/jobs/scene-handler.ts`: Add `handleSceneStateExtract()` handler
- `src/app/api/generate/[id]/route.ts`: Replace inline `await` calls with `queueJob()` + remove direct event emissions (handlers emit them)

### Definition of Done
- [x] SSE stream closes immediately after AI response finishes (no blocking for scene/wiki extraction)
- [x] Scene state extraction runs as a queued job during idle processing
- [x] Wiki auto-extract runs as a queued job during idle processing
- [x] Both jobs still emit SSE events (`SCENE_UPDATED`, `WIKI_PAGE_CREATED`)
- [x] `npx next build` passes (zero errors)
- [x] Existing chat UX is unchanged (toast notifications for wiki still work)

### Must Have
- New job types registered in `JobType` union
- Both handlers call the existing library functions (no duplicate logic)
- SSE events emitted from handlers (not inline)
- Extract-and-create uses existing `extractAndCreateWikiEntities()` function
- Scene extraction uses existing `extractAndApplySceneState()` function
- Generation stream never fails from these operations (they're just queued)

### Must NOT Have (Guardrails)
- NO changes to the existing library functions (`auto-extract.ts`, `scene-extraction.ts`)
- NO changes to the SSE stream route (`stream/route.ts`)
- NO changes to idle processing logic
- NO new npm dependencies
- NO changes to `JobPayload` type (use existing fields: `sessionId`, `userId`, `content`, `universeId`)
- NO deletion of existing library functions — they remain callable for manual triggers

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO (no test framework in project)
- **Agent-Executed QA**: Mandatory

### QA Policy
- **Build verification**: `npx next build` — zero errors
- **Code review**: Confirm no inline `await` calls to these functions remain in the generate route
- **Event emission**: Confirm handlers emit SSE events on completion

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — independent, parallel):
├── T1: Add job types + registry in job-processor.ts + create scene-handler.ts
└── T2: Add wiki_auto_extract handler to wiki-handler.ts

Wave 2 (Integration — depends on Wave 1):
└── T3: Modify generate route to queue instead of await
```

### Dependency Matrix
- T3 depends on T1 + T2 (job types must exist before generate route queues them)

### Agent Dispatch Summary
- T1: `unspecified-high` — job type union, switch case, new handler file wrapping existing function
- T2: `quick` — single handler addition to existing wiki-handler.ts
- T3: `unspecified-high` — generate route modification (high-stakes, must not break generation)

---

## TODOs

- [x] T1. Add job types + scene handler

  **What to do**:
  **File 1: `src/lib/job-processor.ts`**
  - Add `"scene_state_extract"` and `"wiki_auto_extract"` to the `JobType` union type
  - Add `import { handleSceneStateExtract } from "./jobs/scene-handler";`
  - Add two new cases in the `processJob()` switch:
    ```typescript
    case "scene_state_extract":
      return await handleSceneStateExtract(job.id, payload);
    case "wiki_auto_extract":
      return await handleWikiAutoExtract(job.id, payload);
    ```

  **File 2: New `src/lib/jobs/scene-handler.ts`**
  ```typescript
  import { extractAndApplySceneState } from "@/lib/scene-extraction";
  import { eventBus, SessionEvents } from "@/lib/event-bus";
  import type { JobPayload, JobResult } from "@/lib/job-processor";
  import { updateJobProgress, markJobCompleted } from "@/lib/job-processor";

  export async function handleSceneStateExtract(jobId: string, payload: JobPayload): Promise<JobResult> {
    const { sessionId, userId } = payload;
    if (!sessionId || !userId) throw new Error("Missing sessionId or userId");

    updateJobProgress(jobId, 30, "Extracting scene state...");
    await extractAndApplySceneState(sessionId as string, userId as string);
    updateJobProgress(jobId, 80, "Scene state extracted");

    // Emit SSE event for real-time UI update
    eventBus.emit(`${SessionEvents.SCENE_UPDATED}:${sessionId}`, { sessionId });

    markJobCompleted(jobId);
    return { success: true, jobId, type: "scene_state_extract", data: {} };
  }
  ```

  - Import `handleWikiAutoExtract` if T2 is not parallel — or just add the import for the handler (it will be created in T2)

  **Must NOT do**:
  - Do NOT modify the existing library functions
  - Do NOT change the `JobPayload` type

  **Acceptance Criteria**:
  - [x] `scene_state_extract` and `wiki_auto_extract` in `JobType` union
  - [x] Both cases in `processJob()` switch
  - [x] `scene-handler.ts` exists with `handleSceneStateExtract`
  - [x] `npx next build` passes

- [x] T2. Add wiki_auto_extract handler

  **What to do**:
  **File: `src/lib/jobs/wiki-handler.ts`**
  - Add import: `import { extractAndCreateWikiEntities } from "@/lib/wiki/auto-extract";`
  - Add import: `import { eventBus, SessionEvents } from "@/lib/event-bus";`
  - Add a new case in the `handleWikiJob` switch for `"wiki_auto_extract"` → `handleWikiAutoExtract`
  - Add the handler function:
    ```typescript
    async function handleWikiAutoExtract(jobId: string, payload: JobPayload): Promise<JobResult> {
      const { sessionId, userId, universeId, content } = payload;
      if (!sessionId || !userId) throw new Error("Missing sessionId or userId");

      updateJobProgress(jobId, 20, "Extracting wiki entities...");
      const result = await extractAndCreateWikiEntities(
        sessionId as string,
        userId as string,
        (universeId as string) || null,
        (content as string) || ""
      );
      updateJobProgress(jobId, 80, `Created ${result.created.length}, updated ${result.updated.length}`);

      // Emit SSE events for real-time UI (toast notifications etc.)
      if (result.created.length > 0 || result.updated.length > 0) {
        eventBus.emit(`${SessionEvents.WIKI_PAGE_CREATED}:${sessionId}`, {
          sessionId,
          created: result.created,
          updated: result.updated,
        });
      }

      markJobCompleted(jobId);
      return {
        success: true,
        jobId,
        type: "wiki_auto_extract",
        data: { created: result.created.length, updated: result.updated.length },
      };
    }
    ```

  **Must NOT do**:
  - Do NOT modify the existing `extractAndCreateWikiEntities` function
  - Do NOT change existing handler functions in wiki-handler.ts
  - Do NOT modify any other files

  **Acceptance Criteria**:
  - [x] `wiki_auto_extract` case in `handleWikiJob` switch
  - [x] `handleWikiAutoExtract` exists and calls `extractAndCreateWikiEntities`
  - [x] SSE event emission on wiki changes
  - [x] `npx next build` passes

- [x] T3. Modify generate route

  **What to do**:
  **File: `src/app/api/generate/[id]/route.ts`**

  Replace the inline scene extraction block (lines 222-229):
  ```typescript
  // BEFORE (blocking):
  try {
    await extractAndApplySceneState(sessionId, decoded.sub);
  } catch (err: unknown) { /* ... */ }
  eventBus.emit(`${SessionEvents.SCENE_UPDATED}:${sessionId}`, { sessionId });

  // AFTER (queued):
  queueJob(decoded.sub, "scene_state_extract", {
    sessionId,
    userId: decoded.sub,
  }, "low", session.universe_id || undefined);
  ```

  Replace the inline wiki extraction block (lines 231-250):
  ```typescript
  // BEFORE (blocking):
  try {
    const wikiResult = await extractAndCreateWikiEntities(
      sessionId, decoded.sub, session.universe_id || null, fullResponse
    );
    if (wikiResult.created.length > 0 || wikiResult.updated.length > 0) {
      eventBus.emit(`${SessionEvents.WIKI_PAGE_CREATED}:${sessionId}`, { sessionId, ... });
    }
  } catch (err) { /* ... */ }

  // AFTER (queued):
  queueJob(decoded.sub, "wiki_auto_extract", {
    sessionId,
    userId: decoded.sub,
    universeId: session.universe_id || undefined,
    content: fullResponse,
  }, "low", session.universe_id || undefined);
  ```

  The job processor handles progress + completion events. The job handlers will emit the SSE events (`SCENE_UPDATED`, `WIKI_PAGE_CREATED`) during idle processing.

  Remove unused imports:
  - Remove `import { extractAndApplySceneState } from "@/lib/scene-extraction";`
  - Remove `import { extractAndCreateWikiEntities } from "@/lib/wiki/auto-extract";`

  Keep `queueJob` import (already imported since lines 252-274 use it).

  **Must NOT do**:
  - Do NOT change the stream logic or response format
  - Do NOT change the existing 3 queueJob calls (summarize_messages, generate_embeddings, analyze_relationships)
  - Do NOT modify the `do` events or generation completion logic
  - Do NOT remove the `done` signal emission

  **Acceptance Criteria**:
  - [x] No `await extractAndApplySceneState` in the generate route
  - [x] No `await extractAndCreateWikiEntities` in the generate route
  - [x] Both replaced with `queueJob()` calls at `"low"` priority
  - [x] Unused imports removed
  - [x] `npx next build` passes

---

## Commit Strategy

- T1+T2: `feat(jobs): add scene_state_extract and wiki_auto_extract job handlers`
- T3: `fix(generate): defer blocking wiki/scene extraction to queued jobs`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: ✓ Compiled successfully, zero errors
```

### Final Checklist
- [x] SSE stream closes immediately after AI response (no blocking)
- [x] Scene state extraction runs as queued job during idle
- [x] Wiki auto-extract runs as queued job during idle
- [x] Toast notifications still appear (SSE events emitted from handlers)
- [x] `npx next build` passes
