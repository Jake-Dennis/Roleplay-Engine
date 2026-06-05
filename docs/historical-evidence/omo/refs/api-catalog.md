# API Endpoint Catalog

**Last Updated:** 2026-05-27

**Total Route Files:** 94  
**Auth Pattern:** `withAuth()` HOF — extracts JWT from cookie/header, returns `{ userId, decoded }` or 401 error.  
**Error Wrapper:** ~55% of routes use `withErrorHandler()`; others use try/catch with `NextResponse.json({ error }, { status })`.  
**Rate Limiting:** Most routes call `checkRateLimit()` with a per-endpoint key. 429 response on limit exceeded.  

---

## Health & Auth

### Health

#### GET /api/health
- **File**: `src/app/api/health/route.ts`
- **Auth**: Custom `isAuthorized()` — localhost bypass or JWT token
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ ollama: { status, models?, modelCount?, error? }, kokoro: { status, voices?, voiceCount?, error? }, db: { status, error? }, timestamp }`
- **Errors**: 401 (unauthorized), 429 (rate limited), 503 (service unhealthy)
- **Handler**: Raw `GET` export

#### GET /api/health/ready
- **File**: `src/app/api/health/ready/route.ts`
- **Auth**: Custom `isAuthorized()` — localhost bypass or JWT token
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ status: "ready" | "not_ready", services: { ollama, kokoro, db }, timestamp }`
- **Errors**: 401, 503
- **Handler**: Raw `GET` export

#### GET /api/health/live
- **File**: `src/app/api/health/live/route.ts`
- **Auth**: None (always returns 200 if process is running)
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ status: "alive", timestamp, uptime }`
- **Errors**: (none)
- **Handler**: `withErrorHandler`

### Auth

#### POST /api/auth/login
- **File**: `src/app/api/auth/login/route.ts`
- **Auth**: None (rate-limited by IP)
- **Query Params**: (none)
- **Body**: `{ username: string, password: string }`
- **Response**: `{ success: true, user: { id, username } }` + sets `auth-token` cookie (httpOnly)
- **Errors**: 400 (validation), 401 (invalid credentials), 429 (rate limited)
- **Handler**: Raw `POST` export

#### POST /api/auth/register
- **File**: `src/app/api/auth/register/route.ts`
- **Auth**: None (rate-limited by IP)
- **Query Params**: (none)
- **Body**: `{ username: string, password: string }`
- **Response**: `{ success: true, user: { id, username } }` (201)
- **Errors**: 400 (validation), 409 (username exists), 429 (rate limited)
- **Handler**: Raw `POST` export

#### POST /api/auth/logout
- **File**: `src/app/api/auth/logout/route.ts`
- **Auth**: Optional token revocation via `getAuthToken()` — succeeds even without token
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true }` + clears `auth-token` cookie
- **Errors**: 429 (rate limited)
- **Handler**: Raw `POST` export

#### GET /api/auth/me
- **File**: `src/app/api/auth/me/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ user: { id, username, createdAt }, activeState: { groupId, sessionId, universeId } }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### PUT /api/auth/password
- **File**: `src/app/api/auth/password/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ currentPassword: string, newPassword: string }`
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 429
- **Handler**: `withErrorHandler`

---

## Sessions

#### GET /api/sessions
- **File**: `src/app/api/sessions/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `group_id` (optional), `scope` (`"personal"` or omitted for all)
- **Body**: (none)
- **Response**: `{ sessions: Session[] }`
- **Errors**: 401, 403, 429
- **Handler**: `withErrorHandler`

#### POST /api/sessions
- **File**: `src/app/api/sessions/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ name: string, universe_id: string, timeline_id?: string, type?: "solo" | ..., group_id?: string }`
- **Response**: `{ session: Session }` (201)
- **Errors**: 400, 401, 403, 429
- **Handler**: `withErrorHandler`

#### GET /api/sessions/[id]
- **File**: `src/app/api/sessions/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ session: Session, messages: Message[], sceneState, participants, turnConfig, isOwner }`
- **Errors**: 400 (invalid UUID), 401, 404, 429
- **Handler**: Raw `GET` export (try/catch)

#### PUT /api/sessions/[id]
- **File**: `src/app/api/sessions/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ name?: string, status?: string }`
- **Response**: `{ session: Session }`
- **Errors**: 400, 401, 404, 429
- **Handler**: Raw `PUT` export

#### DELETE /api/sessions/[id]
- **File**: `src/app/api/sessions/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 404, 429
- **Handler**: Raw `DELETE` export

#### GET /api/sessions/[id]/messages
- **File**: `src/app/api/sessions/[id]/messages/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `limit` (default 100, max 500), `cursor`
- **Body**: (none)
- **Response**: `{ messages: Message[], nextCursor: string | null }`
- **Errors**: 401, 404, 429
- **Handler**: Raw `GET` export (try/catch)

#### POST /api/sessions/[id]/messages
- **File**: `src/app/api/sessions/[id]/messages/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ content: string, personaId?: string }`
- **Response**: `{ message: Message }` (201)
- **Errors**: 400, 401, 403 (observer), 404, 429
- **Handler**: Raw `POST` export (try/catch)

#### PUT /api/sessions/[id]/messages/[messageId]
- **File**: `src/app/api/sessions/[id]/messages/[messageId]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ content: string, regenerate?: boolean }`
- **Response**: `{ message, newMessage, regenerated, editedContent }`
- **Errors**: 400, 401, 403, 404, 429
- **Handler**: `withErrorHandler`

#### DELETE /api/sessions/[id]/messages/[messageId]
- **File**: `src/app/api/sessions/[id]/messages/[messageId]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true, deletedCount }`
- **Errors**: 401, 403, 404, 429
- **Handler**: `withErrorHandler`

#### POST /api/sessions/[id]/messages/[messageId]/regenerate
- **File**: `src/app/api/sessions/[id]/messages/[messageId]/regenerate/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true, deletedCount, lastValidMessageId, lastUserMessageId, lastUserMessage, sessionName }`
- **Errors**: 401, 403, 404, 429
- **Handler**: `withErrorHandler`

#### GET /api/sessions/[id]/messages/[messageId]/edits
- **File**: `src/app/api/sessions/[id]/messages/[messageId]/edits/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ edits: Edit[] }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### GET /api/sessions/[id]/messages/search
- **File**: `src/app/api/sessions/[id]/messages/search/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `q` (required — search query)
- **Body**: (none)
- **Response**: `{ results: Message[], total: number }`
- **Errors**: 400, 401, 404, 429
- **Handler**: Raw `GET` export (try/catch)

#### GET /api/sessions/[id]/turn
- **File**: `src/app/api/sessions/[id]/turn/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ turnMode: string, turnOrder: string[], currentTurn: string | null }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### PUT /api/sessions/[id]/turn
- **File**: `src/app/api/sessions/[id]/turn/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ turnMode?: string, turnOrder?: string[], currentTurn?: string }`
- **Response**: `{ success: true, turnConfig }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### POST /api/sessions/[id]/turn
- **File**: `src/app/api/sessions/[id]/turn/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ action: "advance" | "claim" }`
- **Response**: `{ success: true, turnConfig }`
- **Errors**: 400, 401, 403, 404, 429
- **Handler**: `withErrorHandler`

#### GET /api/sessions/[id]/scene
- **File**: `src/app/api/sessions/[id]/scene/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ sceneState: { id, location, goal, tone, activeNpcs, activeThreads, sceneSummary, updatedAt } | null }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### PUT /api/sessions/[id]/scene
- **File**: `src/app/api/sessions/[id]/scene/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ location?, goal?, tone?, activeNpcs?, activeThreads?, sceneSummary? }`
- **Response**: `{ success: true }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### GET /api/sessions/[id]/participants
- **File**: `src/app/api/sessions/[id]/participants/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ participants, owner }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### PUT /api/sessions/[id]/participants/role
- **File**: `src/app/api/sessions/[id]/participants/role/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ participant_id: string, role: "participant" | "observer" }`
- **Response**: `{ success: true, role }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### POST /api/sessions/[id]/join
- **File**: `src/app/api/sessions/[id]/join/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ character_name?: string }`
- **Response**: `{ success: true, role: "participant", characterName }`
- **Errors**: 401, 403, 404, 409, 429
- **Handler**: Raw `POST` export

#### POST /api/sessions/[id]/leave
- **File**: `src/app/api/sessions/[id]/leave/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 400 (owner cannot leave), 401, 404, 429
- **Handler**: `withErrorHandler`

#### POST /api/sessions/[id]/invite
- **File**: `src/app/api/sessions/[id]/invite/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ username: string }`
- **Response**: `{ success: true, invitee: { id, username } }`
- **Errors**: 400, 401, 404, 409, 429
- **Handler**: `withErrorHandler`

#### GET /api/sessions/[id]/invite
- **File**: `src/app/api/sessions/[id]/invite/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ invitations }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### POST /api/sessions/[id]/kick
- **File**: `src/app/api/sessions/[id]/kick/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ userId: string }`
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### GET /api/sessions/[id]/export
- **File**: `src/app/api/sessions/[id]/export/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `format` (`"json"`, `"md"`, `"txt"`; default `"json"`)
- **Body**: (none)
- **Response**: File download with `Content-Disposition: attachment` — JSON, Markdown, or plain text
- **Errors**: 400 (invalid format), 401, 404, 429
- **Handler**: Raw `GET` export (try/catch)

#### GET /api/sessions/[id]/retrieval-context
- **File**: `src/app/api/sessions/[id]/retrieval-context/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ context: RetrievedContext, budget: BudgetBreakdown }`
- **Errors**: 401, 404, 500
- **Handler**: Raw `GET` export

#### GET /api/sessions/[id]/private-state
- **File**: `src/app/api/sessions/[id]/private-state/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ privateState: Record<string, unknown> }`
- **Errors**: 401, 403, 429
- **Handler**: Raw `GET` export

#### PUT /api/sessions/[id]/private-state
- **File**: `src/app/api/sessions/[id]/private-state/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ state: Record<string, unknown> }`
- **Response**: `{ success: true }`
- **Errors**: 401, 403, 429
- **Handler**: Raw `PUT` export

#### PUT /api/sessions/[id]/persona
- **File**: `src/app/api/sessions/[id]/persona/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ persona_id: string | null }`
- **Response**: `{ success: true, session: { persona_id } }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### GET /api/sessions/[id]/stream
- **File**: `src/app/api/sessions/[id]/stream/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: SSE stream — events: `message:created`, `message:updated`, `message:deleted`, `generation:started`, `generation:done`, `participant:*`, `turn:updated`, `session:updated`, `heartbeat`
- **Errors**: 401, 404, 429 (rate limit / too many connections)
- **Handler**: Raw `GET` export (ReadableStream)

#### POST /api/sessions/[id]/recap
- **File**: `src/app/api/sessions/[id]/recap/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ jobId }` (201)
- **Errors**: 401, 404, 429
- **Handler**: Raw `POST` export (try/catch)

---

## Generation

#### POST /api/generate/[id]
- **File**: `src/app/api/generate/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ userMessage: string, parentMessageId?: string }`
- **Response**: SSE stream — JSON-line chunks `{ chunk }` + final `{ done: true, messageId, intent }`
- **Errors**: 400, 401, 404, 429
- **Handler**: Raw `POST` export (ReadableStream)

---

## Search

#### GET /api/search
- **File**: `src/app/api/search/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `q` (optional — if omitted returns stats), `type` (entity type filter), `limit` (default 10, max 100), `minScore` (default 0.5)
- **Body**: (none)
- **Response**: `{ results, query }` or `{ stats }` (no query)
- **Errors**: 400 (minScore range), 401, 429
- **Handler**: Raw `GET` export

---

## Groups

#### GET /api/groups
- **File**: `src/app/api/groups/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ groups: Group[] }`
- **Errors**: 401, 429
- **Handler**: Raw `GET` export (try/catch)

#### POST /api/groups
- **File**: `src/app/api/groups/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ name: string, description?: string }`
- **Response**: `{ group: Group }` (201)
- **Errors**: 400, 401, 429
- **Handler**: Raw `POST` export (try/catch)

#### GET /api/groups/[id]
- **File**: `src/app/api/groups/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ group: Group, members, sessions, universes }`
- **Errors**: 400, 401, 403, 429
- **Handler**: `withErrorHandler`

#### PUT /api/groups/[id]
- **File**: `src/app/api/groups/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ name?: string, description?: string }`
- **Response**: `{ group: Group }`
- **Errors**: 400, 401, 403, 429
- **Handler**: `withErrorHandler`

#### DELETE /api/groups/[id]
- **File**: `src/app/api/groups/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 403, 429
- **Handler**: `withErrorHandler`

#### POST /api/groups/[id]/members
- **File**: `src/app/api/groups/[id]/members/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ username?: string, user_id?: string }`
- **Response**: `{ success: true, userId }`
- **Errors**: 400, 401, 403, 404, 409, 429
- **Handler**: `withErrorHandler`

#### DELETE /api/groups/[id]/members
- **File**: `src/app/api/groups/[id]/members/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ user_id: string }`
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 403, 429
- **Handler**: `withErrorHandler`

---

## Invitations

#### GET /api/invitations
- **File**: `src/app/api/invitations/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ invitations }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

---

## Universes

#### GET /api/universes
- **File**: `src/app/api/universes/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `group_id` (optional), `scope` (`"personal"` or omitted)
- **Body**: (none)
- **Response**: `{ universes: Universe[] }`
- **Errors**: 401, 403, 429
- **Handler**: `withErrorHandler`

#### POST /api/universes
- **File**: `src/app/api/universes/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ name, description?, canon_mode?, lore_source?, tone?, time_period?, boundaries?, group_id? }`
- **Response**: `{ universe: Universe }` (201)
- **Errors**: 400, 401, 403, 429
- **Handler**: `withErrorHandler`

#### GET /api/universes/[id]
- **File**: `src/app/api/universes/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ universe: Universe }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### PUT /api/universes/[id]
- **File**: `src/app/api/universes/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ name?, description?, canon_mode?, lore_source?, tone?, time_period?, boundaries? }`
- **Response**: `{ universe: Universe }`
- **Errors**: 400, 401, 404, 429, 500
- **Handler**: `withErrorHandler`

#### DELETE /api/universes/[id]
- **File**: `src/app/api/universes/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 404, 409 (has dependent sessions), 429
- **Handler**: `withErrorHandler`

---

## NPCs

#### GET /api/npcs
- **File**: `src/app/api/npcs/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `universe_id` (optional — filter by universe)
- **Body**: (none)
- **Response**: `{ npcs: Npc[] }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

#### POST /api/npcs
- **File**: `src/app/api/npcs/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ name, description?, personalityTraits?, behaviorPatterns?, voiceId?, isCanon?, universeId }`
- **Response**: `{ npc: Npc }` (201)
- **Errors**: 400, 401, 429
- **Handler**: `withErrorHandler`

#### GET /api/npcs/[id]
- **File**: `src/app/api/npcs/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ npc: Npc }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### PUT /api/npcs/[id]
- **File**: `src/app/api/npcs/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ name?, description?, personalityTraits?, behaviorPatterns?, voiceId?, isCanon? }`
- **Response**: `{ npc: Npc }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### DELETE /api/npcs/[id]
- **File**: `src/app/api/npcs/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

---

## Personas

#### GET /api/personas
- **File**: `src/app/api/personas/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ personas: Persona[] }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

#### POST /api/personas
- **File**: `src/app/api/personas/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ name, description?, personality?, scenario?, firstMes?, mesExample?, creatorNotes?, systemPrompt?, postHistoryInstructions?, tags?, writingStyle?, avatarUrl?, llmModel?, ttsVoice? }`
- **Response**: `{ persona: Persona }` (201)
- **Errors**: 400, 401, 429
- **Handler**: `withErrorHandler`

#### GET /api/personas/[id]
- **File**: `src/app/api/personas/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ persona: Persona }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### PUT /api/personas/[id]
- **File**: `src/app/api/personas/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ name?, description?, personality?, scenario?, firstMes?, mesExample?, creatorNotes?, systemPrompt?, postHistoryInstructions?, tags?, writingStyle?, avatarUrl?, llmModel?, ttsVoice? }`
- **Response**: `{ persona: Persona }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### DELETE /api/personas/[id]
- **File**: `src/app/api/personas/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### PUT /api/personas/[id]/activate
- **File**: `src/app/api/personas/[id]/activate/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ persona }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### GET /api/personas/active
- **File**: `src/app/api/personas/active/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ persona: Persona | null }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

---

## Timeline

#### GET /api/timeline
- **File**: `src/app/api/timeline/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `id` (single entry), `sessionId`, `threadId`, `era`, `entryType`, `sort` (`asc`/`desc`), `limit` (max 500), `cursor`
- **Body**: (none)
- **Response**: `{ entries: Entry[], nextCursor }` or `{ entry }` (single)
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### POST /api/timeline
- **File**: `src/app/api/timeline/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ title, description?, sessionId?, threadId?, occurredAt, era?, entryType?, importance? }`
- **Response**: `{ entry }` (201)
- **Errors**: 400, 401, 429
- **Handler**: `withErrorHandler`

#### PUT /api/timeline
- **File**: `src/app/api/timeline/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ id, title?, description?, occurredAt?, era?, entryType?, importance? }`
- **Response**: `{ entry }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### DELETE /api/timeline
- **File**: `src/app/api/timeline/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `id` (required)
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### GET /api/timelines/[id]/layers
- **File**: `src/app/api/timelines/[id]/layers/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `layerType` (optional — `era`, `faction`, `active_characters`)
- **Body**: (none)
- **Response**: `{ layers }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### POST /api/timelines/[id]/layers
- **File**: `src/app/api/timelines/[id]/layers/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ layerType, name, description?, startYear?, endYear?, metadata? }`
- **Response**: `{ layer }` (201)
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### PUT /api/timelines/[id]/layers/[layerId]
- **File**: `src/app/api/timelines/[id]/layers/[layerId]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ name?, description?, startYear?, endYear?, metadata? }`
- **Response**: `{ layer }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### DELETE /api/timelines/[id]/layers/[layerId]
- **File**: `src/app/api/timelines/[id]/layers/[layerId]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

---

## Narrative

#### GET /api/narrative-memories
- **File**: `src/app/api/narrative-memories/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `sessionId`, `limit` (max 500), `cursor`
- **Body**: (none)
- **Response**: `{ memories, nextCursor }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

#### POST /api/narrative-memories
- **File**: `src/app/api/narrative-memories/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ sessionId?, type, content, importance?, relatedEntities? }`
- **Response**: `{ memory }` (201)
- **Errors**: 400, 401, 429
- **Handler**: `withErrorHandler`

#### GET /api/narrative-memories/[id]
- **File**: `src/app/api/narrative-memories/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ memory }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### PUT /api/narrative-memories/[id]
- **File**: `src/app/api/narrative-memories/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ content?, type?, importance?, relatedEntities? }`
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### DELETE /api/narrative-memories/[id]
- **File**: `src/app/api/narrative-memories/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

#### GET /api/narrative-threads
- **File**: `src/app/api/narrative-threads/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `id` (single thread), `sessionId`, `universe_id`, `status`, `arcType`, `limit` (max 500), `cursor`
- **Body**: (none)
- **Response**: `{ threads, nextCursor }` or `{ thread }` (single)
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### POST /api/narrative-threads
- **File**: `src/app/api/narrative-threads/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ title, description?, sessionId?, arcType?, escalationLevel?, unresolvedItems?, universe_id? }`
- **Response**: `{ thread }` (201)
- **Errors**: 400, 401, 429
- **Handler**: `withErrorHandler`

#### PUT /api/narrative-threads
- **File**: `src/app/api/narrative-threads/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ id, title?, description?, status?, arcType?, escalationLevel?, unresolvedItems?, universe_id? }`
- **Response**: `{ thread }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### DELETE /api/narrative-threads
- **File**: `src/app/api/narrative-threads/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `id` (required)
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

---

## Relationships

#### GET /api/relationships
- **File**: `src/app/api/relationships/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `universe_id`, `group_id`
- **Body**: (none)
- **Response**: `{ relationships }`
- **Errors**: 401, 403, 429
- **Handler**: Raw `GET` export

#### POST /api/relationships
- **File**: `src/app/api/relationships/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ sourceEntity, targetEntity, emotionalState?, sharedHistory?, relationshipStage?, decayRates?, universe_id? }`
- **Response**: `{ relationship }` (201)
- **Errors**: 400, 401, 429
- **Handler**: Raw `POST` export

#### GET /api/relationships/[id]
- **File**: `src/app/api/relationships/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ relationship }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### PUT /api/relationships/[id]
- **File**: `src/app/api/relationships/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ emotionalState?, sharedHistory?, relationshipStage?, decayRates? }`
- **Response**: `{ relationship }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### DELETE /api/relationships/[id]
- **File**: `src/app/api/relationships/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### GET /api/relationships/[id]/evolution
- **File**: `src/app/api/relationships/[id]/evolution/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ history }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### POST /api/relationships/[id]/evolution
- **File**: `src/app/api/relationships/[id]/evolution/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ emotionalState?, relationshipStage?, triggerEvent? }`
- **Response**: `{ entry }` (201)
- **Errors**: 400, 401, 404, 429, 500
- **Handler**: `withErrorHandler`

#### GET /api/relationships/[id]/decay
- **File**: `src/app/api/relationships/[id]/decay/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ relationship, stats }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### POST /api/relationships/[id]/decay
- **File**: `src/app/api/relationships/[id]/decay/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true, decayedCount, decayedRelationships }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

#### GET /api/relationships/[id]/file
- **File**: `src/app/api/relationships/[id]/file/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ relationship, history, filePath, historyPath }`
- **Errors**: 401, 404, 500, 429
- **Handler**: `withErrorHandler`

#### PUT /api/relationships/[id]/file
- **File**: `src/app/api/relationships/[id]/file/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ notes?, relationship_stage?, emotional_state?, shared_history? }`
- **Response**: `{ success: true, relationship?, history? }`
- **Errors**: 401, 404, 429
- **Handler**: `withErrorHandler`

---

## Settings

#### GET /api/settings
- **File**: `src/app/api/settings/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ ollama: { host, model, embeddingModel, localModels }, tts: { host, defaultVoice }, user: { llmModel, embeddingModel, ttsSpeed, ttsVolume, ttsFormat, ttsAutoPlay, ttsSkipLong, ttsLongThreshold } }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

#### PUT /api/settings
- **File**: `src/app/api/settings/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ llmModel?, embeddingModel?, ttsSpeed?, ttsVolume?, ttsFormat?, ttsAutoPlay?, ttsSkipLong?, ttsLongThreshold? }`
- **Response**: `{ success: true, settings }`
- **Errors**: 400, 401, 429
- **Handler**: `withErrorHandler`

#### PUT /api/settings/active-state
- **File**: `src/app/api/settings/active-state/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ groupId?, sessionId?, universeId? }`
- **Response**: `{ success: true }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

---

## Jobs

#### GET /api/jobs
- **File**: `src/app/api/jobs/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `status`, `type`, `universe_id`
- **Body**: (none)
- **Response**: `{ jobs, stats }`
- **Errors**: 401, 429
- **Handler**: Raw `GET` export

#### POST /api/jobs
- **File**: `src/app/api/jobs/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ action: "queue" | "process" | "process-next" | "cancel" | "cancel-all" | "retry" | "retry-all" | "queue-idle" | "process-idle", type?, payload?, priority?, jobId?, universe_id? }`
- **Response**: varies by action — `{ success, jobId }`, `{ success, results }`, etc.
- **Errors**: 400, 401, 429
- **Handler**: Raw `POST` export

#### DELETE /api/jobs
- **File**: `src/app/api/jobs/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `id` (optional — single job; if omitted cancels all)
- **Body**: (none)
- **Response**: `{ success }` or `{ success, cancelledCount }`
- **Errors**: 401, 429
- **Handler**: Raw `DELETE` export

#### GET /api/jobs/stream
- **File**: `src/app/api/jobs/stream/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: SSE stream — events: `job:progress`, `job:completed`, `heartbeat`
- **Errors**: 401, 429
- **Handler**: Raw `GET` export (ReadableStream)

---

## TTS

#### GET /api/tts/voices
- **File**: `src/app/api/tts/voices/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ voices: string[], voiceDetails }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

#### POST /api/tts/voices
- **File**: `src/app/api/tts/voices/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ voices: string[], voiceDetails }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

#### POST /api/tts/voices/refresh
- **File**: `src/app/api/tts/voices/refresh/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true, voices, count }`
- **Errors**: 401, 500, 429
- **Handler**: Raw `POST` export

#### POST /api/tts/voices/combine
- **File**: `src/app/api/tts/voices/combine/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ voiceSpec: string }`
- **Response**: Binary `.pt` file download
- **Errors**: 400, 401, 500, 429
- **Handler**: Raw `POST` export

#### POST /api/tts/stream
- **File**: `src/app/api/tts/stream/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ text: string, voice: string, speed?: number, format?: "mp3" | "wav" | "ogg" }`
- **Response**: Audio stream (`audio/mp3`, `audio/wav`, or `audio/ogg`)
- **Errors**: 400, 401, 429, 500
- **Handler**: Raw `POST` export

#### POST /api/tts/generate
- **File**: `src/app/api/tts/generate/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ text: string, voice: string, speed?: number, format?: string }`
- **Response**: Audio blob with cache headers (`X-Cache: HIT` or `X-Cache: MISS`)
- **Errors**: 400, 401, 429, 500
- **Handler**: Raw `POST` export

#### GET /api/tts/cache
- **File**: `src/app/api/tts/cache/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `cursor`, `limit` (max 100)
- **Body**: (none)
- **Response**: `{ stats, recentEntries, nextCursor }`
- **Errors**: 401, 429
- **Handler**: Raw `GET` export

#### POST /api/tts/cache
- **File**: `src/app/api/tts/cache/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ action: "refresh" | "combine", cacheId?, cacheIds?, outputName? }`
- **Response**: varies by action
- **Errors**: 400, 401, 404, 429
- **Handler**: Raw `POST` export

#### DELETE /api/tts/cache
- **File**: `src/app/api/tts/cache/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `action` (`"clear"`, `"expired"`, `"unused"`)
- **Body**: (none)
- **Response**: `{ success: true, deletedCount }`
- **Errors**: 400, 401, 429
- **Handler**: Raw `DELETE` export

#### GET /api/tts/voice/[entityType]/[entityId]
- **File**: `src/app/api/tts/voice/[entityType]/[entityId]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ assignment }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

#### PUT /api/tts/voice/[entityType]/[entityId]
- **File**: `src/app/api/tts/voice/[entityType]/[entityId]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ voiceName: string, speed?: number, volume?: number }`
- **Response**: `{ assignment, success: true }`
- **Errors**: 400, 401, 429
- **Handler**: `withErrorHandler`

#### DELETE /api/tts/voice/[entityType]/[entityId]
- **File**: `src/app/api/tts/voice/[entityType]/[entityId]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

---

## Voice Assignments

#### GET /api/voice-assignments
- **File**: `src/app/api/voice-assignments/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `entityType`, `entityId` (both required unless `entityType=voice_profile`)
- **Body**: (none)
- **Response**: `{ assignment }` or `{ profiles }`
- **Errors**: 400, 401, 429
- **Handler**: `withErrorHandler`

#### PUT /api/voice-assignments
- **File**: `src/app/api/voice-assignments/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ entityType, entityId, voiceName, voiceSpeed?, volume? }`
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 429
- **Handler**: `withErrorHandler`

#### POST /api/voice-assignments
- **File**: `src/app/api/voice-assignments/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ id, name, slots }`
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 429
- **Handler**: `withErrorHandler`

#### DELETE /api/voice-assignments
- **File**: `src/app/api/voice-assignments/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `entityType`/`entityId` or `profileId`
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 429
- **Handler**: `withErrorHandler`

---

## Backlinks

#### GET /api/backlinks
- **File**: `src/app/api/backlinks/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `entityType`, `entityId`, `targetType`, `universe_id`, `cursor`, `limit` (max 100)
- **Body**: (none)
- **Response**: `{ backlinks, nextCursor }`
- **Errors**: 401, 429
- **Handler**: Raw `GET` export

#### POST /api/backlinks
- **File**: `src/app/api/backlinks/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ sourceType, sourceId, targetType, targetId, linkType?, contextSnippet?, universe_id? }`
- **Response**: `{ backlink }` (201)
- **Errors**: 400, 401, 409, 429
- **Handler**: Raw `POST` export

#### DELETE /api/backlinks
- **File**: `src/app/api/backlinks/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `id` (required)
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 429
- **Handler**: Raw `DELETE` export

#### GET /api/backlinks/graph
- **File**: `src/app/api/backlinks/graph/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ nodes: Node[], edges: Edge[] }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

---

## Contradictions

#### GET /api/contradictions
- **File**: `src/app/api/contradictions/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `entityType`, `entityId`, `cursor`, `limit` (max 100)
- **Body**: (none)
- **Response**: `{ contradictions, nextCursor }`
- **Errors**: 401, 429
- **Handler**: Raw `GET` export

#### POST /api/contradictions
- **File**: `src/app/api/contradictions/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ entityType, entityId }`
- **Response**: `{ contradictions? }` (detection result)
- **Errors**: 400, 401, 500, 429
- **Handler**: Raw `POST` export

#### PUT /api/contradictions
- **File**: `src/app/api/contradictions/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none) — scans all unverified lore
- **Response**: scan result
- **Errors**: 401, 500, 429
- **Handler**: Raw `PUT` export

---

## Models

#### GET /api/models/ollama
- **File**: `src/app/api/models/ollama/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ connected, host, models, llmModels, embeddingModels, defaultLLM, defaultEmbedding }`
- **Errors**: 401, 502 (Ollama unreachable), 429
- **Handler**: Raw `GET` export

#### GET /api/ollama/models
- **File**: `src/app/api/ollama/models/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ models, defaultLlm, defaultEmbedding }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

---

## Idle Processing

#### POST /api/idle/heartbeat
- **File**: `src/app/api/idle/heartbeat/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ tier: number, page: string, universeId?: string }`
- **Response**: `{ success: true, tier }`
- **Errors**: 400 (invalid tier 1-4), 401, 429
- **Handler**: `withErrorHandler`

---

## Admin

#### GET /api/admin/entities
- **File**: `src/app/api/admin/entities/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `search`, `name` (detail mode), `cursor`, `limit` (max 100)
- **Body**: (none)
- **Response**: `{ entities, nextCursor }` or `{ entity: { entityName, mentions } }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

#### GET /api/admin/contradictions
- **File**: `src/app/api/admin/contradictions/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `status`, `cursor`, `limit` (max 100)
- **Body**: (none)
- **Response**: `{ contradictions, nextCursor }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

#### PATCH /api/admin/contradictions/[id]
- **File**: `src/app/api/admin/contradictions/[id]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ status: "resolved" | "dismissed", resolution?: string }`
- **Response**: `{ contradiction }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

---

## Users

#### GET /api/users
- **File**: `src/app/api/users/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `group_id`, `q` (search), `cursor`, `limit` (max 100)
- **Body**: (none)
- **Response**: `{ users: { id, username }[], nextCursor }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

---

## Wiki

#### GET /api/wiki
- **File**: `src/app/api/wiki/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `universe_id`
- **Body**: (none)
- **Response**: `{ pages: WikiPage[], orphanPaths, orphanSuggestions }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

#### POST /api/wiki
- **File**: `src/app/api/wiki/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ path: string, content: string, frontmatter: object, universeId?: string }`
- **Response**: `{ success: true, path }`
- **Errors**: 400, 401, 429
- **Handler**: `withErrorHandler`

#### GET /api/wiki/[...slug]
- **File**: `src/app/api/wiki/[...slug]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `universe_id`
- **Body**: (none)
- **Response**: `{ page: { path, content, frontmatter }, allPages, backlinks, orphanPaths, embeds }`
- **Errors**: 400 (invalid path), 401, 404, 500, 429
- **Handler**: Raw `GET` export

#### PUT /api/wiki/[...slug]
- **File**: `src/app/api/wiki/[...slug]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `universe_id`
- **Body**: `{ content?, frontmatter?, expectedLastModified? }`
- **Response**: `{ success: true, path }`
- **Errors**: 400, 401, 404, 409 (conflict), 500, 429
- **Handler**: Raw `PUT` export

#### DELETE /api/wiki/[...slug]
- **File**: `src/app/api/wiki/[...slug]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `universe_id`
- **Body**: (none)
- **Response**: `{ success: true }`
- **Errors**: 400, 401, 404, 500, 429
- **Handler**: Raw `DELETE` export

#### POST /api/wiki/query
- **File**: `src/app/api/wiki/query/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ query: string, universeId: string }`
- **Response**: `{ answer, citations, usedFallback }`
- **Errors**: 400, 401, 429, 500
- **Handler**: Raw `POST` export

#### GET /api/wiki/recent
- **File**: `src/app/api/wiki/recent/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `universe_id`, `limit` (default 10)
- **Body**: (none)
- **Response**: `{ files }`
- **Errors**: 401, 429, 500
- **Handler**: Raw `GET` export

#### GET /api/wiki/history
- **File**: `src/app/api/wiki/history/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `slug` (required)
- **Body**: (none)
- **Response**: `{ versions }`
- **Errors**: 400, 401, 429, 500
- **Handler**: Raw `GET` export

#### POST /api/wiki/history
- **File**: `src/app/api/wiki/history/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ action: "restore" | "record", versionId?, slug?, changeSummary?, universeId? }`
- **Response**: `{ success: true }` or `{ success: true, versionNumber }`
- **Errors**: 400, 401, 404, 429, 500
- **Handler**: Raw `POST` export

#### GET /api/wiki/log
- **File**: `src/app/api/wiki/log/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `universe_id`, `count` (default 5)
- **Body**: (none)
- **Response**: `{ logs }`
- **Errors**: 401, 429, 500
- **Handler**: Raw `GET` export

#### GET /api/wiki/index
- **File**: `src/app/api/wiki/index/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `universe_id`
- **Body**: (none)
- **Response**: `{ index: string }`
- **Errors**: 401, 429, 500
- **Handler**: Raw `GET` export

#### POST /api/wiki/ingest
- **File**: `src/app/api/wiki/ingest/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ sourcePath: string, universeId: string }`
- **Response**: `{ success: true, created, updated, errors }`
- **Errors**: 400, 401, 429, 500
- **Handler**: Raw `POST` export

#### POST /api/wiki/lint
- **File**: `src/app/api/wiki/lint/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ universeId? }`
- **Response**: `{ contradictions, staleClaims, orphans, missingPages, suggestions }`
- **Errors**: 401, 429, 500
- **Handler**: Raw `POST` export

#### POST /api/wiki/file
- **File**: `src/app/api/wiki/file/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ query, answer, citations, universeId }`
- **Response**: result object
- **Errors**: 400, 401, 429, 500
- **Handler**: Raw `POST` export

#### GET /api/wiki/graph
- **File**: `src/app/api/wiki/graph/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `universe_id`
- **Body**: (none)
- **Response**: `{ nodes, edges, collisions }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

#### GET /api/wiki/templates
- **File**: `src/app/api/wiki/templates/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: (none)
- **Response**: `{ templates }`
- **Errors**: 401, 429
- **Handler**: `withErrorHandler`

#### POST /api/wiki/sources/upload
- **File**: `src/app/api/wiki/sources/upload/route.ts`
- **Auth**: `withAuth`
- **Query Params**: (none)
- **Body**: `{ filename: string, content: string, universeId?: string }`
- **Response**: `{ success: true, filename, size }`
- **Errors**: 400, 401, 413 (too large), 415 (bad extension), 429, 500
- **Handler**: Raw `POST` export

#### PUT /api/wiki/validate/[...slug]
- **File**: `src/app/api/wiki/validate/[...slug]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `universe_id`
- **Body**: (none)
- **Response**: `{ success: true, status: "reviewed" }`
- **Errors**: 400, 401, 404, 500, 429
- **Handler**: Raw `PUT` export

#### PUT /api/wiki/lock/[...slug]
- **File**: `src/app/api/wiki/lock/[...slug]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `universe_id`
- **Body**: (none)
- **Response**: `{ success: true, status: "locked" }`
- **Errors**: 400, 401, 404, 500, 429
- **Handler**: Raw `PUT` export

#### PUT /api/wiki/reject/[...slug]
- **File**: `src/app/api/wiki/reject/[...slug]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `universe_id`
- **Body**: `{ reason: string }`
- **Response**: `{ success: true, status: "rejected" }`
- **Errors**: 400, 401, 404, 500, 429
- **Handler**: Raw `PUT` export

#### GET /api/wiki/split-suggestions/[...slug]
- **File**: `src/app/api/wiki/split-suggestions/[...slug]/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `universe_id`
- **Body**: (none)
- **Response**: `{ pageSize, splitSuggestion }`
- **Errors**: 400, 401, 404, 429
- **Handler**: `withErrorHandler`

#### GET /api/wiki-revisions
- **File**: `src/app/api/wiki-revisions/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `slug` (required), `id` (optional — specific revision), `universe_id`
- **Body**: (none)
- **Response**: `{ revisions }` or `{ revision }`
- **Errors**: 400, 401, 404, 429
- **Handler**: Raw `GET` export

#### POST /api/wiki-revisions
- **File**: `src/app/api/wiki-revisions/route.ts`
- **Auth**: `withAuth`
- **Query Params**: `slug` (required), `universeId`
- **Body**: (varies, parsed from JSON)
- **Response**: `{ success: true, revision }`
- **Errors**: 400, 401, 404, 500, 429
- **Handler**: Raw `POST` export
