# Phase 8E: Markdown Lore Editor ✅ COMPLETE

## Goal
Build a full-featured markdown editor for lore entries (locations, NPCs, events) with live preview, wikilink autocomplete, canon layer selector, validation badge, and backlink panel.

## Status
All steps completed. Lore editor with frontmatter, wikilink autocomplete, backlink panel, and edit page all built.

## Current State
- [x] `src/components/lore/lore-editor.tsx` — markdown editor with frontmatter, live preview toggle
- [x] `src/components/lore/wikilink-autocomplete.tsx` — `[[wikilink]]` autocomplete overlay
- [x] `src/components/lore/lore-browser.tsx` — lore list with edit buttons
- [x] `src/components/backlinks/backlink-panel.tsx` — incoming/outgoing backlinks
- [x] `src/lib/backlinks.ts` — wikilink parsing, link type inference, backlink storage
- [x] `src/app/(app)/lore/[id]/edit/page.tsx` — edit page with editor + preview
- [x] `src/app/(app)/lore/page.tsx` — lore browser with edit links

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  /lore/[type]/[id]/edit                                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Header: Location: Dark Forest          [Save] [Preview] [←] │   │
│  ├────────────────────────┬─────────────────────────────────────┤   │
│  │  Editor (left pane)    │  Preview (right pane)               │   │
│  │                        │                                     │   │
│  │  # Dark Forest         │  Dark Forest                        │   │
│  │                        │                                     │   │
│  │  A mysterious forest   │  A mysterious forest filled with    │   │
│  │  filled with [[ancient │  ancient ruins. The [[Elven         │   │
│  │  ruins]].              │  Outpost]] is nearby.               │   │
│  │                        │                                     │   │
│  │  The [[Elven Outpost]] │  ── Backlinks (2) ────────────────  │   │
│  │  is nearby.            │  ← Haleth's Report (mentions)       │   │
│  │                        │  ← Ranger's Journal (related)       │   │
│  │  ────────────────────  │                                     │   │
│  │  Canon: [Generated ▼]  │  ── Validation ──────────────────   │   │
│  │  Status: 🟡 Unverified │  🟡 Under Review                    │   │
│  │                        │  "Potential contradiction with..."  │   │
│  └────────────────────────┴─────────────────────────────────────┘   │
│                                                                      │
│  Wikilink Autocomplete (overlay):                                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ [[ancient...                                                 │   │
│  │ ┌──────────────────────────────────────────────────────────┐ │   │
│  │ │ Ancient Ruins        location    Dark Forest             │ │   │
│  │ │ Ancient Watchtower   location    Weather Hills           │ │   │
│  │ │ Ancient Sword        item        Rivendell               │ │   │
│  │ └──────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Execution Plan

### Step 1: Create Lore Editor API Routes
**File**: `src/app/api/lore/[type]/[id]/route.ts`

- `GET` — get lore entity + markdown content + backlinks + validation status
- `PUT` — update lore entity (metadata + markdown content)
  - Writes to filesystem via `writeLoreFile`
  - Updates database record
  - Re-parses backlinks from markdown
  - Creates/updates validation entry

**File**: `src/app/api/lore/[type]/route.ts`

- `POST` — create new lore entity
  - Creates database record
  - Writes initial markdown file
  - Creates validation entry (generated_unverified)

### Step 2: Create Markdown Editor Component
**File**: `src/components/lore/markdown-editor.tsx`

Features:
- Textarea with monospace font
- Tab key inserts 2 spaces (not focus change)
- Ctrl+S triggers save
- Line numbers (optional, toggleable)
- Word/character count in footer
- Wikilink detection: `[[...]]` pattern triggers autocomplete

### Step 3: Create Wikilink Autocomplete
**File**: `src/components/lore/wikilink-autocomplete.tsx`

Features:
- Detects `[[` pattern in textarea
- Positions overlay at cursor location
- Fetches all entities (locations, NPCs, events) for current user
- Filters by text after `[[`
- Click or Enter selects entity, inserts `[[Entity Name]]`
- Escape closes overlay
- Debounced fetch (300ms)

### Step 4: Create Live Preview Component
**File**: `src/components/lore/markdown-preview.tsx`

Features:
- Renders markdown to HTML
- Converts `[[wikilinks]]` to clickable links
- Clicking wikilink navigates to that entity's edit page
- Code block support
- Table support
- Header hierarchy

### Step 5: Create Canon Layer Selector
**File**: `src/components/lore/canon-layer-selector.tsx`

Features:
- Radio group: Immutable / Soft / Generated / Session / Rumor
- Immutable is locked (disabled) if entity is already immutable
- Visual indicator for current layer
- Tooltip explaining each layer
- On change → updates entity + creates validation entry

### Step 6: Create Validation Badge Component
**File**: `src/components/lore/validation-badge.tsx`

Features:
- Shows current validation state with color/icon
- 🟢 Validated / 🟡 Under Review / 🔴 Rejected / ⚪ Unverified
- Click badge → opens validation notes modal
- For unverified: "Mark as reviewed" button
- For under_review: shows validation notes
- For rejected: shows reason + "Override" button

### Step 7: Create Backlink Panel
**File**: `src/components/lore/backlink-panel.tsx`

Features:
- Shows incoming backlinks (entities linking TO this one)
- Shows outgoing backlinks (entities this one links TO)
- Each backlink is clickable → navigates to that entity
- Shows link type (mentions, located_in, related_to, etc.)
- Shows context snippet
- "Refresh" button to re-scan backlinks

### Step 8: Create Lore Editor Page
**File**: `src/app/(app)/lore/[type]/[id]/edit/page.tsx`

Features:
- Split-pane layout (editor left, preview right)
- Responsive: stacks vertically on narrow screens
- Header with entity name, save button, back button
- Left pane: MarkdownEditor + WikilinkAutocomplete
- Right pane: MarkdownPreview + BacklinkPanel + ValidationBadge
- Canon layer selector in right pane sidebar
- Auto-save draft to localStorage (every 30s)
- Save button → PUT to API → refresh preview + backlinks

### Step 9: Update Lore Browser to Link to Editor
**File**: `src/app/(app)/lore/page.tsx`

- Each lore card gets an "Edit" button
- Click → navigate to `/lore/[type]/[id]/edit`
- Show validation badge on each card
- Show canon layer indicator on each card

### Step 10: Backlink Re-parsing on Save
**File**: `src/lib/backlinks.ts` (extend)

Add `parseAndStoreBacklinks` function:
```typescript
export async function parseAndStoreBacklinks(
  userId: string,
  sourceType: string,
  sourceId: string,
  markdownContent: string
): Promise<void> {
  const db = getDb();

  // Delete existing outgoing backlinks from this source
  db.prepare(
    "DELETE FROM backlinks WHERE user_id = ? AND source_type = ? AND source_id = ?"
  ).run(userId, sourceType, sourceId);

  // Parse [[wikilinks]] from markdown
  const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = wikilinkRegex.exec(markdownContent)) !== null) {
    const targetName = match[1];

    // Resolve target name to entity
    const target = resolveEntityByName(userId, targetName);
    if (target) {
      // Infer link type from context
      const linkType = inferLinkType(markdownContent, match.index, target.type);

      // Get context snippet (50 chars around the link)
      const start = Math.max(0, match.index - 25);
      const end = Math.min(markdownContent.length, match.index + match[0].length + 25);
      const contextSnippet = markdownContent.slice(start, end);

      // Insert backlink
      db.prepare(
        "INSERT OR IGNORE INTO backlinks (id, user_id, source_type, source_id, target_type, target_id, link_type, context_snippet) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(crypto.randomUUID(), userId, sourceType, sourceId, target.type, target.id, linkType, contextSnippet);
    }
  }
}
```

## Files Created
- `src/app/api/lore/[type]/[id]/route.ts`
- `src/app/api/lore/[type]/route.ts`
- `src/app/(app)/lore/[type]/[id]/edit/page.tsx`
- `src/components/lore/markdown-editor.tsx`
- `src/components/lore/markdown-preview.tsx`
- `src/components/lore/wikilink-autocomplete.tsx`
- `src/components/lore/canon-layer-selector.tsx`
- `src/components/lore/validation-badge.tsx`
- `src/components/lore/backlink-panel.tsx`

## Files Modified
- `src/app/(app)/lore/page.tsx` (add edit buttons, badges)
- `src/lib/backlinks.ts` (add `parseAndStoreBacklinks`)
- `src/lib/lore-markdown.ts` (extend for editor support)

## Tests
- Lore CRUD via API (create, read, update, delete)
- Markdown file written to correct path
- Backlinks parsed and stored on save
- Wikilink autocomplete filters correctly
- Canon layer change updates entity
- Validation state transitions work
- Backlink panel shows correct incoming/outgoing links
- Auto-save draft to localStorage
- Editor renders existing content correctly
- Preview renders markdown with live wikilinks
- Auth enforcement on all endpoints

## Risk
- **MEDIUM**: Complex UI with many interacting components
- Wikilink resolution requires name lookup — ambiguous names need disambiguation
- Large markdown files may cause performance issues — mitigate with debounced preview updates
- Backlink parsing on every save — mitigate with diff-based approach (only re-parse if content changed)
