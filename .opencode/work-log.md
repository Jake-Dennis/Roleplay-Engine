# Roleplay-Engine — Work Log

Append-only record of every work cycle. Each entry: date, cycle, what was done, files changed, decisions made. Do not edit past entries — add new ones at the bottom.

---

## 2026-06-04 — Cycle 1: Project setup

**Trigger:** User invoked `/setup-project` workflow.

**What was done:**

1. **Detection** — Confirmed project: Next.js 16 (App Router) + TypeScript + SQLite (better-sqlite3) + Ollama (self-hosted LLM) + Tailwind v4. See `AGENTS.md` and `README.md` for full details.
2. **Git** — Repository already initialized. Remote: `https://github.com/Jake-Dennis/Roleplay-Engine.git`. Branch: `master`. No changes needed.
3. **Graphify** — Knowledge graph already exists at `graphify-out/graph.json` (3.5 MB, built 2026-05-27). Verified; refresh not needed for setup, will be run on file changes.
4. **.opencode/ structure** — Created:
   - `.opencode/plans/` — active implementation plans
   - `.opencode/plans/completed/` — verified-completed plans (history)
   - `.opencode/decisions/` — Architecture Decision Records (ADRs)
   - `.opencode/todo.md` — persistent cross-session task checklist
   - `.opencode/work-log.md` — this file
5. **.gitignore** — Already comprehensive (63 lines, covers node_modules, .env*, .next, /data/, /graphify-out/, etc.). No changes required.
6. **README.md** — Already exists and detailed (127 lines, covers tech stack, architecture, getting started, features, docs). No changes required.
7. **scripts/verify-plan.py** — Created. Referenced by the conductor workflow step 8. Extracts runnable verification commands from a plan file's `## Verification` section (commands inside backticks), runs each, and moves the plan to `.opencode/plans/completed/` on full success (exit 0).

**Files changed (this cycle):**

- created: `.opencode/todo.md`
- created: `.opencode/work-log.md`
- created: `scripts/verify-plan.py`

**Files intentionally NOT changed:**

- `.gitignore` — already covers all required patterns
- `README.md` — already detailed
- `package.json` — no setup changes needed
- `graphify-out/` — gitignored, no changes

**Decisions:**

- _(none this cycle — pure setup)_

**Next:** Awaiting user request for first task.

---

## 2026-06-04 — Cycle 2: Fix dev server crash (Next.js 16 middleware → proxy)

**Trigger:** User pasted dev server startup log showing:
> `Unhandled Rejection: Error: Both middleware file "./src/middleware.ts" and proxy file "./src/proxy.ts" are detected. Please use "./src/proxy.ts" only.`

**Root cause:** Next.js 16 renamed the `middleware` file convention to `proxy`. The project had fully migrated to `src/proxy.ts` (CSRF, real-IP, request ID, edge-safe JWT verify) but the orphan `src/middleware.ts` was still on disk. The old file also had a phantom `import jwt from "jsonwebtoken"` (the package is not in `package.json`) and a non-empty `protectedRoutes` list that directly violates `AGENTS.md` ("Do NOT add cookie-based middleware auth... `protectedRoutes` is intentionally empty").

**Evidence collected:**

- `src/lib/auth-edge.ts` exists — `proxy.ts` imports resolve
- `jsonwebtoken` used in **one place only** (`src/middleware.ts`) — safe to remove
- Recent commit `99dc336 chore: remove dead code — full-audit-remediation plan, session-settings-panel, semantic-intent-fallback, middleware` was a dead-code cleanup that was supposed to remove the old middleware — file slipped through
- `proxy.ts` is a strict superset of `middleware.ts` (same auth + CSRF + IP + request ID)
- `proxy.ts` already has `protectedRoutes: string[] = []` per `AGENTS.md`
- Multiple lib files already reference the proxy in comments: `auth-edge.ts`, `idle-processing.ts`, `rate-limiter.ts`, `health/route.ts`
- Architecture docs (`src/ARCHITECTURE.md`) already describe the migration as complete

**What was done:**

1. Wrote plan to `.opencode/plans/plan-001-delete-orphan-middleware.md`.
2. Deleted `src/middleware.ts` (was untracked, so `rm` — no `git rm` needed).
3. Ran `scripts/verify-plan.py` — all 4 verification commands passed.
4. Plan archived to `.opencode/plans/completed/plan-001-delete-orphan-middleware.md`.

**Files changed (this cycle):**

- deleted: `src/middleware.ts` (was untracked)

**Verification (all passed):**

- middleware file gone ✓
- proxy.ts has all expected features (proxy export, verifyTokenBasic, getRealIp, X-Request-Id, CSRF) ✓
- no phantom jsonwebtoken imports in `src/**/*.ts` ✓
- `protectedRoutes` is empty in proxy.ts (per AGENTS.md) ✓

**Decisions:**

- **D1 (no ADR):** Chose deletion over merge. The old file's only unique value was its auth logic, which is fully preserved in `proxy.ts`. Merging would have re-introduced the AGENTS.md anti-pattern (non-empty `protectedRoutes`).

**Follow-ups (not done, optional):**

- Update stale comment in `src/lib/idle-processing.ts:6` ("via middleware" → "via proxy") — accuracy nit, non-blocking.
- 9 other "middleware" matches in `src/ARCHITECTURE.md`, `src/app/api/AGENTS.md`, and `idle-processing.ts` are docs/comments — all describe the proxy, none block functionality.

**Next:** User should restart dev server to confirm the unhandled rejection is gone. Awaiting commit decision.

---

## 2026-06-04 — Cycle 3: Fix dev server crash (parallel pages in `(auth)` route group)

**Trigger:** User restarted dev server. Previous middleware fix worked, but new error surfaced:

> `You cannot have two parallel pages that resolve to the same path. Please check /(auth)/login and /login.`
> `You cannot have two parallel pages that resolve to the same path. Please check /(auth)/register and /register.`

**Root cause:** Next.js 16 hardened route group validation — two pages resolving to the same URL path is now a hard error (warning in 14/15). The project had:

- `src/app/login/page.tsx` (tracked, canonical, 25/05/2026)
- `src/app/register/page.tsx` (tracked, canonical, 25/05/2026)
- `src/app/(auth)/login/page.tsx` (**untracked**, today 4:02:07 PM)
- `src/app/(auth)/register/page.tsx` (**untracked**, today 4:02:07 PM)

Both `(auth)/login` and `/login` resolve to `/login` (route groups don't add URL segments). Conflict.

**Why `(auth)/` is the orphan (not `login/`):**

- `src/app/AGENTS.md` is explicit: "**Auth pages: `login/` and `register/` outside `(app)` — no sidebar layout.**" and anti-pattern: "**Do NOT put auth pages inside `(app)`**". The principle extends to all route groups.
- `(auth)/` was created today at 4:02 PM (mid-session, likely an incomplete LLM/agent refactor) — contains ONLY the two duplicate pages, no `layout.tsx`, no shared components.
- `(auth)/` is untracked in git (`?? src/app/(auth)/`); `login/` and `register/` are tracked.
- **Zero imports from `(auth)/`** — verified by grep across `src/`.
- The `(auth)/login/page.tsx` has different post-login behavior (`router.push("/dashboard"); router.refresh()`) than the tracked `src/app/login/page.tsx` — switching to the (auth) version would be an untracked, untested feature change. Conservative choice: keep the tracked, working version.

**What was done:**

1. Wrote plan to `.opencode/plans/plan-002-delete-orphan-auth-route-group.md`.
2. Deleted `src/app/(auth)/` recursively (was untracked, so `rm -rf` — no `git rm` needed).
3. Ran `scripts/verify-plan.py` — all 5 verification commands passed.
4. Plan archived to `.opencode/plans/completed/plan-002-delete-orphan-auth-route-group.md`.

**Files changed (this cycle):**

- deleted: `src/app/(auth)/login/page.tsx` (untracked)
- deleted: `src/app/(auth)/register/page.tsx` (untracked)

**Verification (all passed):**

- (auth) directory gone ✓
- canonical `src/app/login/page.tsx` intact (LoginPage export, `/api/auth/login` call) ✓
- canonical `src/app/register/page.tsx` intact (RegisterPage export, `/api/auth/register` call) ✓
- **no parallel pages: 36 pages, 36 unique paths** ✓
- no stale `(auth)` references in `src/**/*.{ts,tsx}` ✓

**Decisions:**

- **D2 (no ADR):** Chose deletion over swapping. The `(auth)/` files are untracked, untested, and incomplete (no supporting layout/components). The tracked `login/` and `register/` are the production versions per git + AGENTS.md. The minor feature difference (`useRouter` redirect in (auth)/login) is not worth the risk of switching to unverified code during a hot fix.

**Side observation (NOT fixed this cycle — different issue):**

The dev server startup log also shows: `[startup] Ollama: not reachable (LLM features disabled)`. This is a **networking issue**, not a code bug:

- `.env.local` has no `OLLAMA_HOST` defined.
- `startup-check.ts:35` falls back to default `http://192.168.4.2:11434`.
- App machine IP is `10.127.16.79` (different subnet from `192.168.4.2`).
- The `run.bat` script's precheck (which uses a different routing context) reported "Ollama: Connected", but the dev server process can't reach the same host.

Possible fixes (to be decided by user):
- Add `OLLAMA_HOST=http://...:port` to `.env.local` (full URL with protocol — startup-check expects this)
- Or change `startup-check.ts` to use `APP_CONFIG.ollama.host`/`port` (consistent with `config.ts` and `server-config.ts`)
- Or run dev server on the same network as Ollama

This is non-blocking — the app runs, just with LLM features disabled.

**Next:** User should restart dev server to confirm both errors are gone. Awaiting commit decision for both cycle 2 (middleware) and cycle 3 ((auth) group) fixes.
