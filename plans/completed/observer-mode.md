# Plan: Observer Mode

## Goal
Implement observer mode for group sessions where users can watch but cannot send messages or participate in the narrative.

## Graph Analysis
- **Affected Systems**: Session participants, message creation API, chat UI, SSE events
- **Dependency Chain**: `session_participants.role` → `api/sessions/[id]/messages/route.ts` → `session/[id]/page.tsx`
- **Centrality**: LOW — isolated to participant role enforcement

## Affected Files
| File | Change |
|------|--------|
| `src/app/api/sessions/[id]/messages/route.ts` | Block observers from POST |
| `src/app/(app)/session/[id]/page.tsx` | Hide input for observers |
| `src/app/api/sessions/[id]/invite/route.ts` | Accept `role` parameter |
| `src/components/session/participant-list.tsx` | Show observer badge |
| `src/hooks/use-session.ts` | Add `isObserver` to result |

## Database Changes
```sql
-- role column already exists in session_participants
-- Ensure it supports 'observer' value (currently: 'participant', 'owner')
```

## Risks
- **LOW**: Observers should still receive SSE events and see messages
- **LOW**: Observers can leave session normally
- **LOW**: Owner can promote observer to participant

## Execution Phases

### Phase 1: API Enforcement
1. In `POST /api/sessions/[id]/messages`, check participant role
2. Return 403 if role is `observer`
3. Update invite endpoint to accept `{ username, role: "participant" | "observer" }`

### Phase 2: UI Changes
1. Add `isObserver` to `useSession` hook
2. Hide chat input and send button for observers
3. Show "You are observing this session" banner
4. Add observer badge in participant list

### Phase 3: Role Management
1. Allow owner to change participant role (observer ↔ participant)
2. Add role dropdown in participant list for owner
3. Emit `participant:role_changed` SSE event

## Validation
- Invite user as observer, verify they can see messages but not send
- Promote observer to participant, verify they can now send
- Demote participant to observer, verify sending blocked
- Verify observers receive all SSE events normally

## Rollback
- Remove observer role check from messages route
- Revert UI to always show input
