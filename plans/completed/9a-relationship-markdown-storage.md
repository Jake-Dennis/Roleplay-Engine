# Phase 9A: Relationship-Centric Markdown Storage

## Goal
Store relationship data as markdown files in relationship-specific directories (`data/<user_id>/relationships/<Source_Target>/`) with YAML frontmatter, enabling Obsidian-style browsing, editing, and backlink discovery for relationships.

## Current State
- `data/<user_id>/relationships/` directory exists but is empty
- Relationship data is fully database-driven (`relationships` table)
- `relationship-decay.ts`, `relationship-analysis.ts` work against DB only
- No markdown representation of relationships exists
- No filesystem write path for relationship changes

## Architecture

```
data/<user_id>/relationships/
├── Player_Haleth/
│   ├── relationship.md          # Main relationship file
│   └── history.md               # Shared history log
├── Player_Aragorn/
│   ├── relationship.md
│   └── history.md
└── Haleth_Aragorn/
    ├── relationship.md
    └── history.md
```

### Markdown Format

```markdown
---
id: rel_abc123
source: Player
target: Haleth
user_id: <user_id>
universe_id: <universe_id>
relationship_stage: cautious_allies
created_at: 2025-01-15T10:30:00Z
updated_at: 2025-03-20T14:22:00Z
---

# Player ↔ Haleth

## Emotional State

| Emotion    | Value | Half-Life |
|------------|-------|-----------|
| trust      | 0.62  | 30 days   |
| suspicion  | 0.31  | 60 days   |
| respect    | 0.71  | 30 days   |
| loyalty    | 0.45  | 30 days   |

## Relationship Stage

**cautious_allies** — They work together but maintain distance.

## Shared History

- [[Orc Ambush at Eastern Ruins]] — Survived together, trust +0.1
- [[Campfire Discussion]] — Shared personal stories, trust +0.08
- [[The Broken Promise]] — Haleth withheld information, trust -0.15

## Decay Configuration

- Emotional half-life: 7 days (default)
- Stage regression: 14 days (default)
- Minimum emotional state: neutral

## Notes

Haleth is a ranger stationed near Bree. Initially suspicious of the Player's intentions, but has grown more trusting after shared experiences.
```

## Execution Plan

### Step 1: Create `relationship-markdown.ts` Library
**File**: `src/lib/relationship-markdown.ts`

Functions:
- `buildRelationshipMarkdown(rel: RelationshipRecord): string` — generates markdown from DB record
- `parseRelationshipMarkdown(content: string): Partial<RelationshipRecord>` — parses markdown back to data
- `writeRelationshipFile(userId: string, source: string, target: string, rel: RelationshipRecord): void` — writes to filesystem
- `readRelationshipFile(userId: string, source: string, target: string): RelationshipRecord | null` — reads from filesystem
- `deleteRelationshipFile(userId: string, source: string, target: string): void` — removes file + directory
- `syncRelationshipToFilesystem(relId: string): void` — syncs a DB relationship to its markdown file
- `getAllRelationshipFiles(userId: string): string[]` — lists all relationship directories

### Step 2: Extend `relationship-decay.ts` to Write Markdown
**File**: `src/lib/relationship-decay.ts`

Changes:
- After applying decay to a relationship, call `syncRelationshipToFilesystem()`
- Update the markdown file's `updated_at` and emotional state table
- Append decay events to `history.md`

### Step 3: Extend `relationship-analysis.ts` to Write Markdown
**File**: `src/lib/relationship-analysis.ts`

Changes:
- After analyzing relationships from messages, call `syncRelationshipToFilesystem()`
- Append new shared history entries to the markdown file
- Use wikilink syntax for event references: `[[Event Name]]`

### Step 4: Create Relationship File API Routes
**File**: `src/app/api/relationships/[id]/file/route.ts`

- `GET` — return the markdown content for a relationship
- `PUT` — update the markdown file (user edits), parse and sync back to DB

### Step 5: Create Relationship File Editor UI
**File**: `src/components/relationship/relationship-file-editor.tsx`

Features:
- Split-pane: markdown editor (left) + rendered preview (right)
- Frontmatter editor for stage, decay config, notes
- Shared history list with wikilink autocomplete
- Save button → PUT to API → sync to DB + filesystem
- Auto-save draft to localStorage

### Step 6: Integrate into Relationships Page
**File**: `src/app/(app)/relationships/page.tsx`

Changes:
- Add "Edit as Markdown" button to each relationship card
- Click → opens relationship file editor
- Show file status indicator (synced / modified / unsynced)

### Step 7: Initialize Relationship Directories on Creation
**File**: `src/app/api/relationships/route.ts`

Changes:
- When a new relationship is created (POST), also create its directory and initial markdown file
- Directory name: `<source>_<target>` (sanitized, lowercase, spaces→underscores)

### Step 8: Backfill Existing Relationships
**File**: `scripts/backfill-relationship-files.ts`

One-time script:
- Read all relationships from DB
- Create markdown files for each
- Create `history.md` from `shared_history` JSON array
- Log count of files created

## Files Created
- `src/lib/relationship-markdown.ts`
- `src/app/api/relationships/[id]/file/route.ts`
- `src/components/relationship/relationship-file-editor.tsx`
- `scripts/backfill-relationship-files.ts`

## Files Modified
- `src/lib/relationship-decay.ts` (add filesystem sync)
- `src/lib/relationship-analysis.ts` (add filesystem sync)
- `src/app/api/relationships/route.ts` (create directory on POST)
- `src/app/(app)/relationships/page.tsx` (add markdown edit button)

## Tests
- Relationship markdown file created on relationship creation
- Decay updates reflected in markdown file
- Analysis appends shared history to markdown
- File editor saves changes back to DB
- Backfill script creates files for all existing relationships
- Wikilinks in shared history resolve correctly
- Directory naming handles special characters

## Risk
- **LOW**: Additive change — DB remains source of truth, markdown is a mirror
- File I/O errors should not break DB operations (wrap in try/catch)
- Large relationship histories may produce large markdown files — mitigate with history truncation in main file, full history in `history.md`
