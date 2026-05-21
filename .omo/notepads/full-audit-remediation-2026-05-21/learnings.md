# Wave 2 — Health Endpoint Token Verification

## Date: 2026-05-21

## Issue
`isAuthorized()` in health endpoints checked if `auth-token` cookie EXISTS but never called `verifyToken()`. Any non-empty string ("foo", "hacked") passed authentication.

## Files Modified
- `src/app/api/health/route.ts` — added `verifyToken` import, replaced `if (token) { return true; }` with `const decoded = await verifyToken(token); return decoded !== null;`
- `src/app/api/health/ready/route.ts` — same fix applied

## Root Cause
Token extraction (`getAuthToken`) was confused with token verification. The code assumed presence of a cookie value implied validity.

## Fix Pattern
```typescript
// BEFORE (vulnerable)
if (token) { return true; }

// AFTER (secure)
if (token) {
  const decoded = await verifyToken(token);
  return decoded !== null;
}
```

## Verification
- `npx next build` passes cleanly
- Localhost bypass (127.0.0.1 / ::1) preserved unchanged
- Response shape unchanged

## Lesson
Always verify tokens, not just check presence. `verifyToken()` returns `null` on invalid/expired/revoked tokens — check for `null`, not truthiness of the raw token string.

---

# Wave 2 — TTS Stream Validation & Rate Limiting

## Date: 2026-05-21

## Issue
TTS stream endpoint (`/api/tts/stream`) had no input validation or rate limiting. Any text length, any format string, any speed value accepted. No rate limiting enabled compute abuse.

## Files Modified
- `src/app/api/tts/stream/route.ts` — added text length check (`TTS_CONFIG.maxTextLength`), format validation (`mp3|wav|ogg`), speed range check (`[0.5, 2.0]`), rate limiting (`tts_stream` tier, 10/min per user)
- `src/lib/rate-limiter.ts` — added `tts_stream` tier, added `cleanupExpiredEntries()` call at start of `checkRateLimit()`

## Root Cause
TTS endpoint trusted client input completely. No validation on text length (could send megabytes), format (could inject arbitrary strings into `audio/${format}` header), or speed (could send negative/NaN values).

## Fix Pattern
```typescript
// Validation constants at module level
const VALID_FORMATS = ["mp3", "wav", "ogg"] as const;
const MIN_SPEED = 0.5;
const MAX_SPEED = 2.0;

// Rate limit check after auth, before body parsing
const rateLimit = checkRateLimit(`tts_stream:${decoded.sub}`, "tts_stream");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

// Validation after required field check
if (text.length > TTS_CONFIG.maxTextLength) return 400;
if (!VALID_FORMATS.includes(format)) return 400;
if (typeof speed !== "number" || speed < MIN_SPEED || speed > MAX_SPEED) return 400;
```

## Verification
- `npx next build` passes cleanly
- Streaming logic and response headers unchanged
- Rate limit key uses `decoded.sub` (user-scoped, not IP-scoped)

## Lesson
Validate all client input before passing to external services. Rate limit compute-heavy endpoints per-user, not per-IP (authenticated endpoints have user identity available).

---

# Wave 2 — Logout Token Verification (decodeJwt → verifyToken)

## Date: 2026-05-21

## Issue
`src/app/api/auth/logout/route.ts` used `decodeJwt()` from `jose` which only decodes the JWT payload without verifying the signature. An attacker could craft a fake JWT with a chosen `jti` to pollute the token denylist.

## Files Modified
- `src/app/api/auth/logout/route.ts` — replaced `decodeJwt(token)` with `await verifyToken(token)`, removed `jose` import, removed `as string`/`as number` casts (AuthToken has typed fields)

## Root Cause
`decodeJwt()` performs no cryptographic verification — it simply base64-decodes the payload. Any string with valid JWT structure (even with a fake signature) would be accepted.

## Fix Pattern
```typescript
// BEFORE (vulnerable)
import { decodeJwt } from "jose";
const payload = decodeJwt(token);
if (payload.jti && payload.exp) {
  revokeToken(payload.jti as string, payload.exp as number);
}

// AFTER (secure)
import { verifyToken } from "@/lib/auth";
const payload = await verifyToken(token);
if (payload) {
  revokeToken(payload.jti, payload.exp);
}
```

## Verification
- `npx next build` passes cleanly
- Cookie clearing logic unchanged
- `catch {}` block preserved — logout always succeeds even if token is invalid (graceful degradation)
- `decodeJwt` import removed from `jose`

## Lesson
Never use `decodeJwt()` for security-sensitive operations. Always use `verifyToken()` which validates the signature, checks the denylist, and verifies password-change timestamps. `verifyToken()` is async and returns `null` on any failure — wrap in try/catch for graceful degradation.

---

# Wave 2 — Settings GET Endpoint Authentication

## Date: 2026-05-21

## Issue
`GET /api/settings` returned Ollama host:port, TTS host:port, model names, and available models to any unauthenticated requester. Revealed internal network topology. The GET handler extracted the token but only used it to optionally merge user settings — server config was always returned.

## Files Modified
- `src/app/api/settings/route.ts` — added auth check at top of GET handler: returns 401 if no token or invalid token. Server config now only returned to authenticated users.

## Root Cause
The GET handler treated authentication as optional enhancement (merge user settings if logged in) rather than a gate. The fallback path `return NextResponse.json(serverConfig)` was reachable without any token.

## Fix Pattern
```typescript
// BEFORE (vulnerable — server config exposed to all)
export const GET = withErrorHandler(async (request: NextRequest) => {
  const token = getAuthToken(request);
  const localModels = await fetchLocalModels();
  const serverConfig = { /* host:port, models, etc. */ };
  if (token) {
    const decoded = await verifyToken(token);
    if (decoded) { /* merge user settings */ }
  }
  return NextResponse.json(serverConfig); // ← reachable without auth
});

// AFTER (secure — auth required)
export const GET = withErrorHandler(async (request: NextRequest) => {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  // ... server config + user settings ...
});
```

## Verification
- `npx next build` passes cleanly
- PUT handler behavior unchanged (already had auth)
- Response shape for authenticated users unchanged (still includes `user` object)

## Lesson
When an endpoint extracts a token but only uses it conditionally, audit whether the unauthenticated path leaks sensitive data. Token presence checks should gate data exposure, not just enhance responses.

---

# Code Quality — Generic Variable Renaming (`data`/`err` → descriptive names)

## Date: 2026-05-21

## Issue
41 occurrences of `const data = await res.json()` and 2 occurrences of `const err = await res.json()` across 24 `.tsx` files. The name `data` is uninformative and shadows outer-scope `data` variables in some cases. `err` is misleading since it holds a response JSON body (with `.error` property), not an `Error` object.

## Files Modified (24 files, 43 renames)
- `src/app/register/page.tsx` — `data` → `json`
- `src/app/login/page.tsx` — `data` → `json`
- `src/app/(app)/wiki/[...slug]/page.tsx` — `data` → `errorBody` (error branch)
- `src/app/(app)/wiki/page.tsx` — `data` → `errorBody` (error branch)
- `src/app/(app)/universe/[id]/page.tsx` — `data` → `json`
- `src/app/(app)/universe/page.tsx` — `data` → `json` (3 occurrences)
- `src/app/(app)/timeline/[id]/page.tsx` — `data` → `json`
- `src/app/(app)/timeline/page.tsx` — `data` → `json`
- `src/app/(app)/timeline/layer-manager.tsx` — `data` → `json`
- `src/app/(app)/jobs/page.tsx` — `data` → `json`
- `src/app/(app)/settings/page.tsx` — `data` → `json` (4 occurrences), `data` → `errorBody` (1 error branch)
- `src/app/(app)/groups/[id]/page.tsx` — `data` → `json` (2 occurrences)
- `src/app/(app)/groups/new/page.tsx` — `data` → `json`
- `src/app/(app)/session/[id]/page.tsx` — `data` → `json`, `err` → `errorBody` (2 occurrences)
- `src/app/(app)/relationships/page.tsx` — `data` → `json` (3 occurrences)
- `src/app/(app)/personas/page.tsx` — `data` → `json` (2 occurrences)
- `src/app/(app)/narrative-threads/[id]/page.tsx` — `data` → `json`
- `src/app/(app)/narrative-threads/page.tsx` — `data` → `json`
- `src/app/(app)/npcs/page.tsx` — `data` → `json` (3 occurrences)
- `src/app/(app)/voice-combiner/page.tsx` — `data` → `errorBody` (3 error branches)
- `src/components/wiki/version-history.tsx` — `data` → `errorBody`
- `src/components/wiki/lore-extraction-trigger.tsx` — `data` → `errorBody` (error branch), `data` → `json` (success branch)
- `src/components/session/session-recap-panel.tsx` — `data` → `json` (2 occurrences), `data` → `errorBody` (1 error branch)
- `src/components/session/private-state-panel.tsx` — `data` → `json`

## Root Cause
Copy-paste pattern: `const data = await res.json()` became a reflexive default. The name `err` was chosen to parallel `res.ok` error handling but conflicts with the convention that `err`/`error` denotes `Error` objects (especially in `catch (err)` blocks).

## Fix Pattern
```typescript
// BEFORE (confusing)
const data = await res.json();
if (!res.ok) { setError(data.error); }

const err = await res.json();  // looks like Error object
alert(err.error || "Failed");

// AFTER (clear)
const json = await res.json();
if (!res.ok) { setError(json.error); }

const errorBody = await res.json();  // clearly a response body
alert(errorBody.error || "Failed");
```

## Naming Convention
- **Error-only branches** (`!res.ok`): rename to `errorBody`
- **Success or mixed branches**: rename to `json`
- `.then((data) => ...)` promise chains: left unchanged (different pattern, different scope)
- SSE event parsing (`const data = JSON.parse(event.data)`): left unchanged (different pattern)

## Verification
- `npx next build` passes cleanly (TypeScript + static generation)
- No logic changes — only variable renames
- All usages of renamed variables updated within same scope

## Lesson
When renaming generic variables, use `edit` with sufficient context to avoid missing sibling references. ast-grep failed to parse `.tsx` files in this project, so manual `edit` with context-aware oldString was required. Always verify with a full build after bulk renames — two missed references (`data.error` → `json.error`) were caught only by the TypeScript compiler.
