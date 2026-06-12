# Plan 004: Granular Auto-TTS Controls for Narrator, Your Persona, Other Personas

## Goal
Replace the single "Auto-play TTS" toggle with three granular controls that auto-trigger TTS based on who's speaking — narrator, your persona, or other players' personas.

## Background
The `ttsAutoPlay` setting exists in user settings but is never actually checked anywhere — there's no auto-play logic in the session. TTS only triggers on manual play-button click. This plan wires up the auto-play mechanism while splitting it into three separate toggles.

## Tasks

### Layer 1 (parallel, no deps)

- [ ] **Task A — API: Add three auto-tts fields to user settings** (assigned: @builder)

  **File**: `src/app/api/user/settings/route.ts`

  Add fields to both the settings interface and the PUT handler:
  - `autoTtsNarrator: boolean` — auto-play TTS for AI narrator messages
  - `autoTtsOtherPersonas: boolean` — auto-play TTS for other players' personas
  - `autoTtsYourPersona: boolean` — auto-play TTS for messages from your own persona

  Storage: `user_settings` DB table stores these as INTEGER (0/1). Add migration to create columns if not exist.

  GET response includes them. PUT accepts them via camelCase.

- [ ] **Task B — UI: Replace single auto-play toggle with three granular toggles** (assigned: @builder)

  **File**: `src/app/(app)/settings/user/page.tsx`

  Replace the single "Auto-play TTS" toggle (lines 176-188) with three separate toggles:

  ```
  ┌──────────────────────────────────────────────┐
  │  🔊 Auto-Play TTS                            │
  │                                              │
  │  Narrator         [━━━━━━━━━━━━━━━━] ON      │
  │  Auto-speak AI narration                     │
  │                                              │
  │  Your Persona      [━━━━━━━━━━━━━━━━] ON     │
  │  Auto-speak messages from your character     │
  │                                              │
  │  Other Personas    [━━━━━━━━━━━━━━━━] OFF    │
  │  Auto-speak other players' characters        │
  └──────────────────────────────────────────────┘
  ```

  State variables: `autoTtsNarrator`, `autoTtsOtherPersonas`, `autoTtsYourPersona` (all default `false`)
  
  Load from `data.settings.autoTtsNarrator`, etc. on mount. Save via PUT to `/api/user/settings`.

- [ ] **Task C — Wire auto-play in session hook** (assigned: @builder)

  **File**: `src/hooks/use-session-chat.ts`

  The session hook needs to:
  1. Load user settings (or read them from a simple fetch) to get the three auto-tts booleans
  2. Listen for `message:created` SSE events specifically (not just `refreshSession`)
  3. When a new message arrives, determine its type:
     - `senderId === null` → **Narrator**
     - Has `personaName` that matches active persona → **Your Persona**
     - Has `personaName` that doesn't match → **Other Personas**
     - Otherwise → skip (plain user text, no auto-tts)
  4. Check the corresponding auto-tts setting
  5. If enabled, call `handleTtsPlay(messageId, content)` after a short delay (500ms — let the message render first)

  **Loading user settings**: Add a `useEffect` that fetches `/api/user/settings` and extracts the auto-tts booleans. Or simpler — the session page already has access to user settings via `/api/user/settings`.

  **Detecting "your persona"**: The hook has `activePersonaId`. Compare the new message's persona against it. If `message.personaName` exists and corresponds to the active persona, it's "your persona". This requires the SSE event data to include persona info.

  **SSE event data**: Add a specific listener for `message:created` that parses the event data (which includes message id, content, senderId, personaName) and triggers auto-play.

### Layer 2 (depends on Task C)

- [ ] **Task D — Ensure SSE stream sends persona info with message:created** (assigned: @builder)

  **File**: `src/app/api/sessions/[id]/stream/route.ts` (or wherever the event is emitted)

  Check what payload is sent with `message:created` events. It needs to include:
  - `id` — message ID
  - `content` — message text  
  - `senderId` — who sent it (null for narrator)
  - `personaName` — persona name if applicable

  If the payload is too sparse, augment it. The event bus emit for `MESSAGE_CREATED` should carry these fields.

- [ ] **Task E — Verify build and logic** (assigned: @reviewer)

  - `npm run build` passes
  - User settings page shows three toggles, saves/loads correctly
  - Narrator messages auto-play when narrator toggle is ON
  - Your persona messages auto-play when your-persona toggle is ON
  - Other personas messages auto-play when other-personas toggle is ON
  - All default to OFF (no breaking change for existing users)

## Verification

- [ ] `npm run build`
- [ ] `python -c "import re; f=open('src/app/api/user/settings/route.ts'); c=f.read(); print('PASS' if 'autoTtsNarrator' in c and 'autoTtsOtherPersonas' in c and 'autoTtsYourPersona' in c else 'FAIL')"`
- [ ] `python -c "import re; f=open('src/app/(app)/settings/user/page.tsx'); c=f.read(); print('PASS' if 'autoTtsNarrator' in c and 'autoTtsYourPersona' in c else 'FAIL')"`
- [ ] `python -c "import re; f=open('src/hooks/use-session-chat.ts'); c=f.read(); print('PASS' if 'message:created' in c and 'autoTtsNarrator' in c else 'FAIL')"`

## Files Changed
| File | Change |
|------|--------|
| `src/app/api/user/settings/route.ts` | Add autoTtsNarrator, autoTtsOtherPersonas, autoTtsYourPersona fields + DB migration |
| `src/app/(app)/settings/user/page.tsx` | Replace single auto-play toggle with three granular toggles |
| `src/hooks/use-session-chat.ts` | Wire auto-play logic: listen for message:created, check type, trigger TTS |
| `src/app/api/sessions/[id]/stream/route.ts` | Ensure message:created events carry persona info |
