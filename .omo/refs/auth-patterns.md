# Auth Pattern Cross-Reference

**Last Updated**: 2026-05-27

## Table of Contents

1. [Summary of Auth Patterns](#summary-of-auth-patterns)
2. [Architecture Notes](#architecture-notes)
3. [Legend](#legend)
4. [Route Reference by Domain](#route-reference-by-domain)
   - [Health](#health)
   - [Auth](#auth)
   - [Users](#users)
   - [Groups](#groups)
   - [Invitations](#invitations)
   - [Personas](#personas)
   - [Sessions](#sessions)
   - [NPCs](#npcs)
   - [Relationships](#relationships)
   - [Wiki](#wiki)
   - [Universes](#universes)
   - [Backlinks](#backlinks)
   - [Narrative](#narrative)
   - [Timeline](#timeline)
   - [TTS](#tts)
   - [Settings](#settings)
   - [Search](#search)
   - [Generate](#generate)
   - [Jobs](#jobs)
   - [Contradictions](#contradictions)
   - [Admin](#admin)
   - [Models/Ollama](#modelsollama)
   - [Idle](#idle)
5. [Summary Statistics](#summary-statistics)
6. [Edge Cases](#edge-cases)

---

## Summary of Auth Patterns

Four authentication patterns coexist across the 94 API routes. They are listed below in order of prevalence.

### Pattern 1: `withAuth` + `withErrorHandler` (51 routes) — Modern preferred pattern

The route handler is wrapped with two higher-order functions:

```typescript
export const GET = withAuth(withErrorHandler(async (req: NextRequest, auth: AuthContext) => {
  // auth.user.id, auth.user.email available
  // Any thrown error → 500 JSON response
}));
```

- `withAuth()` calls `getAuthToken()` internally to extract the token from the `auth-token` cookie on `NextRequest.cookies`, then passes it to `verifyToken()` from `@/lib/auth`. On success, it injects an `AuthContext` (containing `user.id`, `user.email`, `user.role`) as the second parameter. On failure, it returns a 401 JSON response.
- `withErrorHandler()` wraps the handler in a try/catch that returns `NextResponse.json({ error: message }, { status: 500 })` for any unhandled exception. It is orthogonal to auth — it can be applied with or without `withAuth`.
- **Where used**: Most newer routes, including all Settings routes, most Relationships routes, all Timeline routes, all Narrative routes, admin routes, TTS voice config routes, and select Session routes.

### Pattern 2: `withAuth` only, native `export async function` (37 routes) — Older pattern, manual error handling

The route handler is exported as a named async function wrapped only with `withAuth`:

```typescript
export const GET = withAuth(async (req: NextRequest, auth: AuthContext) => {
  // auth.user.id, auth.user.email available
  // Must handle errors manually or let them propagate as 500
});
```

- Auth verification is identical to Pattern 1: `withAuth()` extracts and verifies the token.
- No automatic error catching. Errors propagate to Next.js default error handling or must be caught manually with try/catch inside the handler.
- **Where used**: The majority of Wiki routes, Session routes with SSE, Search, Generate, Jobs, Backlinks, TTS cache/generate/stream routes, and contradictions.

### Pattern 3: `getAuthToken()` direct (3 routes) — Custom auth logic for edge cases

The route does not use `withAuth`. Instead, it calls `getAuthToken()` directly:

```typescript
import { getAuthToken } from "@/lib/auth-token";

export async function GET(req: NextRequest) {
  const token = getAuthToken(req); // raw token string or null
  // Custom verification or dual-allow logic
}
```

- `getAuthToken()` reads the `auth-token` cookie from `NextRequest.cookies` and returns the raw token string (or null). It does NOT verify the token.
- The route implements its own verification logic, often with alternative access paths.
- **Where used**: Health endpoints with localhost bypass, and logout with graceful degradation.

### Pattern 4: No auth (3 routes) — Public endpoints by design

These routes have no authentication at all. They are publicly accessible.

- **Where used**: Login, Register, and one health endpoint.

---

## Architecture Notes

- **Cookie access**: All cookie reads go through `NextRequest.cookies`. NO route imports `cookies()` from `next/headers` directly.
- **`getAuthToken()`**: Defined in `@/lib/auth-token`. Reads the `auth-token` cookie from `NextRequest.cookies`. Returns the raw token string or null. No verification is performed.
- **`withAuth()`**: Defined in `@/lib/auth`. Calls `getAuthToken()` then `verifyToken()` from `@/lib/auth`. Returns `AuthContext` (with `user.id`, `user.email`, `user.role`) on success, or returns a 401 `NextResponse.json({ error: "Authentication required" })` on failure. When auth fails, the wrapped handler never executes.
- **`withErrorHandler()`**: Defined in `@/lib/error-handler`. Wraps a route handler in try/catch. On caught error, returns `NextResponse.json({ error: error.message }, { status: 500 })`. Can be composed with or without `withAuth`.
- **Composition order**: `withAuth(withErrorHandler(handler))` — auth runs first, error handler wraps the full result.

---

## Legend

| Symbol | Pattern | Description |
|--------|---------|-------------|
| `W+WEH` | `withAuth` + `withErrorHandler` | Modern pattern: auth verification + automatic error catching |
| `W` | `withAuth` only | Older pattern: auth verification, manual error handling |
| `GA` | `getAuthToken()` direct | Custom auth: reads raw token, custom verification |
| `WEH` | `withErrorHandler` only | No auth, but automatic error catching |
| `—` | No auth | Public endpoint, no authentication |

---

## Route Reference by Domain

### Health

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/health` | GET | `GA` | Localhost bypass (127.0.0.1, ::1) OR getAuthToken. Custom `isAuthorized()`. |
| `/api/health/ready` | GET | `GA` | Same localhost bypass pattern as `/api/health`. Custom `isAuthorized()`. |
| `/api/health/live` | GET | `WEH` | Public liveness probe. No auth at all. Returns 200 if process is alive. |

### Auth

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/auth/login` | POST | `—` | Public. Creates sessions. Rate-limited. |
| `/api/auth/register` | POST | `—` | Public. Creates users. Rate-limited. |
| `/api/auth/logout` | POST | `GA` | Optional token revocation. Sets empty cookie (`maxAge: 0`). Graceful degradation — succeeds even with invalid token. |
| `/api/auth/me` | GET | `W+WEH` | Returns current user profile. |
| `/api/auth/password` | PUT | `W+WEH` | Change password. Requires current password in request body. |

### Users

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/users` | GET | `W+WEH` | List users. |

### Groups

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/groups` | GET, POST | `W` | List or create groups. Manual error handling. |
| `/api/groups/[id]` | GET, PUT, DELETE | `W+WEH` | Single group CRUD. |
| `/api/groups/[id]/members` | POST, DELETE | `W+WEH` | Manage group membership. |

### Invitations

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/invitations` | GET | `W+WEH` | List invitations. |

### Personas

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/personas` | GET, POST | `W+WEH` | List or create personas. |
| `/api/personas/[id]` | GET, PUT, DELETE | `W+WEH` | Single persona CRUD. |
| `/api/personas/[id]/activate` | PUT | `W+WEH` | Activate a persona. |
| `/api/personas/active` | GET | `W+WEH` | Get currently active persona. |

### Sessions

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/sessions` | GET, POST | `W+WEH` | List or create sessions. |
| `/api/sessions/[id]` | GET, PUT, DELETE | `W` | Single session CRUD. Manual error handling. |
| `/api/sessions/[id]/stream` | GET | `W` | SSE stream. `force-dynamic`, `runtime=nodejs`. Manual error handling. |
| `/api/sessions/[id]/messages` | GET, POST | `W` | Session messages list/create. Manual error handling. |
| `/api/sessions/[id]/messages/search` | GET | `W` | Message search. Manual error handling. |
| `/api/sessions/[id]/messages/[messageId]` | PUT, DELETE | `W+WEH` | Single message edit/delete. |
| `/api/sessions/[id]/messages/[messageId]/regenerate` | POST | `W+WEH` | Regenerate an LLM response. |
| `/api/sessions/[id]/messages/[messageId]/edits` | GET | `W+WEH` | Get edit history for a message. |
| `/api/sessions/[id]/turn` | GET, PUT, POST | `W+WEH` | Manage session turns. |
| `/api/sessions/[id]/scene` | GET, PUT | `W+WEH` | Manage session scene. |
| `/api/sessions/[id]/participants` | GET | `W+WEH` | List session participants. |
| `/api/sessions/[id]/participants/role` | PUT | `W+WEH` | Update participant role. |
| `/api/sessions/[id]/join` | POST | `W` | Join a session. Manual error handling. |
| `/api/sessions/[id]/leave` | POST | `W+WEH` | Leave a session. |
| `/api/sessions/[id]/kick` | POST | `W+WEH` | Kick a participant. |
| `/api/sessions/[id]/invite` | POST, GET | `W+WEH` | Manage session invitations. |
| `/api/sessions/[id]/private-state` | GET, PUT | `W` | Private per-participant state. Manual error handling. |
| `/api/sessions/[id]/export` | GET | `W` | Export session data. Manual error handling. |
| `/api/sessions/[id]/recap` | POST | `W` | Generate session recap. Manual error handling. |
| `/api/sessions/[id]/retrieval-context` | GET | `W` | Get retrieval context. Manual error handling. |
| `/api/sessions/[id]/persona` | PUT | `W+WEH` | Update session persona. |

### NPCs

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/npcs` | GET, POST | `W+WEH` | List or create NPCs. |
| `/api/npcs/[id]` | GET, PUT, DELETE | `W+WEH` | Single NPC CRUD. |

### Relationships

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/relationships` | GET, POST | `W` | List or create relationships. Manual error handling. |
| `/api/relationships/[id]` | GET, PUT, DELETE | `W+WEH` | Single relationship CRUD. |
| `/api/relationships/[id]/file` | GET, PUT | `W+WEH` | Relationship file storage. |
| `/api/relationships/[id]/evolution` | GET, POST | `W+WEH` | Relationship evolution tracking. |
| `/api/relationships/[id]/decay` | GET, POST | `W+WEH` | Relationship decay mechanics. |

### Wiki

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/wiki` | GET, POST | `W+WEH` | List or create wiki pages. |
| `/api/wiki/[...slug]` | GET, PUT, DELETE | `W` | Single wiki page by slug. Manual error handling. |
| `/api/wiki/graph` | GET | `W+WEH` | Wiki graph data. |
| `/api/wiki/recent` | GET | `W` | Recently modified pages. Manual error handling. |
| `/api/wiki/history` | GET, POST | `W` | Wiki history. Manual error handling. |
| `/api/wiki/query` | POST | `W` | Wiki query/search. Manual error handling. |
| `/api/wiki/ingest` | POST | `W` | Ingest content into wiki. Manual error handling. |
| `/api/wiki/lint` | POST | `W` | Lint wiki pages. Manual error handling. |
| `/api/wiki/lock/[...slug]` | PUT | `W` | Lock a wiki page (set status to `locked`). Manual error handling. |
| `/api/wiki/reject/[...slug]` | PUT | `W` | Reject a wiki page draft. Manual error handling. |
| `/api/wiki/validate/[...slug]` | PUT | `W` | Validate/approve a wiki page (set status to `reviewed`). Manual error handling. |
| `/api/wiki/file` | POST | `W` | Upload file to wiki. Manual error handling. |
| `/api/wiki/index` | GET | `W` | Wiki index. Manual error handling. |
| `/api/wiki/log` | GET | `W` | Wiki changelog. Manual error handling. |
| `/api/wiki/templates` | GET | `W+WEH` | Wiki templates. |
| `/api/wiki/split-suggestions/[...slug]` | GET | `W+WEH` | Split suggestions for a wiki page. |
| `/api/wiki/sources/upload` | POST | `W` | Upload source files. Manual error handling. |
| `/api/wiki-revisions` | GET, POST | `W` | Wiki revision management. Separate route tree from `/api/wiki/`. Manual error handling. |

### Universes

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/universes` | GET, POST | `W+WEH` | List or create universes. |
| `/api/universes/[id]` | GET, PUT, DELETE | `W+WEH` | Single universe CRUD. |

### Backlinks

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/backlinks` | GET, POST, DELETE | `W` | Manage backlinks. Manual error handling. |
| `/api/backlinks/graph` | GET | `W+WEH` | Backlink graph data. |

### Narrative

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/narrative-memories` | GET, POST | `W+WEH` | List or create narrative memories. |
| `/api/narrative-memories/[id]` | GET, PUT, DELETE | `W+WEH` | Single narrative memory CRUD. |
| `/api/narrative-threads` | GET, POST, PUT, DELETE | `W+WEH` | Manage narrative threads. |

### Timeline

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/timeline` | GET, POST, PUT, DELETE | `W+WEH` | Timeline events CRUD. |
| `/api/timelines/[id]/layers` | GET, POST | `W+WEH` | Timeline layers list/create. |
| `/api/timelines/[id]/layers/[layerId]` | PUT, DELETE | `W+WEH` | Single timeline layer update/delete. |

### TTS

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/tts/cache` | GET, DELETE, POST | `W` | TTS cache management. Manual error handling. |
| `/api/tts/generate` | POST | `W` | Generate TTS audio. Manual error handling. |
| `/api/tts/stream` | POST | `W` | Stream TTS audio. Manual error handling. |
| `/api/tts/voices` | GET, POST | `W+WEH` | List or create voices. |
| `/api/tts/voices/refresh` | POST | `W` | Refresh voice list. Manual error handling. |
| `/api/tts/voices/combine` | POST | `W` | Combine voices. Manual error handling. |
| `/api/tts/voice/[entityType]/[entityId]` | GET, PUT, DELETE | `W+WEH` | Voice assignment by entity. |
| `/api/voice-assignments` | GET, PUT, POST, DELETE | `W+WEH` | Voice assignment management. |

### Settings

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/settings` | GET, PUT | `W+WEH` | User settings. Uses `withAuth+WEH` unlike most wiki routes which use `withAuth`-only. |
| `/api/settings/active-state` | PUT | `W+WEH` | Update active state. |

### Search

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/search` | GET | `W` | Full-text search. Manual error handling. |

### Generate

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/generate/[id]` | POST | `W` | LLM response generation. SSE streaming. Manual error handling. |

### Jobs

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/jobs` | GET, POST, DELETE | `W` | Background job management. Manual error handling. |
| `/api/jobs/stream` | GET | `W` | SSE job progress stream. Manual error handling. |

### Contradictions

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/contradictions` | GET, POST, PUT | `W` | Contradiction detection. Manual error handling. |
| `/api/admin/contradictions` | GET | `W+WEH` | Admin view of contradictions. Different error handling from `/api/contradictions`. |
| `/api/admin/contradictions/[id]` | PATCH | `W+WEH` | Update contradiction status. |

### Admin

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/admin/entities` | GET | `W+WEH` | List admin entities. |

### Models/Ollama

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/models/ollama` | GET | `W` | Lists Ollama models. Manual error handling. |
| `/api/ollama/models` | GET | `W+WEH` | Alternative endpoint using `fetchLocalModels()`. |

### Idle

| Route | Methods | Pattern | Notes |
|-------|---------|---------|-------|
| `/api/idle/heartbeat` | POST | `W+WEH` | Idle processing heartbeat trigger. |

---

## Summary Statistics

| Pattern | Symbol | Count | Percentage |
|---------|--------|-------|------------|
| `withAuth` + `withErrorHandler` | `W+WEH` | 51 | 54.3% |
| `withAuth` only | `W` | 37 | 39.4% |
| `getAuthToken()` direct | `GA` | 3 | 3.2% |
| `withErrorHandler` only (no auth) | `WEH` | 1 | 1.1% |
| No auth | `—` | 2 | 2.1% |
| **Total** | | **94** | **100%** |

---

## Edge Cases

### `/api/health` and `/api/health/ready` — Localhost bypass

These two endpoints implement a dual-allow pattern. The custom `isAuthorized()` function permits access if either:

- The request comes from a localhost address (`127.0.0.1` or `::1`), OR
- A valid `auth-token` cookie is present and verified via `getAuthToken()`

This allows container orchestrators and reverse proxies on the same host to perform health checks without authentication, while still allowing authenticated remote access.

### `/api/auth/logout` — Graceful degradation

The logout endpoint uses `getAuthToken()` directly (not `withAuth()`). It attempts token revocation if a token is present, but succeeds even if the token is invalid or expired. In all cases, it sets a cleared `auth-token` cookie with `maxAge: 0`. This ensures users can always clear their session cookie regardless of token state.

### `/api/health/live` — Public liveness probe

This is the only route using `withErrorHandler` without any authentication. It is designed as a public liveness probe for container orchestrators (Kubernetes, Docker) and load balancers. It returns a 200 status if the Node.js process is running, with no authentication required.

### Settings routes — `withAuth` + `withErrorHandler` preference

The Settings routes (`/api/settings`, `/api/settings/active-state`) use the modern `W+WEH` pattern, unlike the majority of Wiki routes which use `withAuth`-only (`W`). This reflects the Settings domain being developed or refactored more recently than the Wiki domain.

### Admin vs Contradictions — Different error handling with same auth

`/api/contradictions` uses `withAuth` only (`W`), while `/api/admin/contradictions` uses `withAuth` + `withErrorHandler` (`W+WEH`). Both require authentication via `withAuth`, but the admin variant adds automatic error wrapping. This is because the admin endpoint was created/refactored separately from the user-facing contradictions endpoint.
