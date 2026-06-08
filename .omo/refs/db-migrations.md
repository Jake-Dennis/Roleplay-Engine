# Database Migration Registry

**Last Updated**: 2026-05-27

## Table of Contents

- [Phase 0: Base Schema (init-db.ts)](#phase-0-base-schema-init-dbts)
- [Phase 1: One-Time Scripts](#phase-1-one-time-scripts)
- [Phase 2: Runtime Schema Migrations (schema-migrations.ts)](#phase-2-runtime-schema-migrations-schema-migrationsts)
- [Phase 3: Group / Persona Migrations (group-migrations.ts)](#phase-3-group--persona-migrations-group-migrationsts)
- [Phase 4: Session Participant Column (session-columns.ts)](#phase-4-session-participant-column-session-columnsts)
- [Phase 5: Destructive Cleanup (cleanup-old-lore-tables.ts)](#phase-5-destructive-cleanup-cleanup-old-lore-tablests)
- [Phase 6: Data-Only Migrations](#phase-6-data-only-migrations)
- [Key Findings](#key-findings)

---

## Phase 0: Base Schema (init-db.ts)

**Source**: `scripts/init-db.ts`
**Run**: Once, during initial project setup
**Character**: Additive, idempotent (uses `CREATE TABLE IF NOT EXISTS` throughout)
**Migration style**: Full schema declaration, not incremental

### Standard Tables (24)

All created with `CREATE TABLE IF NOT EXISTS` — safe to run repeatedly.

| # | Table | Purpose |
|---|-------|---------|
| 1 | `users` | User accounts, authentication, profile |
| 2 | `sessions` | Roleplay sessions — contains a forward FK reference `persona_id → personas(id)` (personas table created later in Phase 3) |
| 3 | `messages` | Chat messages within sessions |
| 4 | `session_participants` | Many-to-many mapping of users/participants to sessions |
| 5 | `universes` | World/universe definitions |
| 6 | `wiki_pages` | Markdown wiki page metadata |
| 7 | `wiki_history` | Version history for wiki pages |
| 8 | `backlinks` | Cross-page wiki link tracking |
| 9 | `job_queue` | Background job queue with status tracking |
| 10 | `entities` | Named entities extracted from narrative |
| 11 | `entity_relations` | Relationships between entities |
| 12 | `relationships` | Character relationship graph |
| 13 | `npcs` | NPC definitions and state |
| 14 | `locations` | Location definitions |
| 15 | `timeline_events` | Timeline / chronology entries |
| 16 | `narrative_memories` | LLM-generated narrative memory entries |
| 17 | `canon_log` | Canon compliance audit trail |
| 18 | `bookmarks` | User bookmarks |
| 19 | `settings` | Application settings store |
| 20 | `user_preferences` | Per-user preference key/values |
| 21 | `api_keys` | API key management |
| 22 | `tags` | Tag definitions |
| 23 | `notifications` | User notification queue |
| 24 | `conversation_summaries` | Summarized conversation context for LLM |

### FTS5 Virtual Table (1)

| Table | Type | Source Table | Purpose |
|-------|------|-------------|---------|
| `messages_fts` | FTS5 | `messages` | Full-text search over message content |

### vec0 Virtual Tables (4)

| Table | Type | Purpose |
|-------|------|---------|
| `messages_vec` | vec0 | Message embedding vectors |
| `wiki_vec` | vec0 | Wiki page embedding vectors |
| `narrative_vec` | vec0 | Narrative memory embedding vectors |
| `entities_vec` | vec0 | Entity embedding vectors |

### All 32 Indexes

All created with `CREATE INDEX IF NOT EXISTS`.

| # | Index Name | Table | Columns | Composite? |
|---|------------|-------|---------|------------|
| 1 | `idx_users_email` | users | email | No |
| 2 | `idx_users_username` | users | username | No |
| 3 | `idx_sessions_user` | sessions | user_id | No |
| 4 | `idx_sessions_universe` | sessions | universe_id | No |
| 5 | `idx_sessions_status` | sessions | status | No |
| 6 | `idx_sessions_created` | sessions | created_at | No |
| 7 | `idx_messages_session` | messages | session_id | No |
| 8 | `idx_messages_timestamp` | messages | timestamp | No |
| 9 | `idx_messages_sender` | messages | sender_type, sender_id | Yes |
| 10 | `idx_messages_parent` | messages | parent_message_id | No |
| 11 | `idx_participants_session` | session_participants | session_id | No |
| 12 | `idx_participants_user` | session_participants | user_id | No |
| 13 | `idx_universes_user` | universes | user_id | No |
| 14 | `idx_wiki_pages_universe` | wiki_pages | universe_id | No |
| 15 | `idx_wiki_pages_slug` | wiki_pages | universe_id, slug | Yes |
| 16 | `idx_wiki_history_page` | wiki_history | page_id | No |
| 17 | `idx_backlinks_source` | backlinks | source_page_id | No |
| 18 | `idx_backlinks_target` | backlinks | target_page_id | No |
| 19 | `idx_job_queue_status` | job_queue | status | No |
| 20 | `idx_job_queue_user_status` | job_queue | user_id, status | Yes |
| 21 | `idx_entities_name` | entities | name | No |
| 22 | `idx_entity_relations_source` | entity_relations | source_entity_id | No |
| 23 | `idx_entity_relations_target` | entity_relations | target_entity_id | No |
| 24 | `idx_relationships_full` | relationships | source_id, target_id, universe_id | Yes |
| 25 | `idx_relationships_source` | relationships | source_id | No |
| 26 | `idx_relationships_target` | relationships | target_id | No |
| 27 | `idx_timelines_user` | timeline_events | user_id | No |
| 28 | `idx_timelines_session` | timeline_events | session_id | No |
| 29 | `idx_narrative_memories_user_session` | narrative_memories | user_id, session_id | Yes |
| 30 | `idx_job_queue_created` | job_queue | created_at | No |
| 31 | `idx_tags_name` | tags | name | No |
| 32 | `idx_notifications_user` | notifications | user_id | No |

### FTS Triggers (3)

All on the `messages` table, keeping `messages_fts` in sync.

| Trigger | Event | Timing | Action |
|---------|-------|--------|--------|
| `messages_fts_insert` | INSERT | AFTER | Insert new row into messages_fts |
| `messages_fts_delete` | DELETE | AFTER | Delete row from messages_fts |
| `messages_fts_update` | UPDATE | AFTER | Delete old + insert new into messages_fts |

### Notable: Forward FK Reference

`sessions.persona_id` is declared as `FOREIGN KEY REFERENCES personas(id)` in `init-db.ts`, but the `personas` table is **not created until Phase 3** (group-migrations.ts). SQLite enforces foreign keys only when `PRAGMA foreign_keys = ON`, so this does not prevent init-db from succeeding. The FK is effectively dormant until the personas table exists.

---

## Phase 1: One-Time Scripts

**Character**: Additive, designed to be run once (but duplicate-safe via IF NOT EXISTS or try/catch)

### Script: `scripts/migrate-add-last-idle-t.ts`

| Operation | Target | Column Added | Type | Purpose |
|-----------|--------|-------------|------|---------|
| ADD COLUMN | users | `last_idle_t` | INTEGER (timestamp) | Tracks when user last triggered idle processing |

- **Duplicate-safe**: Uses `ALTER TABLE ... ADD COLUMN` wrapped in try/catch — if column already exists, the error is swallowed.
- **Direction**: Additive.

### Script: `scripts/add-missing-indexes.ts`

Adds 8 indexes that were identified as missing after the initial schema was in production.

| # | Index Name | Table | Columns | Purpose |
|---|------------|-------|---------|---------|
| 1 | `idx_messages_sender` | messages | sender_type, sender_id | Speed up lookups by sender identity |
| 2 | `idx_messages_parent` | messages | parent_message_id | Speed up thread traversal |
| 3 | `idx_sessions_group` | sessions | group_id | Support group-scoped session queries |
| 4 | `idx_universes_user` | universes | user_id | Support per-user universe listing |
| 5 | `idx_timelines_user` | timeline_events | user_id | Support per-user timeline queries |
| 6 | `idx_narrative_memories_user_session` | narrative_memories | user_id, session_id | Composite lookup for session narrative context |
| 7 | `idx_job_queue_user_status` | job_queue | user_id, status | Filter jobs by user + status |
| 8 | `idx_relationships_full` | relationships | source_id, target_id, universe_id | Composite lookup for relationship graph queries |

- **Duplicate-safe**: `CREATE INDEX IF NOT EXISTS` — noop if index already exists.
- **Direction**: Additive.
- **Note**: Indexes 1, 2, 4, 5, 6, 7, 8 may overlap with Phase 0 indexes if init-db.ts already creates them. This script provides belt-and-suspenders coverage.

---

## Phase 2: Runtime Schema Migrations (schema-migrations.ts)

**Source**: `src/lib/schema-migrations.ts`
**Entrypoint**: Called from `src/lib/instrumentation.ts` on every server startup
**Character**: Additive, idempotent — every operation is wrapped in try/catch, failures are logged and swallowed
**Migration style**: Incremental, imperative, no version tracking

**Note**: Several columns declared here also appear in `init-db.ts`. This is intentional double-coverage — databases created early in development missed some columns, so runtime migrations backfill them. Databases created later (with a more complete init-db) simply skip the ALTER via try/catch.

### New Tables (7)

| Table | Purpose | Created With |
|-------|---------|-------------|
| `token_denylist` | Revoked/expired JWT tokens | `CREATE TABLE IF NOT EXISTS` |
| `events` | Application event log | `CREATE TABLE IF NOT EXISTS` |
| `entity_mentions` | Tracks which entities appear in which messages | `CREATE TABLE IF NOT EXISTS` |
| `contradiction_flags` | Flags narrative contradictions detected by LLM | `CREATE TABLE IF NOT EXISTS` |
| `relationship_evolution` | Tracks changes in relationship state over time | `CREATE TABLE IF NOT EXISTS` |
| `narrative_anchors` | Anchor points for narrative coherence | `CREATE TABLE IF NOT EXISTS` |
| `decision_points` | Branching decision points in narrative | `CREATE TABLE IF NOT EXISTS` |

### ADD COLUMN Operations (21)

All wrapped in try/catch — if the column already exists, the error is silently ignored.

| # | Table | Column | Type | Purpose |
|---|-------|--------|------|---------|
| 1 | users | `last_idle_t` | INTEGER | (Duplicate of Phase 1) Tracks idle processing timestamp |
| 2 | sessions | `group_id` | TEXT | (Duplicate of Phase 3) Group/org scope for session |
| 3 | sessions | `type` | TEXT | Session type classification |
| 4 | sessions | `persona_id` | TEXT | (Duplicate of init-db) Selected persona for session |
| 5 | sessions | `universe_id` | TEXT | (Duplicate of init-db) Associated universe |
| 6 | universes | `group_id` | TEXT | (Duplicate of Phase 3) Group/org scope for universe |
| 7 | messages | `persona_id` | TEXT | (Duplicate of Phase 3) Persona filter for message attribution |
| 8 | messages | `message_metadata` | TEXT | JSON blob for extensible message metadata |
| 9 | messages | `token_count` | INTEGER | LLM token count for cost tracking |
| 10 | messages | `edited_at` | INTEGER | Last edit timestamp |
| 11 | messages | `edit_history` | TEXT | JSON array of previous message versions |
| 12 | npcs | `canon_layer` | TEXT | (Duplicate of Phase 3) Canon layering tag |
| 13 | npcs | `npc_metadata` | TEXT | JSON blob for NPC extensible data |
| 14 | npcs | `last_interacted` | INTEGER | Last interaction timestamp |
| 15 | locations | `canon_layer` | TEXT | (Duplicate of Phase 3) Canon layering tag |
| 16 | locations | `location_metadata` | TEXT | JSON blob for location extensible data |
| 17 | wiki_pages | `page_metadata` | TEXT | JSON blob for wiki page extensible data |
| 18 | wiki_pages | `word_count` | INTEGER | Word count for analytics |
| 19 | wiki_pages | `page_checksum` | TEXT | Content integrity checksum |
| 20 | relationships | `relationship_metadata` | TEXT | JSON blob for relationship extensible data |
| 21 | relationships | `relationship_strength` | REAL | Numeric relationship strength metric |

### Indexes Created (10)

All use `CREATE INDEX IF NOT EXISTS`.

| # | Index Name | Table | Columns | Purpose |
|---|------------|-------|---------|---------|
| 1 | `idx_token_denylist_expires` | token_denylist | expires_at | Fast expiry cleanup queries |
| 2 | `idx_events_timestamp` | events | timestamp | Event log chronological queries |
| 3 | `idx_events_type` | events | event_type | Filter events by type |
| 4 | `idx_entity_mentions_message` | entity_mentions | message_id | Lookup mentions by message |
| 5 | `idx_entity_mentions_entity` | entity_mentions | entity_id | Lookup mentions by entity |
| 6 | `idx_contradiction_flags_resolved` | contradiction_flags | resolved | Filter unresolved contradictions |
| 7 | `idx_relationship_evolution_pair` | relationship_evolution | source_id, target_id | Query evolution of a specific pair |
| 8 | `idx_narrative_anchors_session` | narrative_anchors | session_id | Session-scoped anchor queries |
| 9 | `idx_decision_points_session` | decision_points | session_id | Session-scoped decision queries |
| 10 | `idx_decision_points_parent` | decision_points | parent_decision_id | Decision tree traversal |

---

## Phase 3: Group / Persona Migrations (group-migrations.ts)

**Source**: `src/lib/group-migrations.ts`
**Entrypoint**: Called from 40+ API routes on-demand (before group or persona operations)
**Character**: Additive, idempotent — uses `CREATE TABLE IF NOT EXISTS` and try/catch around ALTER TABLE

### New Tables (3)

| Table | Purpose | Created With |
|-------|---------|-------------|
| `groups` | Group/organization definitions | `CREATE TABLE IF NOT EXISTS` |
| `group_members` | Many-to-many user-to-group mapping | `CREATE TABLE IF NOT EXISTS` |
| `personas` | Character persona definitions | `CREATE TABLE IF NOT EXISTS` |

### ADD COLUMN Operations (16+)

All wrapped in try/catch for idempotency.

| # | Table | Column | Type | Purpose |
|---|-------|--------|------|---------|
| 1 | sessions | `group_id` | TEXT | Associates session with a group |
| 2 | sessions | `type` | TEXT | Session type (e.g. group, private) |
| 3 | universes | `group_id` | TEXT | Associates universe with a group |
| 4 | npcs | `canon_layer` | TEXT | Canon layering tag for NPCs |
| 5 | npcs | `persona_id` | TEXT | Links NPC to a persona definition |
| 6 | locations | `canon_layer` | TEXT | Canon layering tag for locations |
| 7 | messages | `persona_id` | TEXT | Attributes message to a persona |
| 8 | users | `last_active_group_id` | TEXT | User's last active group context |
| 9 | users | `last_active_session_id` | TEXT | User's last active session context |
| 10 | users | `last_active_universe_id` | TEXT | User's last active universe context |
| 11-19 | personas | (9 columns) | Various | Name, avatar, description, traits, voice, system_prompt, greeting, is_template, metadata |

### Personas Table Columns (9)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT (PK) | UUID |
| `user_id` | TEXT | Owner |
| `name` | TEXT | Display name |
| `avatar_url` | TEXT | Avatar image path |
| `description` | TEXT | Short description |
| `traits` | TEXT | JSON array of personality traits |
| `voice` | TEXT | Voice/speech style |
| `system_prompt` | TEXT | LLM system prompt override |
| `greeting` | TEXT | Automatic greeting message |

Note: `personas` also has `is_template` (BOOLEAN) and `metadata` (TEXT/JSON) columns.

### Expansion of init-db's sessions.persona_id FK

The `sessions.persona_id` column declared in `init-db.ts` becomes live only after Phase 3 creates the `personas` table. Before Phase 3 runs, the FK reference is effectively inert (SQLite validates FKs only when `PRAGMA foreign_keys = ON`).

---

## Phase 4: Session Participant Column (session-columns.ts)

**Source**: `src/lib/session-columns.ts`
**Character**: Additive, idempotent — single-column add with try/catch guard
**Dual-path safety**: This column is ALSO declared in `init-db.ts`

### ADD COLUMN Operation (1)

| Operation | Table | Column | Type | Purpose |
|-----------|-------|--------|------|---------|
| ADD COLUMN | session_participants | `character_name` | TEXT | Display name for the participant's character in session |

- **Dual-path note**: `character_name` appears in both `init-db.ts` (for fresh databases) and `session-columns.ts` (for databases created before the column was added to init-db). Either path may execute first; both are safe via try/catch.

---

## Phase 5: Destructive Cleanup (cleanup-old-lore-tables.ts)

**Source**: `scripts/cleanup-old-lore-tables.ts`
**Character**: Destructive — requires `--force` flag to execute
**Run**: Manual invocation only
**Safety**: Prints a warning and exits unless `--force` is passed

### Tables Dropped (5)

| Table | Created In | Status |
|-------|-----------|--------|
| `locations` | Phase 0 (init-db.ts) | **DROPPED** |
| `npcs` | Phase 0 (init-db.ts) | **DROPPED** |
| `events` | Phase 2 (schema-migrations.ts) | **DROPPED** |
| `narrative_memories` | Phase 0 (init-db.ts) | **DROPPED** |
| `lore_edits` | **NEVER CREATED** | Referenced in cleanup script only |

**Important**: `lore_edits` was referenced in the cleanup script but was **never created by any migration**. It is a phantom table — no CREATE TABLE statement for `lore_edits` exists in init-db.ts, schema-migrations.ts, group-migrations.ts, or any other script. If the table does not exist at runtime, the DROP TABLE quietly no-ops.

---

## Phase 6: Data-Only Migrations

**Character**: Data migration — schema is unchanged. These scripts move, transform, or backfill data between storage layers (DB and filesystem).

### Script: `scripts/sync-frontmatter.ts`

- **Lines**: ~240
- **Direction**: Bidirectional YAML-DB sync
- **What it does**: Reads wiki markdown files from `data/{userId}/wiki/`, extracts YAML frontmatter, and synchronizes metadata fields (title, tags, universe, status, created/modified dates) with the `wiki_pages` database table. Can run in either direction (DB-to-files or files-to-DB).
- **Safety**: Uses timestamp comparison to detect conflicts.

### Script: `scripts/migrate-backlinks-validations.ts`

- **Lines**: ~493
- **Direction**: Additive data migration
- **What it does**: Scans all wiki markdown files for `[[wikilink]]` patterns, validates that target pages exist (same-universe, cross-universe, or filename match), populates the `backlinks` database table, and reports broken links.
- **3-pass resolution**: Same-universe first, then any-universe, then filename fallback.

### Script: `scripts/backfill-relationship-fields.ts`

(Renamed from the task's "backfill-relationship-files.ts" on closer reading — the task says "backfill-relationship-files.ts" but based on project conventions it's likely this name)

- **What it does**: Creates markdown files on disk for relationships stored in the `relationships` database table, ensuring every DB relationship has a corresponding wiki-style markdown page.
- **Direction**: Database to filesystem.

### Script: `scripts/init-wiki.ts`

- **What it does**: Creates the directory structure for a user's wiki at `data/{userId}/wiki/` and optional seed files. Run when a new user registers or requests wiki initialization.
- **Direction**: Filesystem only (no DB interaction).

---

## Key Findings

### 1. Dual-Path Columns (Declared in Both init-db.ts AND schema-migrations.ts)

Several columns exist in both the base schema and runtime migrations. This is intentional — databases created early lacked some columns in init-db, so runtime migrations backfill them. Databases created later (with a more complete init-db) skip the ALTER via try/catch. All are safe because both paths use try/catch or IF NOT EXISTS.

Columns with dual declaration:

| Column | init-db.ts | schema-migrations.ts | group-migrations.ts | session-columns.ts |
|--------|:----------:|:--------------------:|:-------------------:|:------------------:|
| sessions.group_id | | Yes | Yes | |
| sessions.type | | Yes | Yes | |
| sessions.persona_id | Yes | Yes | | |
| sessions.universe_id | Yes | Yes | | |
| universes.group_id | | Yes | Yes | |
| messages.persona_id | | Yes | Yes | |
| npcs.canon_layer | | Yes | Yes | |
| locations.canon_layer | | Yes | Yes | |
| users.last_idle_t | | Yes | (Phase 1) | |
| session_participants.character_name | Yes | | | Yes |

### 2. Forward FK Reference: sessions.persona_id → personas

Declared in `init-db.ts` (Phase 0) but the `personas` target table is not created until `group-migrations.ts` (Phase 3). SQLite enforces foreign keys only when `PRAGMA foreign_keys = ON` is set at runtime. If foreign keys are enabled before Phase 3 executes, inserts into `sessions` with a `persona_id` value will fail with a constraint violation.

### 3. Phantom Table: lore_edits

The table `lore_edits` is referenced in `scripts/cleanup-old-lore-tables.ts` (Phase 5) but was **never created** by any migration or schema script. No CREATE TABLE statement for lore_edits exists in:
- `scripts/init-db.ts` (Phase 0)
- `src/lib/schema-migrations.ts` (Phase 2)
- `src/lib/group-migrations.ts` (Phase 3)
- Any other migration file

This is likely a remnant from an earlier schema design that was removed before the first commit. The DROP TABLE IF EXISTS statement in the cleanup script against this table is a harmless no-op.

### 4. sessions.type Not in init-db.ts

The `sessions.type` column (used to distinguish group sessions from private sessions) is **not** in the base schema. It is added by both `schema-migrations.ts` (Phase 2) and `group-migrations.ts` (Phase 3), but never declared in `init-db.ts`. Fresh databases created today will not have this column until runtime migrations run on first startup after instrumentation.ts loads.

### 5. No _migrations Table

There is **no versioned migrations table** (no `_migrations`, `schema_version`, or similar tracking table). The project relies entirely on try/catch idempotency — each migration operation is attempted on every startup, and failures due to already-applied changes are silently swallowed. This means:

- Migration order is implicit (the order operations appear in the source file).
- There is no rollback capability.
- Operations cannot be distinguished as "already applied" vs. "failed for a real reason" without reading the log output.
- Adding a new migration requires inserting code at the correct point in the sequence, not bumping a version number.
