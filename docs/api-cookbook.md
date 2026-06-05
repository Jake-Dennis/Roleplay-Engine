# API Cookbook

**Last updated:** 2026-05-27

Curl-based usage examples for the Roleplay-Engine API. All 94 routes are documented in [docs/historical-evidence/omo/refs/api-catalog.md](../historical-evidence/omo/refs/api-catalog.md).

## Setup: Getting an Auth Cookie

Every protected endpoint requires authentication. The server uses JWT tokens stored in httpOnly cookies. You get one by logging in, then curl keeps sending it back if you use a cookie jar.

### Login

```bash
# Replace USERNAME and PASSWORD with actual credentials.
# The -c flag tells curl to write Set-Cookie to a file.
# Subsequent requests use -b to read that file.

curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -c /tmp/rpe-cookies.txt \
  -d '{
    "username": "myusername",
    "password": "mypassword"
  }'
```

**Expected response (200):**

```json
{
  "success": true,
  "user": {
    "id": "uuid-of-user",
    "username": "myusername"
  }
}
```

The `auth-token` cookie is set automatically on this response. Curl stores it in `/tmp/rpe-cookies.txt` because of the `-c` flag.

**Error responses:**

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{"error": "Username and password are required"}` | Missing fields |
| 400 | `{"error": "Username must be between 3 and 30 characters"}` | Validation failure |
| 401 | `{"error": "Invalid username or password"}` | Wrong credentials |
| 429 | `{"error": "Too many requests"}` | Rate limited by IP |

### Register (if you don't have an account)

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -c /tmp/rpe-cookies.txt \
  -d '{
    "username": "myusername",
    "password": "mypassword"
  }'
```

**Expected response (201):**

```json
{
  "success": true,
  "user": {
    "id": "uuid-of-user",
    "username": "myusername"
  }
}
```

### Using the Cookie Jar

Once you have the cookie, pass it with `-b` on every subsequent request:

```bash
curl -b /tmp/rpe-cookies.txt http://localhost:3000/api/auth/me
```

You can also inspect the raw cookie value:

```bash
cat /tmp/rpe-cookies.txt | grep "auth-token"
```

### Logout

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -b /tmp/rpe-cookies.txt \
  -c /tmp/rpe-cookies.txt
```

**Expected response (200):**

```json
{
  "success": true
}
```

The cookie is cleared on the server side. The `-c` flag updates your cookie file so it no longer contains a valid token.

---

## Flow 1: Auth Login — Authenticate and Verify Session

This flow logs in, verifies the session, then cleans up. Every other flow in this cookbook starts the same way (get a cookie).

### Step 1: Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -c /tmp/rpe-cookies.txt \
  -d '{"username": "myusername", "password": "mypassword"}'
```

**Expected response:**

```json
{
  "success": true,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "myusername"
  }
}
```

### Step 2: Verify the Session

```bash
curl -b /tmp/rpe-cookies.txt http://localhost:3000/api/auth/me
```

**Expected response:**

```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "myusername",
    "createdAt": "2026-01-15T10:30:00.000Z"
  },
  "activeState": {
    "groupId": null,
    "sessionId": null,
    "universeId": null
  }
}
```

### Step 3: Logout

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -b /tmp/rpe-cookies.txt \
  -c /tmp/rpe-cookies.txt
```

**Expected response:**

```json
{
  "success": true
}
```

### Error Scenarios

- **No cookie file:** Forgetting `-b /tmp/rpe-cookies.txt` on `/api/auth/me` returns `{"error": "Authentication required"}` with status 401.
- **Expired token:** The JWT expires after 24 hours. After that, `/api/auth/me` returns 401. Re-login to get a fresh token.
- **Rate limiting:** Login is rate-limited by IP at 5 attempts per minute. You get `{"error": "Too many requests"}` with status 429 and a `Retry-After` header.

---

## Flow 2: Create and List Sessions

A session is a roleplay conversation tied to a universe. This flow creates a session, lists all sessions, then fetches details for one.

Prerequisite: You have a cookie file from [Flow 1](#flow-1-auth-login--authenticate-and-verify-session).

### Step 1: Create a Session

If you don't have a universe ID yet, create one first:

```bash
# Create a universe
curl -X POST http://localhost:3000/api/universes \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{
    "name": "My Fantasy World"
  }'
```

Expected response (201):

```json
{
  "universe": {
    "id": "UNIVERSE_ID",
    "name": "My Fantasy World",
    "description": null,
    "createdAt": "..."
  }
}
```

Now create a session in that universe:

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{
    "name": "First Adventure",
    "universe_id": "UNIVERSE_ID",
    "type": "solo"
  }'
```

**Expected response (201):**

```json
{
  "session": {
    "id": "SESSION_ID",
    "ownerId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "First Adventure",
    "universeId": "UNIVERSE_ID",
    "status": "active",
    "type": "solo",
    "createdAt": "2026-05-27T12:00:00.000Z",
    "updatedAt": "2026-05-27T12:00:00.000Z"
  }
}
```

### Step 2: List All Sessions

```bash
curl -b /tmp/rpe-cookies.txt http://localhost:3000/api/sessions
```

**Expected response:**

```json
{
  "sessions": [
    {
      "id": "SESSION_ID",
      "ownerId": "550e8400-e29b-41d4-a716-446655440000",
      "ownerName": "myusername",
      "name": "First Adventure",
      "universeId": "UNIVERSE_ID",
      "status": "active",
      "type": "solo",
      "createdAt": "2026-05-27T12:00:00.000Z",
      "updatedAt": "2026-05-27T12:00:00.000Z"
    }
  ]
}
```

Filter to personal sessions only:

```bash
curl -b /tmp/rpe-cookies.txt "http://localhost:3000/api/sessions?scope=personal"
```

### Step 3: Get Session Details

```bash
curl -b /tmp/rpe-cookies.txt http://localhost:3000/api/sessions/SESSION_ID
```

**Expected response:**

```json
{
  "session": {
    "id": "SESSION_ID",
    "ownerId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "First Adventure",
    "universeId": "UNIVERSE_ID",
    "status": "active",
    "type": "solo",
    "createdAt": "2026-05-27T12:00:00.000Z",
    "updatedAt": "2026-05-27T12:00:00.000Z"
  },
  "messages": [],
  "sceneState": {
    "id": "SCENE_ID",
    "location": null,
    "goal": null,
    "tone": null,
    "activeNpcs": null,
    "activeThreads": null,
    "sceneSummary": null,
    "updatedAt": "2026-05-27T12:00:00.000Z"
  },
  "participants": [],
  "turnConfig": null,
  "isOwner": true
}
```

### Error Scenarios

| Step | Status | Body | Cause |
|------|--------|------|-------|
| Create session | 400 | `{"error": "Session name is required"}` | Missing `name` |
| Create session | 400 | `{"error": "universe_id is required"}` | Missing `universe_id` |
| Create session | 401 | `{"error": "Authentication required"}` | No cookie or expired token |
| List sessions | 403 | `{"error": "Forbidden"}` | `group_id` provided but user not a member |
| Get session | 404 | `{"error": "Session not found"}` | Invalid UUID or user not a participant |
| Get session | 400 | `{"error": "Invalid UUID"}` | Malformed session ID |

---

## Flow 3: Send Message and Stream Response

This is the core roleplay flow. You send a message in a session, the backend builds a prompt from wiki lore, character data, and conversation history, then streams the AI response over SSE.

Prerequisite: You have a cookie file and a `SESSION_ID` from [Flow 2](#flow-2-create-and-list-sessions).

### Step 1: Subscribe to the Session SSE Stream (in a separate terminal)

Open a long-lived SSE connection to receive real-time events:

```bash
# This connection stays open. Run in a second terminal.
curl -N -b /tmp/rpe-cookies.txt http://localhost:3000/api/sessions/SESSION_ID/stream
```

You will see the initial `connected` event:

```
id: 0
event: connected
data: {"sessionId":"SESSION_ID","connectionId":"SESSION_ID:user:...","connections":1}

event: heartbeat
data: {"connections":1}
```

The stream sends a `heartbeat` every 30 seconds and pushes events when messages are created, updated, or deleted.

### Step 2: Send a User Message

```bash
curl -X POST http://localhost:3000/api/sessions/SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{
    "content": "I walk into the dark tavern and look around for the barkeep."
  }'
```

**Expected response (201):**

```json
{
  "message": {
    "id": "USER_MSG_ID",
    "sessionId": "SESSION_ID",
    "senderId": "550e8400-e29b-41d4-a716-446655440000",
    "senderName": "myusername",
    "content": "I walk into the dark tavern and look around for the barkeep.",
    "parentMessageId": null,
    "createdAt": "2026-05-27T12:01:00.000Z"
  }
}
```

You will also see a `message:created` event appear in your SSE terminal:

```
id: 5
event: message:created
data: {"messageId":"USER_MSG_ID","sessionId":"SESSION_ID","senderId":"...","content":"I walk into the dark tavern and look around for the barkeep."}
```

### Step 3: Generate the AI Response

This triggers the LLM. The response streams as newline-delimited JSON chunks over SSE.

```bash
curl -N -X POST http://localhost:3000/api/generate/SESSION_ID \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{
    "userMessage": "I walk into the dark tavern and look around for the barkeep.",
    "parentMessageId": "USER_MSG_ID"
  }'
```

**Expected SSE output:**

Each line is a JSON object. They arrive one by one as the model generates text:

```json
{"chunk":"The "}
{"chunk":"tavern "}
{"chunk":"is "}
{"chunk":"dimly "}
{"chunk":"lit "}
...
```

When generation completes, you get a final `done` signal:

```json
{"done":true,"messageId":"AI_MSG_ID","intent":"exploration"}
```

The SSE terminal from Step 1 also shows a `generation:started` then `generation:done` event:

```
event: generation:started
data: {"messageId":"AI_MSG_ID","sessionId":"SESSION_ID"}

event: generation:done
data: {"messageId":"AI_MSG_ID","sessionId":"SESSION_ID","intent":"exploration","contentLength":842}
```

### Step 4: List Messages to See the Full Conversation

```bash
curl -b /tmp/rpe-cookies.txt "http://localhost:3000/api/sessions/SESSION_ID/messages?limit=50"
```

**Expected response:**

```json
{
  "messages": [
    {
      "id": "USER_MSG_ID",
      "sessionId": "SESSION_ID",
      "senderId": "550e8400-e29b-41d4-a716-446655440000",
      "senderName": "myusername",
      "content": "I walk into the dark tavern and look around for the barkeep.",
      "createdAt": "2026-05-27T12:01:00.000Z"
    },
    {
      "id": "AI_MSG_ID",
      "sessionId": "SESSION_ID",
      "senderId": null,
      "senderName": null,
      "content": "The tavern is dimly lit by a crackling hearth...",
      "createdAt": "2026-05-27T12:01:15.000Z"
    }
  ],
  "nextCursor": null
}
```

Use the `cursor` parameter for pagination through long conversations:

```bash
curl -b /tmp/rpe-cookies.txt "http://localhost:3000/api/sessions/SESSION_ID/messages?limit=100&cursor=LAST_MSG_ID"
```

### Error Scenarios

| Step | Status | Body | Cause |
|------|--------|------|-------|
| Send message | 400 | `{"error": "Content is required"}` | Empty message body |
| Send message | 403 | `{"error": "Forbidden"}` | User is an observer (read-only role) |
| Send message | 404 | `{"error": "Session not found"}` | Session does not exist or no access |
| Generate | 400 | `{"error": "userMessage is required"}` | Missing `userMessage` in body |
| Generate | 404 | `{"error": "Session not found"}` | Invalid session ID or no access |
| Generate | 429 | `{"error": "Rate limit exceeded"}` | Too many generation requests |
| SSE stream | 404 | `Session not found` (plain text) | Session does not exist |
| SSE stream | 429 | `{"error": "Too many connections"}` | Max SSE connections per session exceeded |

---

## Flow 4: Wiki CRUD and LLM Query

The wiki is markdown-first, stored as `.md` files with YAML frontmatter under `data/{userId}/wiki/`. You can create, read, update, delete, and query pages using the LLM.

Prerequisite: You have a cookie file and a `UNIVERSE_ID`.

### Step 1: Create a Wiki Page

```bash
curl -X POST http://localhost:3000/api/wiki \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{
    "path": "locations/dark-tavern.md",
    "content": "The Dark Tavern is a two-story establishment on the north side of the town square. The barkeep is a grizzled dwarf named Korgrim.",
    "frontmatter": {
      "title": "Dark Tavern",
      "type": "location",
      "status": "draft",
      "tags": ["tavern", "town"]
    },
    "universeId": "UNIVERSE_ID"
  }'
```

**Expected response (200):**

```json
{
  "success": true,
  "path": "locations/dark-tavern.md"
}
```

### Step 2: Read a Wiki Page

```bash
curl -b /tmp/rpe-cookies.txt "http://localhost:3000/api/wiki/locations/dark-tavern?universe_id=UNIVERSE_ID"
```

**Expected response:**

```json
{
  "page": {
    "path": "locations/dark-tavern.md",
    "content": "The Dark Tavern is a two-story establishment on the north side of the town square. The barkeep is a grizzled dwarf named Korgrim.",
    "frontmatter": {
      "title": "Dark Tavern",
      "type": "location",
      "status": "draft",
      "tags": ["tavern", "town"]
    }
  },
  "allPages": [
    {
      "path": "locations/dark-tavern.md",
      "frontmatter": {
        "title": "Dark Tavern",
        "type": "location",
        "status": "draft",
        "tags": ["tavern", "town"],
        "universe": null
      }
    }
  ],
  "backlinks": [],
  "orphanPaths": [],
  "embeds": {}
}
```

### Step 3: Update a Wiki Page

```bash
curl -X PUT http://localhost:3000/api/wiki/locations/dark-tavern?universe_id=UNIVERSE_ID \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{
    "content": "The Dark Tavern is a two-story establishment on the north side of the town square. The barkeep is a grizzled dwarf named Korgrim who tells tales of the old wars for a copper coin.",
    "frontmatter": {
      "status": "reviewed"
    }
  }'
```

**Expected response:**

```json
{
  "success": true,
  "path": "locations/dark-tavern.md"
}
```

If someone else edited the page between your read and write, you get a conflict error:

**Conflict response (409):**

```json
{
  "error": "Concurrent edit conflict",
  "existingLastModified": "2026-05-27T12:05:00.000Z"
}
```

To handle conflicts, pass `expectedLastModified` with the timestamp you read:

```bash
curl -X PUT ... -d '{
  "content": "...",
  "expectedLastModified": "2026-05-27T12:00:00.000Z"
}'
```

### Step 4: List All Wiki Pages

```bash
curl -b /tmp/rpe-cookies.txt "http://localhost:3000/api/wiki?universe_id=UNIVERSE_ID"
```

**Expected response:**

```json
{
  "pages": [
    {
      "path": "locations/dark-tavern.md",
      "content": "...",
      "frontmatter": { "title": "Dark Tavern", "type": "location", "status": "reviewed" }
    }
  ],
  "orphanPaths": [],
  "orphanSuggestions": []
}
```

### Step 5: Query Wiki with LLM

This uses the LLM to answer questions based on wiki content. It retrieves relevant pages and synthesizes an answer.

```bash
curl -X POST http://localhost:3000/api/wiki/query \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{
    "query": "What is the Dark Tavern and who runs it?",
    "universeId": "UNIVERSE_ID"
  }'
```

**Expected response:**

```json
{
  "answer": "The Dark Tavern is a two-story establishment on the north side of the town square. It is run by a grizzled dwarf named Korgrim, who tells tales of the old wars for a copper coin.",
  "citations": ["locations/dark-tavern.md"],
  "usedFallback": false
}
```

### Step 6: Delete a Wiki Page

```bash
curl -X DELETE "http://localhost:3000/api/wiki/locations/dark-tavern?universe_id=UNIVERSE_ID" \
  -b /tmp/rpe-cookies.txt
```

**Expected response:**

```json
{
  "success": true
}
```

### Additional Wiki Operations

**Validate a page (draft → reviewed):**

```bash
curl -X PUT "http://localhost:3000/api/wiki/validate/locations/dark-tavern?universe_id=UNIVERSE_ID" \
  -b /tmp/rpe-cookies.txt
```

**Lock a page (reviewed → locked, immutable):**

```bash
curl -X PUT "http://localhost:3000/api/wiki/lock/locations/dark-tavern?universe_id=UNIVERSE_ID" \
  -b /tmp/rpe-cookies.txt
```

**Reject a draft:**

```bash
curl -X PUT "http://localhost:3000/api/wiki/reject/locations/dark-tavern?universe_id=UNIVERSE_ID" \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{"reason": "Needs more detail"}'
```

**Get wiki graph data (for Cytoscape visualization):**

```bash
curl -b /tmp/rpe-cookies.txt "http://localhost:3000/api/wiki/graph?universe_id=UNIVERSE_ID"
```

### Error Scenarios

| Step | Status | Body | Cause |
|------|--------|------|-------|
| Create | 400 | `{"error": "path is required"}` | Missing `path` field |
| Read | 400 | `{"error": "Invalid path"}` | Path traversal attempt detected |
| Read | 404 | `{"error": "Wiki page not found"}` | Page does not exist at that slug |
| Update | 400 | `{"error": "At least one of content or frontmatter is required"}` | Empty update body |
| Update | 404 | `{"error": "Wiki page not found"}` | Page does not exist |
| Update | 409 | `{"error": "Concurrent edit conflict"}` | Page was modified since your last read |
| Query | 400 | `{"error": "query and universeId are required"}` | Missing fields |
| Query | 500 | `{"error": "Internal server error"}` | LLM unreachable or query failed |

---

## Flow 5: Job Queue Management

Background jobs handle wiki enrichment, memory compression, relationship decay, and more. You can queue, list, cancel, and monitor jobs via the API. See [src/lib/jobs/AGENTS.md](../lib/jobs/AGENTS.md) for the full job system reference.

Prerequisite: You have a cookie file.

### Step 1: Subscribe to Job Progress SSE (separate terminal)

```bash
# This connection stays open. Run in a second terminal.
curl -N -b /tmp/rpe-cookies.txt http://localhost:3000/api/jobs/stream
```

**Expected initial output:**

```
id: 0
event: connected
data: {"userId":"550e8400-e29b-41d4-a716-446655440000"}

event: heartbeat
data: {}
```

You will see `job:progress` events as jobs are processed:

```
event: job:progress
data: {"jobId":"JOB_ID","progress":50,"message":"Processing embeddings..."}

event: job:progress
data: {"jobId":"JOB_ID","progress":100,"message":"Complete"}
```

### Step 2: Queue a Job

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{
    "action": "queue",
    "type": "wiki_enrich_entity",
    "priority": "high",
    "payload": {
      "sessionId": "SESSION_ID",
      "universeId": "UNIVERSE_ID",
      "entityPage": "locations/dark-tavern.md"
    },
    "universe_id": "UNIVERSE_ID"
  }'
```

**Expected response:**

```json
{
  "success": true,
  "jobId": "JOB_ID"
}
```

Valid job types are: `summarize_messages`, `generate_embeddings`, `analyze_relationships`, `decay_relationships`, `compress_memories`, `refine_relationship_summary`, `archival_processing`, `thread_analysis`, `wiki_ingest`, `wiki_enrich_entity`, `wiki_generate_rumors`, `wiki_deepen_page`, `wiki_deepen_location`, `wiki_extract_event`, `generate_session_recap`, `npc_evolution`, `extract_lore_comprehensive`, `scene_state_extract`, `wiki_auto_extract`.

### Step 3: List All Jobs

```bash
curl -b /tmp/rpe-cookies.txt http://localhost:3000/api/jobs
```

**Expected response:**

```json
{
  "jobs": [
    {
      "id": "JOB_ID",
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "type": "wiki_enrich_entity",
      "status": "queued",
      "priority": "high",
      "progress": 0,
      "progressMessage": null,
      "createdAt": "2026-05-27T12:10:00.000Z",
      "processedAt": null,
      "error": null
    }
  ],
  "stats": {
    "queued": 1,
    "processing": 0,
    "completed": 0,
    "failed": 0,
    "cancelled": 0,
    "total": 1
  }
}
```

Filter by status or type:

```bash
curl -b /tmp/rpe-cookies.txt "http://localhost:3000/api/jobs?status=queued"
curl -b /tmp/rpe-cookies.txt "http://localhost:3000/api/jobs?type=wiki_enrich_entity"
```

### Step 4: Process Jobs

Kick off processing for queued jobs:

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{"action": "process"}'
```

**Expected response:**

```json
{
  "success": true,
  "results": [
    {
      "jobId": "JOB_ID",
      "success": true,
      "result": { "updated": true }
    }
  ]
}
```

Process one job at a time:

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{"action": "process-next"}'
```

### Step 5: Cancel a Job

```bash
# Cancel a specific job
curl -X DELETE "http://localhost:3000/api/jobs?id=JOB_ID" \
  -b /tmp/rpe-cookies.txt
```

**Expected response:**

```json
{
  "success": true
}
```

Cancel all your jobs:

```bash
curl -X DELETE http://localhost:3000/api/jobs \
  -b /tmp/rpe-cookies.txt
```

**Expected response:**

```json
{
  "success": true,
  "cancelledCount": 3
}
```

### Step 6: Retry a Failed Job

```bash
# Retry a single failed job
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{"action": "retry", "jobId": "FAILED_JOB_ID"}'
```

**Expected response:**

```json
{
  "success": true
}
```

Retry all failed jobs:

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{"action": "retry-all"}'
```

### Step 7: Trigger Idle Processing

Idle processing runs background maintenance jobs based on time tiers (5min, 10min, 15min, 30min). See [src/lib/jobs/AGENTS.md](../lib/jobs/AGENTS.md) for tier details.

```bash
# Queue idle jobs for processing
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{"action": "queue-idle", "universe_id": "UNIVERSE_ID"}'

# Start idle processing (fire-and-forget)
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -b /tmp/rpe-cookies.txt \
  -d '{"action": "process-idle", "universe_id": "UNIVERSE_ID"}'
```

### Error Scenarios

| Step | Status | Body | Cause |
|------|--------|------|-------|
| Queue | 400 | `{"error": "type is required"}` | Missing `type` for `queue` action |
| Queue | 400 | `{"error": "Invalid job type. Must be one of: ..."}` | Unknown job type string |
| Queue | 400 | `{"error": "Invalid priority"}` | Priority not one of `high`, `medium`, `low`, `idle` |
| Cancel | 400 | `{"error": "jobId required"}` | Missing `jobId` for `cancel` or `retry` action |
| Process | 200 | `{"success": false, "message": "No queued jobs"}` | Nothing to process |
| Any | 401 | `{"error": "Authentication required"}` | No cookie or expired token |
| Any | 429 | `{"error": "Rate limit exceeded"}` | Too many API calls |
