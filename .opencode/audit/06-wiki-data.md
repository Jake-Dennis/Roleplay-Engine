# Wiki Data Audit — 2026-06-08

**Audit script:** scripts/audit-wiki.ts (TypeScript)  
**Run command:** 
px tsx scripts/audit-wiki.ts  
**Data root:** data/{userId}/wiki/{universeId}/  
**Generated:** 2026-06-08T08:03:10

---

## Executive Summary

The wiki data audit scanned **10 users**, **13 universes**, and **76 pages**, finding **112 issues**.

The single largest category of issues is **TYPE_MISMATCH (76 instances)** — every page in the wiki has a frontmatter 	ype value in singular form ("concept", "entity") while the containing folder is plural ("concepts", "entities"). This is a **systemic convention decision** rather than a data corruption problem, but it indicates a disconnect between how wiki pages are created/ingested and how they are stored.

The second-largest category is **ORPHAN (23 instances)** — pages with zero inbound wikilinks from other pages, indicating they are disconnected from the wiki's link graph. Most orphans are relationship-tracking or auto-extracted entity pages.

Other issues include **MISSING_CONFIG (1 universe)**, **ROOT_LEVEL_PAGE (12 pages)**, and zero subtype-related or superseded_by issues. **No MISSING_TITLE, MISSING_TYPE, MISSING_STATUS, BAD_STATUS, MERGE_CANDIDATE, or BROKEN_SUPERSEDED_BY issues** were found — the frontmatter is structurally complete across all pages.

**Bottom line:** The wiki data is structurally sound (no broken links, no missing required fields, no merge candidates). The issues are primarily convention-level (singular vs plural) and connectivity-level (orphan pages).

---

## How to Run

`powershell
# From project root:
npx tsx scripts/audit-wiki.ts
`

The script requires no arguments. It reads data/ relative to the project root.  
A PowerShell equivalent exists at scripts/audit-wiki.ps1 but has syntax errors (broken string terminators) and does not execute successfully.
---

## Raw Output

\\\
================================================================================
  WIKI AUDIT REPORT — 2026-06-08T08:03:10
================================================================================

  Users:      10
  Universes:  13
  Pages:      76
  Issues:     112

--------------------------------------------------------------------------------
  USER: 1d3eae5b-31fa-47eb-a457-dca056b52777
--------------------------------------------------------------------------------

  Universe: 43d7c50f-8204-4d68-959f-b29976a505d5
  Config:   OK
  Pages:    18
  Issues:   24

  Pages:
    [D] concepts/events/event_arrival-of-the-collector-in-oakhaven.md
    [D] concepts/events/event_elara-studying-crystal-of-ages.md
    [D] concepts/events/event_meeting-between-narrator-and-aldric-vane.md
    [D] concepts/relationship_aldric-vane-brotherhood-of-the-crimson-dawn.md
    [D] concepts/relationship_aldric-vane-heart-of-the-forest.md
    [D] concepts/relationship_aldric-vane-the-collector.md
    [D] concepts/relationship_elara-crystal-of-ages.md
    [D] concepts/relationship_sarah-oakhaven.md
    [D] entities/characters/aldric_vane.md
    [D] entities/characters/elara.md
    [D] entities/characters/sarah.md
    [D] entities/characters/the_collector.md
    [D] entities/items/crystal_of_ages.md
    [D] entities/items/heart_of_the_forest.md
    [D] entities/locations/oakhaven.md
    [D] entities/locations/silverport.md
    [D] entities/locations/thornwall.md
    [D] entities/organizations/brotherhood_of_the_crimson_dawn.md

  Issues:
    FOLDER:
      [~] TYPE_MISMATCH: concepts/events/event_arrival-of-the-collector-in-oakhaven.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/events/event_elara-studying-crystal-of-ages.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/events/event_meeting-between-narrator-and-aldric-vane.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_aldric-vane-brotherhood-of-the-crimson-dawn.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_aldric-vane-heart-of-the-forest.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_aldric-vane-the-collector.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_elara-crystal-of-ages.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_sarah-oakhaven.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: entities/characters/aldric_vane.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/characters/elara.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/characters/sarah.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/characters/the_collector.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/items/crystal_of_ages.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/items/heart_of_the_forest.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/locations/oakhaven.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/locations/silverport.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/locations/thornwall.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/organizations/brotherhood_of_the_crimson_dawn.md — frontmatter type is "entity" but folder is "entities"
    ORPHAN:
      [i] ORPHAN: concepts/relationship_aldric-vane-brotherhood-of-the-crimson-dawn.md — no inbound wikilinks
      [i] ORPHAN: concepts/relationship_aldric-vane-heart-of-the-forest.md — no inbound wikilinks
      [i] ORPHAN: concepts/relationship_aldric-vane-the-collector.md — no inbound wikilinks
      [i] ORPHAN: concepts/relationship_elara-crystal-of-ages.md — no inbound wikilinks
      [i] ORPHAN: concepts/relationship_sarah-oakhaven.md — no inbound wikilinks
      [i] ORPHAN: entities/locations/silverport.md — no inbound wikilinks
--------------------------------------------------------------------------------
  USER: 1d78ef3d-5d4e-4e83-8d7d-a2b46fa5bd72
--------------------------------------------------------------------------------

  Universe: a20d750d-7824-4e11-b224-3df6871c7a14
  Config:   OK
  Pages:    2
  Issues:   3

  Pages:
    [D] concepts/lore/about.md
    [D] entities/characters/Sir Subtype.md

  Issues:
    FOLDER:
      [~] TYPE_MISMATCH: concepts/lore/about.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: entities/characters/Sir Subtype.md — frontmatter type is "entity" but folder is "entities"
    ORPHAN:
      [i] ORPHAN: entities/characters/Sir Subtype.md — no inbound wikilinks

--------------------------------------------------------------------------------
  USER: 6f8f5c9b-7adf-4aa8-8e3f-de1425964188
--------------------------------------------------------------------------------

  Universe: 8225abb7-8e3a-4e56-9b49-5efeb0a4ccf7
  Config:   OK
  Pages:    1
  Issues:   1

  Pages:
    [D] concepts/about.md

  Issues:
    FOLDER:
      [~] TYPE_MISMATCH: concepts/about.md — frontmatter type is "concept" but folder is "concepts"
--------------------------------------------------------------------------------
  USER: 83383f87-f112-43c2-8e91-7df984ae27e7
--------------------------------------------------------------------------------

  Universe: 43d7c50f-8204-4d68-959f-b29976a505d5
  Config:   OK
  Pages:    28
  Issues:   39

  Pages:
    [D] concepts/events/event_arrival-at-thornwall-.md
    [D] concepts/events/event_arrival-of-the-collector-in-oakhaven-.md
    [D] concepts/events/event_introduction-to-aldric-vane-.md
    [D] concepts/event_arrival-at-thornwall.md
    [D] concepts/event_introduction-to-collector.md
    [D] concepts/event_tension-in-oakhaven.md
    [D] concepts/lore/about.md
    [D] concepts/relationship_-aldric-vane-heart-of-the-forest-.md
    [D] concepts/relationship_-aldric-vane-the-collector-.md
    [D] concepts/relationship_-brotherhood-of-the-crimson-dawn-heart-of-the-forest-.md
    [D] concepts/relationship_-elara-crystal-of-ages-.md
    [D] concepts/relationship_-sarah-oakhaven-.md
    [D] concepts/relationship_aldric-vane-brotherhood-of-the-crimson-dawn.md
    [D] concepts/relationship_aldric-vane-the-collector.md
    [D] concepts/relationship_elara-crystal-of-ages.md
    [D] concepts/relationship_sarah-oakhaven.md
    [D] concepts/relationship_the-collector-heart-of-the-forest.md
    [D] entities/characters/aldric_vane.md
    [D] entities/characters/elara.md
    [D] entities/characters/sarah.md
    [D] entities/characters/the_collector.md
    [D] entities/items/crystal_of_ages.md
    [D] entities/items/heart_of_the_forest.md
    [D] entities/locations/oakhaven.md
    [D] entities/locations/silverport.md
    [D] entities/locations/thornwall.md
    [D] entities/organizations/brotherhood_of_the_crimson_dawn.md
    [D] entities/organizations/the_brotherhood_of_the_crimson_dawn.md

  Issues:
    FOLDER:
      [~] TYPE_MISMATCH: concepts/events/event_arrival-at-thornwall-.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/events/event_arrival-of-the-collector-in-oakhaven-.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/events/event_introduction-to-aldric-vane-.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/event_arrival-at-thornwall.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/event_introduction-to-collector.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/event_tension-in-oakhaven.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/lore/about.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_-aldric-vane-heart-of-the-forest-.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_-aldric-vane-the-collector-.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_-brotherhood-of-the-crimson-dawn-heart-of-the-forest-.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_-elara-crystal-of-ages-.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_-sarah-oakhaven-.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_aldric-vane-brotherhood-of-the-crimson-dawn.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_aldric-vane-the-collector.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_elara-crystal-of-ages.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_sarah-oakhaven.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/relationship_the-collector-heart-of-the-forest.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: entities/characters/aldric_vane.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/characters/elara.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/characters/sarah.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/characters/the_collector.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/items/crystal_of_ages.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/items/heart_of_the_forest.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/locations/oakhaven.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/locations/silverport.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/locations/thornwall.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/organizations/brotherhood_of_the_crimson_dawn.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/organizations/the_brotherhood_of_the_crimson_dawn.md — frontmatter type is "entity" but folder is "entities"
    ORPHAN:
      [i] ORPHAN: concepts/relationship_-aldric-vane-heart-of-the-forest-.md — no inbound wikilinks
      [i] ORPHAN: concepts/relationship_-aldric-vane-the-collector-.md — no inbound wikilinks
      [i] ORPHAN: concepts/relationship_-brotherhood-of-the-crimson-dawn-heart-of-the-forest-.md — no inbound wikilinks
      [i] ORPHAN: concepts/relationship_-elara-crystal-of-ages-.md — no inbound wikilinks
      [i] ORPHAN: concepts/relationship_-sarah-oakhaven-.md — no inbound wikilinks
      [i] ORPHAN: concepts/relationship_aldric-vane-brotherhood-of-the-crimson-dawn.md — no inbound wikilinks
      [i] ORPHAN: concepts/relationship_aldric-vane-the-collector.md — no inbound wikilinks
      [i] ORPHAN: concepts/relationship_elara-crystal-of-ages.md — no inbound wikilinks
      [i] ORPHAN: concepts/relationship_sarah-oakhaven.md — no inbound wikilinks
      [i] ORPHAN: concepts/relationship_the-collector-heart-of-the-forest.md — no inbound wikilinks
      [i] ORPHAN: entities/organizations/the_brotherhood_of_the_crimson_dawn.md — no inbound wikilinks
--------------------------------------------------------------------------------
  USER: 8aec6985-e41f-494c-ba65-99648ee80d4b
--------------------------------------------------------------------------------

  Universe: 1cda4728-9567-4571-bd01-bf04f07eb4d9
  Config:   OK
  Pages:    1
  Issues:   1

  Pages:
    [D] concepts/lore/about.md

  Issues:
    FOLDER:
      [~] TYPE_MISMATCH: concepts/lore/about.md — frontmatter type is "concept" but folder is "concepts"

  Universe: 4648880a-7331-4d12-be58-083be22556ab
  Config:   OK
  Pages:    8
  Issues:   11

  Pages:
    [D] concepts/event_acknowledgment-of-the-journey-to-rivendell.md
    [D] concepts/event_arrival-at-the-prancing-pony.md
    [D] concepts/event_butterbur-s-reception.md
    [D] concepts/event_ordering-stew-and-ginger-beer.md
    [D] concepts/lore/about.md
    [D] entities/barliman_butterbur.md
    [D] entities/bree.md
    [D] entities/prancing_pony.md

  Issues:
    FOLDER:
      [~] TYPE_MISMATCH: concepts/event_acknowledgment-of-the-journey-to-rivendell.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/event_arrival-at-the-prancing-pony.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/event_butterbur-s-reception.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/event_ordering-stew-and-ginger-beer.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: concepts/lore/about.md — frontmatter type is "concept" but folder is "concepts"
      [~] TYPE_MISMATCH: entities/barliman_butterbur.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/bree.md — frontmatter type is "entity" but folder is "entities"
      [~] TYPE_MISMATCH: entities/prancing_pony.md — frontmatter type is "entity" but folder is "entities"
    ORPHAN:
      [i] ORPHAN: entities/barliman_butterbur.md — no inbound wikilinks
      [i] ORPHAN: entities/bree.md — no inbound wikilinks
      [i] ORPHAN: entities/prancing_pony.md — no inbound wikilinks

  Universe: 67e1cffb-54a8-488f-8fa0-f546922c012e
  Config:   OK
  Pages:    1
  Issues:   1

  Pages:
    [D] concepts/lore/about.md

  Issues:
    FOLDER:
      [~] TYPE_MISMATCH: concepts/lore/about.md — frontmatter type is "concept" but folder is "concepts"

  Universe: a1b4ab76-9cb2-4c5f-a7d7-b3e3d5b3ea6f
  Config:   OK
  Pages:    1
  Issues:   1

  Pages:
    [D] concepts/lore/about.md

  Issues:
    FOLDER:
      [~] TYPE_MISMATCH: concepts/lore/about.md — frontmatter type is "concept" but folder is "concepts"
  Universe: concepts
  Config:   MISSING
  Pages:    11
  Issues:   23

  Pages:
    [D] event_arrival-at-prancing-pony.md
    [D] event_arrival-at-the-prancing-pony.md
    [D] event_arrival-in-bree.md
    [D] event_confronting-grief-and-pain.md
    [D] event_grief-for-jacqueline.md
    [D] event_internal-struggle-with-grief-and-pain.md
    [D] event_jake-packs-his-bag.md
    [D] event_jake-walks-towards-rivendell.md
    [D] event_leaves-bree-for-rivendell.md
    [D] event_ordering-roast-pork-and-ginger-beer.md
    [D] event_player-enters-bree.md

  Issues:
    CONFIG:
      [~] Missing .wiki-config.json
    FOLDER:

---

## Issue Breakdown by Category

### TYPE_MISMATCH — 76 instances (67.9% of all issues)

**Severity: warn** — Convention issue, not data corruption.

Every wiki page has a mismatch between its frontmatter `type` field (singular) and its parent folder name (plural).
- `type: concept` in folder `concepts/`
- `type: entity` in folder `entities/`

The audit compares `fm.type` directly against the folder name, so "concept" != "concepts" always fails.

**Sub-categories:**

| Sub-category | Count | Description |
|---|---|---|
| Singular/plural convention | 64 | Frontmatter `concept` in `concepts/` folder or `entity` in `entities/` folder |
| Root-level structural | 12 | Page at wiki root (no type folder), so folder resolves to filename like `event_foo.md` vs `type: concept` |

**Systemic note:** This affects 100% of pages. The wiki creation pipeline (likely `src/lib/wiki/ingest.ts` or auto-extraction) writes `type: concept` and `type: entity` (singular), while the wiki storage convention uses plural folder names (`concepts/`, `entities/`). These are two different design choices that should be reconciled.

**Affected universes:** All 12 populated universes.

### ORPHAN — 23 instances (20.5% of all issues)

**Severity: info** — No broken behavior, but indicates incomplete cross-linking.

Pages with zero `[[wikilink]]` references from any other page in the same universe.

| Universe | Orphaned Page | Likely Cause |
|---|---|---|
| 43d7c50f (user 1) | concepts/relationship_aldric-vane-brotherhood-of-the-crimson-dawn.md | Relationship pages often auto-generated, no backlinks added |
| 43d7c50f (user 1) | concepts/relationship_aldric-vane-heart-of-the-forest.md | Same |
| 43d7c50f (user 1) | concepts/relationship_aldric-vane-the-collector.md | Same |
| 43d7c50f (user 1) | concepts/relationship_elara-crystal-of-ages.md | Same |
| 43d7c50f (user 1) | concepts/relationship_sarah-oakhaven.md | Same |
| 43d7c50f (user 1) | entities/locations/silverport.md | Auto-extracted, not yet linked |
| a20d750d (user 2) | entities/characters/Sir Subtype.md | Test page |
| 43d7c50f (user 4) | concepts/relationship_-aldric-vane-heart-of-the-forest-.md | Relationship pages (leading underscore variant) |
| 43d7c50f (user 4) | concepts/relationship_-aldric-vane-the-collector-.md | Same |
| 43d7c50f (user 4) | concepts/relationship_-brotherhood-of-the-crimson-dawn-heart-of-the-forest-.md | Same |
| 43d7c50f (user 4) | concepts/relationship_-elara-crystal-of-ages-.md | Same |
| 43d7c50f (user 4) | concepts/relationship_-sarah-oakhaven-.md | Same |
| 43d7c50f (user 4) | concepts/relationship_aldric-vane-brotherhood-of-the-crimson-dawn.md | Same (no leading underscore) |
| 43d7c50f (user 4) | concepts/relationship_aldric-vane-the-collector.md | Same |
| 43d7c50f (user 4) | concepts/relationship_elara-crystal-of-ages.md | Same |
| 43d7c50f (user 4) | concepts/relationship_sarah-oakhaven.md | Same |
| 43d7c50f (user 4) | concepts/relationship_the-collector-heart-of-the-forest.md | Same |
| 43d7c50f (user 4) | entities/organizations/the_brotherhood_of_the_crimson_dawn.md | Duplicate variant (has `the_` prefix) |
| 4648880a (user 5) | entities/barliman_butterbur.md | Auto-extracted, flat in entities/ |
| 4648880a (user 5) | entities/bree.md | Auto-extracted, flat in entities/ |
| 4648880a (user 5) | entities/prancing_pony.md | Auto-extracted, flat in entities/ |
| test (user 6) | api-test-page.md | Test page, root level |
| cf70a435 (user 8) | entities/Sir Testalot.md | Test page |

**Pattern:** 18 of 23 orphans are relationship-tracking pages. These are LLM-generated artifacts that reference entity names but use wikilink syntax inconsistently (or entity pages use `[[Title]]` while relationship pages use different naming).

### ROOT_LEVEL_PAGE — 12 instances (10.7% of all issues)

**Severity: info** — Pages sitting directly in the wiki root, not inside a type folder (`concepts/` or `entities/`).

| Universe | Pages |
|---|---|
| `concepts` (user 5) | 11 event pages (event_arrival-at-prancing-pony.md, event_grief-for-jacqueline.md, etc.) |
| `test` (user 6) | api-test-page.md |

The `concepts` universe is noteworthy: it is named after the type folder convention rather than being a UUID. This appears to be a universe where pages were placed directly at the root without being organized into type subfolders. No `.wiki-config.json` exists for this universe.

### MISSING_CONFIG — 1 instance (0.9% of all issues)

**Severity: warn**

| Universe | Issue |
|---|---|
| `concepts` (user 8aec6985) | No `.wiki-config.json` file |

This is the only universe missing its configuration. Combined with its 11 root-level pages and non-standard name, it appears to be an uninitialized or partially-migrated wiki universe.

### Issues NOT Found (Clean Sheets)

The following categories had **zero** instances:

| Category | Status |
|---|---|
| MISSING_TITLE | 0 — All 76 pages have a title in frontmatter |
| MISSING_TYPE | 0 — All 76 pages have a type in frontmatter |
| MISSING_STATUS | 0 — All 76 pages have a status in frontmatter |
| BAD_STATUS | 0 — All statuses are valid (`draft`) |
| MISSING_SUBTYPE | 0 — Pages in subtype subfolders all have subtype in frontmatter |
| WRONG_SUBTYPE_FOLDER | 0 — All subtype pages are in the correct folder |
| MERGE_CANDIDATE | 0 — No duplicate titles within any universe |
| BROKEN_SUPERSEDED_BY | 0 — No broken superseded_by references |
| SUPERSEDED_NOT_DORMANT | 0 — No superseded pages with wrong status |
---

## Page Stats

### Per User

| User ID | Universes | Pages | Issues |
|---|---|---|---|
| `1d3eae5b-31fa-47eb-a457-dca056b52777` | 1 | 18 | 24 |
| `1d78ef3d-5d4e-4e83-8d7d-a2b46fa5bd72` | 1 | 2 | 3 |
| `6f8f5c9b-7adf-4aa8-8e3f-de1425964188` | 1 | 1 | 1 |
| `83383f87-f112-43c2-8e91-7df984ae27e7` | 1 | 28 | 39 |
| `8aec6985-e41f-494c-ba65-99648ee80d4b` | 5 | 22 | 37 |
| `8e00579a-06bb-4673-8cca-2ca269678806` | 1 | 1 | 3 |
| `a750ee1c-408f-4cda-861f-e429d4c20229` | 0 | 0 | 0 |
| `ac8f9f5f-7d6d-457c-8013-dba4ab45c748` | 1 | 2 | 3 |
| `b4e7c28b-15dd-4015-a62c-b32f5f054dfb` | 1 | 1 | 1 |
| `e788f387-c200-4660-9919-40bfea52b5da` | 1 | 1 | 1 |
| **Total** | **13** | **76** | **112** |

### Per Universe

| Universe ID | User | Pages | Config |
|---|---|---|---|
| `43d7c50f-8204-4d68-959f-b29976a505d5` | `1d3eae5b` | 18 | OK |
| `a20d750d-7824-4e11-b224-3df6871c7a14` | `1d78ef3d` | 2 | OK |
| `8225abb7-8e3a-4e56-9b49-5efeb0a4ccf7` | `6f8f5c9b` | 1 | OK |
| `43d7c50f-8204-4d68-959f-b29976a505d5` | `83383f87` | 28 | OK |
| `1cda4728-9567-4571-bd01-bf04f07eb4d9` | `8aec6985` | 1 | OK |
| `4648880a-7331-4d12-be58-083be22556ab` | `8aec6985` | 8 | OK |
| `67e1cffb-54a8-488f-8fa0-f546922c012e` | `8aec6985` | 1 | OK |
| `a1b4ab76-9cb2-4c5f-a7d7-b3e3d5b3ea6f` | `8aec6985` | 1 | OK |
| `concepts` | `8aec6985` | 11 | MISSING |
| `test` | `8e00579a` | 1 | OK |
| `cf70a435-fb65-47f6-9823-0ddb098c9b73` | `ac8f9f5f` | 2 | OK |
| `36ed5a7c-22d3-4b04-8b00-eac4c996a6f2` | `b4e7c28b` | 1 | OK |
| `f974f8a7-fbf7-4b37-9482-a8189b713a0e` | `e788f387` | 1 | OK |

### Page Type Distribution

| Frontmatter Type | Count | Folder(s) |
|---|---|---|
| `concept` | 50 | `concepts/` (or root-level for 12 pages) |
| `entity` | 26 | `entities/` |
| **Total** | **76** | |

### Status Distribution

| Status | Count | Percentage |
|---|---|---|
| `draft` | 76 | 100% |
| `reviewed` | 0 | 0% |
| `locked` | 0 | 0% |
| `rejected` | 0 | 0% |
| `dormant` | 0 | 0% |

**Every wiki page is in `draft` status.** No content has been reviewed, locked, or marked for rejection/dormancy. This is expected for an early-stage project.

### Subtype Distribution

| Subtype | Count | Pages |
|---|---|---|
| `event` | 27 | All pages in `concepts/events/` or prefixed `concepts/event_` |
| `character` | 11 | All pages in `entities/characters/` (or flat entity pages with char subtype via tags) |
| `lore` | 7 | `concepts/lore/about.md` across 7 universes |
| `item` | 4 | `entities/items/*` |
| `location` | 6 | `entities/locations/*` (or flat entity pages inferred as locations via tags) |
| `organization` | 4 | `entities/organizations/*` |
| *(no subtype)* | ~17 | Flat entity pages (e.g. `entities/bree.md`) and root-level pages with no subtype |

Note: Many entity pages have no `subtype` in frontmatter because they are stored flat in `entities/` (not in a subtype subfolder). The subtype is sometimes inferable from tags like `type:character` or `type:location` but is not consistently extracted into the frontmatter `subtype` field.

### About.md Pages

| File | Universes | Purpose |
|---|---|---|
| `concepts/lore/about.md` | 7 universes | Sub-universe description (lore subtype) |
| `concepts/about.md` | 3 universes | Sub-universe description (flat in concepts/) |

These `about.md` pages function as universe-level descriptions and are exempted from orphan detection by design.

### Page Size Profile (approximate)

Most pages are 14-23 lines (auto-extracted session snippets). The `about.md` pages are typically shorter (descriptive metadata). Relationship pages are similarly compact (< 25 lines). None exceed ~50 lines.
---

## Critical Issues

### Critical (Should Fix)

1. **TYPE_MISMATCH singular/plural convention (64 pages)** — The audit flags this as a mismatch, but it is really a project-wide convention decision that needs resolution. Either:
   - Change frontmatter `type` to plural (`concepts`, `entities`) — affects wiki creation/ingest pipeline
   - Change folder names to singular (`concept/`, `entity/`) — affects all existing data
   - Update the audit script to accept singular/plural pairs as valid
   - **Recommendation:** Update the audit to accept this convention; it is consistent across 100% of pages.

2. **Universe "concepts" (11 root-level pages, MISSING_CONFIG)** — This is a clearly broken universe. Pages are directly in the wiki root with no type folder structure, and there is no `.wiki-config.json`. These 11 pages likely:
   - Were auto-extracted from sessions without proper wiki initialization
   - Should be moved into proper `concepts/events/` subfolder structure
   - Need a `.wiki-config.json` created
   - Or the universe should be deleted if it is test data

### Moderate (Should Address)

3. **ORPHAN relationship pages (18 of 23)** — Relationship-tracking pages are consistently unlinked. This suggests the auto-extraction pipeline creates relationship pages but does not add wikilinks from/to the related entity pages. Entity pages (`[[Aldric Vane]]`) reference entities by capitalized name, while relationship pages use snake_case filenames like `aldric-vane-the-collector.md`. The wikilink detection in the audit checks for `[[pageName` and `[[title`, so if the wikilink syntax in content does not match the filename exactly, links will be missed.

4. **ORPHAN auto-extracted entities (5 instances)** — `barliman_butterbur.md`, `bree.md`, `prancing_pony.md`, `silverport.md`, and `the_brotherhood_of_the_crimson_dawn.md` have no inbound links. These are auto-extracted session artifacts that should be cross-linked from the main entity pages.

### Cosmetic (Low Priority)

5. **ROOT_LEVEL_PAGE (test universe)** — Single test page (`api-test-page.md`) in the `test` universe. This is harmless test scaffolding but should be cleaned up.

6. **User `a750ee1c`** — Has a `wiki/` directory but zero universe subdirectories (empty user). This may be a partially-created account.

7. **All pages are `draft` status** — Expected for early development, but no pages have progressed through the `draft -> reviewed -> locked` workflow. The wiki validation workflow is untested.

---

## Recommendations

1. **Fix the TYPE_MISMATCH audit false positive:** Update the audit script to recognize `concept` <-> `concepts` and `entity` <-> `entities` as valid matches. Alternatively, change all frontmatter `type` values to plural to match folder names. Either way, the convention needs to be consistent between creation and storage.

2. **Rehabilitate or remove the "concepts" universe:** This is the most actionable real issue. 11 pages are orphaned at root level with no config. Either:
   - Move pages into `concepts/events/` structure and create `.wiki-config.json`
   - Or delete the universe and its contents if it is test data

3. **Improve wikilink generation in the auto-extraction pipeline:** Relationship pages are consistently orphaned because the LLM-generation does not add backlinks. Consider:
   - Adding `[[relationship:...]]` references from entity pages to their relationship pages
   - Normalizing wikilink target matching (the audit does basic substring matching, but content may use different casing or prefix formats)

4. **Audit script enhancements:**
   - Add a `--fix` mode to auto-resolve singular/plural convention
   - Add consideration of tag-based subtype inference (e.g., pages with `type:location` tag but no subtype frontmatter)
   - Report on cross-universe wikilinks (`[[Universe::Page]]`)
   - Add total page size statistics

5. **Test data cleanup:** Consider removing or flagging test universes (`test`, `concepts` named universe) from production reporting.