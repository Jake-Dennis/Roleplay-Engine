# Plan 002: Delete Orphan `(auth)` Route Group (Next.js 16 parallel-pages error)

## Goal
Remove the untracked `src/app/(auth)/` route group that causes Next.js 16 to throw `You cannot have two parallel pages that resolve to the same path. Please check /(auth)/login and /login.` (and the same for `/register`). The pre-existing `src/app/login/` and `src/app/register/` directories are the canonical auth pages per `src/app/AGENTS.md`.

## Root Cause
- Next.js 16 hardened route group validation: two pages resolving to the same URL path is now a hard error (was a warning in 14/15).
- `src/app/(auth)/login/page.tsx` and `src/app/login/page.tsx` both resolve to `/login`.
- The `(auth)` group contains **only** the two duplicate pages — no `layout.tsx`, no shared components, no other files. Pure duplication.
- The `(auth)/` directory is **untracked in git** (`?? src/app/(auth)/` in `git status`).
- The `(auth)/` files were **created/modified today at 4:02:07 PM** — same time the user started the dev server. Looks like an incomplete refactor (e.g. an LLM session attempted to wrap auth in a route group but didn't finish — no layout, no other supporting files).

## Why deletion is the only safe action
- `src/app/AGENTS.md` explicitly states: "**Auth pages: `login/` and `register/` outside `(app)` — no sidebar layout.**" and lists "**Do NOT put auth pages inside `(app)`**" as an anti-pattern. The principle is "auth pages outside route groups" — they should not inherit any group layout.
- **Zero code imports from `(auth)/`** — confirmed by `grep` across `src/`. Removing it breaks no references.
- The `(auth)/login/page.tsx` has different post-login behavior (`router.push("/dashboard"); router.refresh()`) than the tracked `src/app/login/page.tsx`. Switching to the (auth) version would be an untracked, untested feature change. Staying with the tracked version is the conservative, safe choice.
- The pre-existing `src/app/login/page.tsx` and `src/app/register/page.tsx` are **tracked in git** (committed) — they are the canonical, working versions.

## Tasks

### Layer 1 (single action)
- [ ] Delete `src/app/(auth)/` (untracked, so `rm -rf` — no `git rm` needed) (assigned: @builder)

## Files changed
- deleted: `src/app/(auth)/login/page.tsx` (untracked)
- deleted: `src/app/(auth)/register/page.tsx` (untracked)
- deleted: `src/app/(auth)/` (empty after)

## Files NOT changed (intentionally)
- `src/app/login/page.tsx` — tracked, canonical, stays
- `src/app/register/page.tsx` — tracked, canonical, stays
- `src/app/(app)/` — separate route group for authenticated pages, not affected

## Verification
- [ ] (auth) directory gone: `python -c "from pathlib import Path; assert not Path('src/app/(auth)').exists(), '(auth) directory should be deleted'; print('OK: (auth) directory deleted')"`
- [ ] canonical login intact: `python -c "from pathlib import Path; assert Path('src/app/login/page.tsx').exists(), 'canonical login page missing'; content = Path('src/app/login/page.tsx').read_text(encoding='utf-8'); assert 'export default function LoginPage' in content, 'login page missing LoginPage export'; assert '/api/auth/login' in content, 'login page missing API call'; print('OK: src/app/login/page.tsx intact')"`
- [ ] canonical register intact: `python -c "from pathlib import Path; assert Path('src/app/register/page.tsx').exists(), 'canonical register page missing'; content = Path('src/app/register/page.tsx').read_text(encoding='utf-8'); assert 'export default function RegisterPage' in content, 'register page missing RegisterPage export'; assert '/api/auth/register' in content, 'register page missing API call'; print('OK: src/app/register/page.tsx intact')"`
- [ ] no parallel route conflicts: `python -c "from pathlib import Path; pages = list(Path('src/app').rglob('page.tsx')); paths = [('/' + str(p.relative_to('src/app')).replace('\\\\', '/').replace('/page.tsx', '').replace('(app)/', '').replace('(auth)/', '') or '/') for p in pages]; from collections import Counter; dupes = {k: v for k, v in Counter(paths).items() if v > 1}; assert not dupes, f'parallel pages found: {dupes}'; print(f'OK: no parallel pages ({len(pages)} pages, {len(set(paths))} unique paths)')"`
- [ ] nothing imports from (auth): `python -c "import re, glob; from pathlib import Path; hits = []; [hits.append(p) for p in glob.glob('src/**/*.{ts,tsx}', recursive=True) if re.search(r'\\(auth\\)', Path(p).read_text(encoding='utf-8', errors='ignore'))]; assert not hits, f'stale (auth) references in: {hits}'; print('OK: no stale (auth) references in source')"`
