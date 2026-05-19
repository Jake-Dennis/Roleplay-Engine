# Phase 1: Security Hardening

**Priority:** CRITICAL — blocks all other work
**Estimated effort:** 2-3 hours
**Risk:** High — touches auth, cookie handling, path resolution
**Constraint:** `npx next build` must pass. No new npm dependencies.

---

## Context

Security audit identified 4 CRITICAL vulnerabilities that could lead to complete auth bypass or XSS. All must be fixed before any other work proceeds.

**Key files:**
- `src/lib/config.ts` — hardcoded JWT secret fallback
- `src/lib/auth.ts` — token verification, cookie setting
- `src/lib/auth-token.ts` — token extraction utility
- `src/app/api/auth/login/route.ts` — cookie configuration
- `src/app/api/auth/register/route.ts` — cookie configuration
- `src/contexts/app-context.tsx` — localStorage token storage
- `src/app/(app)/app-layout-shell.tsx` — localStorage token usage
- `src/components/wiki/markdown-renderer.tsx` — link regex XSS
- `src/lib/wiki/file-io.ts` — path traversal guard
- All 15 wiki API route files — path resolution pattern

---

## Task 1.1: Remove Hardcoded JWT Secret Fallback

### Problem
`src/lib/config.ts:39` has `jwtSecret: process.env.JWT_SECRET || "default-secret-change-me"`. If `JWT_SECRET` env var is missing, anyone who knows the default can forge valid JWT tokens and authenticate as any user.

### Implementation

**1. `src/lib/config.ts`** — Remove fallback, add startup validation:
```typescript
// BEFORE:
jwtSecret: process.env.JWT_SECRET || "default-secret-change-me",

// AFTER:
jwtSecret: (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "FATAL: JWT_SECRET environment variable is required. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  return secret;
})(),
```

**2. `src/middleware.ts`** — Remove hardcoded fallback (lines 5-6):
```typescript
// BEFORE:
const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-me";

// AFTER:
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is required");
}
```

**3. `.env.example`** — Add documentation:
```
# Required: Base64-encoded 256-bit key for JWT signing
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
JWT_SECRET=
```

### Verification
- `npx next build` passes
- Server throws on startup if `JWT_SECRET` not set
- `.env.local` has a real secret (verify it exists)

### Rollback
Revert the config change. Not recommended — this is a critical security fix.

---

## Task 1.2: Fix Auth Cookie to httpOnly + secure + sameSite strict

### Problem
`src/app/api/auth/login/route.ts:45-48` sets cookie with `httpOnly: false`, `secure: false`, `sameSite: "lax"`. This means:
- JavaScript can read the token (XSS theft)
- HTTP connections transmit it in plaintext (MITM)
- `lax` allows top-level GET navigation to send cookie (CSRF risk)

### Implementation

**1. `src/app/api/auth/login/route.ts`** — Update cookie options:
```typescript
// BEFORE (approx line 45-48):
cookies().set("auth-token", token, {
  httpOnly: false,
  secure: false,
  sameSite: "lax",
  maxAge: 86400, // 24 hours
  path: "/",
});

// AFTER:
cookies().set("auth-token", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 86400,
  path: "/",
});
```

**2. `src/app/api/auth/register/route.ts`** — Same change for registration cookie.

**3. `src/app/api/auth/logout/route.ts`** — Ensure logout clears with matching options:
```typescript
cookies().set("auth-token", "", {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 0,
  path: "/",
});
```

### Verification
- Build passes
- Login flow works (test with dev server — `secure: false` in dev)
- Logout clears cookie
- Token no longer accessible via `document.cookie` in browser console

### Rollback
Revert cookie options. Not recommended.

---

## Task 1.3: Migrate Token from localStorage to httpOnly Cookie

### Problem
With httpOnly cookies (Task 1.2), JavaScript can no longer read the token. But the app currently stores it in localStorage and reads it for API calls. This breaks all API requests.

### Implementation

**1. `src/lib/auth-token.ts`** — This file already has `getAuthToken()` for server-side cookie extraction. Verify it works.

**2. `src/lib/api-client.ts`** — Update client-side API calls:
- **BEFORE:** Reads token from `localStorage.getItem("auth-token")` and sets `Authorization` header
- **AFTER:** Remove manual header setting. Browser automatically sends httpOnly cookies with same-origin requests. Remove the `Authorization` header logic entirely.

```typescript
// BEFORE (in api-client.ts or similar):
const token = localStorage.getItem("auth-token");
const headers: HeadersInit = {
  "Content-Type": "application/json",
  ...(token && { Authorization: `Bearer ${token}` }),
};

// AFTER:
const headers: HeadersInit = {
  "Content-Type": "application/json",
};
// httpOnly cookies sent automatically by browser for same-origin requests
```

**3. `src/contexts/app-context.tsx`** — Remove localStorage token management:
- Remove `localStorage.getItem("auth-token")` reads (line ~62)
- Remove `localStorage.setItem("auth-token", ...)` writes
- Remove `localStorage.removeItem("auth-token")` calls
- Auth state is now cookie-based; the server handles verification

**4. `src/app/(app)/app-layout-shell.tsx`** — Remove all localStorage token references:
- Lines 154, 243, 329 — remove `localStorage` token reads/writes
- Auth state comes from API responses, not localStorage

**5. `src/hooks/use-session.ts`** — Line 91: remove localStorage token reference.

**6. All route handlers** — Ensure they read token from cookies, not `Authorization` header:
- Most routes already use `request.cookies.get("auth-token")` — verify consistency
- Routes using `getAuthToken(request)` already do this correctly

### Verification
- Build passes
- Login → navigate to dashboard → all API calls work (cookies sent automatically)
- Logout → cookies cleared → redirected to login
- `document.cookie` does NOT show auth-token in browser console
- No `localStorage` auth references remain: `grep -r "localStorage.*auth" src/`

### Rollback
Revert to localStorage + non-httpOnly cookies. Not recommended.

---

## Task 1.4: Fix Markdown Renderer XSS via javascript: URIs

### Problem
`src/components/wiki/markdown-renderer.tsx:36` has a link regex that renders `<a href="$2">` without validating the URL scheme. An attacker who can write wiki content could inject `<a href="javascript:alert(1)">`.

### Implementation

**1. `src/components/wiki/markdown-renderer.tsx`** — Add URL scheme validation:

Option A — Fix the regex replacement:
```typescript
// BEFORE:
content = content.replace(linkRegex, '<a href="$2" class="wikilink">$1</a>');

// AFTER:
content = content.replace(linkRegex, (_match, text, href) => {
  // Block javascript:, data:, vbscript: and other dangerous schemes
  const safeHref = href.match(/^(https?|ftp|mailto|tel):/) || href.startsWith('/') || href.startsWith('#')
    ? href
    : '#';
  return `<a href="${safeHref}" class="wikilink">${text}</a>`;
});
```

Option B — Add a rehype plugin that sanitizes href attributes (more robust):
```typescript
// Create src/lib/wiki/sanitize-hrefs.ts:
import type { Root } from 'hast';
import { visit } from 'unist-util-visit';

const DANGEROUS_SCHEMES = /^(javascript|data|vbscript|file):/i;

export function sanitizeHrefPlugin() {
  return (tree: Root) => {
    visit(tree, 'element', (node) => {
      if (node.tagName === 'a' && node.properties?.href) {
        const href = String(node.properties.href);
        if (DANGEROUS_SCHEMES.test(href)) {
          node.properties.href = '#';
        }
      }
    });
  };
}
```
Then add it to the rehype pipeline in `markdown-renderer.tsx`.

**Recommendation:** Option B — rehype plugin is more robust because it catches ALL href assignments, not just wikilinks.

**2. Verify `rehype-sanitize` schema** — Check if the current schema already blocks `javascript:` URIs. If not, add it:
```typescript
// In the sanitize schema configuration:
attributes: {
  a: {
    href: (value) => {
      return !DANGEROUS_SCHEMES.test(value);
    },
  },
},
```

### Verification
- Build passes
- Wiki page with `[[Page|javascript:alert(1)]]` renders as `<a href="#">` not `<a href="javascript:...">`
- Normal wikilinks still work
- External links still work

### Rollback
Revert the regex/plugin change. Low risk.

---

## Task 1.5: Fix Path Traversal — startsWith Bypass on Windows

### Problem
Current guard: `resolvedPath.startsWith(wikiRoot)`. On Windows, `C:\wiki-evil\file.md` starts with `C:\wiki` — the prefix check passes. Also, `..` sequences could escape if not properly resolved.

### Implementation

**1. Create shared path validation utility** — `src/lib/wiki/path-guard.ts`:
```typescript
import path from 'path';

/**
 * Validates that a resolved path is within the expected root directory.
 * Uses path.resolve to normalize .. sequences, then checks with trailing separator
 * to prevent prefix bypass (e.g., wiki-evil passing wiki check).
 */
export function isPathWithinRoot(resolvedPath: string, rootPath: string): boolean {
  const normalizedResolved = path.resolve(resolvedPath);
  const normalizedRoot = path.resolve(rootPath);
  // Trailing separator prevents prefix bypass: "wiki-evil" won't match "wiki/"
  return normalizedResolved === normalizedRoot ||
         normalizedResolved.startsWith(normalizedRoot + path.sep);
}
```

**2. Update all wiki route files** — Replace `startsWith` checks:

Files to update (15 files):
- `src/app/api/wiki/[...slug]/route.ts`
- `src/app/api/wiki/route.ts`
- `src/app/api/wiki/validate/[...slug]/route.ts`
- `src/app/api/wiki/reject/[...slug]/route.ts`
- `src/app/api/wiki/lock/[...slug]/route.ts`
- `src/app/api/wiki/graph/route.ts`
- `src/app/api/wiki/split-suggestions/[...slug]/route.ts`
- `src/app/api/wiki/sources/upload/route.ts`
- `src/app/api/wiki/sources/[...slug]/route.ts`
- `src/app/api/wiki/search/route.ts`
- `src/app/api/wiki/backlinks/route.ts`
- `src/app/api/wiki/orphans/route.ts`
- `src/app/api/wiki/ingest/route.ts`
- `src/app/api/wiki/lint/route.ts`
- `src/app/api/wiki/refresh/route.ts`

In each file, replace:
```typescript
// BEFORE:
if (!resolvedPath.startsWith(wikiRoot)) {
  return NextResponse.json({ error: "Invalid path" }, { status: 400 });
}

// AFTER:
import { isPathWithinRoot } from '@/lib/wiki/path-guard';
// ...
if (!isPathWithinRoot(resolvedPath, wikiRoot)) {
  return NextResponse.json({ error: "Invalid path" }, { status: 400 });
}
```

**3. Update `src/lib/wiki/file-io.ts`** — Apply same guard to all file operations.

### Verification
- Build passes
- Test path traversal attempts:
  - `[[../../../etc/passwd]]` → blocked
  - `wiki-evil/file.md` with root `wiki` → blocked
  - Normal wiki paths → allowed
- All wiki API endpoints return 400 for malicious paths

### Rollback
Revert to `startsWith` checks. Low risk — existing guard is partially effective.

---

## Dependencies

```
1.1 (JWT secret) ──→ 1.3 (localStorage migration)
1.2 (httpOnly cookie) ──→ 1.3 (localStorage migration)
1.4 (XSS fix) ──→ (independent)
1.5 (path traversal) ──→ (independent)
```

**Execution order:**
1. Do 1.4 and 1.5 first (independent, low risk)
2. Do 1.1 (JWT secret — requires `.env.local` update)
3. Do 1.2 (httpOnly cookie)
4. Do 1.3 (localStorage migration — depends on 1.1 + 1.2)

---

## Success Criteria

- [ ] `npx next build` passes
- [ ] Server throws on startup without `JWT_SECRET`
- [ ] Auth cookie is `httpOnly: true`, `secure: true` (prod), `sameSite: "strict"`
- [ ] Zero `localStorage` auth references in `src/`
- [ ] Token not accessible via `document.cookie` in browser
- [ ] `javascript:` URIs blocked in markdown renderer
- [ ] Path traversal attempts return 400 on all wiki endpoints
- [ ] Login → navigate → API calls all work
- [ ] No new TypeScript errors
