# Wiki Evolution Tooling (Plan 010)

> Part of the Wiki Evolution initiative (Plans 008–010).
>
> **Plan 010** — Adds bulk operations, merge/supersede, dormancy detection, and an
> admin restructure UI. Built on top of the Type Registry v2 (Plan 008) and the 2-level
> subtype folder structure (Plan 009).

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Reference Table](#quick-reference-table)
3. [Bulk Move](#bulk-move)
4. [Bulk Re-categorize](#bulk-re-categorize)
5. [Merge & Supersede](#merge--supersede)
6. [Dormancy](#dormancy)
7. [Admin Restructure UI](#admin-restructure-ui)
8. [File Reference](#file-reference)
9. [Related Plans](#related-plans)

---

## Overview

Plan 010 rounds out the wiki subsystem with **evolution tooling** — operations that
help you maintain, clean up, and reorganize a growing wiki. These tools fill the gap
between manual editing (drag-and-drop, individual API calls) and full automation
(scripts, batch jobs).

### What Problem This Solves

As a wiki grows from tens to hundreds or thousands of pages:

- Pages accumulate in the wrong folders or with inconsistent categorization
- Duplicate pages appear (same topic, different filenames or paths)
- Outdated or superseded pages clutter navigation and LLM context
- Manual reorganization becomes impractical at scale

The evolution tooling addresses each of these with a combination of **preview-first
bulk operations**, **intelligent duplicate detection**, and a **lifecycle model**
(draft → reviewed → locked → dormant).

### Architecture

```
Admin UI (/admin/restructure)
  │
  ├─ Bulk Move Tab ──────── POST /api/wiki/bulk-move ──────── bulk-move.ts
  ├─ Bulk Re-categorize ─── POST /api/wiki/bulk-recategorize ─ bulk-recategorize.ts
  ├─ Merge Suggestions ──── GET  /api/wiki/merge-suggestions ─ merge-suggester.ts
  │                         POST /api/wiki/merge ────────────── merge.ts
  └─ Dormancy Tab ────────── GET  /api/wiki (filter: dormant) ─ file-io.ts
                            PUT  /api/wiki/{path} (wake)
                            DELETE /api/wiki/{path} (delete)
```

All operations are **preview-first** (dry-run default). You see exactly what changes
before they are applied. Operations are reversible via backup or per-page undo.

### Lifecycle Integration

The existing validation workflow (draft → reviewed → locked) is extended with one
additional state: **dormant**. This state is the terminal phase for pages that have
been superseded (merged) or explicitly deprecated.

```
                    ┌─────────┐
                    │  draft  │
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │reviewed │
                    └────┬────┘
                         │
                    ┌────▼────┐     ┌──────────┐
                    │ locked  │ ──► │ dormant  │
                    └─────────┘     └──────────┘
                                        │
                                   ┌────▼────┐
                                   │ deleted │
                                   └─────────┘
```

A page enters `dormant` when:
- It is merged into another page (automatically set by `mergePages()`)
- A user explicitly marks it as dormant via the frontmatter panel
- An admin sets status to `dormant` via the Dormancy tab

---

## Quick Reference Table

| Tool | Purpose | API Endpoint | Method | Library |
|------|---------|-------------|--------|---------|
| **Bulk Move** | Move all pages between top-level folders | `/api/wiki/bulk-move` | POST | `bulk-move.ts` |
| **Bulk Re-categorize** | Change type/subtype/tags/status in bulk | `/api/wiki/bulk-recategorize` | POST | `bulk-recategorize.ts` |
| **Merge Suggestions** | Find duplicate page pairs | `/api/wiki/merge-suggestions` | GET | `merge-suggester.ts` |
| **Merge** | Combine two pages into one | `/api/wiki/merge` | POST | `merge.ts` |
| **Dormancy List** | View and manage dormant pages | `/api/wiki` (client filter) | GET | `file-io.ts` |
| **Wake Page** | Restore dormant page to draft | `/api/wiki/{path}` | PUT | `file-io.ts` |
| **Delete Page** | Permanently remove page | `/api/wiki/{path}` | DELETE | `file-io.ts` |

### Where to Access

| Interface | What's Available |
|-----------|-----------------|
| **Admin UI** (`/admin/restructure`) | All four tools in tabbed interface |
| **Direct API** | All endpoints programmatically |
| **Frontmatter panel** (on wiki page editor) | Set status to dormant |
| **File tree** | "Show dormant" toggle, drag-and-drop move |
| **Script/CLI** | All library functions importable from `src/lib/wiki/` |

### Safety Guarantees

- **Dry-run by default** — both bulk endpoints default to `dryRun: true`
- **Path traversal protection** — all operations validate paths via `isPathWithinRoot()`
- **Idempotent moves** — same-source-same-target is a no-op
- **Backup recommended** — always back up `data/{userId}/wiki/` before major operations
- **Confirmation dialog** — admin UI requires explicit confirmation before applying

---

## Bulk Move

**Purpose:** Move all pages from one top-level folder to another (e.g., `entities/` →
`characters/`). Each page's path is rewritten by replacing the top-level folder prefix.

**Key characteristics:**
- Folder-to-folder: source folder → destination folder (same relative subpath preserved)
- Preview first: shows every `oldPath → newPath` before applying
- Batch link rewrite: single scan phase rewrites all path-based wikilinks (O(n+m) instead of O(n×m))
- Frontmatter update: `type` field is singularized from the new folder name
- Subtype handling: explicit `newSubtype` can be set per move, or derived from registry

```typescript
// Example: move all entities to characters folder
const result = bulkMovePages([
  { oldPath: "entities/characters/gandalf.md", newPath: "characters/gandalf.md" },
  { oldPath: "entities/locations/shire.md",     newPath: "characters/locations/shire.md" },
], wikiRoot, { dryRun: true });

console.log(result.moved);     // ["entities/characters/gandalf.md", ...]
console.log(result.failed);    // any failures with reasons
console.log(result.linksUpdated); // count of pages whose links were rewritten
```

For full details: [wiki-bulk-operations.md](wiki-bulk-operations.md#bulk-move)

---

## Bulk Re-categorize

**Purpose:** Find pages matching a filter and change their frontmatter (type, subtype,
tags, status) in bulk. When type/subtype changes cause a folder move, the file is
moved and wikilinks are rewritten automatically.

**Key characteristics:**
- Filter by: type, subtype, tag, status, folder (all ANDed — empty filter matches all pages)
- Change: newSubtype, newType, newTags (replace), addTags, removeTags, newStatus
- Dry-run first: shows proposed changes (including folder moves) before applying
- Folder moves: when type/subtype change triggers a folder change, `moveWikiPage()` is called
- Tag operations: additive and subtractive tag changes supported

```typescript
const result = bulkRecategorize(
  { type: "entity", status: "draft" },            // filter
  { newSubtype: "character", addTags: ["npc"] },  // changes
  wikiRoot,
  { dryRun: true },                                // preview only
);

for (const change of result.changes) {
  console.log(change.path, change.proposed);
  // { path: "entities/misc/oddball.md", proposed: { subtype: "character", tags: ["npc"] } }
}
```

For full details: [wiki-bulk-operations.md](wiki-bulk-operations.md#bulk-re-categorize)

---

## Merge & Supersede

**Purpose:** Combine two wiki pages that are duplicates or cover overlapping topics.
Content is appended, frontmatter is merged (union of tags, max timestamps), and the
merge page is soft-deleted (marked dormant with `superseded_by`).

**Three detection strategies:**

| Strategy | Method | Cost | Confidence | When to Use |
|----------|--------|------|------------|-------------|
| A | Same title, different paths | Cheap | 0.95 | Obvious duplicates — same name, different folders |
| B | Wikilink overlap (Jaccard ≥ 0.8) | Medium | Variable | Pages linking to the same targets |
| C | LLM analysis of Strategy B candidates | Expensive | High | When you want LLM confirmation (stub — returns B results for now) |

```typescript
// Find candidates
const candidates = findMergeCandidates(wikiRoot, { strategy: "A", limit: 20 });
// candidates[0] = { pageA, pageB, confidence: 0.95, reason, strategy: "A" }

// Execute merge
const result = mergePages(
  "entities/characters/gandalf.md",     // keep this page
  "entities/characters/gandalf-dup.md", // merge this page in
  wikiRoot,
  { redirect: true },                    // create redirect stub
);
// result = { mergedFrom, kept, linksUpdated: 3, redirectCreated: true }
```

For full details: [wiki-merge-workflow.md](wiki-merge-workflow.md)

---

## Dormancy

**Purpose:** Deactivate wiki pages without deleting them. Dormant pages are hidden
from default file tree views, excluded from LLM retrieval context, and skipped by
orphan detection — but their wikilinks still resolve (no 404s).

**Key characteristics:**
- Hidden by default in file tree (toggled via "Show dormant")
- Excluded from LLM retrieval context
- Still resolve via wikilinks (no broken links)
- Excluded from orphan detection
- Can be woken (restored to draft) or permanently deleted
- `deprecated_at` timestamp set automatically, cleared on wake
- `superseded_by` field set when page was merged

```yaml
---
title: "Gandalf (old)"
type: entity
subtype: character
status: dormant
deprecated_at: "2026-06-08T12:00:00.000Z"
superseded_by: "entities/characters/gandalf.md"
---
```

For full details: [wiki-dormancy.md](wiki-dormancy.md)

---

## Admin Restructure UI

The Admin Restructure page at `/admin/restructure` provides a **tabbed interface**
for all four evolution tools. Each tab corresponds to a dedicated tab component.

### Tab Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Admin: Restructure                                              │
│  Bulk operations for wiki page management                        │
├──────────┬──────────────┬───────────────────┬───────────┤
│ Bulk Move│ Bulk Re-categorize │ Merge Suggestions │ Dormancy  │
├──────────┴──────────────┴───────────────────┴───────────┤
│                                                          │
│  [Tab content area — renders the active tab's component]  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Tab Components

| Tab | Component | Key Controls |
|-----|-----------|-------------|
| Bulk Move | `bulk-move-tab.tsx` | From/to folder selectors, Preview button, move list, Apply confirmation |
| Bulk Re-categorize | `bulk-recategorize-tab.tsx` | Filter section (type/subtype/tags/status), Changes section (what to modify), Preview + Apply |
| Merge Suggestions | `merge-suggestions-tab.tsx` | Strategy selector (A/B/C), Scan button, candidate list with confidence bars, Merge dialog with redirect option |
| Dormancy | `dormancy-tab.tsx` | Dormant pages list with path, type, date, Wake and Delete buttons, confirmation dialogs |

### How to Use

1. Navigate to `/admin/restructure` (requires authentication)
2. Select the relevant tab for the operation you want to perform
3. Configure the operation (select folders, set filters, choose strategy)
4. Click **Preview** to see what would change
5. Review the proposed changes carefully
6. Click **Apply** and confirm in the dialog
7. Verify the result (the page refreshes data after each operation)

### Common Patterns

**Pattern 1: Move all characters to a new folder**
```
1. Bulk Move tab
2. From: "entities" → To: "characters"
3. Preview → Verify paths → Apply
```

**Pattern 2: Re-tag all NPC entities**
```
1. Bulk Re-categorize tab
2. Filter: type=entity, tag=npc
3. Changes: addTags=["important"]
4. Preview → Verify → Apply
```

**Pattern 3: Find and merge duplicates**
```
1. Merge Suggestions tab
2. Strategy A (same title)
3. Scan → Review candidates (sorted by confidence)
4. For each pair: Review → Merge (with or without redirect)
```

**Pattern 4: Clean up dormant pages**
```
1. Dormancy tab
2. Review dormant pages and their superseded_by info
3. Wake pages that should be active
4. Delete pages that are truly obsolete
```

---

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/wiki/bulk-move.ts` | Batch file move + link rewrite (2-phase: file ops, then link scan) |
| `src/lib/wiki/bulk-recategorize.ts` | Filter-based frontmatter changes with optional folder move |
| `src/lib/wiki/merge-suggester.ts` | 3-strategy duplicate detection (A: title, B: wikilinks, C: LLM) |
| `src/lib/wiki/merge.ts` | Page merge: content append, frontmatter union, supersede, redirect |
| `src/lib/wiki/file-io.ts` | `listWikiPages` with dormant filtering, page CRUD |
| `src/lib/wiki/type-registry.ts` | Cached registry accessor for subtype/folder resolution |
| `src/lib/wiki/subtype-folders.ts` | Folder resolution pipeline (`folderForPage`, `folderForSubtype`) |
| `src/lib/wiki/move-page.ts` | Single page move (used internally by bulk-recategorize) |
| `src/lib/wiki/wikilinks.ts` | Wikilink parsing and `rewriteLinksForPageMove` |
| `src/lib/wiki/path-guard.ts` | Path traversal prevention (`isPathWithinRoot`) |
| `src/lib/wiki/__tests__/merge.test.ts` | Merge unit tests |
| `src/lib/wiki/__tests__/merge-suggestions.test.ts` | Merge suggester unit tests |
| `src/app/api/wiki/bulk-move/route.ts` | Bulk move API endpoint (dry-run by default) |
| `src/app/api/wiki/bulk-recategorize/route.ts` | Bulk recategorize API endpoint (dry-run by default) |
| `src/app/api/wiki/merge/route.ts` | Merge API endpoint |
| `src/app/api/wiki/merge-suggestions/route.ts` | Merge suggestions API endpoint |
| `src/app/(app)/admin/restructure/page.tsx` | Admin restructure page (tab container) |
| `src/app/(app)/admin/restructure/tabs/bulk-move-tab.tsx` | Bulk move tab UI |
| `src/app/(app)/admin/restructure/tabs/bulk-recategorize-tab.tsx` | Bulk recategorize tab UI |
| `src/app/(app)/admin/restructure/tabs/merge-suggestions-tab.tsx` | Merge suggestions tab UI |
| `src/app/(app)/admin/restructure/tabs/dormancy-tab.tsx` | Dormancy management tab UI |

---

## Related Plans

- **Plan 008**: Type Registry — introduced v2 config with `types`, `subtypeFolders`
- **Plan 009**: Subtype Folder Structure — 2-level folder hierarchy
- **Plan 010**: Evolution Tooling — bulk operations, merge, dormancy (this document)

## Related Documentation

- [Wiki Folder Structure](wiki-folder-structure.md) — Complete reference for the 2-level hierarchy
- [Wiki Type Registry](wiki-type-registry.md) — Configuring types, subtypes, and icons
- [Wiki Migration Guide (Subtype Folders)](wiki-migration-guide.md) — Migrating flat folders to 2-level
- [Wiki Merge Workflow](wiki-merge-workflow.md) — Detailed merge process and strategies
- [Wiki Dormancy](wiki-dormancy.md) — Dormant page lifecycle and behavior
- [Wiki Bulk Operations](wiki-bulk-operations.md) — Detailed bulk move and recategorize reference
