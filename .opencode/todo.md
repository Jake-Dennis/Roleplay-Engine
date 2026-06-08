# Roleplay-Engine — OpenCode Todo

Persistent cross-session task checklist. Updated by the conductor before, during, and after each work cycle.

**Last updated:** 2026-06-07 (Plan 006 VERIFIED 8/8 — rich wiki editor from-scratch, archived)
**Status:** Plan 006 archived. Awaiting commit + push decision.

---

## Active Work

## [2026-06-08] Cycle 15: Hotfix — URL slug 404 regression (committed 3b57cca; uncommitted pending push)
- Removed `.replace(/_/g, '-')` from 3 URL generation sites (file-tree.tsx, wiki/page.tsx, wiki/[...slug]/page.tsx) — URLs now mirror on-disk filename exactly.
- 89/89 tests pass, build clean.
- See `.opencode/work-log.md` Cycle 15 for full postmortem.

## [2026-06-08] Plans 008/009/010 written (wiki "ever evolving" evolution)
- **Plan 008: Wiki Type Registry** — move subtype definitions from code into `.wiki-config.json`, LLM prompts read the registry at runtime. 8 tasks, 3 layers.
- **Plan 009: Subtype Folder Structure** — 2-level folder mapping (`entities/characters/`, `concepts/events/`, etc.) + one-time migration. 8 tasks, 3 layers. Depends on 008.
- **Plan 010: Evolution Tooling** — bulk-move, bulk-recategorize, merge-duplicates, dormancy, admin panel, new job. 10 tasks, 3 layers. Depends on 008 + 009.
- Recommended execution order: 008 → 009 → 010. Plans ready; awaiting user go-ahead.



---

## Backlog
_Items discovered but not yet scheduled._

- **Plan 007: AI wiki editing** — selection toolbar (Rewrite/Expand/Summarize/Improve on text select), page header buttons (Enrich/Deepen/Generate Rumors), create-page-from-prompt modal. Reuse existing job system + the new frontmatter utility. From-scratch UI.
- **Plan 008/009/010: Wiki evolution** — see Active Work above. Awaiting user go-ahead to execute in order 008 → 009 → 010.
- `git pull --rebase` + `git push` the 5 local commits (2c3569c, d48dbcc, a66aa64, 241e085, 3b57cca + uncommitted Cycle 15 hotfix).
- **Decide on `scripts/_graphify_*.py` and `scripts/_archive/`** — currently untracked.
- Fix stale "via middleware" comment in `src/lib/idle-processing.ts:6` → "via proxy". 9 other matches in `ARCHITECTURE.md` and `src/app/api/AGENTS.md`.
- Add `OLLAMA_HOST=http://localhost:11434/v1` to `.env.local` (root cause of dev-server Ollama warning).
- Batch-label remaining 457 placeholder communities — Ollama `qwen3.5:4b` got stuck in thinking mode.
- **Security review of `src/app/(app)/app-layout-shell.tsx`** — chunk 14 subagent detected prompt-injection-like embedded system-reminder.
- **Clean up `scripts/_check_chunks.py:26-27`** — hardcoded paths to `.omo/evidence/...` that no longer exist.
- **Delete empty `.omo/` directory** — 140 untracked files (gitignored).

---

## Recently Completed

### Plan 006: Rich Wiki Editor from-scratch (archived 2026-06-07)
- 12 new files + 3 modified. Hand-rolled markdown editor with syntax highlighting, wikilink autocomplete, frontmatter properties panel, Cmd-K quick switcher. Zero new editor deps. 35 new tests, 77/77 pass, build clean, verify-plan 8/8. Plan archived.

### Plan 005: Jobs Model (archived 2026-06-07)
- Added `ollama_job_model` + `ollama_use_jobs_model` to `server_config`. `getActiveJobModel(userId)` resolver. 27 call sites in 11 files. UI: Briefcase icon + toggle + model dropdown. 5 test cases. 42/42 tests pass. Plan archived.

### Prior plans
- 2026-06-05 — **Commit `241e085`**: cycle 7 cleanup (127 files, 119/120 renames preserved). Plan 003 archived.
- 2026-06-05 — Plan 003: Stop-using cleanup. Archived OMO evidence to `docs/historical-evidence/omo/`.
- 2026-06-05 — Cleanup Tiers 1-4 + `/graphify` rebuild. 688 → 677 files, 3,866 nodes, 488 communities.
- 2026-06-05 — Cycle 5: Full `/graphify` knowledge-graph rebuild.
- 2026-06-04 — Delete orphan `src/app/(auth)/` route group. Plan 002 archived.
- 2026-06-04 — Delete orphan `src/middleware.ts` (Next.js 16 proxy). Plan 001 archived.
- 2026-06-04 — Project setup workflow.
