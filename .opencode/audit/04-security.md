## Security Audit: Roleplay-Engine
**Date:** 2026-06-08
**Scope:** Full codebase audit — auth, SQLi, XSS, CSRF, path traversal, SSRF, dependency vulnerabilities, security hardening

---

# 1. AUTHENTICATION

## 1.1 JWT Implementation — Well-Architected

| Property | Status | Detail |
|----------|--------|--------|
| Algorithm | HS256 | `src/lib/auth.ts:47` — jose library, HMAC-SHA256 |
| Expiry | 24h (86400s) | `src/lib/config.ts:77` — configurable via `AUTH_CONFIG.jwtExpiry` |
| Secret | Env `JWT_SECRET` | `src/lib/config.ts:59-67` — fatal error if unset, 32-byte base64 recommended |
| Token revocation | Denylist in SQLite | `src/lib/auth.ts:60-65` — `token_denylist` table, JTI-based |
| Password change | Invalidates old tokens | `src/lib/auth.ts:69-78` — checks `password_changed_at` against token payload |

### SEVERITY: ✅ OK — JWT implementation is correct.

## 1.2 Cookie Settings

### SEVERITY: LOW (src/app/api/auth/login/route.ts:66-72)
**Finding:** `secure` flag is conditional on `NODE_ENV === "production"`.
- Line 68: `secure: process.env.NODE_ENV === "production"`
- In production deployments without HTTPS termination at the app level (e.g., behind a reverse proxy that does TLS termination), the cookie could be sent over non-HTTPS connections if `NODE_ENV` is somehow set to a non-production value.
- **Risk:** Token theft via MitM if HTTPS is misconfigured.
- **Fix:** Either force `secure: true` unconditionally (rely on the reverse proxy for HTTPS), or add a separate env var `COOKIE_SECURE=true`.

The same pattern exists at `src/app/api/auth/logout/route.ts:43-44`.
**Risk modifier:** SameSite=Strict and httpOnly mitigate most cookie theft vectors even without Secure.

## 1.3 bcrypt Usage — Correct

### SEVERITY: ✅ OK
- Salt rounds: 12 (`src/lib/config.ts:78`)
- Password comparison: `bcrypt.compare()` (`src/lib/auth.ts:34`)
- No timing side-channel — bcryptjs is constant-time.

## 1.4 Session Management — Not Addressed

### SEVERITY: LOW (Design Gap)
- No server-side session store (JWT is stateless except denylist).
- No refresh token rotation — single long-lived token (24h).
- No concurrent session limit.
- No "log out all other sessions" feature.
- **Risk:** Stolen tokens are valid for up to 24h (unless manually revoked via denylist).
- **Fix:** Implement short-lived access tokens (15min) + long-lived refresh tokens with rotation.

## 1.5 Password Policy

### SEVERITY: ✅ OK
- Minimum 8 characters (`passwordMinLength: 8`)
- Requires at least one letter and one number (`src/lib/auth.ts:103-108`)
- Username: 3-20 chars, alphanumeric + some symbols

---

# 2. SQL INJECTION

## 2.1 Parameterized Queries — Mostly Good

### SEVERITY: ✅ OK (with notes)
The codebase uses `db.prepare("... ? ...").get/all/run()` with parameterized `?` placeholders throughout. The vast majority of queries are properly parameterized.

## 2.2 Dynamic Column Names in UPDATE Queries

### SEVERITY: LOW (src/app/api/narrative-threads/route.ts:233, universes/[id]/route.ts:159, settings/active-state/route.ts:56, groups/[id]/route.ts:126)

**Finding:** Four UPDATE endpoints use string interpolation for dynamically building the SET clause:
```typescript
const updates: string[] = [];
if (title !== undefined) { updates.push("title = ?"); values.push(title.trim()); }
// ...
db.prepare(`UPDATE table SET ${updates.join(", ")} WHERE id = ?`).run(...values);
```

**Risk:** The column names (`"title = ?"`, `"description = ?"`, etc.) are hardcoded string literals in the code — not user input. **Exploitation is not possible** with the current code. However, the pattern is fragile: any future refactoring that accidentally introduces user-controlled keys would create SQLi.

**Fix:** This is acceptable as-is, but document the pattern clearly. Future contributors should be aware that column names in the `updates.push()` calls must always be hardcoded.

## 2.3 server-config.ts UPDATE — Whitelist Bypass Risk

### SEVERITY: LOW (src/lib/server-config.ts:239-251)
**Finding:** `updateServerConfig()` iterates over `Object.entries(changes)` and constructs SET clause from keys. A whitelist check exists (`if (key in emptyRow())`), but `emptyRow()` enumerates known columns — if the schema is out of sync with `emptyRow()`, an attacker could inject arbitrary column names.

```typescript
for (const [key, value] of Object.entries(changes)) {
  if (value === undefined) continue;
  if (key in emptyRow()) {         // <-- whitelist
    sets.push(`${key} = ?`);
  }
}
```

**Risk:** Low. The whitelist `emptyRow()` must be kept in sync with the actual `server_config` schema. If a new column is added to the DB schema but not to `emptyRow()`, accidentally passing that key would silently skip it (fail-safe), but if a column is removed from `emptyRow()` but exists in the DB, an attacker could potentially update it (if they can reach this function — it's admin-only).

## 2.4 db.exec() Calls — All DDL (Safe)

### SEVERITY: ✅ OK
All `db.exec()` calls are `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN`, or `PRAGMA` statements. No user data reaches these calls. Examples:
- `src/lib/embeddings.ts:160` — `CREATE TABLE IF NOT EXISTS embedding_vectors`
- `src/lib/group-migrations.ts:27-65` — DDL for groups/personas tables
- `src/lib/session-columns.ts:10` — `ALTER TABLE session_participants ADD COLUMN character_name TEXT`

---

# 3. CROSS-SITE SCRIPTING (XSS)

## 3.1 Wiki Content Rendering — Well-Protected

### SEVERITY: ✅ OK
**Finding:** `src/components/wiki/markdown-renderer.tsx:285` uses rehype-sanitize with a custom schema:
```tsx
rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
```
The custom schema (lines 110-126) only allows specific `data-*` attributes on `<div>` elements. The `rehype-raw` plugin is used before sanitization, meaning raw HTML in markdown is parsed and then sanitized. This is the correct pattern.

**No rehype-sanitize bypass is evident.** The allowed attributes are:
- `className`, `data-callout`, `data-callout-fold`, `data-embed-target`, `data-embed-section`, `data-embed-block`, `data-embed-dimensions`, `data-embed-type`

These are safe attributes (data-* attributes cannot execute JavaScript).

## 3.2 dangerouslySetInnerHTML Usage — Manageable Risks

### SEVERITY: LOW (src/components/wiki/markdown-editor.tsx:177)
**Finding:** The wiki editor uses `dangerouslySetInnerHTML` for the syntax-highlighted overlay:
```tsx
<pre dangerouslySetInnerHTML={{ __html: overlayHtml }} />
```
**Analysis:** The `overlayHtml` is generated by `highlightMarkdown()` in `src/components/wiki/editor/syntax-highlighter.ts`, which escapes all text content via `escapeHtml()` before inserting into `<span>` tags. Every regex capture is run through `escapeHtml()` before being included in the output HTML. **This is well-defended.**

### SEVERITY: INFO (src/components/wiki/editor/syntax-highlighter.ts:5)
**Analysis:** The file itself documents its XSS safety claim on line 8. Code review confirms all dynamic text is HTML-escaped.

### SEVERITY: LOW (src/components/chat/chat-search.tsx:214-217)
**Finding:** Chat search results are rendered via `dangerouslySetInnerHTML`:
```tsx
<div dangerouslySetInnerHTML={{ __html: result.snippet }} />
```
**Analysis:** The `snippet` field comes from `src/app/api/sessions/[id]/messages/search/route.ts:91`, which passes through `escapeHtmlPreservingMarks()`. This function:
1. Placeholder-replaces `<mark>` and `</mark>` tags
2. HTML-escapes everything else
3. Restores the mark tags

This effectively prevents XSS while preserving search highlighting. **Well-defended, but the pattern is fragile** — any regression in `escapeHtmlPreservingMarks()` would create a serious XSS vector.

## 3.3 Wiki Markdown Plugins

### SEVERITY: ✅ OK
**Finding:** The remark plugins (`callout-remark-plugin.ts`, `embed-remark-plugin.ts`) operate on HAST/MDAST nodes and emit custom data attributes. They do not inject raw HTML. The callout and embed plugins emit safe `data-*` attributes that are whitelisted in the rehype-sanitize schema.

---

# 4. CSRF (Cross-Site Request Forgery)

## 4.1 Cookie SameSite Protection

### SEVERITY: ✅ OK (src/app/api/auth/login/route.ts:69)
**Finding:** The auth cookie uses `sameSite: "strict"`. This is the strongest SameSite mode — cookies are not sent on cross-site requests, including initial navigation from external sites.

## 4.2 No CSRF Tokens

### SEVERITY: INFO
**Finding:** There are no CSRF tokens anywhere in the application. API calls are authenticated solely via httpOnly cookies.

**Risk:** With `SameSite=Strict`, the practical CSRF risk is near-zero for modern browsers. However, the app does not follow the "defense in depth" principle.

**Why this is INFO not MEDIUM:**
- `SameSite=Strict` prevents cross-site form submissions
- No sensitive read/write operations are CSRF-worthy without the cookie
- The app is a single-page app, not a traditional multi-page form-based app

## 4.3 Client Fetch Calls — No Credentials Mode

### SEVERITY: INFO (src/lib/api-client.ts:51-55)
**Finding:** The `ApiClient.request()` method does not specify `credentials: "include"`:
```typescript
const res = await fetch(url, {
  method,
  headers,
  body: body ? JSON.stringify(body) : undefined,
});
```
**Risk:** On same-origin requests (current deployment), cookies are sent automatically. If the app ever uses a separate API domain, this would silently break auth. For same-origin, this is fine.

---

# 5. PATH TRAVERSAL

## 5.1 Wiki Path Guard — Strong Implementation

### SEVERITY: ✅ OK (src/lib/wiki/path-guard.ts:18-23)
**Finding:** `isPathWithinRoot()` uses path normalization and prefix matching:
```typescript
const normalizedRoot = path.resolve(rootDir);
const normalizedCandidate = path.resolve(candidatePath);
return normalizedCandidate === normalizedRoot
  || normalizedCandidate.startsWith(normalizedRoot + path.sep);
```
**Analysis:** The trailing separator (`path.sep`) prevents the `C:\wiki-evil` matching `C:\wiki` bypass on Windows. The `path.resolve()` eliminates `..` sequences. **Correct implementation.**

## 5.2 Slug Route — Guard Present

### SEVERITY: ✅ OK
All CRUD endpoints in `src/app/api/wiki/[...slug]/route.ts` (GET:199, PUT:373, DELETE:470) call `isPathWithinRoot()` before reading/writing files.

## 5.3 Wiki POST Route — Incomplete Directory Sanitization

### SEVERITY: LOW (src/app/api/wiki/route.ts:95-101)
**Finding:** The POST handler uses `path.dirname(pagePath)` from user input without sanitizing the directory portion:
```typescript
const dir = path.dirname(pagePath);
const base = path.basename(pagePath);
const sanitizedBase = sanitizeWikiFilename(base);
const relativePath = dir === "." ? sanitizedBase : `${dir}/${sanitizedBase}`;
const fullPath = path.join(wikiRoot, relativePath);
```
**Analysis:** While `base` is sanitized via `sanitizeWikiFilename()`, the `dir` component is not. If `pagePath` is `"../../../etc/passwd.md"`, `dir` becomes `"../../../etc"`. However, the subsequent `isPathWithinRoot()` check (line 104) catches this. **Exploitation is not possible**, but sanitizing the entire path or rejecting paths with `..` would be stronger defense-in-depth.

## 5.4 findWikiRoot — Potential Risk

### SEVERITY: LOW (src/lib/wiki/file-io.ts:177-191)
**Finding:** `findWikiRoot()` walks up from a file path to find the wiki root directory, checking for known wiki subdirectories:
```typescript
function findWikiRoot(filePath: string): string {
  let current = path.dirname(filePath);
  for (let i = 0; i < maxDepth; i++) {
    // checks for entities/, concepts/, etc.
  }
  return path.dirname(filePath);
}
```
**Risk:** If a file path is manipulated to point outside the intended wiki root (e.g., through a malicious slug that bypasses `isPathWithinRoot`), `findWikiRoot()` could resolve to an unintended location. This function is called by `saveConflictDiff()` which writes diff files to `_review/conflicts/`.

---

# 6. SENSITIVE DATA EXPOSURE

## 6.1 Error Messages in Development

### SEVERITY: INFO (src/lib/error-response.ts:12-14)

### SEVERITY: LOW (src/lib/error-response.ts:34-37)
**Finding:** The `serverError()` function passes error details to the response in development mode:
```typescript
export function serverError(error: unknown): Response {
  logger.error('Server error', error);
  return errorResponse('Internal server error', 500, error);
}
```
And `errorResponse()` includes details in dev:
```typescript
if (isDev && details) {
  body.details = details instanceof Error ? details.message : String(details);
}
```
**Risk:** In production, error details are properly masked. In development, error messages could leak stack traces or internal state. This is acceptable.

## 6.2 Environment Variables — Not Exposed to Client

### SEVERITY: ✅ OK
No `NEXT_PUBLIC_*` variables are defined. The config module accesses `process.env` directly through server-side code. No sensitive env vars leak to the client.

## 6.3 Passwords — Properly Hashed

### SEVERITY: ✅ OK
Passwords are hashed with bcrypt(12) before storage. Never logged, never returned in API responses.

## 6.4 Wiki Content Exposed in Full via API

### SEVERITY: LOW (src/app/api/wiki/route.ts:55)
**Finding:** The wiki listing endpoint returns full page content:
```typescript
pages: pages.map((p) => ({
  path: p.path,
  content: p.content,     // <-- full content
  frontmatter: p.frontmatter,
})),
```
**Risk:** The full content of all wiki pages is accessible to authenticated users via a single API call. For a single-user or private-group application, this is by design. But if multi-tenant isolation is ever required, this would need per-page access controls.

---

# 7. DEPENDENCY VULNERABILITIES

## 7.1 npm Audit Results

### SEVERITY: MODERATE (package.json)
**Finding:** `npm audit` reports 2 moderate severity vulnerabilities:

```
postcss < 8.5.10 — PostCSS XSS via Unescaped </style> in CSS Stringify Output
- CVE: GHSA-qx2v-qp2m-jg93
- Path: next → postcss (dev dependency of Next.js)
```

**Risk:** This vulnerability allows XSS through malicious CSS input. Exploitation requires an attacker to control CSS content processed by PostCSS. In the context of Next.js, PostCSS processes the app's `globals.css` during build. An attacker would need to control the CSS source files to exploit this. **Low practical risk** unless an attacker can write to the project's CSS files.

**Fix:** Update `next` to ^16.3.0-canary.5 or wait for a stable release that bumps the postcss dependency. Or override postcss version in package.json if compatible.

---

# 8. SERVER-SIDE REQUEST FORGERY (SSRF)

## 8.1 User-Configurable TTS URL

### SEVERITY: MEDIUM (src/lib/ollama.ts:287-303)
**Finding:** The `getUserTtsUrl()` function reads a custom TTS URL from user settings and constructs fetch requests to it:
```typescript
const url = settings.ttsUrl.trim();
if (url) return url.startsWith("http") ? url : `http://${url}`;
```
**Risk:** A malicious authenticated user could set their TTS URL to `http://169.254.169.254` (AWS metadata), `http://localhost:1433` (internal DB), or any internal service. The server will connect to that URL. However, the constructed URL is not directly passed to `fetch()` in `ollama.ts` — the `getUserTtsUrl()` function only returns the base URL. The actual `fetch()` calls are in `src/lib/tts.ts` using this returned base URL.

**Mitigations:**
- The TTS URL defaults to a LAN IP (`192.168.4.2:8880`), which is itself an SSRF-like target
- The user-settable TTS URL is stored in user settings, not directly exposed to unauthenticated users
- The TTS endpoints only make POST requests with specific payloads

**Fix:** Add a URL validation/allowed-hosts check for user-specified TTS/Ollama URLs. Restrict to private CIDR ranges if the service only supports local-network services.

## 8.2 User-Configurable Ollama URL

### SEVERITY: MEDIUM (src/lib/ollama.ts:266-281)
**Finding:** `getUserOllamaUrl()` similarly reads a custom Ollama URL from user settings. The same SSRF concerns apply.

## 8.3 startup-check.ts — Direct Env Var in Fetch

### SEVERITY: INFO (src/lib/startup-check.ts:35)
**Finding:** The startup health check uses `process.env.OLLAMA_HOST` directly in a `fetch()` call with a fallback to a hardcoded LAN IP:
```typescript
const res = await fetch(`${process.env.OLLAMA_HOST || 'http://192.168.6.1:11434'}/api/tags`, ...);
```
**Risk:** This is an env var controlled by the operator, not user input. No SSRF risk from this specific call.

---

# 9. GENERAL SECURITY

## 9.1 HTTP Security Headers

### SEVERITY: ✅ OK (next.config.ts:7-39)
**Headers set:**
- `X-Frame-Options: DENY` — Prevents clickjacking
- `X-Content-Type-Options: nosniff` — Prevents MIME sniffing
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` — HSTS for 1 year
- `Referrer-Policy: strict-origin-when-cross-origin` — Privacy-preserving referrer
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` — Restricts API access
- `Content-Security-Policy` — Restricts script/style/image/media sources

### SEVERITY: INFO (next.config.ts:34)
**CSP specifics:**
```typescript
`default-src 'self'; script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:;`
```
- `'unsafe-inline'` for scripts is required by Next.js for client-side hydration
- `'unsafe-eval'` in development for React DevTools / HMR
- These are standard Next.js CSP requirements — acceptable

## 9.2 CORS Configuration

### SEVERITY: ✅ OK
No CORS headers are configured. This is correct for a same-origin application. Cross-origin requests would be blocked by the browser's same-origin policy.

## 9.3 No Edge Middleware

### SEVERITY: INFO

**Finding:** The middleware.ts file does not exist (confirmed via glob). The AGENTS.md documentation states `protectedRoutes` is "intentionally empty" and auth is per-route.

**Risk:** Server-rendered pages under `(app)/` are served to unauthenticated users. Any page that doesn't fetch data from an API route on load could display the shell to an unauthenticated user before the client-side redirect happens. Data access is still gated by API auth.

## 9.4 Rate Limiting — IP-Based Weaknesses

### SEVERITY: LOW (src/lib/rate-limiter.ts)
**Finding:** Rate limiting is implemented as an in-memory Map with IP-based keys:
```typescript
const ip = getClientIp(request);
const limit = checkRateLimit(`auth:${ip}`, "auth");
```

**Issues:**
1. **In-memory store:** Rate limit state is lost on server restart.
2. **IP extraction:** Uses `x-real-ip` header, which is trustworthy behind Next.js but could be spoofed if the app is deployed without the Next.js proxy.
3. **No per-account rate limit for auth:** The auth rate limit is per-IP, not per-username. A single user with a dynamic IP could attempt unlimited logins.
4. **Map memory leak:** Cleanup only runs every 5 minutes, checking for expired entries. However, `cleanupExpiredEntries()` only removes entries where `now > entry.resetAt`. Since entries are created with a resetAt time 15 minutes in the future, and cleanup runs every 5 minutes, entries could accumulate. In practice, with 100 API calls/minute limits, this should be manageable.

## 9.5 No CSRF Protection on Login/Register

### SEVERITY: INFO (src/app/login/page.tsx:19-23, src/app/register/page.tsx:29-33)
**Finding:** Login and register forms use simple `fetch()` POST calls without CSRF tokens. With `SameSite=Strict` cookies, this is not exploitable. However, if the auth cookie is ever changed to `SameSite=Lax` or `None`, these endpoints would be vulnerable to login CSRF.

## 9.6 Auto-Login After Registration (No CSRF)

### SEVERITY: INFO (src/app/register/page.tsx:42-53)
**Finding:** After registration, the client immediately sends a login request with the just-created credentials. The credentials are never stored in JS memory beyond the form state. No security issue, but worth noting for audit completeness.

## 9.7 require() in Server Code

### SEVERITY: INFO (src/lib/ollama.ts:302)
**Finding:** Uses `require()` instead of static `import`:
```typescript
const { TTS_CONFIG } = require("./config");
```
**Analysis:** This is a code pattern issue to avoid circular dependencies. It works in Next.js server context. Not a security vulnerability.

---

# 10. SEVERITY RATINGS SUMMARY

| Severity | Count | Key Issues |
|----------|-------|------------|
| **MEDIUM** | 2 | SSRF via user-configurable TTS/Ollama URL (ollama.ts:287,266) |
| **LOW** | 7 | Cookie Secure conditional (login:68); Dynamic SQL patterns (4 files); Wiki POST dir sanitization (wiki/route.ts:95); Error detail leak (error-response.ts:34); Wiki content full exposure (wiki/route.ts:55) |
| **INFO** | 7 | No CSRF tokens; No refresh token rotation; No middleware auth; CSP unsafe-inline; Rate limiter in-memory; require() usage; Chat-search XSS fragility |
| ✅ **OK** | 12 | JWT implementation; bcrypt config; SQL parameterization; Path guard; rehype-sanitize; SameSite=Strict; Security headers; No env exposure; CORS disabled; All db.exec() DDL-only; Password policy; Session access control |

---

# 11. RECOMMENDATIONS (By Priority)

### HIGH PRIORITY — Fix within 1 release

1. **MEDIUM: SSRF via User-Settable TTS/Ollama URL** (`src/lib/ollama.ts:287, 266`)
   - Add URL validation with allowlist for TTS and Ollama endpoints
   - Reject private/internal IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254/32)
   - OR: read TTS/Ollama URL only from server config (admin-controlled), not per-user settings

### MEDIUM PRIORITY — Fix within 2 releases

2. **LOW: Cookie Secure Flag** (`src/app/api/auth/login/route.ts:68`)
   - Add `COOKIE_SECURE` env var or force `secure: true` in production builds
   - Apply to logout route as well

3. **LOW: Rate Limiter Hardening** (`src/lib/rate-limiter.ts`)
   - Add per-account rate limiting alongside per-IP for auth endpoints
   - Consider persisting rate limit state to SQLite for restart resilience
   - Add cleanup on every rate limit check instead of 5-minute throttle for large deployments

4. **MODERATE: Dependency Vulnerability** (`package.json`)
   - Monitor Next.js for a release that bumps postcss > 8.5.10
   - Consider overriding postcss version in package.json if compatible

### LOW PRIORITY — Fix as time permits

5. **INFO: CSRF Tokens** for defense-in-depth
   - Add a CSRF token cookie (Double Submit Cookie pattern) for POST/PUT/DELETE endpoints
   - Or implement custom headers (e.g., `X-Requested-By: xmlhttprequest`) checked server-side

6. **INFO: Session Management Enhancement**
   - Implement JWT rotation (15min access + 7d refresh)
   - Add "log out all devices" functionality

7. **LOW: Wiki POST Directory Sanitization** (`src/app/api/wiki/route.ts:95-101`)
   - Sanitize the `dir` component of user-provided `pagePath` by stripping `..` sequences
   - Or reject paths containing `..` at the route handler level

8. **INFO: No Middleware Auth**
   - Consider adding middleware-level authentication for server-rendered pages under `(app)/` to prevent showing the app shell to unauthenticated users

### OBSERVATION — No Action Required

- All three `dangerouslySetInnerHTML` usages are properly guarded
- SQL injection defenses are strong with the dynamic column pattern well-understood
- CSP configuration is appropriate for Next.js
- Wiki content rendering via rehype-sanitize is well-configured
- File path traversal protections are comprehensive
