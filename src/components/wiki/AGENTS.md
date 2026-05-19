# WIKI COMPONENTS — src/components/wiki/

## OVERVIEW
12 wiki UI components. All client components (`"use client"`). Markdown rendering, graph visualization, search, navigation, backlinks, callouts, embeds, revisions.

## COMPONENTS
| Component | Purpose | Key Features |
|-----------|---------|--------------|
| `markdown-renderer.tsx` (335L) | Core wiki content renderer | ReactMarkdown + GFM + wikilinks + callouts + embeds + hover preview + frontmatter badges + size warnings |
| `graph-view.tsx` | Knowledge graph visualization | Cytoscape.js force-directed layout, node colors by type, click-to-navigate |
| `search.tsx` | Full-text search | FlexSearch index, keyboard nav (arrow/Enter/Escape), dropdown results |
| `file-tree.tsx` | Folder navigation tree | Collapsible folders (entities/concepts/sources/synthesis), orphan detection, active page highlight |
| `backlink-panel.tsx` | Inbound links display | Parses wikilinks across all pages, shows context snippets |
| `outgoing-links-panel.tsx` | Outbound links display | Parses current page's wikilinks, resolved vs broken link styling |
| `outline-panel.tsx` | Table of contents | Regex heading parsing, IntersectionObserver scroll tracking, smooth scroll |
| `hover-preview.tsx` | Wikilink hover popover | Portal rendering, 300ms delay, viewport clamping, content caching, 200-char preview |
| `callout.tsx` | Obsidian-style callouts | 13 types (note/info/tip/warning/etc.), foldable (+/-), custom icons/colors |
| `embed-transclusion.tsx` | Wiki embeds | Transclusion of other pages, nesting depth limit for circular detection |
| `revision-history.tsx` | Page version history | Timestamp list, revision viewer, line-by-line diff |
| `react-cytoscapejs.d.ts` | Type declaration | Cytoscape component types |

## RENDERING PIPELINE
```
Wiki markdown → react-markdown → remark-gfm → remark-wiki-link → remarkCallout → remarkEmbed → rehype-raw → rehype-sanitize → DOM
```

## CONVENTIONS
- All components are client-side (hooks, browser APIs, event handlers).
- `markdown-renderer.tsx` is the central orchestrator — other components integrate through it.
- Cytoscape graph uses node colors by wiki page type (entity/concept/source/synthesis).
- Search uses FlexSearch with keyboard navigation (arrow keys + Enter + Escape).

## ANTI-PATTERNS
- **Do NOT remove GFM plugin** — GitHub Flavored Markdown is required for wiki content.
- **Do NOT bypass rehype-sanitize** — security-critical for user-generated content.
- **Do NOT add server-side rendering** — all wiki components need client interactivity.
