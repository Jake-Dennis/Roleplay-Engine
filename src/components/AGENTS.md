# UI COMPONENTS — src/components/

## OVERVIEW
98 `.tsx` files across 18 feature directories. 59% client components (`"use client"`, 58 of 98), 41% server (pure display). No barrel exports.

## STRUCTURE
```
src/components/
├── wiki/           (20 files)  # Wiki rendering: markdown, graph, search, callouts, embeds
├── ui/             (12 files)  # Shared primitives: Modal, LoadingState, EmptyState, StatusBadge
├── session/        (13 files)  # Session: settings, participants, memories, turn management
├── chat/           (8 files)   # Chat: window, bubbles, input, streaming
├── personas/       (8 files)   # Persona: editor, list, preview, tabs (advanced/description/dialogue/personality/scenario)
├── jobs/           (6 files)   # Jobs: table, progress, filter-bar, header, reindex, stats
├── settings/       (5 files)   # Settings: password, connection, narrator voice, server info, layout
├── timeline/       (4 files)   # Timeline: era, faction, character editors, layer manager
├── relationships/  (4 files)   # Relationship viz: web, emotion graph, decay indicator, timeline
├── relationship/   (3 files)   # ⚠ SINGULAR: emotion-bar, relationship-graph, history
├── narrative/      (3 files)   # Narrative: threads, importance, events
├── canon/          (3 files)   # Canon layers: selector, viewer, promotion
├── tts/            (3 files)   # TTS: controls, indicator, voice picker
├── debug/          (2 files)   # Debug: narrative state panel, retrieval inspector
├── npcs/           (2 files)   # NPC: editor, list
├── layout/         (1 file)    # Page header
├── backlinks/      (1 file)    # Backlink panel
└── auth/           (0 files)   # (reserved, currently empty)
```

## CLIENT/SERVER SPLIT
- **Client (59%)**: All wiki, session, chat, timeline, relationship, narrative, canon, tts, jobs, personas, settings, debug components. Any component using hooks (`useState`, `useEffect`, `useRouter`) or browser APIs.
- **Server (41%)**: `ui/loading-state.tsx`, `ui/empty-state.tsx`, `ui/status-badge.tsx`, `ui/StatusIndicator.tsx`, `layout/page-header.tsx`, `ui/connection-indicator.tsx`, `ui/confirmation-dialog.tsx`, `ui/Button.tsx`, `ui/Input.tsx`, `ui/error-boundary.tsx`, `ui/fps-counter.tsx`, `ui/wiki-toast.tsx`. Pure display, no interactivity.
- **Rule**: Server by default. Add `"use client"` only when hooks/browser APIs needed.

## SHARED UI PRIMITIVES (`ui/`)
| Component | Purpose |
|-----------|---------|
| `Modal` | Backdrop blur, Escape close, focus trap, 4 sizes (sm/md/lg/xl) |
| `LoadingState` | Icon + message, customizable icon (default: Sparkles). Used 18+ pages. |
| `EmptyState` | Icon + title + description + optional action button. Used 16+ pages. |
| `StatusBadge` | 6 variants (default/success/warning/error/info/accent), 2 sizes |
| `ConfirmationDialog` | Modal-based confirm/cancel |
| `ConnectionIndicator` | Footer bar showing Ollama/Kokoro status |
| `Button` | Styled button with variants |
| `Input` | Styled text input |
| `StatusIndicator` | Colored dot with status text |
| `ErrorBoundary` | React error boundary wrapper |
| `FpsCounter` | Debug FPS overlay |
| `WikiToast` | Wiki operation toast notification |
| `PageHeader` *(in `layout/`)* | Title + subtitle + optional action button. Used 14+ pages. |

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
