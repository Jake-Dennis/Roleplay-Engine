# Plan 001: Dynamic Context Budget + RAG Message History

## Goal
Replace the fixed-percentage context budget with a remainder-based system where non-message sections (lore, memories, relationships, threads) always get their full content first, and messages automatically shrink to fit whatever space remains. Add semantic vector search across all session messages so trimmed historical messages are still accessible via a `[RELEVANT PAST]` section when they relate to the current conversation.

## Background
Currently all `PROMPT_BUDGET` values are `1.0` — each section independently claims 100% of the context window. The prompt can be 5x the context window, and Ollama silently truncates from the middle (gutting lore/memories). Messages (at the end of the prompt) survive, which is backwards — lore and memories are the long-term knowledge you want preserved.

Message embeddings already exist — both user and AI messages get `generate_embeddings` jobs queued on send/generate, populating `vec_messages`. But nothing queries it for retrieval.

## Tasks

### Layer 1 (parallel, no deps)

- [ ] **Task A — Dynamic budget in `applyContextBudget`** (assigned: @builder)

  **File**: `src/lib/prompt-builder.ts`

  **Change**: Replace the fixed `BUDGET_*` percentage allocation with remainder-based logic:

  ```
  1. Compute overhead (system prompt, instructions, scene, intent, canon) — fixed 500
  2. Measure actual token cost of lore, memories, relationships, threads, decision points
  3. Clamp total non-message cost to 85% of available window (leaving at least 15% for messages)
  4. Messages get: availableTokens - overhead - nonMessageTokens
  ```

  Keep the existing estimateTokens() function. The non-message sections should be measured FIRST, then messages take whatever is left. This guarantees lore/memories/relationships always fit, and messages auto-compress as the wiki grows.

  **Also**: Remove the unused `PROMPT_BUDGET` constants from `src/lib/config.ts` since they're no longer used as fixed percentages. The `OVERHEAD` constant is still needed as a fixed offset.

- [ ] **Task B — `getRelevantMessages` function** (assigned: @builder)

  **New file**: `src/lib/retrieval.ts` (add function, not a new file)

  **Signature**:
  ```ts
  export function getRelevantMessages(
    sessionId: string,
    userMessage: string,
    topK?: number,
    excludeIds?: Set<string>
  ): { content: string; senderId: string | null; timestamp: string; similarity: number }[]
  ```

  **Logic**:
  1. If no `userMessage` or sqlite-vec unavailable, return `[]` (graceful degradation)
  2. Generate embedding for `userMessage` via `generateEmbedding()`
  3. Query `vec_messages` using the embedding with MATCHER — join back to `messages` table to get content/senderId/timestamp
  4. Filter out messages whose IDs are in `excludeIds` (messages already in recent history)
  5. Filter out deleted messages (`is_deleted = 0`)
  6. Return top-K results with similarity scores
  7. Wrap the vec0 query in try-catch — if vec0 table doesn't exist or query fails, return `[]`

  **vec0 query pattern** (from existing code in `vector-search.ts`):
  ```sql
  SELECT rowid, distance, metadata
  FROM vec_messages
  WHERE embedding MATCH ?
  AND k = ?
  ```
  Then join `metadata` (which contains `entity_id`) to `messages` table to get content, sender_id, timestamp.

### Layer 2 (depends on Task B)

- [ ] **Task C — Wire relevantMessages into RetrievedContext** (assigned: @builder)

  **File**: `src/lib/retrieval.ts`

  1. Add `relevantMessages` field to the `RetrievedContext` interface (line 74):
     ```ts
     relevantMessages?: {
       messages: { content: string; senderId: string | null }[];
     };
     ```

  2. In `getRetrievedContext()` (line 896), after the existing `getRecentMessages` call:
     ```ts
     // Build exclude set from messages already in recent history
     const excludeIds = new Set(recentMessages.messages.map(m => /* need message ids */));
     
     // Fetch relevant past messages if we have a user message
     const relevantMessages = userMessage
       ? getRelevantMessages(sessionId, userMessage, 10, excludeIds)
       : [];
     ```

     **Note**: `getRecentMessages` currently returns `{ messages: { senderId, content, timestamp }[] }` — it doesn't include message IDs. We need to either:
     - Also return `id` from `getRecentMessages` (requires changing the query to select `id` and updating the MessageContext type)
     - Or skip the exclude set initially and just let dedup happen naturally in the prompt (simpler, slight risk of duplicate messages but the relevance sorting should make recent ones rank lower)

     **Approach**: Add `id` to the `getRecentMessages` query and `MessageContext` type. This is needed anyway for dedup. The `id` is already in the messages table.

  3. Include `relevantMessages` in the returned context object.

- [ ] **Task D — Add [RELEVANT PAST] section in prompt** (assigned: @builder)

  **File**: `src/lib/prompt-builder.ts`

  1. In `assemblePrompt()`, add a new section after lore (around line 224) and **before** `[RECENT HISTORY]`:
     ```ts
     // Relevant past messages — semantically similar to current input
     if (ctx.relevantMessages?.messages && ctx.relevantMessages.messages.length > 0) {
       const relevantParts = ctx.relevantMessages.messages.map(
         (m) => `${m.senderId === null ? "Narrator" : "Player"}: ${m.content}`
       );
       const wrapped = wrapUserContent(relevantParts.join("\n"));
       parts.push(`[RELEVANT PAST]\n${wrapped || relevantParts.join("\n")}`);
     }
     ```

  2. In `assemblePromptWithBudget()` (line 337), the relevant messages don't need budget trimming — they're already limited to top-K=10 by `getRelevantMessages`.

  3. Also add `relevantMessages` to the passthrough fields in `applyContextBudget()` (around line 450).

### Layer 3 (verify)

- [ ] **Task E — Verify build and logic** (assigned: @reviewer)

  - `npm run build` passes with no errors
  - Check `applyContextBudget()` logic — verify non-message sections fill first, messages get remainder
  - Check `getRelevantMessages()` — verify vec0 query syntax matches existing patterns
  - Check `assemblePrompt()` — verify `[RELEVANT PAST]` section appears in correct position
  - Check `getRetrievedContext()` — verify all fields returned

## Verification

- [ ] `npm run build`
- [ ] `python -c "import re; f=open('src/lib/prompt-builder.ts'); c=f.read(); print('PASS' if 'let msgTokens = 0' in c and 'nonMessageTotal' in c else 'FAIL')"`
- [ ] `python -c "import re; f=open('src/lib/retrieval.ts'); c=f.read(); print('PASS' if 'export async function getRelevantMessages' in c else 'FAIL')"`
- [ ] `python -c "f=open('src/lib/retrieval.ts'); c=f.read(); print('PASS' if 'relevantMessages?' in c else 'FAIL')"`
- [ ] `python -c "f=open('src/lib/prompt-builder.ts'); c=f.read(); print('PASS' if '[RELEVANT PAST]' in c else 'FAIL')"`

## Files Changed
| File | Change |
|------|--------|
| `src/lib/prompt-builder.ts` | Dynamic budget logic in `applyContextBudget`; `[RELEVANT PAST]` section in `assemblePrompt`; passthrough relevantMessages |
| `src/lib/config.ts` | Remove unused `PROMPT_BUDGET` values (keep OVERHEAD) — or mark deprecated |
| `src/lib/retrieval.ts` | New `getRelevantMessages` function; add `relevantMessages` to `RetrievedContext`; wire into `getRetrievedContext`; add `id` to `getRecentMessages` query |
