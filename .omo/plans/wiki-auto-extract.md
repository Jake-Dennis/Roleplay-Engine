# Wiki Auto-Extract: LLM-Powered Entity Creation During Generation

## TL;DR

> **Quick Summary**: After every LLM generation response, auto-detect new named entities (NPCs, locations, factions) and create draft wiki pages. Auto-update existing draft pages with new information. Users retain manual CRUD at all times.
> 
> **Deliverables**:
> - Entity extraction LLM prompt + module (auto-extract.ts)
> - Hook in generate route (post-generation, post-scene-extraction)
> - Wikilink instruction in system prompt (prompt-builder.ts)
> - EventBus events for toast notification
> - SSE whitelist + client-side toast handler
> - Index regeneration + operation logging
> 
> **Estimated Effort**: Medium (5-8 tasks)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Entity extraction prompt → auto-extract module → generate route hook → EventBus/SSE → prompt-builder → toast

---

## Context

### Original Request
"i want it to be fully automated by the llm but i want the user to have the option to also create edit and delete"

### Interview Summary
**Key Discussions**:
- **Timing**: Inline during generation, right after LLM responds (not queued)
- **Scope**: Named entities only — NPCs, locations, factions
- **Visibility**: Silent with subtle toast notification
- **Update existing**: YES — append new info to existing draft pages
- **Conflicts**: Flag via lint (don't overwrite silently). If LLM contradicts existing wiki, append as new section — lint will catch contradictions on the next lint pass
- **Entity detection**: Dedicated LLM call (separate from scene extraction)
- **Wikilink signaling**: Add instruction to system prompt for LLM to use [[wikilinks]]
- **Manual override**: Keep existing wiki CRUD API + UI unchanged

### Research Findings
- Scene extraction (`scene-extraction.ts`) already produces `active_npcs: string[]` and `location: string | null` — structured entity candidates the LLM already identified
- Message summarizer (`message-summarizer.ts`) produces `lore_extracted` array per message — stored but never consumed for wiki creation
- Existing wiki `ingest.ts` has the create/append pattern to follow
- EventBus uses namespaced events (`eventType:sessionId`) — new events must follow this pattern
- SSE stream at `stream/route.ts` whitelist must be updated for new event types
- `src/lib/prompts.ts` already exists (200 lines, 14 prompt templates) — add new prompt, don't create new file
- Wiki file-io.ts supports multiple conflict modes ("fail", "save-diff", "overwrite")
- Sessions can have `universe_id = null` — auto-extract must handle this

### Metis Review
**Identified Gaps** (addressed):
- **Entity detection strategy**: User chose dedicated LLM call (Approach B) over using scene extraction structured data. More expensive but captures entities from full narrative text.
- **EventBus/SSE integration**: New event types must be added to SessionEvents enum and SSE whitelist
- **Rate limiting**: Max 3 wiki operations (creates + updates) per generation event
- **Conflict handling**: Only update `status: "draft"` pages. Skip `reviewed` and `locked` pages.
- **Guardrails**: auto-generated tags, session source traceability, no prompt-builder structural changes

---

## Work Objectives

### Core Objective
Auto-create and auto-update wiki pages from LLM generation output during roleplay sessions. Users retain manual CRUD.

### Concrete Deliverables
- `src/lib/wiki/auto-extract.ts` — Entity extraction + wiki creation module
- Modified `src/app/api/generate/[id]/route.ts` — Post-generation hook
- Modified `src/lib/prompts.ts` — New entity extraction prompt template
- Modified `src/lib/prompt-builder.ts` — Wikilink instruction in system prompt
- Modified `src/lib/event-bus.ts` — New SessionEvents types
- Modified `src/app/api/sessions/[id]/stream/route.ts` — SSE event whitelist
- Client-side toast handler — Subtle wiki notification

### Definition of Done
- [ ] After every generation, entities are extracted from the AI response
- [ ] New entities create draft wiki pages with tags + source metadata
- [ ] Existing draft pages get new info appended
- [ ] Reviewed/locked pages are never modified
- [ ] Max 3 wiki operations per generation
- [ ] Toast notification shows "Wiki: Created N, Updated M"
- [ ] Wiki index is regenerated after changes
- [ ] Wiki operation log is updated
- [ ] `npx next build` passes
- [ ] Existing CRUD / ingest / query / lint still work

### Must Have
- Dedicated LLM call for entity extraction (separate from scene extraction)
- Auto-created pages are `status: "draft"` with `tags: ["auto-generated", "source:session-{sessionId}"]`
- Wikilink instruction added to generation system prompt
- Toast via EventBus → SSE → client
- Rate limit: max 3 wiki operations per generation
- All wiki operations wrapped in try/catch — generation never fails from wiki errors

### Must NOT Have (Guardrails)
- NO entity disambiguation logic (which "Marcus"?) — future scope
- NO faction relationship graphs
- NO auto-delete of entities that no longer appear
- NO cross-universe entity resolution
- NO modification of reviewed/locked wiki pages
- NO changes to scene extraction module (consume its output, don't modify)
- NO changes to existing wiki CRUD API or UI
- NO barrel exports (index.ts)
- NO server actions ("use server")

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO (no test framework in project)
- **Automated tests**: None
- **Agent-Executed QA**: Mandatory for all tasks

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Bash (curl) — hit endpoints, assert status + response fields
- **Build verification**: `npx next build` — zero errors

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — core module + prompt + events):
├── Task 1: Entity extraction prompt (src/lib/prompts.ts)
├── Task 2: auto-extract module (src/lib/wiki/auto-extract.ts)
├── Task 3: EventBus events + SSE whitelist
└── Task 4: Wikilink instruction in prompt-builder

Wave 2 (After Wave 1 — integration + UI):
├── Task 5: Generate route hook
├── Task 6: Client-side toast notification
├── Task 7: Index regeneration + operation logging
└── Task 8: Build verification + QA
```

### Dependency Matrix
- Task 2 (auto-extract) depends on Task 1 (prompt)
- Task 5 (generate hook) depends on Task 2 (auto-extract) + Task 3 (events) + Task 4 (wikilink)
- Task 6 (toast) depends on Task 3 (events)
- Task 7 (index/log) depends on Task 2 (auto-extract)
- Task 8 depends on all Wave 2 tasks

---

## TODOs

- [x] 1. Add entity extraction prompt to `src/lib/prompts.ts`

  **What to do**:
  - Add a new prompt template `extractEntitiesFromResponse` to existing `src/lib/prompts.ts`
  - Prompt takes: the full AI response text, the session's universe context, any existing wiki page titles (to avoid duplicates)
  - LLM returns structured entities: `[{"name": "...", "type": "character|location|faction", "description": "...", "importance": "high|medium|low"}]`
  - Type mapping: characters → `entity`, locations → `entity`, factions → `entity` (type field describes subtype)
  - Instructions: Only extract named entities that are central to the scene. Skip passing mentions. Max 5 entities per response.
  - Follow the existing prompt pattern in `prompts.ts` (exported const string, JSDoc comment, line breaks for readability)
  - Model after `extractLoreComprehensive` prompt (line ~80-130) but scoped to a single response

  **Agent**: `quick` — single-file prompt addition following existing pattern

  **Must NOT do**:
  - Do NOT create a new file — `prompts.ts` already exists
  - Do NOT modify existing prompts

  **References**:
  - `src/lib/prompts.ts:extractLoreComprehensive` — Pattern to follow for entity extraction prompt
  - `src/lib/prompts.ts:extractEvents` — Another structured extraction pattern
  - `src/lib/wiki/ingest.ts:174` — Shows how auto-generated pages are tagged

  **Acceptance Criteria**:
  - [ ] `extractEntitiesFromResponse` prompt added to `prompts.ts`
  - [ ] Prompt returns structured JSON with name, type, description, importance fields
  - [ ] Instructions prevent passing-mention spam (max 5 entities)
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Prompt compiles and builds
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/lib/prompts.ts to verify extractEntitiesFromResponse exists
      2. Run npx next build
    Expected Result: Build passes. New prompt function is exported.
    Evidence: .omo/evidence/task-1-prompt-exists.txt
  ```

- [x] 2. Create `src/lib/wiki/auto-extract.ts`

  **What to do**:
  - Create the core auto-extraction module
  - **Signature**: `async function extractAndCreateWikiEntities(sessionId: string, userId: string, universeId: string | null, aiResponse: string): Promise<{ created: string[], updated: string[], skipped: string[], errors: string[] }>`
  - **Flow**:
    1. If `universeId` is null → return `{ skipped: ["No universe"], errors: [] }` (graceful skip)
    2. Call LLM with `extractEntitiesFromResponse` prompt + AI response text
    3. Parse the JSON output. If parsing fails → return `{ errors: ["parse"] }` (graceful, no crash)
    4. For each entity: check if wiki page with matching title exists using `file-io.ts` `listWikiPages()` + case-insensitive matching
    5. If page doesn't exist: create draft page with `writeWikiPage()` using:
       - `status: "draft"`
       - `tags: ["auto-generated", "source:session-{sessionId}"]`
       - Frontmatter fields from LLM output (name, type)
       - Content: LLM-generated description + "Auto-extracted during session {sessionId}"
    6. If page exists AND `status === "draft"`: append new content as `## Session Update ({date})\n\n{new info}`
    7. If page exists AND `status !== "draft"`: skip (do not modify reviewed/locked)
    8. Enforce max 3 operations total (creates + updates). Prioritize high-importance entities.
    9. Regenerate wiki index (`generateIndex()`)
    10. Append to operation log (`appendLog("auto-extract", ...)`)
    11. Return summary of what was done
  - **Error handling**: EVERYTHING wrapped in try/catch. If any single entity fails, continue with others. Return errors array.
  - **File safety**: Use the existing `file-io.ts` `writeWikiPage` and `readWikiPage` functions (they handle file locking and path sanitization)
  - **Import dependencies**: `@/lib/wiki/file-io`, `@/lib/wiki/index-generator`, `@/lib/wiki/logger`, `@/lib/ollama`, `@/lib/prompts`

  **Agent**: `unspecified-high` — new module with complex logic, error handling, multiple sub-operations

  **Must NOT do**:
  - Do NOT modify any existing wiki files
  - Do NOT write to SQLite for wiki content
  - Do NOT use barrel exports

  **References**:
  - `src/lib/wiki/ingest.ts` — Pattern for entity creation from LLM output (full ingest flow)
  - `src/lib/wiki/file-io.ts` — `writeWikiPage`, `readWikiPage`, `listWikiPages` functions
  - `src/lib/wiki/index-generator.ts:generateIndex` — Index regeneration
  - `src/lib/wiki/logger.ts:appendLog` — Operation logging
  - `src/lib/wiki/types.ts` — `WikiFrontmatter`, `WriteWikiPageOptions` types

  **Acceptance Criteria**:
  - [ ] Creates new draft pages for unknown entities
  - [ ] Appends new info to existing draft pages
  - [ ] Skips reviewed/locked pages
  - [ ] Enforces max 3 operations per call
  - [ ] Handles null universe_id gracefully
  - [ ] Handles empty/wrong LLM output gracefully
  - [ ] Regenerates index after changes
  - [ ] Appends to operation log
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Module compiles and exports
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/lib/wiki/auto-extract.ts
      2. Confirm extractAndCreateWikiEntities is exported
      3. Run npx next build
    Expected Result: Build passes. Module compiles cleanly.
    Evidence: .omo/evidence/task-2-module-compiles.txt

  Scenario: Function signature matches expected types
    Tool: Bash
    Preconditions: None
    Steps:
      1. Check return type is { created: string[], updated: string[], skipped: string[], errors: string[] }
    Expected Result: Type signature matches plan spec
    Evidence: .omo/evidence/task-2-signature.txt
  ```

- [x] 3. Add EventBus events + SSE whitelist

  **What to do**:
  - In `src/lib/event-bus.ts`: Add two new values to the `SessionEvents` enum (or type union):
    - `WIKI_PAGE_CREATED` / `WIKI_PAGE_UPDATED` (or follow the existing naming pattern like `WIKI_PAGE_CREATED = "wiki:page_created"`)
  - The EventBus pattern uses string-type event namespaced with `:sessionId` (e.g., `eventBus.emit("wiki:page_created", sessionId, data)`)
  - Follow the exact existing pattern — look at how `GENERATION_DONE` or `SCENE_UPDATED` events are emitted
  - In `src/app/api/sessions/[id]/stream/route.ts`: Add the new event types to the SSE event whitelist/subscription
  - The SSE stream subscribes to events by name pattern — add `wiki:page_created` and `wiki:page_updated` to the event filter
  - Event payload should include: `{ sessionId, title: string, action: "created" | "updated" }`

  **Agent**: `quick` — small additions to two files following existing patterns

  **Must NOT do**:
  - Do NOT change the EventBus constructor pattern
  - Do NOT modify any SSE connection logic — just add event names to whitelist

  **References**:
  - `src/lib/event-bus.ts` — EventBus singleton, SessionEvents enum/type
  - `src/app/api/sessions/[id]/stream/route.ts` — SSE stream, look for event subscription/filter section

  **Acceptance Criteria**:
  - [ ] Two new event types added to SessionEvents
  - [ ] Events follow existing naming convention (`wiki:page_created`, `wiki:page_updated`)
  - [ ] SSE whitelist includes both events
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Events register without breaking existing events
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/lib/event-bus.ts — confirm new event types exist
      2. Grep for existing SessionEvents to confirm pattern
      3. Run npx next build
    Expected Result: Build passes. All 75+ routes still compile.
    Evidence: .omo/evidence/task-3-events-registered.txt
  ```

- [x] 4. Add wikilink instruction to `prompt-builder.ts`

  **What to do**:
  - In `src/lib/prompt-builder.ts`, find the system prompt assembly section (around the [KNOWN WORLD] section at lines 86-92)
  - Add an instruction to the system prompt:
    ```
    When introducing a new character, location, or faction for the first time, mention it using [[wikilink notation]]. For example: "You meet [[Marcus Blackwood]] at the [[Silver Tavern]]." This helps maintain the wiki. Only use wikilinks for significant named entities, not every object or passing mention.
    ```
  - This instruction should go in the system prompt section, not inside [KNOWN WORLD] or [RECENT HISTORY] — it's a general behavioral instruction
  - Keep it concise — 2-3 sentences max

  **Agent**: `quick` — single instruction addition, no structural changes

  **Must NOT do**:
  - Do NOT restructure `prompt-builder.ts` — just add the instruction text
  - Do NOT modify existing prompt sections
  - Do NOT change the [KNOWN WORLD] formatting — that section is for wiki context data, not instructions

  **References**:
  - `src/lib/prompt-builder.ts` — Find the `assemblePrompt()` function and the system prompt area
  - `src/lib/wiki/wikilinks.ts` — The wikilink syntax that the LLM should use

  **Acceptance Criteria**:
  - [ ] Wikilink instruction added to system prompt in prompt-builder.ts
  - [ ] Instruction is 2-3 sentences, not verbose
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Wikilink instruction present in prompt builder
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/lib/prompt-builder.ts
      2. Confirm wikilink instruction text exists in assemblePrompt()
      3. Run npx next build
    Expected Result: Build passes. Prompt output now includes wikilink guidance.
    Evidence: .omo/evidence/task-4-wikilink-instruction.txt
  ```

- [x] 5. Hook auto-extract into generate route

  **What to do**:
  - In `src/app/api/generate/[id]/route.ts`: After `extractAndApplySceneState()` call (around line 228), add:
    ```typescript
    // Auto-extract wiki entities from AI response
    try {
      const wikiResult = await extractAndCreateWikiEntities(
        sessionId,
        session.owner_id,
        session.universe_id || null,
        fullResponse
      );
      
      if (wikiResult.created.length > 0 || wikiResult.updated.length > 0) {
        eventBus.emit("wiki:page_created", sessionId, {
          created: wikiResult.created,
          updated: wikiResult.updated,
        });
      }
    } catch (e) {
      // Wiki extraction is non-critical — never fail generation
      console.error("[wiki-extract] Error:", e);
    }
    ```
  - This must be AFTER the AI response is saved to the database and scene extraction completes
  - This must be BEFORE any timing-critical code (the user is already seeing the response streamed)
  - Import `extractAndCreateWikiEntities` from `@/lib/wiki/auto-extract`
  - Wrap in try/catch — wiki must NEVER break generation
  - Also use the EventBus to emit wiki events (import eventBus from `@/lib/event-bus`)

  **Agent**: `unspecified-high` — integration into generation route, high-stakes (must never break generation)

  **Must NOT do**:
  - Do NOT move the scene extraction call
  - Do NOT change the streaming logic
  - Do NOT add latency before the user sees the response
  - Do NOT modify existing job queues

  **References**:
  - `src/app/api/generate/[id]/route.ts:220-230` — The scene extraction call site, exact insertion point
  - `src/app/api/generate/[id]/route.ts:231-252` — Existing job queue calls (pattern to follow for post-generation hooks)

  **Acceptance Criteria**:
  - [ ] `extractAndCreateWikiEntities` called AFTER scene extraction
  - [ ] Wrapped in try/catch — generation never fails from wiki errors
  - [ ] EventBus emits wiki events when pages created/updated
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Hook exists at correct position
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/app/api/generate/[id]/route.ts
      2. Confirm extractAndCreateWikiEntities called after scene extraction
      3. Confirm it's in try/catch
      4. Run npx next build
    Expected Result: Build passes. Wiki extraction runs post-generation.
    Evidence: .omo/evidence/task-5-hook-installed.txt
  ```

- [x] 6. Add client-side toast notification

  **What to do**:
  - Find the client-side SSE handler (likely in `src/hooks/` or a `useSSE` hook)
  - Add a listener for `wiki:page_created` and `wiki:page_updated` events
  - When received, show a subtle toast notification:
    - Format: "📄 Wiki: Created 2 pages, updated 1"
    - Click on toast → navigates to `/wiki`
    - Auto-dismiss after 5 seconds
    - Non-blocking (stacking toasts if multiple generations produce wiki pages)
  - Use the existing Toast/notification component if one exists. If not, use a simple div overlay positioned bottom-right
  - The toast should NOT be a modal or popup — subtle and informative

  **Agent**: `visual-engineering` — UI/UX component (toast notification)

  **Must NOT do**:
  - Do NOT add new npm dependencies
  - Do NOT create a complex notification system — keep it simple
  - Do NOT show toast for zero operations (silent)

  **References**:
  - `src/hooks/` — Search for use-sse.ts, useSSE.ts, or similar SSE client hook
  - `src/components/ui/` — Check for Toast, Notification, or Snackbar component
  - `src/contexts/app-context.tsx` — Check if SSE connection is managed here

  **Acceptance Criteria**:
  - [ ] Client-side SSE listener handles wiki events
  - [ ] Toast shows "Wiki: Created N, Updated M"
  - [ ] Toast auto-dismisses after 5s
  - [ ] Click navigates to /wiki
  - [ ] No toast when zero operations
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Toast component exists and builds
    Tool: Bash
    Preconditions: None
    Steps:
      1. Find the toast/notification component
      2. Verify it handles wiki events
      3. Run npx next build
    Expected Result: Build passes. Toast component handles wiki events.
    Evidence: .omo/evidence/task-6-toast-built.txt
  ```

- [x] 7. Verify index regeneration + operation logging

  **What to do**:
  - Verify that `auto-extract.ts` correctly calls:
    1. `generateIndex()` from `@/lib/wiki/index-generator` — must run after create/update operations
    2. `appendLog()` from `@/lib/wiki/logger` — must record each operation with type "auto-extract"
  - Confirm the log entries follow the format: `## [{timestamp}] auto-extract | Created: EntityName, Updated: EntityName`
  - The index must reflect new pages immediately (next user query includes the new content)
  - If not already done in Task 2, add these calls now

  **Must NOT do**:
  - Do NOT modify index-generator.ts or logger.ts — they should already work
  - Do NOT add new parameters to existing functions

  **Agent**: `quick` — verification of existing function calls, no new logic

  **References**:
  - `src/lib/wiki/index-generator.ts:generateIndex` — Verify signature and behavior
  - `src/lib/wiki/logger.ts:appendLog` — Verify signature and log format

  **Acceptance Criteria**:
  - [ ] `generateIndex()` called after wiki changes
  - [ ] `appendLog()` called with type "auto-extract"
  - [ ] Log entries follow existing format
  - [ ] `npx next build` passes

  **QA Scenarios**:
  ```
  Scenario: Index and log functions are called
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read auto-extract.ts — confirm generateIndex and appendLog calls
      2. Check that generateIndex is called after create/update operations
      3. Run npx next build
    Expected Result: Build passes. Index regenerated after wiki changes.
    Evidence: .omo/evidence/task-7-index-log.txt
  ```

- [x] 8. Final build verification + QA

  **What to do**:
  - Run `npx next build` and confirm zero errors
  - Run `git diff --stat` to confirm all changed files are in scope
  - Read ALL changed files and verify no stubs, TODOs, or broken code
  - Verify existing wiki CRUD operations still work:
    - Manual wiki page creation via API
    - Manual wiki page editing via API
    - Wiki page deletion via API
    - Wiki ingest, query, lint operations
  - Confirm no existing wiki tests/features are broken

  **Must NOT do**:
  - Do NOT skip this step — build verification is mandatory

  **Agent**: `unspecified-high` — comprehensive QA + build verification

  **Acceptance Criteria**:
  - [ ] `npx next build` passes (zero errors)
  - [ ] All changed files are in scope
  - [ ] No stubs, TODOs, or broken code
  - [ ] Existing wiki CRUD operations still work
  - [ ] Wiki ingest, query, lint still work

  **QA Scenarios**:
  ```
  Scenario: Full build passes
    Tool: Bash
    Preconditions: None
    Steps:
      1. npx next build
    Expected Result: ✓ Compiled successfully. 52+ routes, zero errors.
    Evidence: .omo/evidence/task-8-build-passed.txt

  Scenario: Only scoped files changed
    Tool: Bash
    Preconditions: None
    Steps:
      1. git diff --stat -- ':!node_modules' ':!.omo' ':!graphify-out'
    Expected Result: Only src/lib/wiki/auto-extract.ts, src/app/api/generate/[id]/route.ts, src/lib/prompts.ts, src/lib/prompt-builder.ts, src/lib/event-bus.ts, stream/route.ts, and toast component changed.
    Evidence: .omo/evidence/task-8-scope-check.txt
  ```

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. Verify each "Must Have" is implemented. Check "Must NOT Have" for violations. Confirm auto-extract creates draft pages, skips locked/reviewed, enforces max 3. Check evidence files.
  
- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx next build`. Review for `as any`, `@ts-ignore`, empty catches (except the intentional try/catch in generate route), console.log in production code.
  
- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Verify the flow: user message → generation → LLM response → scene extraction → auto-extract → wiki pages created. Test: new entity → draft page created. Existing entity → draft page updated. Locked page → skipped. No universe → skipped.
  
- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 mapping. Check "Must NOT do" compliance. Detect cross-task contamination.

---

## Commit Strategy

- Task 1 (prompt): `feat(wiki): add entity extraction prompt for auto-extract`
- Task 2 (auto-extract): `feat(wiki): create auto-extract module for LLM entity extraction`
- Task 3 (events): `feat(wiki): add wiki page events to EventBus and SSE whitelist`
- Task 4 (wikilink): `feat(wiki): add wikilink instruction to generation system prompt`
- Task 5 (hook): `feat(wiki): hook auto-extract into post-generation flow`
- Task 6 (toast): `feat(wiki): add client-side toast for wiki auto-extract notifications`
- Task 7 (index/log): `feat(wiki): wire index regeneration and logging for auto-extract`
- Task 8 (QA): `chore: final build verification and QA for wiki auto-extract`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: ✓ Compiled successfully, zero errors
```

### Final Checklist
- [x] After generation, entity extraction runs
- [x] New entities create draft wiki pages
- [x] Existing draft pages get updated
- [x] Reviewed/locked pages are never modified
- [x] Max 3 operations per generation enforced
- [x] Toast notification shown for wiki changes
- [x] Wikilink instruction in system prompt
- [x] Wiki index regenerated after changes
- [x] Operation log updated
- [x] Existing wiki CRUD still works
- [x] `npx next build` passes
