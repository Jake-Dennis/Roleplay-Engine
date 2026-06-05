# Plan 003: Stop-using cleanup — dyslexia font + OMO archive + credential scrub

## Goal

The user no longer uses three things: (1) the OpenDyslexic font, (2) the OMO (Oh My OpenCode) tool that produced `.omo/`, and (3) `.next/` (typo — meant `.omo/`). Decisions confirmed:

1. **Dyslexia font** → remove (`opendyslexic-0.92/` is untracked, already in `.gitignore`)
2. **OMO** → convert to archive: move tracked contents to `docs/historical-evidence/omo/`, add `.omo/` to `.gitignore` so future OMO output is ignored, write a provenance README
3. **`.next/`** → typo, treated as part of OMO decision (no separate action)

**Critical side-issue discovered during recon**: `.omo/auth-cookie.txt` contains a real JWT auth token; `.omo/auth-session.xml` contains PowerShell session cookies. These were untracked but represent a credential-leak hazard. **Both will be deleted, not archived.**

## Recon (done before this plan)

- Tracked in `.omo/`: 120 files (migrations, tests, evidence, plans, drafts, refs)
- Untracked in `.omo/`: 140 files (logs, debug scripts, fresh evidence, dev scripts)
- `.gitignore` has no rule for `.omo/` (that's how 120 files got tracked)
- `opendyslexic-0.92/` is in `.gitignore` (`/opendyslexic-*/`), untracked
- Security-sensitive files in `.omo/`:
  - Untracked (delete): `auth-cookie.txt` (real JWT), `auth-session.xml` (PowerShell cookies)
  - Tracked (move, no secrets): `session-body.json` (no secrets, just session metadata)

## Tasks

### Layer 1 (parallel, no deps)
- [ ] **T1** (assigned: conductor): Delete `opendyslexic-0.92/` (untracked, no risk)
- [ ] **T2** (assigned: conductor): Delete `.omo/auth-cookie.txt` and `.omo/auth-session.xml` (untracked credential leak)
- [ ] **T3** (assigned: conductor): `git mv` the 120 tracked files from `.omo/` to `docs/historical-evidence/omo/`

### Layer 2 (depends on Layer 1)
- [ ] **T4** (assigned: conductor): Add `/.omo/` to `.gitignore` (so future OMO output is ignored)
- [ ] **T5** (assigned: conductor): Write `docs/historical-evidence/omo/README.md` explaining provenance, scope, and the credential-scrub note
- [ ] **T6** (assigned: conductor): Update `AGENTS.md` line 42 and line 153 to point to new archive location

### Layer 3 (depends on Layer 2)
- [ ] **T7** (assigned: conductor): `git add` + `git status` to confirm staging is clean and correct
- [ ] **T8** (assigned: @reviewer): Reviewer checks that no source files reference the moved contents, that the new README is accurate, and that .gitignore rules are correct

## Verification

For each task, how to confirm it's done:

- [ ] **T1**: `python -c "import os; assert not os.path.exists('opendyslexic-0.92'), 'still here'"`  → exit 0
- [ ] **T2**: `python -c "import os; assert not os.path.exists('.omo/auth-cookie.txt'); assert not os.path.exists('.omo/auth-session.xml')"`  → exit 0
- [ ] **T3**: `git status --short | grep -E '^R  \.omo' | wc -l` ≥ 100  (120 expected). Plus `python -c "import os; assert os.path.isdir('docs/historical-evidence/omo/archived-scripts')"` → exit 0
- [ ] **T4**: `python -c "import re; gitignore = open('.gitignore').read(); assert '/.omo/' in gitignore, 'rule missing'; assert 'Next.js' in gitignore or '.next' in gitignore, 'no Next.js rule'"` → exit 0
- [ ] **T5**: `python -c "from pathlib import Path; r = Path('docs/historical-evidence/omo/README.md').read_text(encoding='utf-8'); assert 'OMO' in r and 'Oh My OpenCode' in r and 'credential' in r.lower()"` → exit 0
- [ ] **T6**: `python -c "from pathlib import Path; t = Path('AGENTS.md').read_text(encoding='utf-8'); assert 'docs/historical-evidence/omo' in t or 'historical-evidence' in t, 'AGENTS.md not updated'"` → exit 0
- [ ] **T7**: `python -c "import subprocess; r = subprocess.run(['git', 'status', '--short'], capture_output=True, text=True); lines = r.stdout.splitlines(); print(lines[:5])"` returns rename entries (R prefix) for the moved files
- [ ] **T8**: reviewer reports no issues, no source files broken, archive is consistent
