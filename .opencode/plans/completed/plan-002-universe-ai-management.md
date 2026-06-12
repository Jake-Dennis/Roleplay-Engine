# Plan 002: Universe AI Management Page

## Goal
Create a visual dashboard at `/universe/[id]/manage` showing real-time context metrics, budget allocation breakdown, model configuration, and wiki stats — so users can see exactly what the AI "sees" and how its context window is used.

## Background
Users currently have no visibility into how their context window is being used. They configure models, see wiki entries, and send messages — but can't tell if lore is eating the whole window, how many messages fit, or what the actual prompt looks like. This page surfaces all that data.

## Dependencies
- **Plan 001 must be complete first** — the dynamic budget logic changes how sections are allocated, and this page visualizes those allocations. Without Plan 001, the "budget breakdown" section would show the broken 1.0-per-all behavior.

## Tasks

### Layer 1 (parallel, no deps — UI scaffolding + API endpoint)

- [ ] **Task A — `/api/universe/[id]/ai-metrics` endpoint** (assigned: @builder)

  **New file**: `src/app/api/universe/[id]/ai-metrics/route.ts`

  **GET** returns:
  ```json
  {
    "model": {
      "name": "gemma4:31b-cloud",
      "contextWindow": 131072,
      "choicesModel": "qwen3.5:9b",
      "embeddingModel": "qwen3-embedding:8b",
      "availableModels": ["gemma4...", "qwen3.5...", ...]
    },
    "context": {
      "totalPrompt": null,
      "sections": {
        "overhead": { "tokens": 500, "label": "System Prompt + Instructions" },
        "messages": { "tokens": 0, "label": "Recent History", "count": 0 },
        "lore": { "tokens": 0, "label": "Known World / Lore", "count": 0 },
        "memories": { "tokens": 0, "label": "Narrative Memories", "count": 0 },
        "relationships": { "tokens": 0, "label": "Relationships", "count": 0 },
        "threads": { "tokens": 0, "label": "Narrative Threads", "count": 0 }
      }
    },
    "stats": {
      "totalMessages": 42,
      "totalWikiPages": 39,
      "totalNarrativeThreads": 3,
      "totalRelationships": 6,
      "totalMemories": 12,
      "lastGeneration": null
    }
  }
  ```

  **Logic**:
  - Auth: `withAuth`, verify user owns the universe (or is participant)
  - Read `server_config` for model info + context window
  - Call `fetchLocalModels()` for available models list
  - Query DB counts: messages from sessions in this universe, wiki pages (count files in `data/{userId}/wiki/`), narrative threads, relationships, memories
  - Context tokens are estimated by calling `getRetrievedContext()` + `estimateTokens()` on each section — OR return all-zero tokens with a `?compute=true` flag so the heavy work is opt-in
  - Cache the context breakdown for 30 seconds to avoid recomputing on every page load
  - Read `messageHistoryLimit` and `choicesModel` from server config

- [ ] **Task B — Universe AI Management page scaffold** (assigned: @builder)

  **New file**: `src/app/(app)/universe/[id]/manage/page.tsx`

  **Structure** — server component that renders client components:
  ```tsx
  export default async function UniverseAIManagementPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    // Fetch initial data server-side for fast first paint
    return <UniverseAIManagementClient universeId={id} initialData={data} />;
  }
  ```

  **Route**: `src/app/(app)/universe/[id]/manage/page.tsx`

  **Note**: Check existing `(app)/universe/[id]/` route exists — may need to create `manage/` directory under it.

### Layer 2 (depends on Layer 1)

- [ ] **Task C — Client component with visual dashboard** (assigned: @builder)

  **New file**: `src/app/(app)/universe/[id]/manage/ai-management-client.tsx`

  **Layout**: Tabs or collapsible sections: "Dashboard" (metrics), "How It Works" (docs + diagrams).

  **Dashboard tab**:

  1. **Model Card** (top row, left)
     - Current model name (large text)
     - Context window size (e.g., "131,072 tokens")
     - Choices model + embedding model (smaller, secondary)
     - Badge: "131K context window" or "8K context window"

  2. **Context Budget Bar** (full width, prominent)
     - Horizontal stacked bar showing the full context window
     - Colored segments: Overhead (gray), Messages (blue), Lore (green), Memories (purple), Relationships (orange), Threads (yellow), Free (light gray)
     - Each segment is proportional to its token count
     - Hover tooltip shows exact token count and percentage
     - Empty space (unused) shown as "Free" segment

  3. **Section Breakdown Table** (below the bar)
     | Section | Tokens | % of Window | Items | 
     |---------|--------|-------------|-------|
     | System Prompt | 500 | 0.4% | — |
     | Recent History | 6,200 | 4.7% | 30 messages |
     | Known World | 3,100 | 2.4% | 12 entries |
     | Narrative Memories | 800 | 0.6% | 5 memories |
     | Relationships | 400 | 0.3% | 6 relationships |
     | Narrative Threads | 200 | 0.2% | 2 threads |
     | **Total Used** | **11,200** | **8.5%** | |
     | **Free** | **119,872** | **91.5%** | |

  4. **Wiki Stats** (bottom, card grid)
     - Total wiki pages (with link to wiki)
     - Sessions in this universe
     - Narrative threads
     - Relationships tracked
     - Narrative memories

  5. **Last Generation** (optional, bottom-right)
     - Prompt size
     - Response size  
     - Tokens/sec
     - Time

  **"How It Works" tab** (docs + diagrams):

  1. **Pipeline Flow Diagram** — rendered as a CSS/SVG flow chart showing:
     ```
     User Message → getRetrievedContext() → applyContextBudget() → assemblePrompt() → Ollama
                                                    │                      │
                                           ┌────────┴────────┐     ┌──────┴──────┐
                                           │ Dynamic Budget  │     │ [SYSTEM]     │
                                           │                 │     │ [MEMORIES]   │
                                           │ Lore: 3,100 tok │     │ [KNOWN WORLD]│
                                           │ Mem:    800 tok │     │ [REL PAST]   │
                                           │ Rel:    400 tok │     │ [RECENT HIST]│
                                           │ Msg:  6,200 tok │     └──────────────┘
                                           └─────────────────┘
     ```
     Use a flexbox/div-based flow chart with arrows (CSS borders/transforms). Each box is a colored card with label + brief description. Keep it simple — no SVG library, just Tailwind-styled divs.

  2. **Dynamic Budget Explanation** — short section explaining:
     - "Non-message sections (lore, memories, relationships) are measured first"
     - "Messages automatically shrink to fit whatever space remains"
     - "This guarantees lore and world knowledge always fit in the context window"
     - Show a before/after comparison mini-diagram:
       ```
       BEFORE (fixed 1.0):  [──── Messages ────][── Lore ──][─ Mem ─] → Ollama truncates middle
       AFTER  (remainder):  [── Lore ──][─ Mem ─][── Messages ──] → Everything fits
       ```

  3. **RAG for Message History** — explanation:
     - "Old messages get vector embeddings stored in sqlite-vec"
     - "When you send a message, the system searches ALL past messages for semantically similar ones"
     - "Relevant matches appear as [RELEVANT PAST] in the prompt"
     - Show a simple diagram:
       ```
       Your message ──→ generateEmbedding() ──→ vec_messages MATCH ──→ top 10 relevant past messages
       ```

  4. **Prompt Assembly Order** — visual showing the prompt structure:
     ```
     ┌─────────────────────────────────────────────────────┐
     │ [SYSTEM]        System instructions + personality    │
     │ [MEMORIES]      Important narrative memories         │
     │ [KNOWN WORLD]   Wiki entries (locations, NPCs, etc) │
     │ [RELATIONSHIPS] Emotional state between characters   │
     │ [RELEVANT PAST] Old messages relevant to now (RAG)   │
     │ [RECENT HISTORY] Last N messages (auto-sized)        │
     │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
     │ Total: fits within context window ✓                 │
     └─────────────────────────────────────────────────────┘
     ```
     Each section is a colored row with a brief description.

  5. **Key Concepts** — short bullet-point cards:
     - "Context Window: The model's working memory, set per-model in Server Settings"
     - "Token Budget: How the context window is divided between sections"
     - "Estimates: Token counts use `chars/4` approximation — actual may vary"
     - "Message Limit: configurable cap on how many recent messages are fetched"

  **Data refresh**: Poll the API every 10 seconds via `useEffect` + `setInterval`, or reload on focus. Use `useSWR` pattern or simple fetch.

  **Styling**: Use Tailwind classes consistent with the rest of the app (dark theme, `bg-bg-elevated`, `border-border-default`, etc.). Use stacked bar divs (no chart library needed). Diagrams are pure Tailwind/CSS — no SVG or image files.

- [ ] **Task D — Navigation entry for the page** (assigned: @builder)

  **File**: `src/app/(app)/universe/[id]/page.tsx` or the universe navigation component

  Add a link/tab "AI Management" on the universe detail page that navigates to `/universe/[id]/manage`. Also add it in the sidebar navigation if a universe-specific sub-nav exists.

### Layer 3 (verify)

- [ ] **Task E — Verify build and logic** (assigned: @reviewer)

  - `npm run build` passes
  - Page loads at `/universe/{id}/manage`
  - API returns correct data
  - Budget bar renders proportionally
  - Section breakdown matches actual context usage
  - Refresh button / polling works

## Verification

- [ ] `npm run build`
- [ ] `python -c "import os; print('PASS' if os.path.exists('src/app/api/universe/[id]/ai-metrics/route.ts') else 'FAIL')"`
- [ ] `python -c "import os; print('PASS' if os.path.exists('src/app/(app)/universe/[id]/manage/page.tsx') else 'FAIL')"`
- [ ] `python -c "import os; print('PASS' if os.path.exists('src/app/(app)/universe/[id]/manage/ai-management-client.tsx') else 'FAIL')"`
- [ ] `python -c "f=open('src/app/(app)/universe/[id]/page.tsx'); c=f.read(); print('PASS' if 'AI Management' in c else 'FAIL')"`

## Files Changed
| File | Change |
|------|--------|
| `src/app/api/universe/[id]/ai-metrics/route.ts` | NEW — GET endpoint returning context metrics |
| `src/app/(app)/universe/[id]/manage/page.tsx` | NEW — server component, route entry |
| `src/app/(app)/universe/[id]/manage/ai-management-client.tsx` | NEW — client dashboard component |
| `src/app/(app)/universe/[id]/page.tsx` | MODIFY — add "AI Management" navigation link |
