# Roleplay-Engine — OpenCode Todo

Persistent cross-session task checklist. Updated by the conductor before, during, and after each work cycle.

**Last updated:** 2026-06-08 (Plan 023 completed and committed)

---

## Active Work

(none)

## Recently Completed

### Plan 023: AI Wiki Editing UI + Cleanup (committed as `67afc28`)
- **Layer 1 — Cleanup:** Fixed "via middleware" comment, added OLLAMA_HOST to .env.local, deleted `.omo/` directory, deleted orphan `_graphify_*.py` and `_archive/` scripts, fixed `_check_chunks.py`, security review of `app-layout-shell.tsx`
- **Layer 2 — 8 new API endpoints:** `text/{rewrite,expand,summarize,improve,generate}`, `enrich`, `deepen`, `generate-rumors`
- **Layer 3 — 3 new UI components:** `create-from-prompt-modal.tsx`, `selection-toolbar.tsx`, `wiki-ai-header-buttons.tsx`
- **Layer 4 — Integration:** Wiki page header buttons, MarkdownEditor textareaRef passthrough, 5 new prompt templates
- **Build:** ✓ Compiled, TypeScript clean, 103 routes, 17 files staged, commit `67afc28`

## Backlog

(none — all items completed)

---

## Completed Plans History

- 2026-06-08 — **Plan 023**: AI Wiki Editing UI + Cleanup (`67afc28`)
- 2026-06-07 — **Plan 006**: Rich Wiki Editor (archived)
- 2026-06-07 — **Plan 005**: Jobs Model (archived)
- 2026-06-06 — **Plans 011-022**: All archived
- 2026-06-05 — **Plans 001-004**: All archived
