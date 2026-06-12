# Plan 005: Conversation Tracking Between Personas and NPCs

## Goal
Track which NPC the AI is roleplaying as in each response, pair it with the speaking persona, and use conversation-pair filtering for context. Provide a UI to browse all conversation logs between character pairs.

## Background
In group sessions, the AI sees all messages as one flat list — Gandalf talking to Elrond and Aragorn talking to the Witch King get mixed together. By tracking which NPC the AI speaks as in each response, we can segment context by conversation pair.

## Tasks

### Layer 1 (foundation — data model + extraction)

- [ ] **Task A — Add `speaking_as` column to messages table** (assigned: @builder)

  **Files**: `scripts/init-db.ts` + DB migration in generate route

  Add `speaking_as TEXT` column to the messages table. This stores the NPC name the AI was roleplaying as when it generated that message. NULL for user messages, NULL for narrator narration (no specific NPC).

- [ ] **Task B — Extract `speakingAs` from AI responses** (assigned: @builder)

  **File**: `src/app/api/generate/[id]/route.ts` (or `src/lib/ollama.ts` post-processing)

  After the AI generates a response, scan the first line/sentence for NPC speech indicators:
  - `"Elrond said..."` → Elrond
  - `"Elrond strokes his beard..."` → Elrond (look for NPC names that appear in the first 100 chars as the subject of an action/speech)
  - `"The troll bellows..."` → The Troll
  - `"You hear a voice..."` → Unknown (narrator)

  Use a simple heuristic: check the first 150 characters for NPC names from the scene's active NPCs list. If a known NPC name appears as the grammatical subject (not inside quotes), use it.

  Store the result in the `speaking_as` field of the AI message.

- [ ] **Task C — Conversation-pair filtered context** (assigned: @builder)

  **File**: `src/lib/retrieval.ts`

  Add a new function `getConversationPairMessages(sessionId, personaId, speakingAs)` that:
  1. Finds messages where the last user/persona message matches `personaId` AND the following AI message has `speaking_as = speakingAs`
  2. Returns the last N exchanges of this conversation pair
  3. Messages that don't belong to any conversation pair are treated as "ambient" (background/setting)

  Add a new `ConversationContext` type:
  ```ts
  interface ConversationContext {
    currentNpc: string | null;        // NPC the AI is currently roleplaying as
    currentPersonaId: string | null;  // Persona talking to that NPC
    pairHistory: { speaker: string; content: string }[];  // Last 10 exchanges of this pair
  }
  ```

  Wire into `getRetrievedContext()`:
  - If the session has multiple active personas, check for conversation pairs
  - Pass the conversation context to the prompt builder

### Layer 2 (prompt + UI)

- [ ] **Task D — Add `[CURRENT CONVERSATION]` to prompt** (assigned: @builder)

  **File**: `src/lib/prompt-builder.ts`

  Add a new section before `[RECENT HISTORY]`:
  ```
  [CURRENT CONVERSATION]
  <user_content>
  Gandalf: Will you help us?
  Elrond: I have seen much darkness...
  Gandalf: Then you know what must be done.
  </user_content>
  ```

  This section only shows messages between the current speaking pair. `[RECENT HISTORY]` still shows all messages for broader context, but `[CURRENT CONVERSATION]` is prioritized.

- [ ] **Task E — Conversation log UI** (assigned: @builder)

  **New file**: `src/components/session/conversation-log.tsx`

  A panel/modal accessible from the session header showing:
  ```
  ┌─────────────────────────────────────────────────┐
  │  Conversation Log          [X]                   │
  ├─────────────────────────────────────────────────┤
  │  Filter: [All pairs ▼]                          │
  │                                                 │
  │  ┌─ Gandalf ↔ Elrond ──────────────────────────┐│
  │  │  Gandalf: Will you help us?                  ││
  │  │  Elrond: I have seen much darkness...        ││
  │  │  Gandalf: Then you know what must be done.   ││
  │  │  Elrond: I will aid you, old friend.         ││
  │  └──────────────────────────────────────────────┘│
  │                                                 │
  │  ┌─ Aragorn ↔ Witch King ──────────────────────┐│
  │  │  Witch King: You fool. No man can kill me.   ││
  │  │  Aragorn: I am no man.                       ││
  │  └──────────────────────────────────────────────┘│
  └─────────────────────────────────────────────────┘
  ```

  Each pair shown as a card with recent exchanges. Click to expand full conversation.

  **API**: Add a query param to GET `/api/sessions/[id]/messages` that filters by `speaking_as` or `persona_id` to fetch conversation pairs.

### Layer 3 (verify)

- [ ] **Task F — Verify build and logic** (assigned: @reviewer)
  - `npm run build` passes
  - AI responses store `speaking_as` correctly
  - Conversation pair context only shows relevant messages
  - Conversation log UI renders pairs correctly
  - Solo sessions still work as before (no change in behavior)

## Verification

- [ ] `npm run build`
- [ ] `python -c "f=open('src/lib/retrieval.ts'); c=f.read(); print('PASS' if 'getConversationPairMessages' in c else 'FAIL')"`
- [ ] `python -c "f=open('src/lib/prompt-builder.ts'); c=f.read(); print('PASS' if 'CURRENT CONVERSATION' in c else 'FAIL')"`
- [ ] `python -c "import os; print('PASS' if os.path.exists('src/components/session/conversation-log.tsx') else 'FAIL')"`

## Files Changed
| File | Change |
|------|--------|
| `scripts/init-db.ts` | Add `speaking_as TEXT` column to messages table |
| `src/app/api/generate/[id]/route.ts` | Extract speakingAs from AI response, store in DB |
| `src/lib/retrieval.ts` | New `getConversationPairMessages()` function, ConversationContext type |
| `src/lib/prompt-builder.ts` | New `[CURRENT CONVERSATION]` section in prompt |
| `src/components/session/conversation-log.tsx` | NEW — conversation log UI panel |
| `src/components/session/session-header.tsx` | Button to open conversation log |
| `src/app/api/sessions/[id]/messages/route.ts` | Optional query param filters for persona/NPC pairs |
