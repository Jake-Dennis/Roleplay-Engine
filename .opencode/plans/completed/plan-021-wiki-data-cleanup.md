# Plan 021: Wiki Data Cleanup

## Goal
Fix the systemic TYPE_MISMATCH convention issue, rehabilitate the broken `concepts` universe, update the audit script to accept singular/plural pairs, and improve wikilink generation.

## Tasks

### Layer 1 (parallel, no deps)

- [ ] **1a: Fix TYPE_MISMATCH convention** (assigned: @builder)
  - Decision needed: update frontmatter to plural OR update folder names to singular?
  - Option A (recommended): Update `scripts/audit-wiki.ts` to accept `concept` ↔ `concepts` and `entity` ↔ `entities` as valid pairs
  - Option B: Batch-update all 76 page frontmatter `type` fields to plural (`concepts`, `entities`)
  - Option C: Rename all `concepts/` folders to `concept/` and `entities/` to `entity/`
  - **Recommendation**: Option A (lowest risk, no data migration)
  - If Option A: Update `audit-wiki.ts` line that does the TYPE_MISMATCH comparison to normalize for singular/plural
  - If Option B/C: Create a migration script that processes all pages

- [ ] **1b: Rehabilitate "concepts" universe** (assigned: @builder)
  - The universe named `concepts` under user `8aec6985-...` has 11 root-level pages and no `.wiki-config.json`
  - Create `.wiki-config.json` for this universe
  - Move 11 event pages into `concepts/events/` subfolder
  - Update wikilinks within those pages if needed
  - OR: If this is test data, archive the pages and delete the universe

- [ ] **1c: Improve audit script** (assigned: @builder)
  - Update `scripts/audit-wiki.ts`:
    - Add singular/plural normalization for type matching
    - Add `--fix` mode to auto-resolve issues
    - Add tag-based subtype inference (pages with `type:location` tag but no subtype frontmatter)
    - Add cross-universe wikilink reporting (`[[Universe::Page]]`)
    - Add total page size statistics

## Verification
- [ ] 1a: TYPE_MISMATCH false positives eliminated — audit script shows 76 fewer issues
- [ ] 1b: `concepts` universe has `.wiki-config.json` and all 11 pages in proper `concepts/events/` folder
- [ ] 1c: Audit script has `--fix` mode, improved reporting
- [ ] Full: `npm test` passes
