# Wiki Dormancy

> **Plan 010** — Deactivating wiki pages that are superseded, deprecated, or no longer
> active, without deleting them.
>
> Part of the Wiki Evolution tooling. Extends the validation workflow (draft → reviewed
> → locked) with a terminal dormant state.

---

## Table of Contents

1. [Overview](#overview)
2. [What Dormant Means](#what-dormant-means)
3. [How to Mark a Page as Dormant](#how-to-mark-a-page-as-dormant)
4. [How to Wake a Dormant Page](#how-to-wake-a-dormant-page)
5. [Effects of Dormancy](#effects-of-dormancy)
6. [Dormancy Tab in Admin UI](#dormancy-tab-in-admin-ui)
7. [Frontmatter Reference](#frontmatter-reference)
8. [Comparison: Dormant vs. Other Statuses](#comparison-dormant-vs-other-statuses)
9. [FAQ](#faq)

---

## Overview

Dormancy is a **soft-delete** mechanism for wiki pages. When a page is no longer
relevant — because it has been merged into another page, its information is outdated,
or it was created by mistake — you can mark it as **dormant** rather than deleting
it entirely.

A dormant page:
- Is **hidden** from default wiki views (file tree, search results)
- Is **excluded** from LLM retrieval context
- Still **resolves** via wikilinks (no 404s for existing links)
- Is **excluded** from orphan detection
- Can be **woken** (restored to draft) at any time
- Can be **permanently deleted** when truly obsolete

### Why Dormancy Instead of Delete?

| Reason | Explanation |
|--------|-------------|
| **Safety net** | If a merge or deprecation was a mistake, the page can be woken |
| **Wikilink preservation** | Pages linking to the dormant page won't 404 |
| **Content preservation** | The full content is still on disk, readable |
| **Audit trail** | `superseded_by` and `deprecated_at` track what happened |
| **No context pollution** | Unlike deleted pages, dormant pages are explicitly marked |

### Where Dormancy Fits in the Lifecycle

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
                    └─────────┘     └─────┬────┘
                                          │
                                    ┌─────▼──────┐
                                    │  deleted   │ (permanent)
                                    └────────────┘
```

A page can enter `dormant` from any status (`draft`, `reviewed`, `locked`, or
`rejected`). Once dormant, it can be woken back to `draft` or permanently deleted.

---

## What Dormant Means

### For the User

- **Hidden by default**: Dormant pages do not appear in the file tree, wiki listing,
  or search results unless you explicitly toggle them on
- **No editing in default view**: You cannot accidentally edit a dormant page through
  normal navigation
- **Visible in dormancy management**: The Dormancy tab at `/admin/restructure` shows
  all dormant pages for review and management

### For the System

- **LLM context excluded**: When building prompts for generation, dormant pages are
  excluded from default context retrieval
- **Wikilinks still resolve**: The 3-pass wikilink resolver still matches dormant
  pages by title, so existing links don't break
- **No orphan detection**: Dormant pages are exempt from orphan reports — they are
  intentionally inactive
- **Backlinks count**: The dormant page's outbound links still count toward other
  pages' inbound link counts for orphan detection

### For the Filesystem

- **File remains on disk** at its original path
- **Frontmatter `status` field** is set to `"dormant"`
- **`deprecated_at` timestamp** is set automatically
- **`superseded_by`** is set when dormancy is caused by a merge (points to the
  replacement page)

---

## How to Mark a Page as Dormant

### Method 1: Frontmatter Panel (Recommended)

On any wiki page editor, there is a **status selector** dropdown in the frontmatter
panel. Select "dormant" from the dropdown.

1. Open the wiki page in the editor
2. Locate the frontmatter panel (sidebar or toggle)
3. Find the **Status** field
4. Change it from `draft`/`reviewed`/`locked` to `dormant`
5. Click **Save**

A **confirmation dialog** appears explaining the consequences:

> Mark "Gandalf (alt)" as dormant?
>
> Dormant pages are hidden from default views and excluded from LLM context.
> Wikilinks will still resolve. You can wake this page later.

6. Confirm to apply the change

### Method 2: Admin Dormancy Tab

1. Navigate to `/admin/restructure`
2. Click the **Dormancy** tab
3. Locate the page in the dormant list (or wake a page first, then re-dormant it
   from the frontmatter panel)

This method is primarily for **managing** dormant pages, not for creating them.

### Method 3: Direct API Call

```bash
curl -X PUT /api/wiki/entities/characters/gandalf-alt.md \
  -H "Content-Type: application/json" \
  -d '{
    "frontmatter": { "status": "dormant" }
  }'
```

### Method 4: Automatic via Merge

When `mergePages()` is called, the merge page is **automatically** set to dormant
with `superseded_by` pointing to the keep page:

```typescript
// mergePages() does this automatically:
writeWikiPage(mergeAbs, mergePage.content, {
  ...mergePage.frontmatter,
  superseded_by: "entities/characters/gandalf.md",
  superseded_at: "2026-06-08T12:00:00.000Z",
  status: "dormant",
  updated: "2026-06-08T12:00:00.000Z",
});
```

No manual action needed.

### Method 5: Direct Filesystem Edit

Edit the page's frontmatter directly:

```markdown
---
title: "Gandalf (alt)"
type: entity
subtype: character
status: dormant
deprecated_at: "2026-06-08T12:00:00.000Z"
---
```

This is not recommended but is always possible since wiki pages are plain markdown
files on disk.

---

## How to Wake a Dormant Page

Waking a dormant page restores it to `draft` status, making it active and editable
again.

### Method 1: Admin Dormancy Tab (Recommended)

1. Navigate to `/admin/restructure`
2. Click the **Dormancy** tab
3. Find the page in the dormant list
4. Click the **Wake** button (checkmark icon)
5. Confirm in the dialog:

> Restore "entities/characters/gandalf-alt.md" to draft status?
>
> The page will become active and editable again.

6. The page is restored to `draft` status and removed from the dormant list

Behind the scenes, this sends a PUT request to the wiki page API:
```typescript
fetch(`/api/wiki/${encodeURIComponent(path)}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    frontmatter: { status: "draft" },
  }),
});
```

### Method 2: Direct API Call

```bash
curl -X PUT /api/wiki/entities/characters/gandalf-alt.md \
  -H "Content-Type: application/json" \
  -d '{
    "frontmatter": { "status": "draft", "superseded_by": null }
  }'
```

### What Happens When You Wake a Page

| Field | Change |
|-------|--------|
| `status` | `"dormant"` → `"draft"` |
| `deprecated_at` | Cleared (removed from frontmatter) |
| `superseded_by` | **Not automatically cleared** — must be removed manually if needed |
| `superseded_at` | **Not automatically cleared** |
| `updated` | Set to current time |
| Visibility | Reappears in file tree, search, and LLM context |

> **Note:** If the page was dormant because it was merged, waking it creates
> two active pages about the same topic. The `superseded_by` field is kept
> as a breadcrumb. Remove it manually if you want a clean separation.

### Edge Case: Waking a Superseded Page

If a page was merged (has `superseded_by` set), waking it results in two active
pages with overlapping content. This is intentional — it allows you to undo a
merge or recreate a split page.

After waking, you should:
1. Remove `superseded_by` and `superseded_at` from the frontmatter
2. Review the kept page's content (it may have been modified after the merge)
3. Remove the `## Merged from ...` section from the kept page if desired

---

## Effects of Dormancy

### File Tree

**Default behavior:** Dormant pages are **hidden** from the file tree.

The `listWikiPages()` function filters them out by default:
```typescript
export function listWikiPages(
  wikiRoot: string,
  options?: { includeDormant?: boolean }
): WikiPage[] {
  // ... collect and sort pages ...

  // Filter out dormant pages by default
  if (!options?.includeDormant) {
    return pages.filter((p) => p.frontmatter.status !== "dormant");
  }

  return pages;
}
```

**"Show dormant" toggle:** The file tree component provides a toggle to show
dormant pages. When enabled, dormant pages are displayed with a muted appearance
(Moon icon, dimmed text) to distinguish them from active pages.

```
entities (15)
├── characters (8)
│   ├── Gandalf
│   ├── Frodo
│   ├── Aragorn
│   ├── ...
│   ├── 🌙 Gandalf (alt)    ← Dormant page (shown when toggle is on)
│   └── 🌙 Frodo (old)      ← Dormant page
├── locations (3)
└── items (2)
```

### LLM Retrieval

**Default behavior:** Dormant pages are **excluded** from LLM retrieval context.

When the system assembles context for generation (via `retrieval.ts` or
`query.ts`), it calls `listWikiPages()` without `includeDormant: true`,
which naturally excludes dormant pages.

This means:
- LLM-generated responses will not reference dormant page content
- Wiki queries (`/api/wiki/query`) using LLM synthesis will not cite dormant pages
- The LLM will not waste context tokens on outdated or superseded information

**If you want the LLM to reference a dormant page**, wake it first.

### Wikilinks

**Behavior:** Dormant pages **still resolve** via the 3-pass wikilink resolver.

Wikilinks are not affected by dormancy. The wikilink resolver matches by title,
and dormant pages are included in the link graph. This means:
- `[[Gandalf (alt)]]` will resolve to the dormant page
- `[[entities/characters/gandalf-alt]]` will resolve to the dormant page
- Pages linking to a dormant page will **not** produce broken links or warnings
- The link graph visualization will still show dormant pages (with muted styling)

This is intentional — it prevents a cascade of broken links when pages are
deprecated or merged.

### Orphan Detection

**Behavior:** Dormant pages are **excluded** from orphan detection.

The `findOrphans()` function explicitly skips dormant pages:
```typescript
export function findOrphans(wikiRoot: string): string[] {
  const allPages = listWikiPages(wikiRoot, { includeDormant: true });
  const linkGraph = buildLinkGraph(allPages);

  // ... build inbound link set ...

  for (const page of allPages) {
    // Skip dormant pages — they are intentionally inactive
    if (page.frontmatter.status === "dormant") continue;
    // ... orphan detection logic ...
  }
}
```

However, the dormant page's **outbound wikilinks still count** toward other pages'
inbound counts. This means a dormant page's links can prevent other pages from
being falsely identified as orphans.

### The `deprecated_at` Timestamp

When a page is marked as dormant, the `deprecated_at` frontmatter field is
automatically set to the current ISO timestamp:

```yaml
deprecated_at: "2026-06-08T12:00:00.000Z"
```

This timestamp:
- Is **set** when `status` changes to `"dormant"` (via the frontmatter panel)
- Is **cleared** when the page is woken (status changed back to `"draft"`)
- Is **not affected** by merges (merge uses `superseded_at` instead)
- Can be used for sorting dormant pages by deprecation date in the admin UI

In the `WikiFrontmatter` type:
```typescript
interface WikiFrontmatter {
  // ...
  status: "draft" | "reviewed" | "locked" | "rejected" | "dormant";
  /** ISO timestamp when the page was marked as dormant (deprecated). */
  deprecated_at?: string;
  /** Relative path of the page that supersedes this one. */
  superseded_by?: string;
  /** ISO timestamp when this page was superseded. */
  superseded_at?: string;
  // ...
}
```

---

## Dormancy Tab in Admin UI

The Dormancy tab at `/admin/restructure` provides a dedicated interface for
managing dormant pages.

### Page Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Dormancy                                                        │
│  Manage dormant (superseded) wiki pages. Wake to restore as      │
│  draft, or delete permanently.                        [Refresh]  │
├─────────────────────────────────────────────────────────────────┤
│ Title           │ Path              │ Type │ Date     │ Actions  │
├─────────────────┼───────────────────┼──────┼──────────┼──────────┤
│ 🌙 Gandalf (alt)│ entities/.../...md│entity│ 3d ago   │ [✓] [✗] │
│                 │ superseded by ... │      │          │          │
├─────────────────┼───────────────────┼──────┼──────────┼──────────┤
│ 🌙 Frodo (old)  │ entities/.../...md│entity│ 1w ago   │ [✓] [✗] │
└─────────────────┴───────────────────┴──────┴──────────┴──────────┘
```

### Controls

| Control | Description |
|---------|-------------|
| **Refresh** | Reload dormant pages from the server |
| **Wake (✓)** | Opens confirmation dialog → sets status to `draft` |
| **Delete (✗)** | Opens confirmation dialog → permanently deletes the file |

### Wake Confirmation Dialog

```
Wake Page
Restore "entities/characters/gandalf-alt.md" to draft status?
The page will become active and editable again.

              [Cancel]  [Wake to Draft]
```

### Delete Confirmation Dialog

```
Delete Page Permanently
Are you sure you want to permanently delete
"entities/characters/gandalf-alt.md"?
This action cannot be undone, and the page will be removed from disk.

              [Cancel]  [Delete Permanently]
```

---

## Frontmatter Reference

### Dormant Page Frontmatter

A typical dormant page's frontmatter after being marked:

```yaml
---
title: "Gandalf (alt)"
type: entity
subtype: character
status: dormant
tags:
  - wizard
  - istari
  - deprecated
created: "2026-05-15T10:30:00.000Z"
updated: "2026-06-08T12:00:00.000Z"
deprecated_at: "2026-06-08T12:00:00.000Z"
superseded_by: "entities/characters/gandalf.md"
superseded_at: "2026-06-08T12:00:00.000Z"
---
```

### Dormant After Merge (No Manual Deprecation)

```yaml
---
title: "Gandalf (alt)"
type: entity
subtype: character
status: dormant
tags:
  - wizard
  - istari
created: "2026-05-15T10:30:00.000Z"
updated: "2026-06-08T12:00:00.000Z"
superseded_by: "entities/characters/gandalf.md"
superseded_at: "2026-06-08T12:00:00.000Z"
# Note: deprecated_at is NOT set by merge — superseded_at serves that purpose
---
```

### Dormant Without Supersession (Manual Deprecation)

```yaml
---
title: "Outdated Magic Rules"
type: concept
subtype: rule
status: dormant
tags:
  - magic
  - deprecated
created: "2026-04-01T08:00:00.000Z"
updated: "2026-06-08T12:00:00.000Z"
deprecated_at: "2026-06-08T12:00:00.000Z"
# No superseded_by — this page was just deprecated, not merged
---
```

### Woken Page Frontmatter

After waking (status restored to `draft`):

```yaml
---
title: "Gandalf (alt)"
type: entity
subtype: character
status: draft
tags:
  - wizard
  - istari
created: "2026-05-15T10:30:00.000Z"
updated: "2026-06-08T13:00:00.000Z"
# deprecated_at has been removed
# superseded_by and superseded_at may still be present (not auto-cleared)
superseded_by: "entities/characters/gandalf.md"
superseded_at: "2026-06-08T12:00:00.000Z"
---
```

> **Note:** `superseded_by` is not automatically cleared on wake. If the page is
> no longer superseded, remove `superseded_by` and `superseded_at` manually.

---

## Comparison: Dormant vs. Other Statuses

| Aspect | Draft | Reviewed | Locked | Rejected | Dormant |
|--------|-------|----------|--------|----------|---------|
| **Editable** | Yes | Yes | No | Yes | No (must wake first) |
| **LLM context** | Included | Included | Included | Excluded | Excluded |
| **File tree** | Visible | Visible | Visible | Visible | Hidden by default |
| **Wikilink resolution** | Resolves | Resolves | Resolves | Resolves | Resolves |
| **Orphan detection** | Scanned | Scanned | Scanned | Scanned | Excluded |
| **Search results** | Included | Included | Included | Included | Excluded |
| **Can be deleted** | Yes | Yes | Yes | Yes | Yes |
| **Can be merged into** | Yes (target) | Yes | No | No | No (source only) |
| **Auto-transition to** | — | → locked | → locked | — | → draft (wake) |

---

## FAQ

### Can I edit a dormant page?

Not through the normal editor. You must **wake** it first (set status to `draft`).
After waking, the page behaves like any other draft page.

You can, however, edit the file directly on disk — since wiki pages are plain
markdown, nothing prevents you from modifying the file. But this is not recommended
because the application state (cache, index, etc.) will not be updated.

### Can I merge a dormant page into another page?

No. The merge function reads both pages from disk and merges the merge page's content.
A dormant page can only be used as the **merge source** (merged into another page).
It cannot be used as the **keep target** (you cannot merge content into a dormant page).

If you want to merge content into a dormant page, wake it first.

### Can I create a wikilink to a dormant page?

Yes. Wikilinks `[[dormant-page-title]]` resolve normally. The 3-pass resolver
includes dormant pages in its matching. This is by design — it prevents broken
links when pages are deprecated.

### Do dormant pages appear in the link graph visualization?

Yes, but they are displayed with muted styling (lower opacity, grayed out) to
distinguish them from active pages.

### Can I search for dormant pages?

Yes. The wiki search endpoint (`GET /api/wiki`) can include dormant pages if the
`includeDormant` parameter is set. The admin UI's Dormancy tab fetches all pages
and filters for dormant ones client-side.

### What happens to dormant pages during bulk operations?

Bulk operations (bulk move, bulk recategorize) use `listWikiPages(wikiRoot, { includeDormant: true })`
to include dormant pages in their scope. This means:
- **Bulk move**: Dormant pages are moved along with active pages
- **Bulk recategorize**: Dormant pages match the filter and can be recategorized
- **Merge suggestions**: Dormant pages are included in candidate detection (useful
  for finding dormant duplicates of active pages)

### Can I delete a dormant page permanently?

Yes. The Dormancy tab has a **Delete** button with a confirmation dialog. This
permanently removes the file from disk. The operation cannot be undone — only a
filesystem backup can restore it.

### Is there a bulk wake or bulk delete operation?

Not currently. Each dormant page must be woken or deleted individually from the
Dormancy tab. This is intentional to prevent accidental bulk operations on pages
that may have been intentionally deprecated.

### Does dormancy affect the index.md auto-generation?

Yes. The `index-generator.ts` function uses `listWikiPages()` to build the index,
so dormant pages are excluded from the auto-generated index by default.

### Can I configure the dormant page behavior?

The behavior is hardcoded in the wiki subsystem. Key control points:
- `listWikiPages()` options: `{ includeDormant: true }` to override default filtering
- 3-pass wikilink resolver: always includes dormant pages
- Orphan detection: explicitly skips dormant pages

To change behavior, modify these files:
- `src/lib/wiki/file-io.ts` — `listWikiPages()` dormant filtering
- `src/lib/wiki/wikilinks.ts` — Link graph and resolution
- `src/lib/wiki/orphans.ts` — `findOrphans()` dormant exclusion

---

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/wiki/file-io.ts` | `listWikiPages()` dormant filtering (lines 409–411) |
| `src/lib/wiki/types.ts` | `WikiFrontmatter` type with `status: "dormant"`, `deprecated_at` |
| `src/lib/wiki/frontmatter.ts` | `VALID_STATUSES` array including `"dormant"`, validation |
| `src/lib/wiki/orphans.ts` | `findOrphans()` — skips dormant pages (line 34) |
| `src/lib/wiki/merge.ts` | `mergePages()` — sets merge page to dormant with `superseded_by` |
| `src/lib/wiki/wikilinks.ts` | Link graph excludes dormant pages from collision detection |
| `src/lib/wiki/__tests__/file-io.test.ts` | Tests for dormant filtering behavior |
| `src/app/(app)/admin/restructure/tabs/dormancy-tab.tsx` | Dormancy management tab UI |
| `src/app/(app)/admin/restructure/page.tsx` | Admin restructure page (tab container) |

## Related Documentation

- [Wiki Evolution Tooling](wiki-evolution-tooling.md) — Overview of all Plan 010 tools
- [Wiki Merge Workflow](wiki-merge-workflow.md) — Merge process (creates dormant pages automatically)
- [Wiki Bulk Operations](wiki-bulk-operations.md) — Bulk move and recategorize reference
- [Wiki Folder Structure](wiki-folder-structure.md) — Folder hierarchy and page lifecycle
- [Wiki Schema Reference](wiki-schema-reference.md) — Frontmatter fields and validation
