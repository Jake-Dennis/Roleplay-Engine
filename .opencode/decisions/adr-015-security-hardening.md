# ADR-015: Security Hardening — SSRF Prevention, Cookie Security, Path Traversal

**Date:** 2026-06-08
**Status:** Accepted
**Context:** Plan 015 security audit findings from `docs/audit-report.md`

## Decision 1: Denylist over Allowlist for SSRF Prevention

**Context:** `getUserOllamaUrl()` and `getUserTtsUrl()` read user-settable URLs from the database settings column. Without validation, a malicious user could set their URL to `http://169.254.169.254/latest/meta-data/` (cloud metadata SSRF) or `http://127.0.0.1:11434` (loopback SSRF).

**Options considered:**
- **A. Allowlist (CIDR-safe list):** Only allow specific known IPs. Downside: brittle — every user's LAN topology differs, and `OLLAMA_CONFIG.host` defaults to `192.168.6.1`.
- **B. Denylist (block dangerous targets):** Block only `127.x.x.x`, `::1`, `0.0.0.0`, `169.254.169.254`, and IPv6-mapped variants. Allow everything else.
- **C. Full URL validation:** Use `URL` class to parse, validate hostname format, reject non-HTTP(S) protocols.

**Decision:** Option B (denylist) + Option C (URL parsing).

**Rationale:**
- Self-hosted app — users own their infrastructure and may legitimately point to any LAN IP
- Denylist covers the most impactful SSRF vectors (cloud metadata exfiltration, loopback service access) without breaking legitimate use
- URL parsing via `new URL()` ensures malformed URLs are rejected early via try-catch
- IPv6-mapped IPv4 (`::ffff:x.x.x.x`) also blocked to prevent bypass attempts

**Consequences:**
- Internal network scanning SSRF (pointing to any internal `10.x.x.x` or `192.168.x.x` host) is NOT prevented — accepted risk for a self-hosted app
- If cloud deployment is ever desired, an additional allowlist mode should be added

## Decision 2: Unconditional Cookie Secure Flag

**Context:** Login and logout routes set `secure: process.env.NODE_ENV === "production"`, making the Secure cookie flag conditional on the environment.

**Options considered:**
- **A. Keep conditional:** `secure: process.env.NODE_ENV === "production"` — fragile, easily copy-pasted wrong
- **B. Make unconditional:** `secure: true` — modern browsers treat `localhost` as secure context
- **C. Env var approach:** `secure: process.env.COOKIE_SECURE !== "false"` — configurable but more complex

**Decision:** Option B (unconditional `secure: true`).

**Rationale:**
- All major browsers (Chrome 90+, Firefox 75+, Safari 14+) treat `localhost` as a secure context over HTTP
- Auth system has an `Authorization` header fallback in `getAuthToken()` if cookie is unavailable
- Eliminates a fragile pattern that could be copy-pasted into new cookie-setting code

## Decision 3: 3-Layer Path Traversal Defense

**Context:** Wiki POST route sanitized filenames but didn't explicitly check for `..` path traversal in the `dir` portion of `pagePath`. While `isPathWithinRoot()` existed as a post-join check, defense-in-depth was lacking.

**Decision:** Add 3 layers of defense:
1. Explicit `..` string rejection in `dir` and `pagePath` before any file operations
2. `path.normalize()` to resolve any embedded traversal tricks
3. Existing `isPathWithinRoot()` post-join boundary check

**Rationale:**
- Each layer catches different bypass techniques
- String-level check catches obvious attacks early with clear error messages
- `path.normalize()` handles edge cases like `foo/bar/../baz`
- `isPathWithinRoot()` catches any remaining traversal attempts that slip through

## Affected Files
- `src/lib/ollama.ts` — `isValidServiceUrl()`, `getUserOllamaUrl()`, `getUserTtsUrl()`
- `src/app/api/auth/login/route.ts` — cookie secure flag
- `src/app/api/auth/logout/route.ts` — cookie secure flag
- `src/app/api/wiki/route.ts` — path traversal defense

## Related
- ADR-012: Comprehensive Audit (triggered this work)
- `docs/audit-report.md` — full audit report
