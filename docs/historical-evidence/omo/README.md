# Historical OMO Archive

This directory is the **archived contents of the original `.omo/` working directory**, which held artifacts produced by OMO (Oh My OpenCode) — the AI agent workflow tool that was used during the early development of Roleplay-Engine.

## Why this archive exists

On **2026-06-05**, OMO was retired. The contents of `.omo/` were moved here via `git mv` to:

1. **Preserve the historical record** of the OMO workflow (plans, evidence, drafts, refs, archived scripts).
2. **Stop tracking future OMO output** — `.omo/` is now in `.gitignore`. Any new OMO artifacts created locally will stay untracked.
3. **Keep these files versioned** — the 120 files in this archive retain their git history (parent commits, blame, etc.) thanks to `git mv`.

## What was archived

| Subdirectory | Contents | Why kept |
|---|---|---|
| `archived-scripts/` | One-off TypeScript/JS migration scripts and phase tests from OMO workflow runs | Useful reference for the migrations they performed |
| `drafts/` | Markdown drafts (UI splits, plans) that were either implemented or abandoned | Historical context for design decisions |
| `evidence/` | Per-task and per-wave verification evidence (text logs, JSON snapshots, QA screenshots) | Audit trail for what was checked during multi-task waves |
| `notepads/` | Session "learnings" markdown files for various audit/remediation plans | Context that fed into subsequent plans and decisions |
| `plans/` | Markdown plans (architecture remediation, audit fixes, wiki/chat/UX plans) | The thinking that drove real code changes |
| `refs/` | Curated reference docs (auth patterns, component deps, DB migrations, job processing, wiki architecture) | Still useful as design-context references |
| `run-continuation/` | `ses_*.json` continuation snapshots from OMO session runs | Diagnostic value if you need to trace what a specific OMO session did |

## What was NOT archived (and why)

The original `.omo/` also contained 140 **untracked** files at the time of cleanup. Most were logs, debug scripts, or fresh evidence that the OMO tool kept regenerating. They were left in `.omo/` (now gitignored) rather than archived, because:

- They were never versioned (no history to preserve).
- Most were transient (test output, integration JSON snapshots).
- Two of them were **credential leaks** and have been **permanently deleted** (see below).

## Credential scrub

The following files were **deleted** from the original `.omo/` and are **NOT** in this archive:

- `.omo/auth-cookie.txt` — contained a real JWT auth token (`auth-token=eyJ...`).
- `.omo/auth-session.xml` — contained a PowerShell `WebRequestSession` export with cookies.

Both were untracked (never made it into git history), but leaving them on disk was a credential-leak hazard. They are gone. If you need a reference of what an OMO test auth session looked like, see `refs/auth-patterns.md` (which has no actual secrets).

## Origin

- **Tool:** OMO (Oh My OpenCode) — see https://github.com/JakeP/... (project-specific)
- **Period covered:** ~2026-04 through 2026-06-05
- **Workflow:** Each OMO "plan" was a multi-task execution with `evidence/` and `notepads/` for audit trail.

## If you need to find something

- Looking for a script that performed a migration? Check `archived-scripts/`.
- Looking for the rationale behind a feature? Check `plans/` or `notepads/`.
- Looking for verification of a specific task? Check `evidence/task-N-*.txt`.
- Looking for design context on a subsystem? Check `refs/`.

## If you're starting fresh

You can safely delete the entire `docs/historical-evidence/omo/` directory if you no longer need the historical reference. The git history is still in commit objects (you can recover via `git log --all --follow` if needed). The current `AGENTS.md` and `.opencode/` directories are the live, authoritative documentation.

## If you create new OMO output

The `.omo/` directory is now in `.gitignore`. Anything you put there will stay local-only. If you want a future OMO archive, follow the same pattern: `git mv` the tracked contents to a new `docs/historical-evidence/omo-v2/` and add a README explaining what's new.
