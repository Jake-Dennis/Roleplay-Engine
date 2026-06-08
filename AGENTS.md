<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PROJECT KNOWLEDGE BASE — Roleplay-Engine

**Generated:** 2026-05-20
**Commit:** 9267d10
**Branch:** master

## OVERVIEW
Next.js 16 App Router app for AI-assisted roleplay sessions. LLM-maintained wiki system for world-building, SQLite storage, Ollama (self-hosted) for generation. Wiki content is markdown-first — stored as `.md` files with YAML frontmatter under `data/{userId}/wiki/`.

## STRUCTURE
```
Roleplay-Engine/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (app)/              # Route group: authenticated pages (sidebar layout)
│   │   ├── api/                # 107 REST route handlers (route.ts)
│   │   ├── login/ / register/  # Auth pages (outside route group)
│   │   ├── layout.tsx          # Root layout — force-dynamic, Inter font
│   │   └── page.tsx            # Redirects to /login
│   ├── components/             # 98 .tsx files, 18 feature directories
│   │   ├── wiki/               # 20 wiki UI components
│   │   ├── ui/                 # 12 shared primitives (Modal, LoadingState, Button, etc.)
│   │   ├── chat/ / session/    # Session/chat components
│   │   ├── timeline/ / canon/  # Timeline/canon layers
│   │   ├── relationships/ / relationship/  # ⚠ SINGULAR vs PLURAL — different dirs
│   │   ├── personas/ / npcs/   # Character management
│   │   ├── jobs/ / settings/ / debug/  # Utility feature dirs
│   │   └── tts/ / narrative/ / layout/ / backlinks/
│   ├── contexts/               # 2 files: app-context.tsx + active-universe.tsx (compat shim)
│   ├── hooks/                  # 10 custom hooks (use-* prefix)
│   ├── lib/                    # 61 flat utility files + 6 subdirectories
│   │   ├── wiki/               # 33-file wiki subsystem (43 incl. tests)
│   │   ├── jobs/               # 19-file job processing (16 impl + 3 tests, see lib/jobs/AGENTS.md)
│   │   ├── benchmark/          # 10-file Ollama benchmarking suite
│   │   └── idle/ / validation/ / __tests__/
│   └── middleware.ts           # Edge middleware (auth redirects, mostly no-op)
├── data/                       # Runtime data (gitignored): SQLite DBs + per-user wiki markdown
├── scripts/                    # One-off migration/utility scripts
├── docs/                       # Wiki system documentation
└── docs/historical-evidence/   # Archived OMO output (historical, not part of the app)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add API endpoint | `src/app/api/{resource}/route.ts` | Raw SQL, inline auth check, withErrorHandler, NextResponse.json errors |
| Add UI component | `src/components/{feature}/` | Feature-specific or `ui/` for shared primitives |
| Add wiki feature | `src/lib/wiki/` + `src/components/wiki/` | Lib for logic, components for rendering |
| Add custom hook | `src/hooks/use-{name}.ts` | Return shape: `{ data, loading, error, refresh }` |
| Change DB schema | `scripts/init-db.ts` | 16 tables + 3 vec0 virtual tables + 17 indexes |
| Modify wiki content | `data/{userId}/wiki/` | Markdown files, NOT in SQLite |
| Adjust LLM prompts | `src/lib/ollama.ts` + `src/lib/prompt-builder.ts` | Ollama self-hosted, qwen3.5:4b default |
| Change styling | `src/app/globals.css` | Tailwind v4 `@theme` tokens, no tailwind.config |
| Auth logic | `src/lib/auth.ts` + `src/lib/auth-token.ts` | JWT via jose, bcrypt(12), cookie + header fallback |
| Background jobs | `src/lib/job-processor.ts` + `src/lib/idle-processing.ts` | No persistent workers, on-demand triggers |
| Add job handler | `src/lib/jobs/{handler-name}.ts` | Export `async process(job)`, see lib/jobs/AGENTS.md |

## ENTRY POINTS

For complex modules, read files in this order to understand the data flow:

### Auth System
```
src/lib/auth.ts           — core: hashing, JWT create/verify, user CRUD
src/lib/with-auth.ts      — API route auth HOF (extracts token + verifies)
src/app/api/auth/login/route.ts — login endpoint (authenticateUser → set cookie)
src/app/login/page.tsx    — client-side login UI
```
Supporting: `src/lib/auth-token.ts`, `src/lib/with-error-handler.ts`, `src/app/api/auth/register/route.ts`

### Job Processing System
```
src/lib/jobs/types.ts      — job types (20), priorities, statuses, constants
src/lib/jobs/queue.ts      — queue operations (queueJob, getUserJobs, progress)
src/lib/job-processor.ts   — orchestrator (processUserJobs, processJobsByType)
src/lib/idle-processing.ts — 4-tier idle scheduling (5/10/15/30 min)
```
Supporting: `src/lib/jobs/` (all handler files), `src/app/api/jobs/route.ts`, `src/app/api/jobs/stream/route.ts`

### SSE/Events System
```
src/lib/event-bus.ts       — EventBus class (on/emit/registerController/history)
src/app/api/sessions/[id]/stream/route.ts — session SSE (message:*, scene:*, job:* events)
src/app/api/jobs/stream/route.ts          — job progress SSE (job:progress events)
```
Supporting: `src/lib/config.ts` (EVENT_BUS_CONFIG, TIMEOUTS)

### Wiki Subsystem
```
src/lib/wiki/types.ts     — WikiFrontmatter, WikiPage, ConflictError types
src/lib/wiki/file-io.ts   — CRUD foundation, file locking, conflict detection
src/lib/wiki/wikilinks.ts — wikilink parsing and 3-pass resolution
src/lib/wiki/query.ts     — LLM-powered natural language query + synthesis
```
Supporting: `src/lib/wiki/` (validation, lint, ingest, index-generator, orphans, history, etc.)

### Session/Generation Pipeline
```
src/app/api/generate/[id]/route.ts — generation endpoint (orchestrates retrieval→prompt→Ollama→SSE)
src/lib/retrieval.ts     — context retrieval pipeline (getRetrievedContext)
src/lib/prompt-builder.ts — structured prompt assembly (10-section prompt)
src/lib/ollama.ts         — LLM client (generateTextStream, embeddings, validation)
```
Supporting: `src/app/(app)/session/[id]/page.tsx`, `src/app/api/sessions/[id]/turn/route.ts`, `src/lib/config.ts`

## CONVENTIONS
- **Import alias**: `@/*` → `./src/*` (tsconfig.json). 374+ uses across 130+ files.
- **No barrel exports**: Zero `index.ts` re-export files. Always import from specific file paths.
- **File naming**: kebab-case for files/dirs, PascalCase for component files.
- **API routes**: All `route.ts` files. No server actions (`"use server"` = none).
- **Client/Server split**: Server by default. `"use client"` only when hooks/browser APIs needed. 59% of components are client (58 of 98).
- **Auth pattern**: Every route does inline token verification. Two extraction styles coexist: direct cookie access (older) and `getAuthToken()` utility (newer).
- **Error responses**: Always `NextResponse.json({ error: "..." }, { status: N })`.
- **DB access**: Raw better-sqlite3, no ORM. `db.prepare("...").get/all/run()`. Parameterized with `?`.
- **Real-time**: SSE via `ReadableStream` + in-process `EventBus` singleton.

## ANTI-PATTERNS (THIS PROJECT)
- **Do NOT add barrel exports** — explicit imports are a deliberate convention.
- **Do NOT add ORM or query builder** — raw SQL is the established pattern.
- **Do NOT add cookie-based middleware auth** — auth is client-side + per-route. Middleware `protectedRoutes` is intentionally empty.
- **Do NOT move `app-layout-shell.tsx`** — co-located inside `(app)/` route group by design.
- **Do NOT merge `relationship/` and `relationships/`** — they contain different components.
- **Do NOT use `active-universe.tsx` for new code** — it's a compat shim. Use `app-context.tsx`.
- **Do NOT create `tailwind.config.*`** — Tailwind v4 uses CSS-first `@theme` in `globals.css`.
- **Do NOT store wiki content in SQLite** — wiki is markdown-first on disk.
- **Do NOT add persistent background workers** — jobs are on-demand via idle tiers/API triggers.

## UNIQUE STYLES
- **force-dynamic at root**: `src/app/layout.tsx` exports `dynamic = "force-dynamic"` — all routes SSR, no SSG/ISR.
- **Wiki validation workflow**: `draft` (LLM-created) → `reviewed` (human-approved) → `locked` (immutable).
- **Idle-time processing tiers**: 4 tiers (5min/10min/15min/30min) trigger different job types.
- **Cross-universe wikilinks**: `[[Universe::Page]]` namespace syntax, 3-pass resolution (same-universe → any-universe → filename).
- **Concurrent edit protection**: In-memory file locks + timestamp-based conflict detection with diff saving.

## COMMANDS
```bash
npm run dev        # Next.js dev server, binds 0.0.0.0:3000
npm run build      # Production build
npm run start      # Production server, binds 0.0.0.0
npm run lint       # ESLint (flat config, core-web-vitals + typescript)
npm run analyze    # Bundle analysis (ANALYZE=true + next build)
```

## NOTES
- **Next.js 16 has breaking changes** — consult `node_modules/next/dist/docs/` before writing code.
- **No test framework** — no test files, test config, or testing dependencies.
- **No Prettier config** — formatting not enforced.
- **JWT secret** in `.env.local` — base64-encoded, 24h expiry.
- **sqlite-vec extension** optional — graceful fallback to keyword-only search if unavailable.
- **`data/` directory** is gitignored — runtime storage, never import from it in source code.
- **`.omo/` directory** is gitignored (former OMO working dir, retired 2026-06-05; historical contents archived under `docs/historical-evidence/omo/`).
