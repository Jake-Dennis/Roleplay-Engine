# APP ROUTER — src/app/

## OVERVIEW
Next.js 16 App Router structure. Route groups, dynamic routes, error boundaries, force-dynamic rendering.

## STRUCTURE
```
src/app/
├── layout.tsx              # Root layout (Inter font, force-dynamic)
├── page.tsx                # Redirect → /login
├── globals.css             # Tailwind v4 @theme tokens
├── (app)/                  # Route group: authenticated pages
│   ├── layout.tsx          # App wrapper (AppProvider + AppLayoutShell)
│   ├── app-layout-shell.tsx # Sidebar nav + main content (CLIENT, co-located)
│   ├── error.tsx           # Route-group error boundary
│   ├── global-error.tsx    # Root error boundary (<html><body> required)
│   ├── not-found.tsx       # 404 page
│   ├── loading.tsx         # Suspense fallback for (app) group
│   ├── admin/              # Admin pages
│   ├── canon/              # Canon layer pages
│   ├── characters/         # Character browsing pages
│   ├── dashboard/          # Dashboard pages
│   ├── events/             # Event pages
│   ├── groups/             # Group pages
│   ├── jobs/               # Job monitoring pages
│   ├── narrative-threads/  # Narrative thread pages
│   ├── npcs/               # NPC management pages
│   ├── personas/           # Persona pages
│   ├── relationships/      # Relationship pages
│   ├── session/            # Session pages + error.tsx
│   ├── settings/           # Settings pages
│   ├── timeline/           # Timeline pages + error.tsx
│   ├── universe/           # Universe pages
│   ├── validations/        # Validation pages
│   ├── voice-combiner/     # Voice combiner pages
│   ├── wiki/[...slug]/     # Catch-all wiki route
│   └── ...                 # 18 route groups total
├── api/                    # 107 REST route handlers (see api/AGENTS.md)
├── login/                  # Auth pages (outside route group)
└── register/
```

## CONVENTIONS
- **Route groups**: `(app)` wraps all authenticated pages for shared sidebar layout.
- **Auth pages**: `login/` and `register/` outside `(app)` — no sidebar layout.
- **Error boundaries**: `(app)/error.tsx` (group-level), `session/error.tsx`, `timeline/error.tsx` (nested).
- **Dynamic routes**: `[id]` for single resources, `[...slug]` for wiki paths.
- **Root layout**: `dynamic = "force-dynamic"` — all routes SSR, no SSG/ISR.

## AUTH FLOW
- Unauthenticated → proxy redirects to `/login`.
- Authenticated → proxy redirects away from `/login`/`/register`.
- Per-route token verification in API handlers (not proxy).

## ANTI-PATTERNS
- **Do NOT move `app-layout-shell.tsx`** — co-located in `(app)/` by design.
- **Do NOT add `loading.tsx` to every route** — only at `(app)` group level.
- **Do NOT put auth pages inside `(app)`** — they must be outside to avoid sidebar layout.
- **Do NOT remove `force-dynamic`** — app relies on server-side rendering for all routes.
