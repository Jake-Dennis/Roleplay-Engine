# Wiki Merge Workflow

> **Plan 010** — Detecting duplicate wiki pages and merging them into one.
>
> Part of the Wiki Evolution tooling. Built on the Type Registry (Plan 008) and
> subtype folder structure (Plan 009).

---

## Table of Contents

1. [Overview](#overview)
2. [When to Merge vs. Archive vs. Delete](#when-to-merge-vs-archive-vs-delete)
3. [Merge Detection Strategies](#merge-detection-strategies)
4. [Strategy A — Same Title](#strategy-a--same-title)
5. [Strategy B — Wikilink Overlap](#strategy-b--wikilink-overlap)
6. [Strategy C — LLM Analysis](#strategy-c--llm-analysis)
7. [The Merge Process](#the-merge-process)
8. [Redirect Feature](#redirect-feature)
9. [Restore from Backup](#restore-from-backup)
10. [API Reference](#api-reference)
11. [File Reference](#file-reference)

---

## Overview

The merge workflow has two phases:

1. **Detection** — Find candidate duplicate pages using one of three strategies
2. **Execution** — Combine content, merge frontmatter, rewrite wikilinks, supersede

The merge is **destructive to the merge page's identity** but **non-destructive
to the content** — all content from both pages is preserved in the kept page.
The merge page is soft-deleted (set to `status: "dormant"`) and can be restored
at any time.

```
┌─────────────────────┐     ┌─────────────────────┐
│   Page A (keep)     │     │  Page B (merge)     │
│  "Gandalf"          │     │  "Gandalf (alt)"    │
│  entities/characters│     │  entities/characters │
└──────────┬──────────┘     └──────────┬──────────┘
           │                           │
           └──────────┬────────────────┘
                      │
                      ▼
           ┌─────────────────────┐     ┌─────────────────────────┐
           │  Kept Page (A)      │     │  Merged Page (B)        │
           │  Original content + │     │  status: dormant        │
           │  appended B content │     │  superseded_by: A path  │
           │  union of tags      │     │  superseded_at: <now>   │
           │  max timestamps     │     │  (invisible by default) │
           └─────────────────────┘     └─────────────────────────┘
```

---

## When to Merge vs. Archive vs. Delete

### Merge — Use When

- **Two pages cover the same topic** (e.g., "Gandalf" and "Gandalf the Grey")
- **One page is a subset of another** (e.g., a stub that was expanded elsewhere)
- **Content should be preserved** but combined into a single authoritative page
- Example: A wiki has `entities/characters/frodo.md` and `entities/hobbits/frodo-baggins.md`

### Archive — Use When

- **The page is no longer relevant** but you want to keep it for history
- **The content might be referenced in the future** but is not currently needed
- Move the page to `_review/archived/` or use a third-party backup
- The wiki subsystem does not have a built-in archive operation; use filesystem backup

### Delete — Use When

- **The page is truly obsolete** and nobody links to it
- **No merge candidate exists** (the content is unique but unwanted)
- **You have confirmed no inbound wikilinks** point to the page
- Use the Dormancy tab at `/admin/restructure` → Dormancy → Delete button

### Decision Matrix

| Condition | Merge | Archive | Delete |
|-----------|-------|---------|--------|
| Same topic, different source | ✓ Keep all content | — | — |
| Outdated but referenced by others | ✓ (merge into updated page) | ✗ (breaks links) | ✗ (breaks links) |
| No other pages link to it | ✓ (if duplicate) | ✓ | ✓ |
| Unique content, no duplicates | ✗ | ✓ | ✓ (if unwanted) |
| Has inbound wikilinks | ✓ (automatically rewrites them) | ✓ (keeps links working) | ✗ (404s) |
| LLM context polluted by old info | ✓ (merge + note) | ✗ (still in LLM context) | ✓ |

---

## Merge Detection Strategies

The `findMergeCandidates()` function in `merge-suggester.ts` implements three
strategies with increasing cost and accuracy:

| Strategy | Method | Cost | Confidence | When to Use |
|----------|--------|------|------------|-------------|
| **A** | Same title, different paths | Cheap (O(n)) | 0.95 | Run first — catches obvious duplicates |
| **B** | Wikilink overlap (Jaccard ≥ 0.8) | Medium (O(n²)) | 0.80–1.00 | Follow-up — catches related pages |
| **C** | LLM analysis of top B candidates | Expensive (LLM call per pair) | Highest | Final pass — confirms borderline cases |

### Recommendation

1. Start with **Strategy A** — it's fast and catches obvious duplicates
2. If that yields few results, try **Strategy B** — it finds pages that link to the
   same targets even when their titles differ
3. For highest confidence, use **Strategy C** (once the LLM integration is complete)

---

## Strategy A — Same Title

**How it works:**

1. Group all wiki pages (including dormant) by their lowercase, trimmed title
2. For groups with ≥2 pages, generate all pairwise combinations
3. Each pair gets a confidence of **0.95** (very strong signal, but two different
   "Council" pages about different councils could exist intentionally)

```typescript
// Internally, the strategy groups by title and generates pairs
function strategyA(pages: WikiPage[], limit: number): MergeCandidate[] {
  const byTitle = new Map<string, WikiPage[]>();
  for (const page of pages) {
    const key = page.frontmatter.title?.toLowerCase().trim();
    if (!key) continue;
    const list = byTitle.get(key) || [];
    list.push(page);
    byTitle.set(key, list);
  }
  // ... generate pairs for groups with >= 2 pages
}
```

**Example:**
```
Pages found:
  entities/characters/gandalf.md          title: "Gandalf"
  entities/characters/gandalf-alt.md      title: "Gandalf"
  concepts/lore/gandalf-the-wizard.md     title: "Gandalf"

Candidates:
  entities/characters/gandalf.md  ↔  entities/characters/gandalf-alt.md   (0.95)
  entities/characters/gandalf.md  ↔  concepts/lore/gandalf-the-wizard.md  (0.95)
  entities/characters/gandalf-alt.md  ↔  concepts/lore/gandalf-the-wizard.md  (0.95)
```

**Coverage:** Pages with different titles but the same content will NOT be found
by Strategy A. Use Strategy B for those.

### Limitations

- Case-insensitive matching: "Gandalf" and "gandalf" are treated as the same
- Pages with empty or missing `title` frontmatter are skipped
- Maximum 20 candidates by default (configurable via `limit`)

---

## Strategy B — Wikilink Overlap

**How it works:**

For each page, Strategy B builds a **wikilink signature** — the set of all targets
that page links to (lowercase, trimmed). It then compares every pair of pages using
**Jaccard similarity**:

```
J(A, B) = |A ∩ B| / |A ∪ B|
```

Where:
- `|A ∩ B|` = number of wikilink targets common to both pages
- `|A ∪ B|` = total unique wikilink targets across both pages

Pairs with `Jaccard ≥ 0.8` are returned as merge candidates.

```typescript
function strategyB(pages: WikiPage[], limit: number): MergeCandidate[] {
  // Build signatures: page path → Set of lowercase wikilink targets
  const signatures = new Map<string, Set<string>>();

  for (const page of pages) {
    const content = readFileSync(page.path, "utf-8");
    const links = parseWikilinks(content);
    const targets = new Set(
      links.map((l) => l.name.toLowerCase().trim()).filter(Boolean),
    );
    signatures.set(page.path, targets);
  }

  // Compare every pair using Jaccard similarity
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const intersection = new Set([...sigA].filter((x) => sigB.has(x)));
      const union = new Set([...sigA, ...sigB]);
      const jaccard = intersection.size / union.size;
      if (jaccard >= 0.8) {
        // This is a candidate
      }
    }
  }
}
```

**Example:**
```
Page A: "The Shire" links to: [hobbit, bilbo, bag-end, middle-earth, rivendell]
Page B: "Hobbiton" links to: [hobbit, bilbo, bag-end, middle-earth, bywater]

Intersection: {hobbit, bilbo, bag-end, middle-earth} = 4
Union: {hobbit, bilbo, bag-end, middle-earth, rivendell, bywater} = 6
Jaccard: 4/6 = 0.67 → Below threshold (not a candidate, but close)
```

**Confidence:** The Jaccard score itself IS the confidence value. A pair with
80% overlap gets confidence 0.80; 95% overlap gets 0.95.

### Limitations

- Pages with 0 wikilinks are skipped (no signature to compare)
- O(n²) comparison — on a wiki with 500 pages, that's ~125,000 comparisons.
  Performance is acceptable for most wikis under 1,000 pages but may be slow
  beyond that.
- Only considers outbound links, not inbound links. Two pages about the same
  topic that independently link to different targets will score low.

### Performance Notes

Strategy B reads every `.md` file on disk to parse wikilinks. On a large wiki
(1000+ pages), this may take several seconds. The result is not cached — each
scan re-parses all files.

---

## Strategy C — LLM Analysis

**How it works (currently a stub):**

Strategy C first runs Strategy B with a higher limit (50 candidates), then passes
each candidate pair to the Ollama LLM for confirmation. The LLM is prompted to
answer only YES or NO:

```
Are these two wiki pages about the same topic? Answer only YES or NO.

Page A: "Gandalf"
First 300 chars: Gandalf was a wizard of the Istari order...

Page B: "Mithrandir"
First 300 chars: Mithrandir, known in the West as Gandalf, was one of the...
```

Only pairs confirmed as duplicates by the LLM are returned.

**Current status:** Strategy C currently returns the top N results from Strategy B
without LLM analysis. The stub is in place and ready for LLM integration:

```typescript
function strategyC(
  preliminary: MergeCandidate[],
  limit: number,
): MergeCandidate[] {
  // For now, just return the top N from B results
  // LLM integration can be added later
  return preliminary.slice(0, limit);
}
```

**When to implement:**
- When you need high-confidence confirmation for borderline candidates
- When Strategy B produces too many false positives
- When you have an Ollama instance available and can tolerate the latency

---

## The Merge Process

When `mergePages()` is called, it performs the following steps in order:

### Step 1: Read Both Pages

Both source files are read from disk. If either file does not exist, an error is
thrown. If both paths are the same, an error is thrown ("Cannot merge a page
with itself").

```typescript
const keepPage = readWikiPage(keepAbs);
const mergePage = readWikiPage(mergeAbs);
```

### Step 2: Merge Content

The merge page's body content is appended to the keep page's body content,
separated by an `## Merged from {title}` heading:

```typescript
const mergedContent =
  keepPage.content +
  `\n\n## Merged from ${mergePage.frontmatter.title}\n\n` +
  mergePage.content;
```

**Result:**
```markdown
## Description
Gandalf was a wizard of the Istari order...

## Appearance
An old man with a grey beard...

## Merged from Gandalf (alt)
Gandalf was known by many names...

### Alternate Names
Mithrandir, Grey Pilgrim, Stormcrow...
```

### Step 3: Merge Frontmatter

Frontmatter is merged with the following rules:

| Field | Strategy |
|-------|----------|
| `title` | Kept from keep page (unchanged) |
| `type` | Kept from keep page |
| `subtype` | Kept from keep page |
| `status` | Kept from keep page |
| `tags` | **Union** of both pages' tags (deduplicated) |
| `created` | Earliest of the two timestamps |
| `updated` | Set to current time |
| `universe` | Kept from keep page |
| All others | Kept from keep page |

```typescript
const mergedTags = [
  ...new Set([
    ...(keepPage.frontmatter.tags || []),
    ...(mergePage.frontmatter.tags || []),
  ]),
];

const mergedCreated = maxDate(keepPage.frontmatter.created, mergePage.frontmatter.created);
const mergedUpdated = new Date().toISOString();
```

### Step 4: Write Kept Page

The updated keep page is written to disk with the merged content and merged
frontmatter:

```typescript
writeWikiPage(keepAbs, mergedContent, keepFrontmatter);
```

### Step 5: Supersede Merge Page

The merge page is **soft-deleted** — its frontmatter is updated to mark it as
dormant with a reference to the keep page:

```typescript
writeWikiPage(mergeAbs, mergePage.content, {
  ...mergePage.frontmatter,
  superseded_by: "entities/characters/gandalf.md",  // path to keep page
  superseded_at: "2026-06-08T12:00:00.000Z",        // current timestamp
  status: "dormant",
  updated: "2026-06-08T12:00:00.000Z",
});
```

The resulting frontmatter on the merge page:
```yaml
---
title: "Gandalf (alt)"
type: entity
subtype: character
status: dormant
superseded_by: "entities/characters/gandalf.md"
superseded_at: "2026-06-08T12:00:00.000Z"
---
```

The merge page's body content **is preserved** — nothing is deleted. This means
the merge is fully reversible.

### Step 6: Rewrite Wikilinks

All wiki pages (including dormant pages) are scanned for **path-based wikilinks**
pointing to the merge page. Those links are rewritten to point to the keep page.

**Links that are rewritten:**
- `[[entities/characters/gandalf-dup]]` → `[[entities/characters/gandalf]]`
- `[[entities/characters/gandalf-dup|alternate]]` → `[[entities/characters/gandalf|alternate]]`
- `![[entities/characters/gandalf-dup]]` → `![[entities/characters/gandalf]]`

**Links that are NOT rewritten:**
- `[[Gandalf]]` — bare-name links are left for the 3-pass resolver
- `[[Universe::Gandalf]]` — namespace links are also left alone

```typescript
const regex = new RegExp(
  `(!?)\\[\\[${escapedMergePath}(\\|[^\\]]*)?\\]\\]`, "g"
);
content = content.replace(regex, (_match, bang, alias) => {
  return `${bang}[[${keepPath}${alias || ""}]]`;
});
```

This preserves cross-universe link resolution. The 3-pass resolver naturally
resolves bare-name links to the kept page because the merge page is dormant and
would not be the primary match.

### Step 7: Create Redirect (Optional)

If `redirect: true`, a redirect stub is created at `_review/redirects/`:

```
_review/redirects/gandalf-dup.md
```
```markdown
---
title: Gandalf (alt)
type: concept
status: draft
superseded_by: entities/characters/gandalf.md
superseded_at: 2026-06-08T12:00:00.000Z
---

This page was merged into [[entities/characters/gandalf|Gandalf]].

Originally at: `entities/characters/gandalf-dup.md`
```

This redirect is purely informational — it does not affect wiki resolution at
runtime. It serves as a breadcrumb trail for anyone who finds the redirect file
in the filesystem.

### Full API Example

```bash
curl -X POST /api/wiki/merge \
  -H "Content-Type: application/json" \
  -d '{
    "keepPath": "entities/characters/gandalf.md",
    "mergePath": "entities/characters/gandalf-dup.md",
    "redirect": true
  }'
```

Response:
```json
{
  "mergedFrom": "entities/characters/gandalf-dup.md",
  "kept": "entities/characters/gandalf.md",
  "linksUpdated": 3,
  "redirectCreated": true
}
```

### Merge Script Example

For batch merges, call the library function directly:

```typescript
import { mergePages } from "@/lib/wiki/merge";
import { getWikiRoot } from "@/lib/wiki/wiki-root";

const wikiRoot = getWikiRoot("user-id");
const result = mergePages(
  "entities/characters/frodo.md",
  "entities/hobbits/frodo-baggins.md",
  wikiRoot,
  { redirect: true },
);

console.log(`Merged: ${result.mergedFrom} → ${result.kept}`);
console.log(`Links updated: ${result.linksUpdated}`);
console.log(`Redirect: ${result.redirectCreated ? "yes" : "no"}`);
```

---

## Redirect Feature

The redirect feature (`options.redirect: true`) creates a human-readable breadcrumb
in `_review/redirects/`. This is **optional** and primarily for filesystem auditing.

### What the Redirect Contains

- Frontmatter with `superseded_by` pointing to the keep page
- A wikilink to the keep page for quick navigation
- The original path as a reference

### When to Enable

- **Enable** when you want a clear audit trail of what happened to the merge page
- **Disable** when you want to minimize filesystem clutter
- The default in the admin UI is **enabled** (checkbox checked)

### Redirect vs. Wikilink Resolution

The redirect file is **not** used by the 3-pass wikilink resolver. It is purely
informational. Wikilinks are rewritten during Step 6 of the merge process, and
the 3-pass resolver handles any remaining bare-name links by naturally preferring
the active (non-dormant) page.

---

## Restore from Backup

Merges are **reversible** because the merge page's content is preserved in its
entirety (only `status` and `superseded_by` are changed). However, restoring
requires some manual work because content from both pages has been combined.

### Method 1: Full Backup Restore

If you have a backup of the wiki before the merge:

```bash
# Stop the server
# Restore the entire wiki
rm -rf data/{userId}/wiki
cp -r data/{userId}/wiki-backup-YYYYMMDD data/{userId}/wiki
# Restart the server
```

### Method 2: Unmerge (Manual)

If you don't have a full backup but the merge is recent:

1. **Wake the merge page** (set `status: "draft"` and remove `superseded_by`):
   ```yaml
   ---
   title: "Gandalf (alt)"
   type: entity
   subtype: character
   status: draft
   # removed: superseded_by, superseded_at
   ---
   ```

2. **Restore the keep page** — the merged content includes an `## Merged from`
   section at the end. Split that content back out:

   ```markdown
   # Original keep page content (everything before the merged section)
   ## Description
   Gandalf was a wizard...

   # Remove this section from keep page:
   ## Merged from Gandalf (alt)
   Gandalf was known by many names...
   ```

3. **Check wikilinks** — path-based links were rewritten during the merge.
   You'll need to manually restore them if you want the old paths back:
   ```bash
   grep -r "\[\[entities/characters/gandalf" data/{userId}/wiki/ --include="*.md"
   ```
   This is tedious for large wikis. A full backup restore is strongly preferred.

### Method 3: Revision History

If the merge page had revisions saved via `revisions.ts`, you can restore the
content from a revision snapshot:

```typescript
import { listRevisions, getRevision } from "@/lib/wiki/revisions";
import { writeWikiPage } from "@/lib/wiki/file-io";

const revisions = listRevisions(mergePagePath);
const lastRevision = await getRevision(mergePagePath, revisions[revisions.length - 1].id);
writeWikiPage(mergePagePath, lastRevision.content, lastRevision.frontmatter);
```

### Best Practice

**Always back up before batch operations:**
```bash
cp -r data/{userId}/wiki data/{userId}/wiki-backup-$(date +%Y%m%d-%H%M%S)
```

Keep backups for at least one week before cleaning them up.

---

## API Reference

### GET /api/wiki/merge-suggestions

Find duplicate page candidates.

**Query parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `strategy` | `"A" | "B" | "C"` | `"A"` | Detection strategy |
| `limit` | number | `20` | Maximum candidates to return |

**Response (200):**
```json
{
  "candidates": [
    {
      "pageA": "entities/characters/gandalf.md",
      "pageB": "entities/characters/gandalf-alt.md",
      "confidence": 0.95,
      "reason": "Same title: \"Gandalf\"",
      "strategy": "A"
    }
  ],
  "count": 1
}
```

### POST /api/wiki/merge

Execute a merge.

**Request body:**
```json
{
  "keepPath": "entities/characters/gandalf.md",
  "mergePath": "entities/characters/gandalf-dup.md",
  "redirect": false
}
```

**Response (200):**
```json
{
  "mergedFrom": "entities/characters/gandalf-dup.md",
  "kept": "entities/characters/gandalf.md",
  "linksUpdated": 3,
  "redirectCreated": false
}
```

**Error responses:**
- `400` — Missing or invalid fields, same paths, pages not found
- `401` — Authentication failed
- `415` — Content-Type is not application/json

---

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/wiki/merge-suggester.ts` | 3-strategy duplicate detection |
| `src/lib/wiki/merge.ts` | Merge execution (content append, frontmatter union, supersede) |
| `src/lib/wiki/file-io.ts` | Page read/write, `listWikiPages` with dormant filter |
| `src/lib/wiki/wikilinks.ts` | Wikilink parsing, `rewriteLinksForPageMove` |
| `src/lib/wiki/types.ts` | `WikiFrontmatter` with `superseded_by`, `superseded_at`, `status: "dormant"` |
| `src/app/api/wiki/merge-suggestions/route.ts` | Merge suggestions API endpoint |
| `src/app/api/wiki/merge/route.ts` | Merge API endpoint |
| `src/app/(app)/admin/restructure/tabs/merge-suggestions-tab.tsx` | Merge suggestions tab UI |
| `src/lib/wiki/__tests__/merge.test.ts` | Merge unit tests |
| `src/lib/wiki/__tests__/merge-suggestions.test.ts` | Merge suggester unit tests |

## Related Documentation

- [Wiki Evolution Tooling](wiki-evolution-tooling.md) — Overview of all Plan 010 tools
- [Wiki Dormancy](wiki-dormancy.md) — Dormant page lifecycle and behavior
- [Wiki Bulk Operations](wiki-bulk-operations.md) — Bulk move and recategorize reference
- [Wiki Folder Structure](wiki-folder-structure.md) — Folder hierarchy and path resolution
- [Wiki Type Registry](wiki-type-registry.md) — Type/subtype configuration
