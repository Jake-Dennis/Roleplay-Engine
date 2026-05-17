# Plan: Per-User Private State UI

## Goal
Create UI for group session participants to manage private thoughts, personal relationship views, and individual narrative memories that are not visible to other participants.

## Graph Analysis
- **Affected Systems**: Session API, private-state endpoint, session chat UI
- **Dependency Chain**: `api/sessions/[id]/private-state/route.ts` → `session/[id]/page.tsx`
- **Centrality**: LOW — isolated to group session private state

## Affected Files
| File | Change |
|------|--------|
| `src/app/(app)/session/[id]/page.tsx` | Add private state panel + toggle button |
| `src/components/session/private-state-panel.tsx` | New component |
| `src/components/session/private-thoughts.tsx` | New component |
| `src/components/session/personal-relationships.tsx` | New component |
| `src/components/session/individual-memories.tsx` | New component |

## Risks
- **LOW**: API already exists, only UI work needed
- **MEDIUM**: Privacy enforcement — must ensure private state is never sent to other participants
- **LOW**: Data stored in `session_participants.private_state` JSON column

## Execution Phases

### Phase 1: Private State Panel Component
1. Create `PrivateStatePanel` with tabs:
   - Private Thoughts
   - Personal Relationships
   - Individual Memories
2. Panel slides in from right side of session page
3. Only visible to current user (not broadcast via SSE)

### Phase 2: Private Thoughts
1. Text area for private notes/thoughts
2. Auto-save to `private_state.thoughts`
3. Timestamped entries
4. Search/filter functionality

### Phase 3: Personal Relationships
1. View of relationships from this user's perspective
2. Override shared relationship data with personal views
3. Store personal emotion values in `private_state.relationships`
4. Show both shared and personal views side-by-side

### Phase 4: Individual Memories
1. List of narrative memories specific to this user
2. Add/remove memories from personal view
3. Store in `private_state.memories`
4. Option to promote memory to shared state (owner approval required)

### Phase 5: Integration
1. Add "Private" button to session header
2. Toggle panel visibility
3. Persist panel open/closed state in localStorage
4. Ensure private state is never included in SSE events

## Validation
- Open group session, click Private button
- Add private thought, verify it saves
- Verify other participants cannot see private thoughts
- Add personal relationship override, verify it persists
- Verify private state is not sent via SSE

## Rollback
- Remove private state panel from session page
- Delete private state components

## Status: COMPLETED
- [x] Phase 1: PrivateStatePanel with 3 tabs
- [x] Phase 2: Private Thoughts (add, delete, search, timestamps)
- [x] Phase 3: Personal Relationships (emotion overrides, notes, expandable cards)
- [x] Phase 4: Individual Memories (add, delete, promote to shared)
- [x] Phase 5: Integration (Lock button in header, localStorage persistence)
- [x] Validation: Privacy enforced — private state isolated to dedicated API, never in SSE
