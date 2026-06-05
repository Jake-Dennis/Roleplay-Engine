# Phase 1: Security Hardening — Learnings

**Date:** 2026-05-20
**Status:** Completed

## Task A: XSS in Markdown Renderer

**File:** `src/lib/markdown-renderer.ts:36`

**Vulnerability:** The link regex `\[([^\]]+)\]\(([^)]+)\)` rendered `<a href="$2">` without validating the URL scheme. An attacker could inject `javascript:alert(1)` URLs.

**Fix:** Added a `SAFE_SCHEMES` regex (`/^(https?:|mailto:|tel:|\/|#)/i`) that validates the `href` before rendering. Dangerous schemes (`javascript:`, `data:`, `vbscript:`, `file:`) are blocked — links with unsafe schemes render as `href="#"` instead.

**Approach:** Used a callback function in `String.replace()` to test each `href` against the safe scheme whitelist before constructing the `<a>` tag.

## Task B: Path Traversal Bypass in Wiki Routes

**Files:** 7 wiki route files (10 occurrences total)

**Vulnerability:** All wiki API routes used `resolvedPath.startsWith(wikiRoot)` which is vulnerable on Windows. For example, if `wikiRoot = "C:\wiki"`, then `"C:\wiki-evil\file.md".startsWith("C:\wiki")` returns `true` — a classic prefix bypass.

**Fix:** Created `src/lib/wiki/path-guard.ts` with `isPathWithinRoot()` that:
1. Uses `path.resolve()` to normalize both paths (eliminates `..` sequences)
2. Appends `path.sep` (trailing separator) to the root to prevent prefix bypass
3. Returns boolean after comparison

**Updated routes:**
- `src/app/api/wiki-revisions/route.ts` (2 occurrences)
- `src/app/api/wiki/[...slug]/route.ts` (3 occurrences)
- `src/app/api/wiki/validate/[...slug]/route.ts` (1 occurrence)
- `src/app/api/wiki/split-suggestions/[...slug]/route.ts` (1 occurrence)
- `src/app/api/wiki/route.ts` (1 occurrence)
- `src/app/api/wiki/reject/[...slug]/route.ts` (1 occurrence)
- `src/app/api/wiki/lock/[...slug]/route.ts` (1 occurrence)

## Verification

- `npx next build` passed with zero TypeScript errors
- Zero `startsWith(wikiRoot)` or `startsWith(wikiDir)` patterns remain in source
- No new npm dependencies added
- No files modified outside `src/lib/markdown-renderer.ts`, `src/lib/wiki/`, or `src/app/api/wiki/`
