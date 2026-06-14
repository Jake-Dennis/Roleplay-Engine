# Plan 030 — Wiki as Editor, Pages as Catalog Viewers

## Goal
Make the wiki the single place for creating and editing all content. Standalone pages become read-only catalogs that list items and link to the wiki for editing. This eliminates dual-editing (wiki vs page) and makes the wiki the source of truth for character identity.

## Tasks

### Phase 1 — NPCs Page: Remove inline editor, keep catalog

The NPCs page currently has a full CRUD editor (name, description, personality traits, behavior patterns, voice, entity ID, aliases). NPCs already have wiki pages at `entities/characters/{name}.md`. Replace the editor with a wiki-driven catalog view.

Files to modify:
- `src/app/(app)/npcs/page.tsx`
- `src/components/npcs/npc-list.tsx`
- `src/components/npcs/npc-editor.tsx`

Scope:
- [ ] Strip NPC editor: remove inline form fields (name, description, personality, behavior, voice, entity ID, aliases)
- [ ] Keep: universe filter, search bar, canon/active toggle for each NPC
- [ ] Keep: create new NPC (creates DB record + wiki page shell)
- [ ] Add: wiki page preview excerpt in NPC list card
- [ ] Add: "Open in Wiki" button navigates to `wiki/entities/characters/{slug}`
- [ ] Add: "Create Wiki Page" button for NPCs without one (writes initial `.md` file)
- [ ] NPC detail view (when selected) shows wiki content read-only with "Edit" link

### Phase 2 — Personas Page: Simplify to RP-only editor

Personas now have a `wikiPage` field linking to a wiki character page. The persona editor should show wiki content as read-only and only allow editing RP-specific fields.

Files to modify:
- `src/app/(app)/personas/page.tsx`
- `src/components/personas/persona-tab-description.tsx`
- `src/components/personas/persona-tab-personality.tsx`
- `src/components/personas/persona-tab-advanced.tsx`
- `src/components/personas/persona-editor.tsx`

Scope:
- [ ] Description tab: if `wikiPage` is set, show name/description/tags as read-only with "Edit Wiki Page" link. If not set, show editable fields with "Create Wiki Page" button.
- [ ] Personality tab: if `wikiPage` is set, show personality/traits as read-only with wiki link. If not set, show editable fields.
- [ ] Advanced tab: already has wiki page link section (done). Keep system prompt, post-history, creator notes, TTS voice as editable.
- [ ] Wire up `formWikiPage` prop through persona-editor to all tabs.

### Phase 3 — Entities Page: Convert to wiki-only catalog

The entity registry browser lists all entities (personas, NPCs, locations, items, etc.). It should be a read-only catalog that links to the wiki for editing.

Files to modify:
- `src/app/(app)/entities/page.tsx`
- `src/components/entities/entity-manager-client.tsx`

Scope:
- [ ] Remove entity create/edit inline forms
- [ ] Keep: entity list with search, type filter, universe filter
- [ ] Keep: entity detail panel showing ID, display name, type, aliases
- [ ] Add: "View Wiki Page" button that navigates to the matching wiki page
- [ ] For entities without a wiki page (e.g., persona entities), show a "Wiki page not found" message

### Phase 4 — Sidebar Cleanup

Remove the redundant navigation entries and re-label.

File to modify:
- `src/app/(app)/app-layout-shell.tsx`

Scope:
- [ ] Remove `/entities` link (access entities via wiki file tree)
- [ ] Remove `/npcs` link (access NPCs via wiki file tree)
- [ ] Keep `/personas` (RP-specific settings still need their own page)
- [ ] Keep `/relationships`, `/narrative-threads`, `/timeline` (DB-driven, read-only viewers)
- [ ] Keep `/universe`, `/conversations`, `/voice-combiner`, `/jobs`, `/settings`

### Phase 5 — Wiki Page Enhancements

Add new content types to the wiki page creation flow.

Files to modify:
- `src/app/(app)/wiki/[...slug]/page.tsx`
- `src/components/wiki/file-tree.tsx`

Scope:
- [ ] Add "Create NPC" action to entity/character wiki pages (creates NPC DB record + wiki page)
- [ ] Ensure NPC wiki pages (entities/characters/*.md) have proper frontmatter and description/personality sections for AI extraction
- [ ] Verify that the "Create Persona" button (already built) creates the wiki page link properly

## Verification

- [ ] npm run build passes
- [ ] NPCs page shows wiki page preview with "Open in Wiki" link
- [ ] Creating an NPC creates both DB record and wiki page
- [ ] Persona page shows wiki-linked fields as read-only
- [ ] Entities page has "View Wiki Page" links
- [ ] Sidebar no longer has /entities or /npcs
- [ ] No inline editing of wiki data outside the wiki
