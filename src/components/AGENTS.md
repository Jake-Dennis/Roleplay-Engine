# UI COMPONENTS — src/components/

## OVERVIEW
71 `.tsx` files across 12 feature directories. 66% client components (`"use client"`, 47 of 71), 34% server (pure display). No barrel exports.

## STRUCTURE
```
src/components/
├── wiki/           (12 files)  # Wiki rendering: markdown, graph, search, callouts, embeds
├── ui/             (7 files)   # Shared primitives: Modal, LoadingState, EmptyState, StatusBadge
├── session/        (10 files)  # Session: settings, participants, memories, turn management
├── chat/           (6 files)   # Chat: window, bubbles, input, streaming
├── timeline/       (4 files)   # Timeline: era, faction, character editors
├── relationships/  (3 files)   # Relationship viz: web, emotion graph, decay indicator
├── relationship/   (3 files)   # ⚠ SINGULAR: emotion-bar, relationship-graph, history
├── narrative/      (3 files)   # Narrative: threads, importance, events
├── canon/          (3 files)   # Canon layers: selector, viewer, promotion
├── tts/            (3 files)   # TTS: controls, indicator, voice picker
├── layout/         (1 file)    # Page header
├── jobs/           (1 file)    # Job progress indicator
└── backlinks/      (1 file)    # Backlink panel
```

## CLIENT/SERVER SPLIT
- **Client (66%)**: All wiki, session, chat, timeline, relationship, narrative, canon, tts components. Any component using hooks (`useState`, `useEffect`, `useRouter`) or browser APIs.
- **Server (34%)**: `ui/loading-state.tsx`, `ui/empty-state.tsx`, `ui/status-badge.tsx`, `layout/page-header.tsx`, `ui/connection-indicator.tsx`, `ui/confirmation-dialog.tsx`. Pure display, no interactivity.
- **Rule**: Server by default. Add `"use client"` only when hooks/browser APIs needed.

## SHARED UI PRIMITIVES (`ui/`)
| Component | Purpose |
|-----------|---------|
| `Modal` | Backdrop blur, Escape close, focus trap, 4 sizes (sm/md/lg/xl) |
| `LoadingState` | Icon + message, customizable icon (default: Sparkles). Used 18+ pages. |
| `EmptyState` | Icon + title + description + optional action button. Used 16+ pages. |
| `StatusBadge` | 6 variants (default/success/warning/error/info/accent), 2 sizes |
| `PageHeader` | Title + subtitle + optional action button. Used 14+ pages. |
| `ConfirmationDialog` | Modal-based confirm/cancel |
| `ConnectionIndicator` | Footer bar showing Ollama/Kokoro status |

## STYLING
- Tailwind v4 via `@tailwindcss/postcss`. No `tailwind.config` file.
- Design tokens in `src/app/globals.css` `@theme` block.
- Dark theme only (base `#0a0a0a`).
- `clsx` for conditional class composition.
- `prose prose-invert max-w-none` for markdown content areas.

## CONVENTIONS
- kebab-case directories, PascalCase component files.
- No barrel exports — import from specific file path.
- Components use LoadingState/ErrorState/EmptyState triad pattern.
- Feature directories are self-contained — no cross-directory imports between feature dirs.

## ANTI-PATTERNS
- **Do NOT merge `relationship/` and `relationships/`** — separate directories with different components.
- **Do NOT add `"use client"` to pure display components** — server by default.
- **Do NOT create barrel exports** — direct imports only.
- **Do NOT add CSS modules or styled-components** — Tailwind utility classes only.
