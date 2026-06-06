# Roleplay-Engine — OpenCode Todo

Persistent cross-session task checklist. Updated by the conductor before, during, and after each work cycle.

**Last updated:** 2026-06-05 (cycle 7 committed: 241e085, 127 files, 119/120 renames preserved)
**Status:** Plan 003 committed (`241e085`). 4 local commits ahead of `origin/master` (3 from cycle 4 + 1 from cycle 7). `origin/master` is 4 commits ahead (needs pull --rebase before push).

---

## Active Work

_No active work. Use this section to track ongoing multi-step tasks. Format:_

```
## [YYYY-MM-DD] <task title>
- [ ] step 1 (assigned: @agent)
- [ ] step 2 (assigned: @agent)
  - depends on: step 1
```

---

## Backlog

_Items discovered but not yet scheduled. Move into "Active Work" with a date when picked up._

- `git pull --rebase` + `git push` the 4 local commits (`2c3569c` setup, `d48dbcc` middleware, `a66aa64` auth route, `241e085` cycle 7 cleanup). `origin/master` is 4 commits ahead of local; rebase will likely auto-merge.
- **Decide on `scripts/_graphify_*.py` and `scripts/_archive/`** — currently untracked. Should they be moved to `scripts/_graphify/` and committed as a tool subdir, or deleted?
- Fix stale "via middleware" comment in `src/lib/idle-processing.ts:6` → "via proxy". 9 other matches in `ARCHITECTURE.md` and `src/app/api/AGENTS.md`.
- Add `OLLAMA_HOST=http://localhost:11434/v1` to `.env.local` (root cause of dev-server Ollama warning). Proved reachable from graphify label pass.
- Batch-label remaining 457 placeholder communities — Ollama `qwen3.5:4b` got stuck in thinking mode (output tokens consumed by thinking block). Need `thinking: False` option or larger `num_predict` to actually get labels.
- **Security review of `src/app/(app)/app-layout-shell.tsx`** — chunk 14 subagent detected and ignored embedded system-reminder mimicking text (suspected prompt injection). Independent of cleanup cycle.
- **Clean up `scripts/_check_chunks.py:26-27`** — has hardcoded paths to `.omo/evidence/ultrawork-oracle-verification*.txt` that no longer exist. Low priority, script will print "MISS".
- **Delete empty `.omo/` directory** — currently has 140 untracked files (gitignored). User can `rm -rf .omo/` once they're confident the archive commit is safe.

---

## Recently Completed

- 2026-06-05 — **Commit `241e085`**: cycle 7 cleanup committed (127 files, 119/120 renames preserved, 1 file fell to delete+add pair). Pre-commit hook verified plan-003.
- 2026-06-05 — Plan 003: Stop-using cleanup. Deleted `opendyslexic-0.92/`, deleted 2 untracked credential files in `.omo/` (auth-cookie.txt, auth-session.xml), `git mv` 120 tracked files to `docs/historical-evidence/omo/`, added `/.omo/` to `.gitignore`, wrote archive README (4,168 chars), updated `AGENTS.md` + 5 broken doc links. Plan: `plan-003-stop-using-cleanup.md` (archived).
- 2026-06-05 — Cleanup Tiers 1-4 + re-run `/graphify`. 688 → 677 files, 3,866 nodes, 7,757 edges, 488 communities. 31 communities labeled by ollama. Outputs: `graphify-out/graph.json` (4.2 MB), `graphify-out/graph.html` (3.4 MB), `graphify-out/GRAPH_REPORT.md` (114 KB, 1,601 lines).
- 2026-06-05 — Cycle 5: Full `/graphify` knowledge-graph rebuild (688 files → 3,646 nodes).
- 2026-06-04 — Delete orphan `src/app/(auth)/` route group (Next.js 16 parallel-pages error). Plan: `plan-002-delete-orphan-auth-route-group.md` (archived).
- 2026-06-04 — Delete orphan `src/middleware.ts` (Next.js 16 proxy migration). Plan: `plan-001-delete-orphan-middleware.md` (archived).
- 2026-06-04 — Project setup workflow (detect type, verify git, build graphify, create `.opencode/`, `.gitignore`, `verify-plan.py`, README)

## Backlog (discovered, not yet scheduled)

- Ollama connectivity — `[startup] Ollama: not reachable (LLM features disabled)`. Root cause: `.env.local` has no `OLLAMA_HOST`, app defaults to `http://192.168.4.2:11434` which is unreachable from `10.127.16.79` subnet. Needs `OLLAMA_HOST` set in `.env.local` (full URL) or `startup-check.ts` should use `APP_CONFIG.ollama`. **Verified reachable on `http://localhost:11434/v1`** during graphify label pass (just need env var). Non-blocking but disables LLM features.
