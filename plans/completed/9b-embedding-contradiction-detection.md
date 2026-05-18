# Phase 9B: Embedding-Based Contradiction Detection

## Goal
Enhance the contradiction detector to use embedding similarity for finding related canon entries, enabling semantic comparison beyond the current 3 rule-based checks (alive/dead, temporal, location).

## Current State
- `src/lib/contradiction-detector.ts` has 3 rule-based checks only
- Checks against `lore_validations` (state='validated') and `events` tables
- No embedding similarity comparison
- Embeddings infrastructure exists (`embeddings.ts`, `vector-search.ts`, sqlite-vec)
- Canon entries have embeddings stored in `embedding_index` table

## Architecture

```
New Lore Entry: "Haleth died in the Eastern Ruins"
    ↓
1. Generate embedding for new content (bge-m3)
    ↓
2. Vector search against validated canon entries (top 10 by similarity)
    ↓
3. For each similar canon entry (similarity > 0.7):
   a. LLM comparison: "Do these contradict? Explain."
   b. If LLM says yes → flag contradiction
    ↓
4. Run existing rule-based checks (alive/dead, temporal, location)
    ↓
5. Aggregate all contradictions → return to caller
```

## Execution Plan

### Step 1: Create `semantic-contradiction.ts` Library
**File**: `src/lib/semantic-contradiction.ts`

Functions:
- `findSimilarCanonEntries(userId: string, content: string, topK?: number): CanonEntry[]` — vector search against validated canon
- `compareForContradiction(entry1: CanonEntry, entry2: CanonEntry): Promise<Contradiction | null>` — LLM-based comparison
- `detectSemanticContradictions(entityType: string, entityId: string, userId: string): Promise<Contradiction[]>` — main entry point
- `buildContradictionPrompt(entry1: CanonEntry, entry2: CanonEntry): string` — prompt assembly for LLM

### Step 2: Implement Canon Entry Embedding Lookup
**File**: `src/lib/semantic-contradiction.ts`

```typescript
interface CanonEntry {
  id: string;
  entityType: string;  // 'location', 'npc', 'event', 'lore'
  entityId: string;
  title: string;
  content: string;
  similarity: number;  // cosine similarity score
}
```

Lookup sources:
- `lore_validations` where `state = 'validated'`
- `locations` table
- `npcs` table
- `events` table
- `narrative_memories` where `importance` indicates canonical

Use `vectorSearch()` from `vector-search.ts` with the new content's embedding.

### Step 3: Implement LLM-Based Contradiction Comparison
**File**: `src/lib/semantic-contradiction.ts`

Prompt template:
```
Compare these two narrative entries for contradictions.

ENTRY 1 (existing canon):
Type: {entry1.entityType}
Title: {entry1.title}
Content: {entry1.content}

ENTRY 2 (new content):
Type: {entry2.entityType}
Title: {entry2.title}
Content: {entry2.content}

Do these entries contradict each other? Consider:
- Factual conflicts (alive vs dead, present vs absent)
- Temporal conflicts (event order impossibilities)
- Location conflicts (entity in two places at once)
- Character trait conflicts

Return JSON:
{
  "contradicts": true/false,
  "type": "factual|temporal|location|character|none",
  "severity": "high|medium|low",
  "explanation": "brief explanation of the contradiction"
}
```

Use `generateText()` from `ollama.ts` with low temperature (0.1) for deterministic output.

### Step 4: Integrate into Existing Contradiction Detector
**File**: `src/lib/contradiction-detector.ts`

Changes:
- Add `detectSemanticContradictions()` call to `detectContradictions()`
- Run semantic checks AFTER rule-based checks
- Merge results: rule-based + semantic contradictions
- Create `under_review` validation record for each semantic contradiction found

### Step 5: Add Contradiction Check to Lore Save Workflow
**File**: `src/app/api/lore-edits/route.ts` (or relevant lore save endpoint)

Changes:
- When lore is saved/created, trigger contradiction check
- If contradictions found, set state to `under_review`
- Store contradiction details in `validation_notes`

### Step 6: Add Contradiction Check to Idle-Time Enrichment
**File**: `src/lib/idle-enrichment.ts`

Changes:
- During Tier 3 (15 min idle), run contradiction checks on `generated_unverified` lore
- This catches contradictions that may have emerged as canon evolved

### Step 7: Update Validation Queue to Show Semantic Contradictions
**File**: `src/components/lore/validation-queue.tsx`

Changes:
- Display semantic contradiction details (similarity score, explanation)
- Differentiate rule-based vs semantic contradictions in UI
- Show the conflicting canon entry preview

### Step 8: Add Semantic Contradiction API Endpoint
**File**: `src/app/api/contradictions/check/route.ts`

- `POST` — manually trigger contradiction check for content
- Request: `{ content: string, entityType: string, entityId: string }`
- Response: `{ contradictions: Contradiction[], similarCanon: CanonEntry[] }`
- Used by lore editor for real-time contradiction preview

## Files Created
- `src/lib/semantic-contradiction.ts`
- `src/app/api/contradictions/check/route.ts`

## Files Modified
- `src/lib/contradiction-detector.ts` (add semantic check integration)
- `src/app/api/lore-edits/route.ts` (trigger check on save)
- `src/lib/idle-enrichment.ts` (periodic contradiction scan)
- `src/components/lore/validation-queue.tsx` (show semantic details)

## Tests
- Embedding-based search finds relevant canon entries
- LLM correctly identifies contradictions between similar entries
- LLM correctly identifies non-contradictions (no false positives)
- Rule-based + semantic results merge correctly
- Validation queue shows both types of contradictions
- API endpoint returns correct contradiction data
- Idle-time enrichment catches new contradictions
- Performance: semantic check completes within 5 seconds

## Risk
- **MEDIUM**: LLM calls add latency and cost to contradiction detection
- Mitigate: Only run semantic checks when vector similarity > 0.7 threshold
- Mitigate: Cache contradiction results for 24 hours (re-check only if canon changed)
- Mitigate: Limit to top 5 similar canon entries (not all validated entries)
- LLM may produce false positives — mitigate by requiring high confidence in JSON response
- Embedding generation for new content adds a step — mitigate by reusing existing embeddings if content hasn't changed
