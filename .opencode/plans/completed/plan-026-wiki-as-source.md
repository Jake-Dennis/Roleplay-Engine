# Plan 026: Wiki as Source of Truth for Personas & NPCs

## Goal
Personas and NPCs are just wiki `.md` files under `entities/characters/`.
The wiki editor is the only way to create/edit them. The persona and NPC
pages become read-only viewers that link to the wiki.

No custom frontmatter fields needed. The wiki editor is just markdown —
users type whatever they want.

## The simple flow
1. User clicks "New Character" in the wiki → creates `entities/characters/{name}.md`
2. User edits in the wiki editor (markdown body, whatever content they want)
3. Persona page reads title as name, body as description — read-only view
4. Generation pipeline reads title + body — that's the character context
5. Old `personas` and `npcs` SQLite tables get removed after backfill

---

## Phase 1 — Backfill

### Task A: One-time script copies existing personas/NPCs to wiki .md

**File:** `scripts/backfill-personas-to-wiki.ts` (NEW)

```
data/{userId}/wiki/{universe}/entities/characters/{name}.md
---
title: Aragorn
type: entity
subtype: character
status: reviewed
entity_id: "persona:{uuid}"
created: "..."
updated: "..."
---
Aragorn, son of Arathorn, is the heir to the throne of Gondor...
```

## Phase 2 — Rewrite Persona API to read from wiki

### Task B: GET /api/personas → scan wiki for subtype:character
### Task C: GET /api/personas/[id] → read specific wiki page
### Task D: Remove POST/PUT/DELETE persona endpoints
### Task E: Remove activate/active endpoints (no global active concept)

## Phase 3 — Update Generation

### Task F: Remove getActivePersonaContext() from ollama.ts
### Task G: Generate route reads persona title+body from wiki

## Phase 4 — Rewrite NPC API
### Task H: GET /api/npcs → same wiki scan
### Task I: Remove POST/PUT/DELETE NPC endpoints

## Phase 5 — Read-only viewer pages
### Task J: Persona page shows wiki character card + "Edit in Wiki" link
### Task K: NPC page same pattern

## Phase 6 — Cleanup
### Task L: Remove is_active from schemas
### Task M: Drop personas and npcs SQLite tables
