# Persona Selection - Learnings

## T2: PUT /api/sessions/[id]/persona — COMPLETED

**File created:** `src/app/api/sessions/[id]/persona/route.ts`

**Implementation details:**
- Auth pattern: `getAuthToken(request)` → `verifyToken(token)` → `decoded.sub`
- Session access check: `SELECT id FROM sessions WHERE id = ? AND owner_id = ?` (owner-only)
- Persona validation: `SELECT id FROM personas WHERE id = ? AND user_id = ?` (must belong to user)
- Update: `UPDATE sessions SET persona_id = ? WHERE id = ?`
- Handles `persona_id = null` (clears selection)
- Returns: `{ success: true, session: { persona_id: ... } }`
- Error responses: 401 (no token), 401 (invalid token), 404 (not owner), 400 (persona not found/wrong user)

**Build verification:** `npx next build` passes — route appears as `ƒ /api/sessions/[id]/persona`

**Dependencies:**
- Depends on T1 (sessions.persona_id column) — COMPLETED
- Blocks T3 (UI dropdown)

## T3: Generate route uses session persona — COMPLETED

**File modified:** `src/app/api/generate/[id]/route.ts`

**Implementation details:**
- Replaced single `getActivePersonaContext(decoded.sub)` call with session-aware lookup
- Flow: `session.persona_id` → fetch specific persona → fallback to `getActivePersonaContext()` → null
- Raw DB row mapped to `PersonaContext` type (snake_case → camelCase, tags JSON parsed)
- `buildPersonaPrompt(persona, baseSystemPrompt)` unchanged
- Model resolution `sessionSettings.llmModel || persona?.llmModel || userModels.llmModel` unchanged
- Added `type PersonaContext` to imports from `@/lib/ollama`

**Build verification:** `npx next build` passes — route appears as `ƒ /api/generate/[id]`

**Behavior:**
- Session with `persona_id` → LLM uses that persona's context
- Session with NULL `persona_id` → LLM uses global active persona
- Session with NULL `persona_id` + no global active → LLM uses default prompt

## T3: UI dropdown moved to session header — COMPLETED

**Files modified:**
- `src/app/(app)/session/[id]/page.tsx` — dropdown added to header, persistence wiring, click-outside, empty/loading states
- `src/components/chat/chat-window.tsx` — persona dropdown and props removed
- `src/hooks/use-session.ts` — `persona_id: string | null` added to Session interface

**Implementation details:**
- Dropdown positioned in session header after session name, before scene button
- Matches existing header button styling: `rounded p-1 text-text-muted hover:bg-bg-raised hover:text-accent`
- Click-outside via `useEffect` with `document.addEventListener('click')` and `ref.contains()` check
- Empty state: "No personas. Create persona" with `<Link href="/personas">`
- Loading state: spinner + "Loading..." while personas fetch
- Persistence: `handlePersonaChange` calls `PUT /api/sessions/${sessionId}/persona` then updates local state
- Session restore: `useEffect` watches `session?.persona_id` and sets `activePersonaId` on mount
- `personasLoading` state tracks fetch progress
- Removed from ChatWindow: `personas`, `activePersonaId`, `onPersonaChange` props + dropdown JSX + `useState` import

**Build verification:** `npx next build` passes — all TypeScript checks clean
