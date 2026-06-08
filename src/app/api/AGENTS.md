# API ROUTES — src/app/api/

## OVERVIEW
107 REST route handlers (`route.ts` files). Raw SQL via better-sqlite3, inline auth checks, `NextResponse.json` errors. No server actions.

## AUTH PATTERN
All protected routes use the `withAuth()` HOF:
```typescript
import { withAuth } from '@/lib/with-auth';
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;
```
100% of protected routes now use `withAuth()` (101 route files). Only `health/route.ts`, `health/ready/route.ts` (localhost bypass pattern), and `auth/logout/route.ts` (optional token revocation) remain on `getAuthToken()` by design.

## ERROR RESPONSES
Always `NextResponse.json({ error: "..." }, { status: N })`:
- 400 — Validation errors
- 401 — Unauthorized / Invalid token
- 404 — Resource not found
- 429 — Rate limiting (SSE connection limits)
- 201 — Resource created

## KEY ENDPOINTS
| Resource | Methods | Notes |
|----------|---------|-------|
| `/api/auth/*` | POST/GET/PUT | Login, register, logout, me, password |
| `/api/sessions/[id]/messages` | GET/POST | Send messages, triggers generation |
| `/api/generate/[id]` | POST | SSE streaming LLM responses |
| `/api/sessions/[id]/stream` | GET | SSE real-time event stream |
| `/api/wiki/*` | GET/POST/PUT/DELETE | Wiki CRUD, query, ingest, lint |
| `/api/jobs` | GET/POST/DELETE | Job queue management |
| `/api/jobs/stream` | GET | SSE job progress stream |
| `/api/tts/*` | GET/POST | TTS generation, streaming, voices |

## CONVENTIONS
- **No ORM** — `db.prepare("...").get/all/run()` with `?` parameters.
- **No shared types directory** — interfaces co-located with implementation (`auth.ts`, `vector-search.ts`, `event-bus.ts`).
- **Streaming endpoints** use `ReadableStream` with controller for SSE.
- **Inline validation** — no shared validation library. Check field presence/types directly.

## ANTI-PATTERNS
- **Do NOT add global error handler** — per-route error handling is the pattern.
- **Do NOT add middleware-level auth** — `protectedRoutes` is empty by design.
- **Do NOT add `"use server"`** — all server logic lives in route handlers.
