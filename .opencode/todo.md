# Roleplay-Engine — OpenCode Todo

Persistent cross-session task checklist. Updated by the conductor before, during, and after each work cycle.

**Last updated:** 2026-06-04 (initial setup)
**Status:** Project setup complete. Awaiting next task.

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

- (none)

---

## Recently Completed

- 2026-06-04 — Delete orphan `src/app/(auth)/` route group (Next.js 16 parallel-pages error). Plan: `plan-002-delete-orphan-auth-route-group.md` (archived).
- 2026-06-04 — Delete orphan `src/middleware.ts` (Next.js 16 proxy migration). Plan: `plan-001-delete-orphan-middleware.md` (archived).
- 2026-06-04 — Project setup workflow (detect type, verify git, build graphify, create `.opencode/`, `.gitignore`, `verify-plan.py`, README)

## Backlog (discovered, not yet scheduled)

- Ollama connectivity — `[startup] Ollama: not reachable (LLM features disabled)`. Root cause: `.env.local` has no `OLLAMA_HOST`, app defaults to `http://192.168.4.2:11434` which is unreachable from `10.127.16.79` subnet. Needs `OLLAMA_HOST` set in `.env.local` (full URL) or `startup-check.ts` should use `APP_CONFIG.ollama`. Non-blocking but disables LLM features.
