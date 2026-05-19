# API ROUTES — src/app/api/

## OVERVIEW
75 REST route handlers (`route.ts` files). Raw SQL via better-sqlite3, inline auth checks, `NextResponse.json` errors. No server actions.

## AUTH PATTERN
Every protected route uses the `withAuth()` wrapper or `getAuthToken()` utility:
```typescript
// Preferred: withAuth wrapper (10 routes, 28 handlers)
const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

// Alternative: getAuthToken utility (all remaining routes)
import { getAuthToken } from '@/lib/auth-token';
const token = getAuthToken(request);
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```
All routes use `getAuthToken()` (cookie + x-auth-token header fallback). Zero direct `request.cookies.get("auth-token")` calls remain.

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
