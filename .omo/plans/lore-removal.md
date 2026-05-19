# Remove Old Lore System

**Goal**: Remove the old DB-backed lore system now that the markdown wiki system is complete and verified. Migrate all active consumers to wiki-native equivalents.

**Strategy**: Phased removal with extraction pre-work, no data loss, rollbackable at each step.

---

## Dependency Map (Pre-Plan Intel)

### What's safe to delete (zero external imports):
- `src/components/lore/lore-editor.tsx` — 0 importers
- `src/components/lore/wikilink-autocomplete.tsx` — 0 importers

### What has 1 importer:
- `src/components/lore/lore-browser.tsx` → only imported by `/lore/page.tsx`
- `src/components/lore/validation-queue.tsx` → fetches API only, no direct imports
- `src/app/(app)/lore/page.tsx` → Next.js page, only auto-imported by router
- `src/app/(app)/lore/[id]/edit/page.tsx` → Next.js page

### What has active dependents that are NOT being removed:
- `src/lib/lore-markdown.ts` → **8 importers**, 1 of which is KEPT: `relationship-markdown.ts`
- `lore_validations` DB table → **7 active consumers** (contradiction-detector, semantic-contradiction, job-processor, idle-enrichment, contradictions API, lore-validations API, universes cascade)

### Ghost tables (referenced in code, never created in schema):
- `lore_entries` — referenced by importance-scoring.ts, user-overrides.ts, job-processor.ts
- `importance_scores` — referenced by importance-scoring.ts
- `user_overrides` — referenced by user-overrides.ts

### Cleanup script risk:
- `scripts/cleanup-old-lore-tables.ts` drops `backlinks`, `embedding_index`, `embedding_vectors` — **ALL USED BY WIKI**. Must be fixed before running.
- `scripts/cleanup-old-lore-tables.ts` also drops `relationships` — **`relationship-markdown.ts` DEPENDS ON THIS TABLE**. Must be fixed before running.

---

## Phase 0 — Pre-Work (BLOCKER for Phase 4+5)

### P0.1 — Extract shared utilities from `lore-markdown.ts`
**Files:** `src/lib/lore-markdown.ts` → `src/lib/markdown-utils.ts`

`relationship-markdown.ts` imports `buildMarkdown`, `parseFrontmatter`, `LoreFrontmatter` — these are generic markdown utilities, not lore-specific.

**Tasks:**
1. Create `src/lib/markdown-utils.ts` containing:
   - `buildMarkdown()` — builds YAML frontmatter + body string
   - `parseFrontmatter()` — parses YAML frontmatter from file content
   - `LoreFrontmatter` type (rename to `MarkdownFrontmatter`)
2. Update `src/lib/relationship-markdown.ts` to import from `markdown-utils.ts`
3. Update `src/lib/lore-markdown.ts` to re-export from `markdown-utils.ts` (backward compat)
4. **Verify:** `npx next build` succeeds
5. **Verify:** `grep "from.*lore-markdown" src/lib/relationship-markdown.ts` → 0 matches

### P0.2 — Run validation migration FIRST (blocker order: must run BEFORE P0.3)
```bash
npx tsx scripts/migrate-backlinks-validations.ts --userId <userId>
```
This reads `lore_validations` states and writes them to wiki page frontmatter. **Must run before any table rename (P0.3).**
If no users have data yet, confirm this and skip.

**Note:** This is a one-time migration. The script also queries `locations`, `npcs`, `events` tables to resolve entity names — these are dropped in Phase 5.3. Ensure this runs before Phase 5.3.

**Verify:** Script exits with code 0.

### P0.3 — Choose `lore_validations` fate
`lore_validations` is actively used by contradiction detection, semantic scanning, job validation — none have wiki fallbacks.

**Option A (recommended):** Rename to `entity_validations`, update all 7 consumers. Safest path.
**Option B:** Migrate contradiction detection to wiki frontmatter status first. Cleaner but more work.
**Option C:** Keep `lore_validations` as-is. Only drop truly dead tables like `lore_edits`.

**Recommendation:** Option A. Contradiction detection depends on this table — it's the source of truth for "validated canon" used as a ground truth reference. The wiki's frontmatter status field (`draft` / `reviewed` / `locked`) is a separate workflow.

**Tasks if Option A:**
1. Rename table: `ALTER TABLE lore_validations RENAME TO entity_validations`
2. Update all SQL queries in:
   - `src/lib/contradiction-detector.ts`
   - `src/lib/semantic-contradiction.ts`
   - `src/lib/job-processor.ts`
   - `src/lib/idle-enrichment.ts`
   - `src/app/api/contradictions/route.ts`
   - `src/app/api/universes/[id]/route.ts`
3. Update `scripts/init-db.ts` CREATE TABLE statement
4. Update `scripts/cleanup-old-lore-tables.ts` — remove `lore_validations` from drop list (or keep as `entity_validations`)
5. **Verify:** `npx next build` succeeds
6. **Verify:** `curl http://localhost:3000/api/contradictions` returns valid JSON (not 500)

### P0.4 — Fix `cleanup-old-lore-tables.ts`
Remove from the drop list:
- `backlinks` — used by wiki backlink panel
- `embedding_index` — used by wiki retrieval pipeline
- `embedding_vectors` — used by wiki embedding system
- `relationships` — used by `relationship-markdown.ts` (kept component)

The cleanup script should only drop: `lore_edits`, `narrative_memories`, `locations`, `npcs`, `events`.

### P0.5 — DB backup
```bash
sqlite3 data/global.db ".backup data/global.db.pre-lore-removal"
```
**Verify:** File exists and is non-empty.

---

## Phase 1 — UI Cleanup (Safe, zero build risk)

### 1.1 — Delete zero-import components
**Files to delete:**
- `src/components/lore/lore-editor.tsx` — 0 importers, safe
- `src/components/lore/wikilink-autocomplete.tsx` — 0 importers, safe

**Verify:** `grep -rl "lore-editor\|wikilink-autocomplete" src/app src/components src/lib` → 0 matches (excluding graphify-out/)

### 1.2 — Redirect old lore pages to wiki
**Files:**
- `src/app/(app)/lore/page.tsx` — replace with redirect to `/wiki`
- `src/app/(app)/lore/[id]/edit/page.tsx` — replace with redirect to `/wiki?edit=<id>`

**Tasks:**
1. Rewrite `lore/page.tsx` to a simple redirect component
2. Rewrite `lore/[id]/edit/page.tsx` to redirect to wiki edit URL
3. **Verify:** `curl -I http://localhost:3000/lore` returns 302 with `Location: /wiki`
4. **Verify:** `npx next build` succeeds

### 1.3 — Delete lore-browser and validation-queue
Now that `lore/page.tsx` no longer imports `LoreBrowser`:
- Delete `src/components/lore/lore-browser.tsx`
- Delete `src/components/lore/validation-queue.tsx`

**Verify:** `grep -rl "lore-browser\|validation-queue" src/` → 0 matches (excluding graphify-out/)

---

## Phase 2 — API Route Removal ✅

### 2.1 — Delete lore-specific API routes ✅
**Files deleted:**
- `src/app/api/lore-files/route.ts` ✅
- `src/app/api/lore-edits/route.ts` ✅

### 2.2 — Delete entity CRUD API routes ✅
**Files deleted:**
- `src/app/api/locations/route.ts` ✅
- `src/app/api/locations/[id]/route.ts` ✅
- `src/app/api/npcs/route.ts` ✅
- `src/app/api/npcs/[id]/route.ts` ✅
- `src/app/api/events/route.ts` ✅
- `src/app/api/events/[id]/route.ts` ✅
- `src/app/api/lore-validations/route.ts` ✅

**Pages redirected to /wiki:**
- `src/app/(app)/validations/page.tsx` ✅
- `src/app/(app)/characters/page.tsx` ✅
- `src/app/(app)/canon/page.tsx` ✅
- `src/app/(app)/events/page.tsx` ✅

**Verify:** `npx next build` succeeds ✅

---

## Phase 3 — DB Fallback Strip (High risk, atomic changes)

### 3.1 — Strip old job handlers from `job-processor.ts`
**Remove these handlers** (gated by `WIKI_JOBS !== "true"`):
- `handleExpandLore` (lines ~544-562)
- `handleEnrichNpc` (lines ~847-916)
- `handleExpandRumors` (lines ~918-986)
- `handleExtractEvent` (lines ~1063-1139)
- `handleExpandLocationLore` (lines ~1141-1210)
- `handleLoreDeepening` (lines ~1290-1360) — also removes ghost `lore_entries` ref

Also remove:
- `import { processLoreExpansion } from "@/lib/lore-expansion"` (line 24)
- The `if (process.env.WIKI_JOBS === "true")` guards in `processJob()` switch — replace with direct wiki handler calls (remove the conditional, always call wiki handler)

**Verify:** `grep "processLoreExpansion\|handleExpandLore\|handleEnrichNpc\|handleExpandRumors\|handleExtractEvent\|handleExpandLocationLore\|handleLoreDeepening" src/lib/job-processor.ts` → 0 matches

### 3.2 — Strip DB fallback from `idle-processing.ts`
**Remove:**
- `import { getUniversesNeedingLoreExpansion, processLoreExpansion } from "@/lib/lore-expansion"` (line 30)
- All `if (useWiki) { ... } else { ... }` branches — keep only the wiki path
- Remove all DB fallback `processJobsByType()` calls that reference old lore

**Verify:** `grep "processLoreExpansion\|getUniversesNeedingLoreExpansion\|handleExpandLore\|handleEnrichNpc\|handleExpandRumors" src/lib/idle-processing.ts` → 0 matches

### 3.3 — Strip DB fallback from `idle-enrichment.ts`
**Remove:**
- All `if (useWiki) { ... } else { ... }` branches — keep only wiki path
- All old DB enrichment function calls

**Verify:** `grep "lore\|Lore\|processLoreExpansion" src/lib/idle-enrichment.ts` → only wiki-related matches

### 3.4 — Update `retrieval.ts`
**Tasks:**
1. If `getLoreContext()` exists and queries old tables — remove the DB fallback
2. Make `WIKI_FIRST` the only path (remove conditional that checks wiki presence)

**Verify:** `grep "getLoreContext\|lore_entries\|lore_validations" src/lib/retrieval.ts` → 0 matches
**Verify:** `npx next build` succeeds

---

## Phase 4 — Library Cleanup ✅

### 4.1 — Delete `lore-expansion.ts` ✅
**File deleted:** `src/lib/lore-expansion.ts` ✅

### 4.2 — Delete `lore-markdown.ts` ✅
**File deleted:** `src/lib/lore-markdown.ts` ✅

### 4.3 — Clean up ghost table references ✅
**Removed `lore_entries` from:**
- `src/lib/importance-scoring.ts` — tableMap entries (2 locations) ✅
- `src/lib/user-overrides.ts` — tableMap entry ✅

### 4.4 — Update `relationship-markdown.ts` ✅
**Verify:** `grep "from.*lore" src/lib/relationship-markdown.ts` → 0 matches ✅
**Verify:** `npx next build` succeeds ✅

---

## Phase 5 — Schema & Script Cleanup ✅

### 5.1 — Update `init-db.ts` ✅
- Removed `locations`, `npcs`, `events`, `narrative_memories` table definitions ✅
- Removed `vec_lore` virtual table ✅
- Removed dead indexes: `idx_locations_universe`, `idx_npcs_universe`, `idx_events_user`, `idx_events_universe`, `idx_narrative_memories_user`, `idx_narrative_memories_universe` ✅

### 5.2 — Update `init-db.js` ✅
- Removed duplicate `sessions` table, `session_config` table ✅
- Removed `locations`, `npcs`, `events`, `narrative_memories` table definitions ✅
- Removed `timeline_entries` table + indexes ✅
- Renamed `lore_validations` → `entity_validations` ✅
- Removed `lore_edits` table + indexes ✅
- Removed `relationship_evolution` table + index ✅
- Removed `embedding_vectors` table ✅
- Removed canon_tier migration code for dropped tables ✅

### 5.3 — Drop dead DB tables ✅
**Tables dropped:** `locations`, `npcs`, `events`, `narrative_memories`, `lore_edits` ✅
**Lore files archived:** 1 file → `data/a750ee1c.../lore-archive/` ✅
**Empty dirs cleaned:** `locations/`, `npcs/`, `events/`, `relationships/` ✅

### 5.4 — Archive migration scripts ✅
**Archived to `.omo/archived-scripts/`:**
- `migrate-locations-to-wiki.ts`, `migrate-npcs-to-wiki.ts`, `migrate-events-to-wiki.ts`, `migrate-relationships-to-wiki.ts`
- `migrate-universe-scope.ts`
- `test-phase1.js` through `test-phase7.js`

### 5.5 — Update `api/universes/[id]/route.ts` ✅
- Removed cascade deletions for `locations`, `npcs`, `events`, `narrative_memories` ✅

### 5.6 — Update docs ✅
- Removed `WIKI_FIRST` and `WIKI_JOBS` feature flags from README.md ✅
- Updated wiki description (no longer "replaces legacy lore database") ✅

---

## Verification Summary (per phase)

| Phase | Must Pass |
|-------|-----------|
| P0.1 | `npx next build` succeeds; relationship-markdown imports from markdown-utils |
| P0.2 | migration script exits 0 |
| P0.3 | `/api/contradictions` returns valid JSON (not 500) |
| P0.4 | cleanup script no longer drops wiki/relationships-owned tables |
| P0.5 | DB backup file exists and is non-empty |
| 1.1 | no imports of deleted components remain |
| 1.2 | `/lore` redirects to `/wiki`; `npx next build` succeeds |
| 1.3 | no imports of lore-browser/validation-queue remain |
| 2.1 | old API routes return 404 |
| 2.2 | locations/npcs/events API return 404 |
| 2.3 | remaining pages render without 500 errors |
| 3.1 | no old lore handlers in job-processor.ts; `npx next build` succeeds |
| 3.2 | no lore-expansion imports in idle-processing.ts |
| 3.3 | no lore-expansion calls in idle-enrichment.ts |
| 3.4 | no getLoreContext in retrieval.ts |
| 4.1 | no lore-expansion imports anywhere |
| 4.2 | no lore-markdown imports anywhere |
| 4.3 | no lore_entries references anywhere |
| 4.4 | relationship-markdown clean of lore imports; `npx next build` succeeds |
| 5.1-5.6 | `npx next build` succeeds; `sqlite3 .tables` clean |

---

## Rollback Strategy

| Point | Rollback | Data Loss |
|-------|----------|-----------|
| After Phase 0 | `git revert` full phase | None |
| After Phase 1 | `git revert` | None |
| After Phase 2 | `git revert` | None |
| After Phase 3 | `git revert` (requires WIKI_JOBS=true in prod) | None |
| After Phase 4 | `git revert` | None |
| After Phase 5.1-5.2 | `git revert` (re-run init-db) | Schema change, no data |
| After Phase 5.3 | ❌ NOT ROLLBACKABLE | DB data permanently gone |
| After Phase 5.4-5.6 | `git revert` | None |

**Critical rule:** Stop before Phase 5.3 and get explicit approval before dropping tables.

---

## Risk Register

| Risk | Phase | Severity | Mitigation |
|------|-------|----------|------------|
| Contradiction detection breaks | P0.2 | CRITICAL | Keep/rename lore_validations; don't drop without migration |
| Relationship markdown breaks | P0.1 | CRITICAL | Extract shared utilities before deleting lore-markdown.ts |
| Relationship system DB breaks | P0.4 | CRITICAL | Remove `relationships` from cleanup script drop list |
| Wiki backlinks break | P0.4 | HIGH | Fix cleanup script; don't drop backlinks table |
| P0.2/P0.5 ordering conflict | P0.2 | HIGH | Run validation migration BEFORE any table rename |
| Schema divergence | 5.2 | MEDIUM | Sync init-db.ts with init-db.js |
| Ghost table crashes | 4.3 | MEDIUM | Remove dead references from 3 files |
| Page render crashes | 2.3 | MEDIUM | Audit remaining pages for old API calls |
| No tests | ALL | HIGH | Manual verify each step; use `npx next build` as gate |
