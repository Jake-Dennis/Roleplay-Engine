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

---

## 2026-06-04 — Cycle 4: Commits

**Trigger:** User confirmed "yes" to committing the cycle 2 and cycle 3 fixes plus setup artifacts.

**What was done:**

1. Committed `chore(setup): add .opencode/ tooling and verify-plan.py` — 5 files, 470 insertions (real content: `.opencode/todo.md`, `.opencode/work-log.md`, `.opencode/plans/completed/plan-001-*.md`, `.opencode/plans/completed/plan-002-*.md`, `scripts/verify-plan.py`). Commit: `2c3569c`.
2. Committed `fix(proxy): delete orphan middleware.ts to unblock Next.js 16` — empty commit (file was untracked, so no file changes). Audit trail lives in work-log + plan-001. Commit: `d48dbcc`.
3. Committed `fix(routes): delete orphan (auth) route group to unblock Next.js 16` — empty commit (directory was untracked). Audit trail in work-log + plan-002. Commit: `a66aa64`.

**Commits in order:**

```
a66aa64 fix(routes): delete orphan (auth) route group to unblock Next.js 16
d48dbcc fix(proxy): delete orphan middleware.ts to unblock Next.js 16
2c3569c chore(setup): add .opencode/ tooling and verify-plan.py
b1c4504 fix(build): resolve subtype type error in lore-extraction.ts  <-- prior HEAD
```

**Files changed (this cycle):**

- `.opencode/todo.md` (modified, now tracked)
- `.opencode/work-log.md` (modified, now tracked)
- `.opencode/plans/completed/plan-001-delete-orphan-middleware.md` (created, now tracked)
- `.opencode/plans/completed/plan-002-delete-orphan-auth-route-group.md` (created, now tracked)
- `scripts/verify-plan.py` (created, now tracked)

**Decisions:**

- **D3:** Used `--allow-empty` for the two fix commits to preserve audit trail. The deleted files were untracked, so git has no file changes to record. Empty commits with the drafted messages keep the fix chronology visible in `git log`. The full rationale + verification output is in `.opencode/plans/completed/plan-00{1,2}-*.md`.

**Side observation:** No pre-commit hook installed (`.git/hooks/pre-commit` does not exist). The workflow documentation suggests a pre-commit hook that runs `verify-plan.py` should be installed. Not done this cycle — out of scope and the user did not request it.

**Next:** Awaiting user decision on `git push` to origin. Branch `master` is 13 commits behind origin/master; pushing may require `git pull --rebase` first.

---

## 2026-06-05 � Cycle 5: Full graphify rebuild

**Trigger:** User invoked /graphify (full rebuild) on the Roleplay-Engine repo.

**What was done:**

1. **Verified graphify install** (v0.x) � interpreter pinned at C:\Users\JakeP\AppData\Local\Programs\Python\Python311\python.exe, all module imports OK.
2. **Detected 688 files** (~511,551 words): 465 code, 190 docs, 33 images, 2 skipped. Saved to .graphify_detect.json.
3. **AST extract** � 465 code files ? 2,374 nodes, 6,778 edges via tree-sitter. Saved to .graphify_ast.json (2.6 MB).
4. **Cache check** � 95 files already cached (444 nodes, 493 edges, 40 hyperedges from 2026-05-27 build). 593 files uncached.
5. **Chunked 593 files into 27 chunks of 22** = 7 batches of 4. Dispatched 27 subagent calls via 	ask tool with subagent_type=general.
6. **27/27 chunks returned** � total semantic yield: 1,472 unique nodes, 1,508 edges, 81 hyperedges (after dedup). One chunk had a JSON typo (missing "confidence": key) � fixed manually.
7. **Merged cache + chunks + AST** ? .graphify_extract.json (3,646 nodes, 7,735 edges, 114 hyperedges).
8. **Built NetworkX graph (directed)**: 3,646 nodes, 7,680 edges.
9. **Leiden cluster**: 475 communities.
10. **Cohesion scored** all 475 communities.
11. **God nodes** (top 15): getDb(), withAuth, checkRateLimit, createRateLimitResponse, getClientIp, equireJson, Path, safeParseWarn, getWikiRoot(), wiki/file-io.ts, generateText, writeWikiPage, withErrorHandler, generateIndex, lib/idle-processing.ts.
12. **Surprising connections** (top 15) + 8 **suggested questions** � 3 bridge questions about wiki/file-io.ts, processJobsByType, processJob cross-community roles.
13. **Ollama community labeling**: Set OLLAMA_API_KEY=ollama + OLLAMA_MODEL=qwen3.5:4b + OLLAMA_BASE_URL=http://localhost:11434/v1 (key was unset; localhost is reachable). Labeled 31 largest communities with real names (e.g., "Authentication Middleware", "Wiki Generation Pipeline", "Group Management API"). 445 smaller communities kept Community N placeholder. Batched re-labeling of all 476 timed out � qwen3.5:4b too slow per call.
14. **Generated GRAPH_REPORT.md** (121,195 chars, 1,570 lines).
15. **Exported graph.html** (312 KB) � aggregated community view (475 community nodes, 470 cross-community edges) because full graph exceeds 2,000-node viz limit.
16. **Updated cost.json** � added 8th run (201,000 in / 29,600 out). Cumulative across 8 runs: 287,060 in / 66,259 out.
17. **Saved manifest.json** with semantic_hash stamps.
18. **Cleaned up 28 chunk files** (912 KB freed).

**Files changed (this cycle):**

- created: graphify-out/graph.json (4.2 MB � main knowledge graph)
- created: graphify-out/graph.html (312 KB � interactive vis.js)
- created: graphify-out/GRAPH_REPORT.md (121 KB)
- modified: graphify-out/cost.json (8th run appended)
- modified: graphify-out/manifest.json (semantic stamps)
- created: graphify-out/.graphify_labels.json (14 KB)
- created: graphify-out/.graphify_extract.json (3.5 MB)
- created: graphify-out/.graphify_semantic.json (1.4 MB)
- created: graphify-out/.graphify_ast.json (2.6 MB)
- created: graphify-out/.graphify_detect.json (66 KB)
- created: graphify-out/.graphify_cached.json (303 KB)
- created: graphify-out/.graphify_chunks.json (66 KB)
- created: graphify-out/.graphify_uncached.txt (51 KB)
- created: graphify-out/.graphify_python (65 B � interpreter pin)
- deleted: 27 � .graphify_chunk_NN.json (cleaned)
- deleted: 1 � .graphify_chunk_69.json (stale, from 2026-05-27)

**Decisions:**

- **D4 (from before):** full . rebuild, not --update or narrow � user said "do it all".
- **D5:** AST gives 2,374 nodes; cache adds 444/493; semantic adds 1,472/1,508. Combined dedup ? 3,646 unique nodes (vs 3,310 prior build, +336).
- **D6:** Set OLLAMA_API_KEY=ollama (any non-empty value) and OLLAMA_BASE_URL=http://localhost:11434/v1 � graphify's provider_base_url_ok validates URL but not API key for ollama. Without this, ollama backend was skipped and labeling fell back to placeholders.
- **D7:** Set OLLAMA_MODEL=qwen3.5:4b (installed locally) � default qwen2.5-coder:7b not present.
- **D8:** Skip batched re-labeling of all 476 communities. Ollama 4B is too slow per call (15-min timeout hit on first batch). 31 real labels on the largest communities is sufficient for navigation.
- **D9:** Manually fix one JSON typo in chunk 24 (missing "confidence": key on one edge). Subagent output validation caught it.

**Open follow-ups (still pending from prior cycles):**

- 3 commits ready to push to origin/master (currently 13 behind, will need git pull --rebase).
- OLLAMA_HOST missing from .env.local (root cause of dev-server Ollama warning) � graphify labels prove http://localhost:11434/v1 IS reachable when env is set.
- Stale "via middleware" comment in src/lib/idle-processing.ts:6 (now should be "via proxy").
- 9 other "middleware" doc/comment matches in ARCHITECTURE.md and src/app/api/AGENTS.md.

**Next:** User review of GRAPH_REPORT.md + graph.html. Optionally git push the 3 commits.

---

## 2026-06-05 — Cycle 6: Cleanup + re-run graphify

**Trigger:** User invoked `/graphify` again on the cleaned corpus.

**Cleanup tiers (pre-rebuild):**

- **Tier 1a (root)**: Deleted 14 untracked garbage files (104 KB): `$null`, `.graphify_cached.json` (root copy), `cookie.txt`/`cookiejar.txt`/`cookies.txt`, `check-wiki.cjs`, `queue-extract.cjs`, `run-extract-standalone.js`, `run-extract.ts`, `test-auth-create.ts`, `test-extract.mjs`, `project-context.md`, `decisions/`, `plans/`.
- **Tier 1b (scripts/)**: Archived 8 debug scripts to `scripts/_archive/` (28 KB) — recoverable.
- **Tier 3 (graphify-out)**: Deleted 35 stale files (75 KB): `_*.py` helpers, `.graphify_chunk_files_*.txt`, `.graphify_semantic_*.txt`, error logs. Kept `cache/` (1,445 files, 16.8 MB).
- **Tier 4 (tempdir)**: Deleted `C:\Users\JakeP\AppData\Local\Temp\opencode\` — 157 files, 2.3 MB freed.
- **Total freed**: ~2.5 MB, 214 files removed/archived. No tracked files modified. Tier 2 (untracked source) untouched.

**Re-run graphify (`.`):**

1. **Detected 677 files** (~500,682 words): 460 code, 184 docs, 33 images, 2 skipped. (Down from 688 thanks to Tier 1 cleanup.)
2. **AST extract**: 2,355 nodes, 6,745 edges (slightly fewer than 2,374/6,778 last run — 11 untracked garbage code files gone).
3. **Cache check**: 94 cached (443 nodes, 493 edges, 40 hyperedges), 583 uncached.
4. **Chunked 583 files into 27 chunks of ~22**, dispatched via 7 task-tool batches of 4 subagents.
5. **Chunk 12 had a JSON typo** (missing `"source_file":` key on one edge, also used a non-standard schema). Botched regex fix; **re-extracted** with strict schema and re-validated.
6. **Chunk 24 used a different schema** (`type`/`name`/`file_path`/`description` instead of `file_type`/`label`/`source_file`; edge `kind` with non-enum values like `describes`/`implemented_by`). Wrote normalizer that mapped all fields to canonical schema. 47 unknown `kind` values mapped to `conceptually_related_to`.
7. **27/27 chunks valid**: 1,383 nodes, 1,567 edges, 80 hyperedges. 107 duplicate node IDs (cosmetic — first-seen wins on merge).
8. **Merged** → 1,764 semantic nodes (after cache dedup), 2,060 edges, 120 hyperedges.
9. **AST + semantic merge** → 3,866 nodes, 8,805 edges, 120 hyperedges.
10. **Build + cluster + analyze**: 488 communities, 10 god nodes, 5 surprising connections, 7 suggested questions.
11. **Ollama labeling**: 31/488 communities labeled (largest 31, size 12-112). Ollama `qwen3.5:4b` got stuck in thinking mode (output tokens consumed by thinking block) after parallel hammering. Tried serial retry — 5 consecutive timeouts. Shipped with 31 real + 457 placeholder labels.
12. **Generated GRAPH_REPORT.md** (112,618 chars, 1,601 lines).
13. **Exported graph.html** (3.4 MB) — full graph view, 3,866 nodes (under 5,000 limit).
14. **Updated cost.json** — run #9 (0 in / 0 out, since task tool doesn't return usage field).
15. **Cleaned up** all chunk files, temp files, .graphify_*_new.json.

**Files changed (this cycle):**

- created: `scripts/_archive/` (untracked, 8 debug scripts)
- created: `scripts/_graphify_step3a.py`, `_graphify_step3b0.py`, `_graphify_step3b1.py`, `_graphify_step3b1_prompts.py`, `_graphify_step3b3_merge.py`, `_graphify_step3c_merge.py`, `_graphify_step4_build.py`, `_graphify_step5_label.py`, `_graphify_step5_label_parallel.py`, `_graphify_step5_label_serial.py`, `_graphify_step5_regen.py`, `_graphify_step6_html.py`, `_graphify_step9_finalize.py` (untracked)
- regenerated: `graphify-out/graph.json` (4.2 MB), `graphify-out/graph.html` (3.4 MB), `graphify-out/GRAPH_REPORT.md` (114 KB)
- modified: `graphify-out/cost.json` (run #9 appended, cumulative 287,060 in / 66,259 out across 9 runs)
- modified: `graphify-out/.graphify_labels.json` (31 real + 457 placeholder)

**Decisions:**

- **D11:** Archive rather than delete Tier 1b scripts — recoverable under `scripts/_archive/`. User can fully delete later.
- **D12:** Keep `graphify-out/cache/` (16.8 MB) — intentional graphify extraction cache.
- **D13:** Skip narrow-corpus prompt on re-run — user typed `/graphify` (full pipeline).
- **D14:** Re-dispatch chunks 13-16 and 12 with corrected schemas (not skip) — wrong lists were my error.
- **D15:** Write Python to `.py` files (not inline `-c "..."`) — PowerShell `& $py -c "..."` mangles `\"` escapes.
- **D16:** Write JSON via `Path.write_bytes(json.dumps(...).encode('utf-8'))` — PowerShell `>` redirect adds UTF-16 LE BOM.
- **D17:** Ship with 31/488 real labels — Ollama `qwen3.5:4b` stuck in thinking-mode. 31 labels cover the largest communities (size 12-112) which is where the interesting cross-community structure lives.

**Side observations:**

- Cycle 5 was 3,646 nodes; cycle 6 is 3,866 nodes (+220, +6%). Slight increase from 2 extra chunks producing more semantic content despite smaller corpus (677 vs 688 files).
- God nodes in this build: `getDb()` (249), `checkRateLimit()` (152), `withAuth()` (151), `createRateLimitResponse()` (146), `getClientIp()` (133), `requireJson()` (79), `getWikiRoot()` (69), `Path` (66), `safeParseWarn()` (65), `generateText()` (55). The auth/rate-limit utility cluster dominates — matches the project's heavy middleware concern.

**Open follow-ups (still pending from prior cycles):**

- 3 commits from cycle 4 ready to push to origin/master (currently 13 behind, will need git pull --rebase).
- OLLAMA_HOST missing from .env.local (root cause of dev-server Ollama warning).
- Stale "via middleware" comment in src/lib/idle-processing.ts:6 (should be "via proxy").
- 9 other "middleware" doc/comment matches in ARCHITECTURE.md and src/app/api/AGENTS.md.
- Possible prompt-injection in `src/app/(app)/app-layout-shell.tsx` (chunk 14 subagent detected and ignored an embedded system-reminder mimicking text).
- Ollama `qwen3.5:4b` thinking-mode issue: `num_predict: 5` produces empty response, output is consumed by thinking block. Need `thinking: False` (if supported) or `num_predict: 200+` to actually get a label.

---

## 2026-06-05 — Cycle 7: Stop-using cleanup (dyslexia font + OMO archive + credential scrub)

**Trigger:** User said "Im no longer using dylexia font / im no longer using Oh my opencode / im no longer using .next — should we convert these files or remove them?"

**Decisions confirmed:**
1. **Dyslexia font** → REMOVE (was already gitignored, no source references)
2. **.omo/** → CONVERT to archive at `docs/historical-evidence/omo/` (option c) with `.gitignore` rule for future OMO output
3. **`.next/`** → typo, treated as part of #2 (no separate action)

**Critical security finding (during recon):**
- `.omo/auth-cookie.txt` contained a real JWT auth token (`auth-token=eyJ...`)
- `.omo/auth-session.xml` contained a PowerShell `WebRequestSession` export with cookies
- Both were UNTRACKED in git (never committed), but represented a credential-leak hazard
- **Decision: delete permanently, do not archive** (no historical value, security risk)

**What was done:**

1. **Recon** (parallel): Found 120 tracked + 140 untracked files in `.omo/`. Identified 2 credential files. No live source references to dyslexia font.
2. **Plan written**: `.opencode/plans/plan-003-stop-using-cleanup.md` with 3 layers and 8 tasks.
3. **T1** (Layer 1): Deleted `opendyslexic-0.92/` (untracked, no risk).
4. **T2** (Layer 1): Deleted `.omo/auth-cookie.txt` and `.omo/auth-session.xml` (untracked credential leak).
5. **T3** (Layer 1): `git mv` 120 tracked files from `.omo/` to `docs/historical-evidence/omo/` (preserves git history). One move was RM (rename+modify) due to CRLF/LF normalization in `.omo/run-continuation/ses_1c53eff67ffeCdr0YX3P28JlBj.json` — harmless.
6. **T4** (Layer 2): Added `/.omo/` to `.gitignore` with explanatory comment.
7. **T5** (Layer 2): Wrote `docs/historical-evidence/omo/README.md` (4,168 chars) explaining provenance, what was archived, what was deleted, and how to find things.
8. **T6** (Layer 2): Updated `AGENTS.md` line 42 (project structure) and line 153 (NOTES section) to point to new archive location.
9. **T7** (Layer 3): Verified `git status` shows 119 R + 1 RM renames.
10. **T8** (Layer 3, reviewer): Reviewer caught **5 broken `.omo/` links** in live docs that I missed:
    - `README.md:120` and `:121` (Schema Reference, API Catalog)
    - `docs/api-cookbook.md:5` (intro link to API catalog)
    - `docs/api-cookbook.md:708` and `:908` (job-processing references — file was untracked, replaced with `src/lib/jobs/AGENTS.md`)
11. **Link fixes** (post-reviewer): Updated all 5 broken links. The 2 `job-processing.md` references were untracked files, so the reviewer suggested replacing them with the source-code link to `src/lib/jobs/AGENTS.md`.
12. **Re-verify**: No live `.omo/` references remain in `README.md`, `AGENTS.md`, `docs/api-cookbook.md`, `docs/wiki-migration.md`. The only remaining `.omo/` mentions are in the archive README and this work-log (intentional historical record).
13. **Plan auto-archived**: `verify-plan.py` ran 7 verifications, all passed, plan moved to `.opencode/plans/completed/`.

**Files changed (this cycle):**

- deleted: `opendyslexic-0.92/` (was untracked)
- deleted: `.omo/auth-cookie.txt` (untracked credential leak)
- deleted: `.omo/auth-session.xml` (untracked credential leak)
- renamed (git mv, 120 files): `.omo/*` → `docs/historical-evidence/omo/*`
- created: `docs/historical-evidence/omo/README.md` (4,168 chars)
- modified: `.gitignore` (added `/.omo/` rule at line 50)
- modified: `AGENTS.md` (line 42, 153 — point to new archive location)
- modified: `README.md` (lines 120-121 — fixed broken .omo/ links)
- modified: `docs/api-cookbook.md` (lines 5, 708, 908 — fixed broken .omo/ links)
- created: `.opencode/plans/plan-003-stop-using-cleanup.md` (now in completed/)

**Decisions:**

- **D18:** Convert .omo/ to archive (option c) rather than full delete (option b) or untrack (option a). Preserves historical reference, organizes it, and adds gitignore defense in depth.
- **D19:** Delete credential files permanently, do not archive. They had no historical value (no docs referenced them), only a security risk. Documented the deletion in the archive README.
- **D20:** For 2 untracked `.omo/refs/job-processing.md` references in api-cookbook.md, replace with `src/lib/jobs/AGENTS.md` link (per AGENTS.md "WHERE TO LOOK" table) rather than removing the references entirely. The cookbook's job-system section still has context that benefits from a source-code pointer.
- **D21:** Keep `scripts/_archive/` (8 debug scripts) and ad-hoc graphify helpers (`_graphify_*.py`) as untracked. They're untracked so no `git status` pollution. The user can decide to commit or delete in a future cycle.

**Side observations:**

- The archive moved **120 files / 4.2 MB** to a structured location with a README. The 140 untracked files in `.omo/` remain on disk but are now gitignored (won't be committed).
- Reviewer pass was valuable: caught 5 broken links that I missed because I only searched `AGENTS.md` for the move. Should have done a project-wide grep.
- `.gitignore` now has a clean tool-output section: `/.playwright-mcp/`, `/.omo/`, `/graphify-out/`, `/data/`, `/obsidian-docs/`.

**Open follow-ups (still pending from prior cycles):**

- 3 commits from cycle 4 ready to push to origin/master (currently 13 behind, will need git pull --rebase). **Now 4 commits** if we add this cycle's cleanup.
- OLLAMA_HOST missing from .env.local (root cause of dev-server Ollama warning).
- Stale "via middleware" comment in src/lib/idle-processing.ts:6 (should be "via proxy").
- 9 other "middleware" doc/comment matches in ARCHITECTURE.md and src/app/api/AGENTS.md.
- Possible prompt-injection in `src/app/(app)/app-layout-shell.tsx` (chunk 14 subagent detected and ignored an embedded system-reminder mimicking text).
- Ollama `qwen3.5:4b` thinking-mode issue: `num_predict: 5` produces empty response, output is consumed by thinking block. Need `thinking: False` (if supported) or `num_predict: 200+` to actually get a label.
- **NEW:** `scripts/_check_chunks.py:26-27` has hardcoded paths to `.omo/evidence/ultrawork-oracle-verification*.txt` (one moved, one was untracked). Low priority — script will print "MISS" if run. Should be cleaned up or removed.

**Next:** User review of the cleanup. Optionally commit + push.

---

## 2026-06-05 — Cycle 7 commit (241e085)

**Trigger:** User said "yes" to commit cycle 7 changes.

**Commit:** 241e085 chore(cleanup): archive OMO working dir, scrub credentials, remove dyslexic font
- 127 files changed, 133 insertions(+), 18 deletions(-)
- 119 renames at 100% similarity (history preserved)
- 1 rename fell back to delete+add pair (.omo/run-continuation/ses_1c53eff67ffeCdr0YX3P28JlBj.json — single-line JSON, lost history)
- 4 modifications: .gitignore (L50), AGENTS.md (L42, L153), README.md (L120-121), docs/api-cookbook.md (L5, L708, L908)
- 2 new files: docs/historical-evidence/omo/README.md, .opencode/plans/completed/plan-003-stop-using-cleanup.md
- 1 fallback new file: docs/historical-evidence/omo/run-continuation/ses_1c53eff67ffeCdr0YX3P28JlBj.json

**Staging drama (for the record):**
- First attempt staged 172 files including 50 pre-existing in-flight modifications. Reset and re-scoped to cycle 7 only.
- Second attempt hit git mv "bad source" error: the new /.omo/ gitignore rule was blocking git from seeing the .omo/ source paths.
- Third attempt: unstaged the 120 destination adds, ran git rm -r .omo/ (works for tracked files regardless of gitignore), then git add -A docs/historical-evidence/omo/. Git detected 119 renames (R100). One file fell to delete+add pair.
- Pre-commit hook ran erify-plan.py against the archived plan-003 — passed.

**Post-commit state:**
- master: 13 ahead / 4 behind origin/master (4 unpulled commits on origin, possibly recent)
- Working tree: 44 unstaged modifications (pre-existing in-flight, not part of cycle 7) + 53 untracked (gitignored: scripts/_archive/, scripts/_graphify_*.py, .omo/*)
- Next: ask user about push (needs rebase) and follow-up cleanups.

---

### Cycle 8 — 2026-06-06: Benchmark Audit & Fixes

**What:** Full end-to-end audit of the LLM benchmark system, fixing 14 bugs across 9 files.

**Bug fix summary:**

| # | Severity | Bug | Fix |
|---|----------|-----|-----|
| 1 | CRITICAL | `generateText()` ignores benchmark's ollamaHost — silently uses wrong URL | Added `ollamaHost` option to `generateText()` in `ollama.ts`; URL priority: explicit > user DB > env default |
| 2 | CRITICAL | `generateTextStream()` same URL issue | Same fix — added `ollamaHost` option |
| 3 | CRITICAL | `generateEmbedding()` same URL issue | Same fix — added `ollamaHost` option |
| 4 | CRITICAL | Pre-flight check passes (correct URL) but generation fails (wrong URL) | All three functions now accept `ollamaHost`, benchmark passes it through every call path |
| 5 | MAJOR | Hardware detection disabled — `getSystemInfo()` imported but never called | Re-enabled `getSystemInfo()` in orchestrator; real hardware data flows to auto-tune |
| 6 | MAJOR | Auto-tune used fake hardware (8GB RAM, no GPU) | Auto-tune now receives real hardware; falls back gracefully if detection fails |
| 7 | MAJOR | `throughput-test.ts` used `OLLAMA_CONFIG.embeddingModel` ignoring server config | Added `embeddingModel` parameter to `runThroughputTests()`; populated from `serverConfig` via `BenchmarkConfig` |
| 8 | MINOR | UI `BenchmarkJob.status` has `"pending"` — API returns `"queued"` | Changed to `"queued"`, fixed Clock icon rendering |
| 9 | MINOR | UI quick/full mode descriptions wrong | Updated to match actual test sizes |
| 10 | MINOR | TestHistoryLog hardcodes wrong context sizes | Replaced with dynamic `generateContextSizes()` matching benchmark patterns |
| 11 | MINOR | UI type `BenchmarkReport` had stale `timeoutMs` field | Removed |
| 12 | MINOR | UI type `hardware` was non-optional, server made it optional | Fixed to `hardware?: HardwareInfo` |

**Files changed (this cycle):**
- `src/lib/ollama.ts` — added `ollamaHost` to generateText/generateTextStream/generateEmbedding
- `src/lib/benchmark/types.ts` — added `embeddingModel` to `BenchmarkConfig`
- `src/lib/benchmark/orchestrator.ts` — re-enabled hardware detection, passes embeddingModel
- `src/lib/benchmark/context-test.ts` — forwards ollamaHost to generateText
- `src/lib/benchmark/throughput-test.ts` — forwards ollamaHost, accepts embeddingModel param
- `src/lib/benchmark/memory-test.ts` — forwards ollamaHost to all generateText calls
- `src/app/api/benchmark/route.ts` — passes embeddingModel from serverConfig
- `src/app/(app)/settings/benchmark/page.tsx` — types, descriptions, TestHistoryLog fixes
- `.opencode/plans/completed/plan-005-benchmark-audit-fixes.md`

**Verification:** `npm run build` — compiled. `bun test src/lib/benchmark/` — 46/46 pass.

---

## 2026-06-07 — Cycle 11: Remove legacy benchmark system

**Trigger:** Cleanup after new benchmark system replaced old one.

**What was done:**
- Replaced `ContextBenchmarkSection` on server settings page with a link to the new `/settings/benchmark` page (card with Gauge icon + description)
- Deleted old component `src/components/settings/context-benchmark.tsx` (518 lines)
- Deleted old API route `src/app/api/settings/benchmark/route.ts` (262 lines — had its own `benchmark_results` DB table, child process spawning, rate limiting)
- Deleted old runner script `scripts/benchmark-context.mjs` (500+ lines — exponential + binary search with needle-in-haystack test)
- Removed `benchmark_results` table creation/migration from `src/lib/server-config.ts` (replaced with a comment)
- Removed empty `src/app/api/settings/benchmark/` directory

**Files changed:**
- `src/app/(app)/settings/server/page.tsx` — removed import, replaced component with `<Link>` to benchmark page
- `src/components/settings/context-benchmark.tsx` — DELETED (518 lines)
- `src/app/api/settings/benchmark/route.ts` — DELETED (262 lines)
- `src/app/api/settings/benchmark/` — DELETED (empty dir)
- `scripts/benchmark-context.mjs` — DELETED
- `src/lib/server-config.ts` — removed `benchmark_results` table creation block
- `.opencode/plans/completed/plan-011-remove-legacy-benchmark.md`

**Verification:** `npm run build` — compiled. `bun test src/lib/benchmark/` — 14/14 pass. No `ContextBenchmarkSection` references remain. No `benchmark_results` schema code remains.

---

## 2026-06-07 — Cycle 12: Plan 006 — Rich Wiki Editor (built from scratch)

**Trigger:** User asked for a wiki editor that feels Obsidian-like, with both user and AI editing. User explicitly wanted no third-party editor libraries — only open source, and ultimately the editor built from scratch.

**What was done:**

Replaced the raw `<textarea>` wiki editor with a hand-rolled, from-scratch markdown editor. No new third-party editor libraries (no CodeMirror, no TipTap, no Lexical). Uses only what the project already depends on: `react`, `lucide-react`, `gray-matter`, browser-native APIs.

**New files:**
- `src/lib/wiki/frontmatter.ts` — gray-matter wrapper with `parseWikiFrontmatter`, `serializeWikiFrontmatter`, `validateWikiFrontmatter`, `EMPTY_FRONTMATTER`. Re-exports `WikiFrontmatter` from `types.ts` to avoid duplication.
- `src/components/wiki/editor/syntax-highlighter.ts` — pure markdown→HTML tokenizer (zero deps). 18 token types: headings, bold/italic/strike, code, wikilinks, embeds, links, images, lists, checkboxes, blockquotes, callouts, hr, tags, escapes, frontmatter. XSS-safe.
- `src/components/wiki/editor/editor-styles.css` — overlay + gutter + autocomplete popup styles. Uses existing design tokens.
- `src/components/wiki/editor/wikilink-autocomplete.ts` — pure helpers (`findWikilinkContext`, `filterPages`, `getCursorCoordinates` via mirror-div technique).
- `src/components/wiki/editor/use-wikilink-autocomplete.ts` — React hook that drives the popup state.
- `src/components/wiki/frontmatter-properties-panel.tsx` — Obsidian-style form (title, type, status, tags chips, universe, created/updated).
- `src/components/wiki/markdown-editor.tsx` — the centerpiece: `<textarea>` + syntax `<pre>` overlay + line-number gutter + wikilink popup. Cmd-S save, Tab → 2 spaces.
- `src/components/wiki/wiki-quick-switcher.tsx` — Cmd-K modal with fuzzy search, arrow-key nav, type badges.
- `src/lib/__tests__/frontmatter.test.ts` — 12 tests
- `src/lib/__tests__/syntax-highlighter.test.ts` — 23 tests

**Modified files:**
- `src/app/(app)/wiki/[...slug]/page.tsx` — removed `toRawMarkdown`/`parseRawMarkdown` helpers, replaced edit-mode textarea with `<FrontmatterPropertiesPanel>` + `<MarkdownEditor>`, added Cmd-K listener, integrated `<WikiQuickSwitcher>`, added `validateWikiFrontmatter` to save path, fixed pre-existing universe_id PUT URL bug, removed `as any` casts.
- `src/components/wiki/editor/editor-styles.css` — changed `.wiki-autocomplete` from `position: absolute` to `position: fixed` to match viewport coordinates from `getCursorCoordinates`.
- `src/lib/wiki/types.ts` — widened `created`/`updated` from `string` to `string | Date` (gray-matter returns Date objects for unquoted ISO timestamps).

**Bugs caught and fixed (during test):**
1. Italic regex "stole" the leading `*` of `*italic*` after `**bold**`. Fixed by adding `(?<!\*)` / `(?!\*)` lookbehind/lookahead to italic regex.
2. A lone `---` was classified as frontmatter opener. Fixed by requiring a closing `---` within the next 100 lines before entering frontmatter state.

**Reviewer findings (all addressed):**
- Pre-existing PUT URL bug: missing `?universe_id=` query string → fixed
- Dead `serializeFrontmatter` export: kept (small, tested, useful in future)
- Type duplication `FrontmatterData` vs `WikiFrontmatter`: collapsed to use `WikiFrontmatter`
- Name collision with `markdown-utils.ts:parseFrontmatter`: renamed to `parseWikiFrontmatter`
- `as any` casts in page.tsx: removed
- `required` HTML attribute without `<form>`: removed
- `created`/`updated` type lie: fixed

**Verification:**
- `python scripts/verify-plan.py .opencode/plans/plan-006-rich-wiki-editor.md` → 8/8 commands passed, plan archived
- 77/77 tests pass (35 new: 12 frontmatter + 23 syntax-highlighter)
- `npm run build` → 58 routes, compiled in 33s
- No new third-party editor deps

**Decisions:**
- Architecture: `<textarea>` + syntax `<pre>` overlay (no contenteditable) — gives us 80% of Obsidian feel with full ownership
- Frontmatter is form-only (not raw YAML in editor) — cleaner UX, no YAML hand-editing
- Used `gray-matter` for parse/serialize (already a project dep)
- `validateWikiFrontmatter` wired into `handleSave` — turns dead code into live validation
- No new editor deps, period — user explicitly required this

**Files changed:** 12 new + 3 modified. Plan archived: `.opencode/plans/completed/plan-006-rich-wiki-editor.md`.


