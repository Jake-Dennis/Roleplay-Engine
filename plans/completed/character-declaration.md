# Plan: Character Declaration UI

## Goal
Allow group session participants to declare which character they're playing when joining a session, and display character names in the chat UI.

## Graph Analysis
- **Affected Systems**: Session participants table, session chat UI, message display, session creation flow
- **Dependency Chain**: `session_participants` table → `api/sessions/[id]/join/route.ts` → `session/[id]/page.tsx` → `chat-window.tsx`
- **Centrality**: MEDIUM — adds column to participants table, affects message rendering

## Affected Files
| File | Change |
|------|--------|
| `src/app/api/sessions/[id]/join/route.ts` | Accept `character_name` on join |
| `src/app/api/sessions/[id]/participants/route.ts` | Return character_name |
| `src/app/(app)/session/[id]/page.tsx` | Character declaration modal on join |
| `src/components/session/participant-list.tsx` | Show character names |
| `src/components/chat/chat-window.tsx` | Display character name on messages |
| `src/hooks/use-session.ts` | Add `characterName` to Participant type |

## Database Changes
```sql
ALTER TABLE session_participants ADD COLUMN character_name TEXT;
```

## Risks
- **LOW**: Existing participants will have NULL character_name — handle gracefully
- **MEDIUM**: Need to prevent duplicate character names in same session
- **LOW**: Solo sessions don't need character declaration

## Execution Phases

### Phase 1: Database + API
1. Add `character_name` column to `session_participants` (migration or lazy ALTER)
2. Update `POST /api/sessions/[id]/join` to accept `{ character_name }` in body
3. Update `GET /api/sessions/[id]/participants` to return `character_name`
4. Add uniqueness check: reject join if character_name already taken in session

### Phase 2: Join Flow UI
1. When user accepts invite or joins group session, show character declaration modal
2. Input field for character name, with validation (non-empty, unique)
3. Submit joins session with declared character
4. Show existing taken character names to avoid conflicts

### Phase 3: Display
1. Participant list shows `username` as `character_name`
2. Chat messages show character name instead of username
3. Owner's messages show their declared character (or username if not declared)

## Validation
- Join group session, declare character, verify it appears in participant list
- Try to declare duplicate character name, verify rejection
- Send message, verify character name appears on message bubble
- Leave and rejoin, verify character name persists or re-declaration required

## Rollback
- Remove character_name column
- Revert UI to show username only
