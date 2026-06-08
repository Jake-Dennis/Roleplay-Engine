# Comprehensive Project Audit Report — Roleplay-Engine

**Date:** 2026-06-08
**Scope:** Full 8-category health audit
**Total source:** ~64,565 lines across ~435 files (src/)
**Test suite:** 253 tests, 0 failures
**Build:** Compiles cleanly in 7.2s (65 routes)

---

## Executive Summary

The project is in **good structural health** overall. The architecture is sound, security posture is strong for a self-hosted app, and all 253 tests pass. However, there are **3 critical issues** (1 runtime crash, 2 performance) and ~30+ high/medium issues across all categories.

### Issue Count by Severity

| Severity | Count | Key Areas |
|----------|-------|-----------|
| **CRITICAL** | 3 | Runtime crash (benchmark page), zero React.memo, missing DB indexes |
| **HIGH** | ~12 | Dead duplicate files, SSRF vector, 10 dead code files, 5 set-state-in-effect, 5+ render perf issues |
| **MEDIUM** | ~15 | Outdated deps, AGENTS.md drift, active-universe.tsx usage, 4 production `any` types |
| **LOW** | ~20+ | Unused import warnings, cookie secure flag, missing per-route force-dynamic |
| **INFO** | ~15 | No CSRF tokens, no refresh rotation, no CI config, all pages `draft` status |

---

## 1. Code Quality

**Report:** `.opencode/audit/01-code-quality.md` (326 lines)

### Stats
- **146 total problems** (79 errors, 67 warnings)
- **Fixable:** 1 error (prefer-const)

### Error Breakdown

| Rule | Count | Where |
|------|-------|-------|
| `no-explicit-any` | 60 | 25 in archived scripts, 31 in test files, **4 in production** |
| `no-require-imports` | 9 | 8 in archived scripts, **1 in production** (`ollama.ts:302`) |
| `set-state-in-effect` | 5 | benchmark page, server page, markdown-editor, quick-switcher, server-info |
| `immutability` (crash) | **2** | `settings/benchmark/page.tsx:198-199` |
| `refs-in-render` | 1 | `tts-playback.tsx:157` |
| `prefer-const` | 1 | `benchmark/roleplay/route.ts:83` |

### 🔴 CRITICAL RUNTIME CRASH
`src/app/(app)/settings/benchmark/page.tsx` lines 198-199:
```typescript
useEffect(() => {
  fetchHistory();       // ReferenceError — const not hoisted!
  fetchUserSettings();  // ReferenceError — const not hoisted!
}, []);
```
Arrow functions defined with `const` on lines 257 and 209 are called **before declaration**. This throws a `ReferenceError` on every render.

### Dead Code: 10 Files (~1,046 lines) Never Imported

| File | Lines | Notes |
|------|-------|-------|
| `lib/message-summarizer.ts` | 198 | Full summarization engine |
| `lib/api-client.ts` | 111 | Typed API client with retry |
| `hooks/use-auth.ts` | ~80 | Auth hook |
| `hooks/use-tts.ts` | ~60 | TTS playback hook |
| `hooks/use-local-storage.ts` | ~40 | localStorage hook |
| `hooks/use-voices.ts` | ~50 | Voice discovery hook |
| `components/session/session-header.tsx` | 217 | Full header component |
| `lib/entity-resolution.ts` | ~100+ | Entity resolution |
| `lib/wiki/prompt-subtypes.ts` | ~150 | Only imported by test |
| `components/ui/error-boundary.tsx` | ~40 | Error boundary |

### Most Problematic Files

| Rank | File | Errors | Warnings |
|------|------|--------|----------|
| 1 | `wiki-prompt-integration.test.ts` | 13 | 5 |
| 2 | `settings/benchmark/page.tsx` | 3 | 5 |
| 3 | `components/wiki/file-tree.tsx` | 0 | 5 |
| 4 | `lib/benchmark/orchestrator.ts` | 0 | 5 |
| 5 | `jobs/__tests__/npc-wiki-sync.test.ts` | 5 | 1 |

### Recommendations
1. **🔴 Fix runtime crash** in benchmark page (move `const` above `useEffect`)
2. **HIGH** Remove/reintegrate 10 dead code files (~1,046 lines)
3. **HIGH** Fix 5 set-state-in-effect violations (convert to `useMemo` or `useLayoutEffect`)
4. **MEDIUM** Convert `ollama.ts:302` from `require()` to `import`
5. **MEDIUM** Add proper types to 4 production `any` usages
6. **LOW** Exclude `docs/historical-evidence/` from ESLint (removes 33 problems)

---

## 2. Dependencies

**Report:** `.opencode/audit/02-dependencies.md` (221 lines)

### Outdated: 13 Packages

| Package | Current | Latest | Bump | Action |
|---------|---------|--------|------|--------|
| typescript | 5.9.3 | 6.0.3 | major | Defer (breaking) |
| eslint | 9.39.4 | 10.4.1 | major | Blocked by eslint-config-next |
| @types/node | 25.8.0 | 25.9.2 | minor | Safe |
| lucide-react | 1.16.0 | 1.17.0 | minor | Safe |
| cytoscape | 3.33.3 | 3.34.0 | minor | Safe |
| next (pinned!) | 16.2.6 | 16.2.7 | patch | **Unlock to `^16.2.6`** |
| react/react-dom | 19.2.6 | 19.2.7 | patch | Safe |
| @types/react | 19.2.14 | 19.2.17 | patch | Safe |
| eslint-config-next (pinned!) | 16.2.6 | 16.2.7 | patch | Unlock alongside next |
| @next/bundle-analyzer | 16.2.6 | 16.2.7 | patch | Safe |
| tsx | 4.22.3 | 4.22.4 | patch | Safe |
| @types/bcryptjs | 3.0.0 | **deprecated** | special | **Remove** (bcryptjs ships own types) |

### Security: 2 Moderate Vulns
- `postcss < 8.5.10` — XSS via CSS stringify. Transitively via Next.js.
- **No action possible** until Next.js bumps its bundled postcss. Low practical risk.

### Unused Dependencies: **0 genuine** (5 depcheck flags are all false positives)

### Recommendations
1. **HIGH** Unlock `next` and `eslint-config-next` to `^16.2.x` for auto-patches
2. **HIGH** Remove `@types/bcryptjs` (deprecated)
3. **MEDIUM** Patch bump react/react-dom, @types/react, @types/node, tsx, lucide-react, cytoscape
4. **LOW** Monitor Next.js for postcss fix

---

## 3. Architecture

**Report:** `.opencode/audit/03-architecture.md` (315 lines)

### Anti-Pattern Check

| Anti-Pattern | Status | Notes |
|-------------|--------|-------|
| Barrel exports | ✅ PASS | 0 found |
| ORM / query builder | ✅ PASS | Raw SQL only |
| Middleware auth | ✅ PASS | `protectedRoutes` empty |
| Persistent workers | ✅ PASS | None found |
| Wiki in SQLite | ✅ PASS | Markdown on disk |
| `relationship/` vs `relationships/` | ✅ PASS | Distinct dirs |
| `tailwind.config.*` | ❌ **ISSUE** | Exists but dead code (v4 uses `@theme`) |
| `active-universe.tsx` in new code | ⚠️ **6 files** | Should migrate to `app-context.tsx` |

### Module Boundaries
- ✅ `lib/` never imports from `app/`
- ✅ `hooks/` never imports from `components/` or `app/`
- ⚠️ `components/debug/retrieval-inspector.tsx` imports types from API route (should extract to shared types)

### 🔴 Dead Duplicate Files (Critical)
| Dead File | Size | Active Equivalent |
|-----------|------|-------------------|
| `src/components/chat/ChatWindow.tsx` | 238 lines | `chat-window.tsx` (415 lines, in use) |
| `src/hooks/useRenderLoop.ts` | 25 lines | `use-render-loop.ts` (51 lines, in use) |

### Documentation Drift
AGENTS.md file counts are 40-50% out of date (claims 94 routes vs actual 107, 71 components vs 98).

### Recommendations
1. **🔴 Delete** `ChatWindow.tsx` and `useRenderLoop.ts`
2. **HIGH** Delete `tailwind.config.ts`
3. **MEDIUM** Regenerate all AGENTS.md files
4. **MEDIUM** Migrate 6 `active-universe.tsx` imports to `app-context.tsx`
5. **MEDIUM** Extract shared types from API route to `lib/retrieval.ts`

---

## 4. Security

**Report:** `.opencode/audit/04-security.md` (468 lines)

### Strong Points (12 items)
- ✅ JWT: jose HS256, 24h expiry, token denylist, password-change invalidation
- ✅ bcrypt(12) with constant-time comparison
- ✅ SQL injection: parameterized `?` everywhere
- ✅ Path traversal: `isPathWithinRoot()` with Windows prefix protection
- ✅ Wiki XSS: rehype-sanitize with tightly-scoped schema
- ✅ HTTP headers: HSTS, X-Frame-Options, CSP, Permissions-Policy
- ✅ Cookies: httpOnly + SameSite=Strict

### 🔴 MEDIUM: SSRF via User-Settable TTS/Ollama URL (2 findings)

| Location | Issue |
|----------|-------|
| `src/lib/ollama.ts:287` — `getUserTtsUrl()` | Reads custom TTS URL from user settings, fetches arbitrary hosts |
| `src/lib/ollama.ts:266` — `getUserOllamaUrl()` | Same pattern for Ollama URL |

**Risk:** Authenticated users can point to `http://169.254.169.254` (AWS metadata), internal services.

**Fix:** URL validation with allowlist or read from server config only (admin-controlled).

### 🟡 LOW Findings (7)
| Finding | Location | Fix |
|---------|----------|-----|
| Cookie `secure` conditional on NODE_ENV | login/route.ts:68 | Force `secure: true` or env var |
| Dynamic column names in UPDATE | 4 route files | Acceptable but fragile pattern |
| Wiki POST dir not sanitized | wiki/route.ts:95 | Add `..` rejection |
| Error details leak in dev | error-response.ts:34 | Acceptable for dev mode |
| Full wiki content via single API call | wiki/route.ts:55 | By design for private app |
| Rate limiter in-memory | rate-limiter.ts | Lost on restart |
| No CSRF tokens | All POST/PUT/DELETE | Mitigated by SameSite=Strict |

### Recommendations
1. **MEDIUM** Add URL validation for TTS/Ollama (SSRF fix)
2. **LOW** Add `COOKIE_SECURE` env var
3. **LOW** Add per-account rate limiting alongside IP-based
4. **INFO** Consider CSRF tokens for defense-in-depth

---

## 5. Test Coverage

**Report:** `.opencode/audit/05-test-coverage.md` (437 lines)

### Overall: ~6.5% line coverage

| Area | Coverage | Details |
|------|----------|---------|
| `src/lib/` | ~6-10% | 16 of 101 files tested |
| `src/lib/wiki/` | **~43%** | Best-covered subsystem (11/32 files) |
| `src/lib/jobs/` | ~12% | 2 of 16 files tested |
| `src/lib/benchmark/` | ~15% | 2 of 8 files tested |
| `src/components/` | **<0.1%** | 1 stub test (9 lines, 1 assertion) |
| `src/hooks/` | **0%** | 11 files, 0 tests |
| `src/contexts/` | **0%** | 2 files, 0 tests |
| `src/app/api/` (routes) | **0%** | 98 route files, 0 tests |

### 🔴 Critical Untested Modules (7)

| Module | Lines | Risk |
|--------|-------|------|
| `lib/retrieval.ts` | 825 | Heart of generation pipeline |
| `lib/ollama.ts` | 543 | All AI generation flows through this |
| `lib/prompt-builder.ts` | 357 | 10-section prompt assembly |
| `lib/auth.ts` | 286 | Auth core (hashing, JWT, user CRUD) |
| `lib/event-bus.ts` | 228 | Powers all real-time streaming |
| `lib/job-processor.ts` | 172 | Job orchestrator |
| `lib/jobs/queue.ts` | 368 | Job queue core infrastructure |

### Recommendations
1. **🔴 HIGHEST** Add tests for `lib/retrieval.ts` (825 lines) — context assembly, keyword extraction, budget truncation
2. **🔴 HIGHEST** Add tests for `lib/ollama.ts` (543 lines) — stream parsing, error handling, timeout, fallback
3. **HIGH** Add tests for `lib/prompt-builder.ts`, `lib/auth.ts`, `lib/event-bus.ts`
4. **HIGH** Add integration tests for key API routes (auth, sessions, generate, wiki CRUD)
5. **MEDIUM** Add component tests for high-value components (ChatWindow, FileTree, Modal)
6. **MEDIUM** Add bunfig.toml and CI test runner (GitHub Actions)
7. **LOW** Expand existing test suites with edge cases

---

## 6. Wiki Data

**Report:** `.opencode/audit/06-wiki-data.md` (543 lines)

### Headline Numbers
| Metric | Value |
|--------|-------|
| Users scanned | 10 |
| Universes | 13 |
| Pages audited | 76 |
| Issues found | **112** |
| All pages `draft` | **100%** |

### Issue Breakdown

| Category | Count | Severity |
|----------|-------|----------|
| TYPE_MISMATCH | 76 (68%) | Cosmetic — singular vs plural convention |
| ORPHAN (no inbound wikilinks) | 23 (21%) | Info — mostly relationship pages |
| ROOT_LEVEL_PAGE | 12 (11%) | Info — test/legacy pages |
| MISSING_CONFIG | 1 (1%) | Warn — universe `concepts` |

### 🔴 Key Findings

1. **TYPE_MISMATCH is systemic (76/76 pages)** — Every page has `type: concept` (singular) in frontmatter while living in `concepts/` (plural) folder. Consistent across 100% of pages — this is a convention decision, not data corruption.

2. **Universe "concepts" is broken** — 11 pages at wiki root with no `.wiki-config.json` and no type folder structure. Either rehabilitate or delete.

3. **Orphan relationship pages (18 of 23)** — Auto-extraction pipeline creates relationship pages but doesn't add wikilinks from/to entity pages. The wikilink convention difference (snake_case filenames vs. capitalized entity names) causes missed links.

4. **0 pages have been reviewed/locked** — The `draft → reviewed → locked` workflow has never been used.

### Recommendations
1. **MEDIUM** Update audit script to accept singular/plural pairs as valid (fixes 76 "false positive" issues)
2. **MEDIUM** Rehabilitate or remove the `concepts` universe (11 root-level pages, no config)
3. **LOW** Improve wikilink generation in auto-extraction pipeline
4. **INFO** Clean up test universes

---

## 7. Performance

**Report:** `.opencode/audit/07-performance.md` (348 lines)

### 🔴 Critical (3)

| # | Finding | Impact | Fix |
|---|---------|--------|-----|
| C1 | **Zero React.memo usage** across all 71 components | Every state change re-renders entire trees | Add memo to 20+ hot-path components |
| C2 | **Missing indexes on 4 tables** (scene_states, narrative_memories, narrative_anchors, entity_mentions) | Full table scans on every generation request | 4 CREATE INDEX statements |
| C3 | **Session page: 1012-line mega-component** with 35+ useState | Cascading re-renders, maintainability risk | Extract panels, combine state |

### High (5)
| # | Finding | Impact | Fix |
|---|---------|--------|-----|
| H1 | `useSession.refresh()` calls **6 separate setState** calls | 6+ renders per SSE event | Combine into one state object |
| H2 | `setStreamContent()` per-token during streaming | Full re-render per token | Throttle (100ms) or use ref |
| H3 | Duplicated `entity_mentions` query in `getWikiContext()` | DB query runs twice per generation | Hoist query |
| H4 | `getTurnConfig()` makes **3 separate DB queries** | 3 round-trips where 1 suffices | Single query with IN clause |
| H5 | Choice generation blocks SSE stream close (sync generateText) | 5-15s added latency | Move to background job |

### Architecture Note: 6-8 Ollama calls per user message
Every generation triggers: main response stream, choice generation, relationship analysis, thread analysis, summarization, embeddings, wiki extraction. These serialize through the `ollama-busy` mutex, totaling **30-120 seconds of cumulative LLM time per message**.

### Recommendations
1. **🔴 Add 4 DB indexes** — Low effort, high impact
2. **🔴 Add React.memo** to hot-path components — ChatWindow, FileTree, MarkdownEditor, WikiQuickSwitcher, all panel components
3. **HIGH** Combine `useSession` into single state object
4. **HIGH** Throttle stream content updates (100ms intervals)
5. **MEDIUM** Run `npm run analyze` for bundle baseline
6. **MEDIUM** Move choice generation to background job
7. **LOW** Dynamic import cytoscape (5.4 MB) on relationship pages only

---

## Consolidated Priority Action Plan

### Do This Week (Critical/Immediate)

| Priority | Action | Category | Effort |
|----------|--------|----------|--------|
| 🔴 **P1** | Fix runtime crash in `settings/benchmark/page.tsx` (access-before-declaration) | Code Quality | 5 min |
| 🔴 **P2** | Add 4 missing DB indexes | Performance | 10 min |
| 🔴 **P3** | Delete `ChatWindow.tsx` and `useRenderLoop.ts` (dead duplicates) | Architecture | 2 min |
| 🟠 **P4** | Delete `tailwind.config.ts` (dead code) | Architecture | 1 min |
| 🟠 **P5** | Remove `@types/bcryptjs` (deprecated) | Dependencies | 2 min |
| 🟠 **P6** | Unlock `next` and `eslint-config-next` to `^16.2.x` | Dependencies | 2 min |
| 🟠 **P7** | Add URL validation for TTS/Ollama (SSRF fix) | Security | 30 min |

### Do This Sprint (High Priority)

| Action | Category | Effort |
|--------|----------|--------|
| Add React.memo to 15+ hot-path components | Performance | 2-4 hr |
| Combine `useSession` into single state object | Performance | 1 hr |
| Throttle stream content updates | Performance | 30 min |
| Fix 5 set-state-in-effect violations | Code Quality | 2 hr |
| Remove/reintegrate 10 dead code files (~1,046 lines) | Code Quality | 1-2 hr |
| Add tests for `lib/retrieval.ts` (825 lines) | Test Coverage | 4-6 hr |
| Add tests for `lib/ollama.ts` (543 lines) | Test Coverage | 3-5 hr |
| Regenerate AGENTS.md files | Architecture | 30 min |
| Migrate 6 `active-universe.tsx` imports | Architecture | 30 min |
| Fix duplicated entity_mentions query in retrieval.ts | Performance | 15 min |
| Fix getTurnConfig — single query | Performance | 15 min |

### Do This Month (Medium Priority)

| Action | Category | Effort |
|--------|----------|--------|
| Patch bump all safe deps (react, @types, lucide-react, tsx) | Dependencies | 30 min |
| Add tests for prompt-builder, auth, event-bus, job-processor, queue | Test Coverage | 8-12 hr |
| Add integration tests for key API routes | Test Coverage | 4-8 hr |
| Extract session page panels (1012 → 300 lines) | Performance | 4-6 hr |
| Set up CI (GitHub Actions) | Test Coverage | 1-2 hr |
| Fix 4 production `any` type annotations | Code Quality | 1 hr |
| Add COOKIE_SECURE env var | Security | 30 min |
| Rehabilitate or delete `concepts` universe | Wiki Data | 2 hr |

### Next Quarter (Low Priority)

| Action | Category | Effort |
|--------|----------|--------|
| Move choice generation to background job | Performance | 4-6 hr |
| Dynamic import cytoscape (5.4 MB) | Performance | 1 hr |
| Add CSRF tokens for defense-in-depth | Security | 4 hr |
| Add bunfig.toml and coverage reporting | Test Coverage | 1 hr |
| Remove per-route `force-dynamic` on login/register | Performance | 30 min |
| Document new lib subdirectories | Architecture | 30 min |
| Expand wiki test edge cases | Test Coverage | 2-4 hr |
| Evaluate TS 6 and ESLint 10 upgrades | Dependencies | 4 hr |

---

## Summary

| Metric | Value | Verdict |
|--------|-------|---------|
| **Build** | Compiles clean, 7.2s | ✅ |
| **Tests** | 253 pass, 0 fail | ✅ |
| **Lint errors** | 79 (26 in archived scripts, 35 in test files) | ⚠️ 4 in production code |
| **Lint warnings** | 67 (mostly unused imports) | ⚠️ Cleanup needed |
| **Security vulns** | 2 moderate (postcss, blocked by Next.js) | ⚠️ Monitor |
| **Outdated deps** | 13 (2 major, 3 minor, 7 patch, 1 remove) | ⚠️ 6 immediate-safe |
| **Dead code** | ~1,046 lines across 10 files + 2 duplicate files | 🟠 Clean up |
| **Runtime bugs** | 1 (benchmark page crash) | 🔴 FIX NOW |
| **Test coverage** | ~6.5% (0% on routes, components, hooks) | 🟠 Significant gap |
| **Wiki data** | 112 issues (mostly cosmetic singular/plural) | ✅ 1 real issue |
| **SSRF risk** | User-settable TTS/Ollama URL | 🟠 FX SOON |
| **Performance** | No React.memo, 4 missing indexes, 35-state mega-component | 🟠 Multiple quick wins |
| **Architecture** | Follows 7/11 anti-patterns, 4 violations | ✅ Good foundation |

**Overall Health:** B- / Green. Stable enough to ship today, but with a known runtime crash on one page and significant test/performance gaps.

*Generated from 7 category audit reports in `.opencode/audit/`. Full detail in each category report.*
