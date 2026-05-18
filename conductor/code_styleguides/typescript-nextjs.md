# TypeScript/Next.js Style Guide

## Project Conventions (Inferred from Codebase)

### TypeScript
- Strict mode enabled (`strict: true`)
- No implicit `any` — all types must be explicit or inferrable
- ES2017 target, ESNext modules
- Module resolution: bundler
- Path alias: `@/*` maps to `./src/*`
- Isolated modules enabled

### Next.js App Router
- Route groups for organization: `(app)`, `(auth)`
- API routes under `src/app/api/`
- Server components by default; `'use client'` directive for client components
- Layout files at each route group level

### Styling (Tailwind CSS 4)
- Utility-first CSS
- `@tailwindcss/postcss` for processing
- Dark theme: `#0a0a0a` background, `#141414` cards, `#4a9eff` accent
- Consistent spacing using Tailwind scale

### Component Structure
- Components in `src/components/`
- Page-level components in `src/app/(app)/*/page.tsx`
- Custom hooks in `src/hooks/`
- Context providers in `src/contexts/`
- Utilities in `src/lib/`

### Linting (ESLint 9)
- `eslint-config-next` for Next.js-specific rules
- Run via `npm run lint`
