# Plan 006: Rich Wiki Editor (built from scratch)

## Goal
Replace the raw `<textarea>` wiki editor with a hand-rolled, from-scratch
markdown editor that feels Obsidian-like — syntax highlighting, wikilink
autocomplete, frontmatter properties panel, and Cmd-K quick switcher — with
**zero new third-party editor libraries**. Use only what the project already
depends on (`react`, `gray-matter`, `lucide-react`, browser-native APIs).

## Why from scratch
- The user wants ownership of the editor; no third-party editor library.
- `<textarea>` is browser-native, not a "library".
- A syntax-highlight overlay + small autocomplete popup gives 80% of the
  Obsidian feel in ~600 lines of code we own.

## Architecture

```
+---------------------------------------------------------------+
| FrontmatterPropertiesPanel (form, above editor)               |
|  - title, type, status, tags (chips), universe, created/updated|
+---------------------------------------------------------------+
| MarkdownEditor (textarea + highlight overlay)                 |
|                                                               |
|  [gutter]  |  [syntax-highlight <pre> overlay  ]              |
|  line nums |  [transparent <textarea> ON TOP   ]              |
|                                                               |
|  Popup: wikilink autocomplete (positioned at cursor)          |
+---------------------------------------------------------------+
| (Cmd-K opens WikiQuickSwitcher modal, anywhere on the page)   |
+---------------------------------------------------------------+
```

### Key decisions
- **No contenteditable.** The editor is a `<textarea>` with a colored
  `<pre>` overlay behind it. Browser handles cursor, selection, IME, undo,
  mobile touch, accessibility. We just style the text.
- **No new deps.** Pure browser APIs + existing project deps.
- **Form for frontmatter, textarea for body.** Simpler than parsing
  user-edited YAML. YAML is generated from form state on save.
- **gray-matter for parse/serialize** (already a dep).
- **In-page Cmd-K opens WikiQuickSwitcher** — a modal that fuzzy-searches
  pages and navigates on Enter.

## File Layout

```
src/
├── components/wiki/
│   ├── markdown-editor.tsx                  (NEW)
│   ├── frontmatter-properties-panel.tsx     (NEW)
│   ├── wiki-quick-switcher.tsx              (NEW)
│   └── editor/
│       ├── syntax-highlighter.ts            (NEW — pure: text → HTML)
│       ├── wikilink-autocomplete.ts         (NEW — popup logic)
│       └── editor-styles.css                (NEW — overlay + gutter)
├── lib/wiki/
│   └── frontmatter.ts                       (NEW — gray-matter wrapper)
├── lib/__tests__/
│   ├── syntax-highlighter.test.ts           (NEW)
│   └── frontmatter.test.ts                  (NEW)
└── app/(app)/wiki/[...slug]/page.tsx        (MODIFIED — wire new components)
```

## Tasks

### Layer 1 (parallel, no deps)
- [ ] **A. `src/lib/wiki/frontmatter.ts`** — wrapper around gray-matter
  with helpers: `parseFrontmatter(raw)` → `{ frontmatter, body }`,
  `serializeFrontmatter(body, frontmatter)` → raw, plus
  `EMPTY_FRONTMATTER` constant. Replaces the hand-rolled
  `parseRawMarkdown`/`toRawMarkdown` in page.tsx.
  (assigned: @builder)

- [ ] **B. `src/components/wiki/editor/syntax-highlighter.ts`** — pure
  function `highlightMarkdown(text: string) → string` returning HTML with
  `<span class="tok-...">` wrappers. Token types: heading (1-6), bold,
  italic, strikethrough, inline-code, code-block, wikilink (`[[Page]]`,
  `[[Page|alias]]`, `![[embed]]`), link, image, list-bullet, list-number,
  list-checkbox, blockquote, callout (`> [!type]`), hr, tag (`#tag`),
  frontmatter-delim. State machine for fenced code blocks and list
  nesting. HTML-escapes all user content. (assigned: @builder)

- [ ] **C. `src/components/wiki/editor/editor-styles.css`** — token color
  classes (use existing design tokens: text-accent, text-secondary,
  text-muted, error, success, warning, info), textarea transparent
  text + opaque background, pre overlay pointer-events: none, gutter
  styling, monospace font stack. Imported once by MarkdownEditor.
  (assigned: @builder)

### Layer 2 (depends on A, B, C)
- [ ] **D. `src/components/wiki/frontmatter-properties-panel.tsx`** —
  form component. Props: `frontmatter: WikiFrontmatter`, `onChange(fn)`,
  `readOnlyFields?: ('created'|'updated')[]`. Renders labelled inputs:
  - title: text input
  - type: select (entity/concept/source/synthesis)
  - status: select (draft/reviewed/locked)
  - tags: chip input (text + Add button, click ✕ to remove)
  - universe: text input (or read-only)
  - created/updated: read-only display
  Calls `onChange(newFrontmatter)` on any change. (assigned: @builder)

- [ ] **E. `src/components/wiki/editor/wikilink-autocomplete.ts`** — pure
  helpers + a small class/hook for the popup:
  - `findOpenWikilink(text, cursorPos)` → `{ query, start } | null`
  - `filterPages(pages, query, limit=10)` → string[]
  - `useWikilinkAutocomplete({ textareaRef, pages, onSelect })` hook
    that watches input/selection, positions a popup at the cursor, and
    handles arrow keys / Enter / Escape. (assigned: @builder)

### Layer 3 (depends on D, E)
- [ ] **F. `src/components/wiki/markdown-editor.tsx`** — the main editor.
  Layout: CSS grid with a gutter column + content column. Content
  column is `position: relative` containing:
  - `<pre>` overlay with `dangerouslySetInnerHTML={highlighted}`
  - `<textarea>` on top with transparent text, opaque background
  Syncs scroll. Calls `onChange(text)` on every input. Calls
  `onSave()` on Cmd-S (preventDefault). Renders the wikilink popup
  using the hook from E. Props:
  ```ts
  {
    value: string;
    onChange: (v: string) => void;
    onSave?: () => void;
    existingPages: string[];
    rows?: number;
  }
  ```
  (assigned: @builder)

- [ ] **G. `src/components/wiki/wiki-quick-switcher.tsx`** — modal with:
  - Text input (autofocus)
  - List of fuzzy-matched pages (simple substring scoring v1)
  - Arrow keys + Enter to navigate, Escape to close
  - Click outside to close
  Props: `open: boolean`, `onClose()`, `pages: Array<{path, title}>`,
  `onSelect(path)`. Reuses design tokens. ~120 lines.
  (assigned: @builder)

### Layer 4 (depends on F, G)
- [ ] **H. `src/app/(app)/wiki/[...slug]/page.tsx`** — modifications:
  1. Remove `toRawMarkdown` and `parseRawMarkdown` (now in
     `lib/wiki/frontmatter.ts`).
  2. In edit mode, render:
     ```
     <FrontmatterPropertiesPanel
       frontmatter={editFrontmatter}
       onChange={setEditFrontmatter}
     />
     <MarkdownEditor
       value={editBody}
       onChange={setEditBody}
       onSave={handleSave}
       existingPages={allPages.map(p => p.path)}
     />
     ```
  3. `handleSave` now uses
     `serializeFrontmatter(editBody, editFrontmatter)` and PUTs
     `{ content: editBody, frontmatter: editFrontmatter }`.
  4. Add Cmd-K listener that opens `WikiQuickSwitcher`. (assigned: @builder)

- [ ] **I. `src/lib/__tests__/syntax-highlighter.test.ts`** — tests for:
  - heading detection (h1-h6)
  - bold/italic/strikethrough
  - inline code + fenced code block state
  - wikilink `[[Page]]`, `[[Page|alias]]`, `![[embed]]`
  - list bullets/numbers
  - blockquote + callout
  - HTML escape (no XSS)
  - empty input
  (assigned: @builder)

- [ ] **J. `src/lib/__tests__/frontmatter.test.ts`** — tests for:
  - `parseFrontmatter` with valid YAML, no frontmatter, malformed
  - `serializeFrontmatter` round-trip
  - Required fields preserved (title, type, status)
  (assigned: @builder)

### Layer 5 (depends on H, I, J)
- [ ] **K. Review pass** — @reviewer verifies:
  - No new third-party editor deps
  - Wiki edit still saves correctly
  - Wikilink autocomplete works on `[[`
  - Cmd-S triggers save
  - Cmd-K opens switcher
  - Frontmatter form updates the saved YAML
  - Existing tests still pass; new tests pass
  (assigned: @reviewer)

- [ ] **L. Build + tests + verify** — @builder:
  - `npm run build`
  - `npm test` (or `bun test`)
  - `python scripts/verify-plan.py .opencode/plans/plan-006-rich-wiki-editor.md`
  - Archive to `.opencode/plans/completed/` on pass.
  (assigned: @builder)

## Verification

- [ ] no new editor deps in package.json: `python -c "import json; pkg=json.load(open('package.json')); bad=[d for k in ['dependencies','devDependencies'] for d in pkg.get(k,{}).keys() for e in ['codemirror','tiptap','lexical','monaco','slate','quill','milkdown','prosemirror'] if e in d.lower()]; print('OK: no editor deps' if not bad else 'FAIL: ' + str(bad))"`
- [ ] frontmatter utility exports the right names: `python -c "import re; t=open('src/lib/wiki/frontmatter.ts').read(); names=['parseWikiFrontmatter','serializeWikiFrontmatter','validateWikiFrontmatter','EMPTY_FRONTMATTER']; missing=[n for n in names if 'export '+n not in t.replace('export function '+n, 'export '+n) and 'export const '+n not in t]; print('OK' if not missing else 'MISSING: '+str(missing))"`
- [ ] page.tsx integrates the new components: `python -c "t=open('src/app/(app)/wiki/[...slug]/page.tsx').read(); required=['FrontmatterPropertiesPanel','MarkdownEditor','WikiQuickSwitcher','handleSave','switcherOpen','validateWikiFrontmatter']; missing=[r for r in required if r not in t]; print('OK' if not missing else 'MISSING: '+str(missing))"`
- [ ] CSS popup is position: fixed: `python -c "t=open('src/components/wiki/editor/editor-styles.css').read(); print('OK' if 'position: fixed;' in t and '.wiki-autocomplete' in t else 'FAIL')"`
- [ ] syntax highlighter test passes: `bun test src/lib/__tests__/syntax-highlighter.test.ts`
- [ ] frontmatter test passes: `bun test src/lib/__tests__/frontmatter.test.ts`
- [ ] all tests pass: `bun test`
- [ ] build passes: `npm run build`

## Out of Scope (Plan 007+)
- AI editing toolbar (selection menu, header buttons)
- AI "create page from prompt" modal
- Slash commands
- Split-pane live preview
- Find/replace in editor
- Multi-cursor
- Mobile-optimized selection handles
