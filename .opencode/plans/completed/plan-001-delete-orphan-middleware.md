# Plan 001: Delete Orphan `src/middleware.ts` (Next.js 16 migration)

## Goal
Remove the orphaned `src/middleware.ts` file that causes the dev server to fail with `Both middleware file "./src/middleware.ts" and proxy file "./src/proxy.ts" are detected. Please use "./src/proxy.ts" only.` The project has fully migrated to Next.js 16's `proxy` convention; this file was missed during the migration.

## Root Cause
- Next.js 16 renamed the `middleware` file convention to `proxy`.
- `src/proxy.ts` is the canonical, modernized file (CSRF, real-IP, request ID, edge-safe JWT verify).
- `src/middleware.ts` is the old Next.js 14/15 file with a phantom `jsonwebtoken` import (package not in `package.json`).
- Recent commit `99dc336 chore: remove dead code — full-audit-remediation plan, session-settings-panel, semantic-intent-fallback, middleware` was supposed to remove the old middleware but the file slipped through.
- `AGENTS.md` mandates: "Do NOT add cookie-based middleware auth — auth is client-side + per-route. Middleware `protectedRoutes` is intentionally empty." The old file violates this (it has hardcoded protected routes).

## Tasks

### Layer 1 (single action)
- [ ] Delete `src/middleware.ts` (assigned: @builder)

## Why delete is the only safe action
- The `proxy.ts` is a **strict superset** of `middleware.ts` auth logic PLUS additional features (CSRF, IP extraction, request ID).
- `proxy.ts` already has `protectedRoutes: string[] = []` (intentionally empty per `AGENTS.md`).
- `jsonwebtoken` import in `middleware.ts` is phantom (not in `package.json`).
- No other code imports from `middleware.ts` (only `proxy.ts` is referenced by `auth-edge.ts`, `idle-processing.ts`, `rate-limiter.ts`, `health/route.ts`).

## Files changed
- deleted: `src/middleware.ts`

## Files NOT changed (intentionally)
- `src/proxy.ts` — already correct
- `package.json` — `jsonwebtoken` already absent
- `AGENTS.md` — already documents the migration

## Verification
- [ ] middleware file gone: `python -c "from pathlib import Path; assert not Path('src/middleware.ts').exists(), 'middleware.ts should be deleted'; print('OK: middleware.ts deleted')"`
- [ ] proxy file present and canonical: `python -c "from pathlib import Path; c = Path('src/proxy.ts').read_text(encoding='utf-8'); assert 'export async function proxy' in c, 'proxy export missing'; assert 'verifyTokenBasic' in c, 'edge auth import missing'; assert 'getRealIp' in c, 'real-IP extraction missing'; assert 'X-Request-Id' in c, 'request ID header missing'; assert 'Forbidden' in c, 'CSRF protection missing'; print('OK: proxy.ts has all expected features')"`
- [ ] no orphan jsonwebtoken imports: `python -c "import re, glob; hits = []; [hits.append(p) for p in glob.glob('src/**/*.ts', recursive=True) if re.search(r'from [\"\\\']jsonwebtoken[\"\\\']', Path := __import__('pathlib').Path(p).read_text(encoding='utf-8'))]; assert not hits, f'phantom jsonwebtoken imports in: {hits}'; print('OK: no phantom jsonwebtoken imports')"`
- [ ] proxy.ts still has empty protectedRoutes (per AGENTS.md): `python -c "from pathlib import Path; c = Path('src/proxy.ts').read_text(encoding='utf-8'); assert 'const protectedRoutes: string[] = []' in c, 'protectedRoutes should be intentionally empty per AGENTS.md'; print('OK: protectedRoutes is empty as required')"`
