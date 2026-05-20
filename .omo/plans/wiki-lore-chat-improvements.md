# Wiki, Lore & Chat Improvements

## TL;DR

> **Quick Summary**: Comprehensive upgrade to the Roleplay Engine's content systems. Adds chat search, wiki templates, session recaps, NPC creator with evolution, universe-isolated lore, chat export, and version history.
>
> **Deliverables**:
> - Chat search (FTS5)
> - Wiki page templates
> - Session recap generation
> - Recent changes dashboard widget
> - NPC system (separate from Personas)
> - Universe-isolated wiki/lore
> - Chat export (JSON/MD/TXT)
> - Wiki version history (dual storage)
> - Username symbol support
>
> **Estimated Effort**: Large (3 Phases, ~30 tasks)
> **Parallel Execution**: YES - 3 Phases
> **Critical Path**: Schema Migrations → API Endpoints → UI Components

---

## Context

### Original Request
User wants to improve Wiki, Lore, and Chat History systems. Specifically:
- User Persona & NPC Creator (separate systems)
- Wiki/Lore tied to Universes (isolation)
- Chat History tied to Sessions (isolation)
- Phased approach to implementation

### Interview Summary
**Key Discussions**:
- **NPCs**: Natural evolution by default, `is_canon` flag locks personality for story-critical characters.
- **Sessions**: Strictly one-to-one with universes. `universe_id` becomes required.
- **Lore Extraction**: Comprehensive scan of ALL messages, creates `draft` wiki pages for review.
- **Export**: All three formats (JSON/Markdown/TXT) from single endpoint.
- **Version History**: Dual system — DB for metadata/querying, files for actual snapshots.
- **Usernames**: Allow uppercase, lowercase, numbers, and symbols.

**Research Findings**:
- `personas` table exists; `npcs` table needs creation.
- Wiki is file-based; `getWikiRoot()` already supports universe scoping.
- `messages.session_id` FK exists; session-universe binding needs enforcement.
- No FTS5 index on messages; chat search requires schema change.
- Job system supports new job types easily.

---

## Work Objectives

### Core Objective
Upgrade the Roleplay Engine's content management systems to support universe isolation, NPC evolution, comprehensive lore extraction, and better chat history tools.

### Concrete Deliverables
- `src/lib/npc.ts` + `src/app/api/npcs/` + UI components
- `src/lib/wiki/templates/` + template selection UI
- `src/lib/jobs/session-recap.ts` + recap panel
- `GET /api/sessions/[id]/messages/search` + search UI
- `GET /api/sessions/[id]/export` + export buttons
- `src/lib/wiki/history.ts` + version history UI
- Schema migrations for `npcs`, `wiki_versions`, FTS5
- Username validation update

### Definition of Done
- [ ] All new endpoints return 200/201/400 correctly
- [ ] UI components render without errors
- [ ] Background jobs complete and update progress via SSE
- [ ] Universe isolation enforced at API and UI levels
- [ ] `npx next build` passes

### Must Have
- NPC system separate from Personas
- Universe isolation for wiki/lore
- Session isolation for chat
- Phased delivery (Quick Wins → Core → Advanced)

### Must NOT Have (Guardrails)
- Do NOT merge Personas and NPCs
- Do NOT allow cross-universe wiki links by default
- Do NOT break existing chat history
- Do NOT add external dependencies (use SQLite FTS5)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (no test framework)
- **Automated tests**: NO
- **Agent-Executed QA**: ALWAYS (mandatory)

### QA Policy
Every task MUST include agent-executed QA scenarios.
- **Frontend/UI**: Playwright navigates, interacts, asserts DOM.
- **API/Backend**: curl sends requests, asserts status + response fields.
- **Jobs**: Trigger job, poll status, verify result.

---

## Execution Strategy

### Parallel Execution Waves

```
Phase 1: Foundation & Quick Wins (Waves 1-3)
├── Wave 1: Schema & Config (Username fix, FTS5, NPCs table, Wiki versions table)
├── Wave 2: API Endpoints (Search, Export, Recap trigger, Recent changes)
── Wave 3: UI Components (Search bar, Export button, Recap panel, Recent widget)

Phase 2: Core Features (Waves 4-6)
├── Wave 4: NPC System (API, UI, Evolution logic)
├── Wave 5: Lore Extraction (Job handler, UI trigger, Draft review)
└── Wave 6: Universe Isolation (Enforcement, UI selectors, Migration)

Phase 3: Advanced Polish (Waves 7-8)
├── Wave 7: Version History (UI, Restore flow, Diff view)
└── Wave 8: Wiki Templates (Files, Selection UI, Creation flow)
```

### Dependency Matrix
- **Wave 1**: - → Waves 2, 4, 5, 6
- **Wave 2**: 1 → Wave 3
- **Wave 3**: 2 → -
- **Wave 4**: 1 → -
- **Wave 5**: 1, 4 → -
- **Wave 6**: 1 → -
- **Wave 7**: 1 → -
- **Wave 8**: 1 → -

### Agent Dispatch Summary
- **Wave 1**: `quick` (Schema/Config)
- **Wave 2**: `quick` (APIs)
- **Wave 3**: `visual-engineering` (UI)
- **Wave 4**: `deep` (NPC System)
- **Wave 5**: `deep` (Lore Extraction)
- **Wave 6**: `quick` (Isolation)
- **Wave 7**: `visual-engineering` (Version UI)
- **Wave 8**: `quick` (Templates)

---

## TODOs

### Phase 1: Foundation & Quick Wins

- [ ] 1. Update Username Validation & Case Preservation

  **What to do**:
  - Update `usernamePattern` in `src/lib/config.ts` to `/^[a-zA-Z0-9_\-@.!#$%^&*()+=]+$/`
  - Update error message in `src/lib/auth.ts` to reflect allowed symbols
  - Remove `.toLowerCase()` calls in `src/lib/auth.ts` (lines 143, 152, 170, 241) to preserve original case
  - Update `scripts/init-db.ts` to use `COLLATE NOCASE` on username UNIQUE constraint (prevents "Jake" and "jake" as separate users)
  - Add migration to update existing DB schema for COLLATE NOCASE

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1

  **References**:
  - `src/lib/config.ts:52` - Current pattern
  - `src/lib/auth.ts:94` - Error message
  - `src/lib/auth.ts:143,152,170,241` - `.toLowerCase()` calls to remove
  - `scripts/init-db.ts:28` - Username column definition

  **Acceptance Criteria**:
  - [ ] `validateUsername("User@123!")` returns `null`
  - [ ] `validateUsername("User Name")` returns error (no spaces)
  - [ ] Sidebar displays username in original case (e.g., "Jake" not "jake")
  - [ ] Login works with any case variation ("Jake", "jake", "JAKE")

  **QA Scenarios**:
  ```
  Scenario: Valid username with symbols
    Tool: Bash (node REPL)
    Steps:
      1. node -e "const { validateUsername } = require('./src/lib/auth'); console.log(validateUsername('Jake@123!'));"
    Expected Result: null
    Evidence: .omo/evidence/task-1-username-valid.txt

  Scenario: Case-insensitive login
    Tool: Bash (curl)
    Steps:
      1. Register user "JakeP"
      2. Login with "jakep"
    Expected Result: Login succeeds
    Evidence: .omo/evidence/task-1-case-insensitive-login.txt
  ```

  **Commit**: YES
  - Message: `feat: allow symbols in usernames and preserve case`

- [ ] 2. Add FTS5 Virtual Table for Messages

  **What to do**:
  - Add `CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, session_id, sender_id)` to `scripts/init-db.ts`.
  - Add migration to `src/lib/schema-migrations.ts` to create it on startup for existing DBs.
  - Note: FTS5 requires populating the index. Add a startup job or trigger to backfill.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1

  **References**:
  - `scripts/init-db.ts` - Schema definitions
  - `src/lib/schema-migrations.ts` - Startup migrations

  **Acceptance Criteria**:
  - [ ] `messages_fts` table exists in DB
  - [ ] Startup migration runs without error on existing DB

  **QA Scenarios**:
  ```
  Scenario: FTS5 table creation
    Tool: Bash (node script)
    Steps:
      1. Run startup migration script
      2. Query sqlite_master for messages_fts
    Expected Result: Table exists
    Evidence: .omo/evidence/task-2-fts5-table.txt
  ```

  **Commit**: YES (groups with 1)
  - Message: `feat: add FTS5 virtual table for message search`

- [ ] 3. Create NPCs Database Table

  **What to do**:
  - Add `npcs` table to `scripts/init-db.ts`:
    ```sql
    CREATE TABLE IF NOT EXISTS npcs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      name TEXT NOT NULL,
      description TEXT,
      personality_traits TEXT,
      behavior_patterns TEXT,
      voice_id TEXT,
      is_canon BOOLEAN DEFAULT 0,
      evolution_log TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    );
    ```
  - Add migration to `src/lib/schema-migrations.ts`.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1

  **References**:
  - `scripts/init-db.ts` - Schema patterns
  - `src/lib/schema-migrations.ts` - Migration patterns

  **Acceptance Criteria**:
  - [ ] `npcs` table exists with all columns
  - [ ] Migration adds table to existing DBs

  **QA Scenarios**:
  ```
  Scenario: NPCs table creation
    Tool: Bash (node script)
    Steps:
      1. Run migration
      2. PRAGMA table_info(npcs)
    Expected Result: Columns match spec
    Evidence: .omo/evidence/task-3-npcs-table.txt
  ```

  **Commit**: YES (groups with 1, 2)
  - Message: `feat: add npcs table for LLM-controlled characters`

- [ ] 4. Create Wiki Versions Database Table

  **What to do**:
  - Add `wiki_versions` table to `scripts/init-db.ts`:
    ```sql
    CREATE TABLE IF NOT EXISTS wiki_versions (
      id TEXT PRIMARY KEY,
      page_path TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      version_number INTEGER NOT NULL,
      change_summary TEXT,
      file_snapshot_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    ```
  - Add migration to `src/lib/schema-migrations.ts`.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1

  **References**:
  - `scripts/init-db.ts`
  - `src/lib/schema-migrations.ts`

  **Acceptance Criteria**:
  - [ ] `wiki_versions` table exists
  - [ ] Migration works on existing DBs

  **QA Scenarios**:
  ```
  Scenario: Wiki versions table creation
    Tool: Bash (node script)
    Steps:
      1. Run migration
      2. PRAGMA table_info(wiki_versions)
    Expected Result: Columns match spec
    Evidence: .omo/evidence/task-4-wiki-versions-table.txt
  ```

  **Commit**: YES (groups with 1-3)
  - Message: `feat: add wiki_versions table for metadata tracking`

### Phase 1: API Endpoints

- [ ] 5. Chat Search Endpoint

  **What to do**:
  - Create `src/app/api/sessions/[id]/messages/search/route.ts`.
  - Query: `SELECT * FROM messages WHERE session_id = ? AND messages_fts MATCH ?`.
  - Return paginated results with highlighted snippets.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocked By**: 2 (FTS5 table)

  **References**:
  - `src/app/api/sessions/[id]/messages/route.ts` - Pagination pattern
  - `src/lib/error-response.ts` - Error helpers

  **Acceptance Criteria**:
  - [ ] `GET /api/sessions/[id]/messages/search?q=hello` returns matching messages
  - [ ] Results include `snippet` with highlighted match

  **QA Scenarios**:
  ```
  Scenario: Search returns results
    Tool: Bash (curl)
    Steps:
      1. Insert test message with "hello world"
      2. curl /api/sessions/[id]/messages/search?q=hello
    Expected Result: 200, messages array with "hello world"
    Evidence: .omo/evidence/task-5-search-results.json
  ```

  **Commit**: YES
  - Message: `feat: add chat search endpoint with FTS5`

- [ ] 6. Chat Export Endpoint

  **What to do**:
  - Create `src/app/api/sessions/[id]/export/route.ts`.
  - Query params: `?format=json|md|txt`.
  - Fetch all messages for session.
  - Format based on `format` param.
  - Return with `Content-Disposition: attachment; filename="chat-export.{ext}"`.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2

  **References**:
  - `src/app/api/sessions/[id]/messages/route.ts` - Message fetching
  - `src/lib/response-utils.ts` - `camelizeKeys`

  **Acceptance Criteria**:
  - [ ] `?format=json` returns JSON array of messages
  - [ ] `?format=md` returns Markdown transcript
  - [ ] `?format=txt` returns plain text transcript
  - [ ] Headers include `Content-Disposition`

  **QA Scenarios**:
  ```
  Scenario: Export JSON
    Tool: Bash (curl)
    Steps:
      1. curl /api/sessions/[id]/export?format=json
    Expected Result: 200, JSON body, attachment header
    Evidence: .omo/evidence/task-6-export-json.json
  ```

  **Commit**: YES (groups with 5)
  - Message: `feat: add chat export endpoint (JSON/MD/TXT)`

- [ ] 7. Session Recap Trigger Endpoint

  **What to do**:
  - Create `src/app/api/sessions/[id]/recap/route.ts`.
  - POST endpoint to trigger `generate_session_recap` job.
  - Returns `jobId` for polling.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2

  **References**:
  - `src/lib/job-processor.ts` - `queueJob`
  - `src/app/api/jobs/route.ts` - Job status pattern

  **Acceptance Criteria**:
  - [ ] POST returns `jobId`
  - [ ] Job appears in `job_queue` table

  **QA Scenarios**:
  ```
  Scenario: Trigger recap job
    Tool: Bash (curl)
    Steps:
      1. curl -X POST /api/sessions/[id]/recap
    Expected Result: 200, { jobId: "..." }
    Evidence: .omo/evidence/task-7-recap-trigger.json
  ```

  **Commit**: YES (groups with 5, 6)
  - Message: `feat: add session recap trigger endpoint`

- [ ] 8. Recent Changes API

  **What to do**:
  - Create `src/app/api/wiki/recent/route.ts`.
  - Scan `data/{userId}/wiki/` for files sorted by `mtime`.
  - Return top 10 recent files with path, timestamp, universe.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2

  **References**:
  - `src/lib/wiki/file-io.ts` - `listWikiPages`
  - `node:fs` - `statSync` for mtime

  **Acceptance Criteria**:
  - [ ] Returns array of recent files
  - [ ] Sorted by modification time descending

  **QA Scenarios**:
  ```
  Scenario: Recent changes list
    Tool: Bash (curl)
    Steps:
      1. curl /api/wiki/recent
    Expected Result: 200, array of files with mtime
    Evidence: .omo/evidence/task-8-recent-changes.json
  ```

  **Commit**: YES (groups with 5-7)
  - Message: `feat: add recent wiki changes API`

### Phase 1: UI Components

- [ ] 9. Chat Search UI

  **What to do**:
  - Add search input to chat header.
  - Debounced fetch to `/api/sessions/[id]/messages/search`.
  - Display results in dropdown or inline.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocked By**: 5

  **References**:
  - `src/components/chat/chat-header.tsx` - Header location
  - `src/hooks/use-debounce.ts` - If exists, or implement

  **Acceptance Criteria**:
  - [ ] Search input renders in chat header
  - [ ] Typing triggers search after 300ms
  - [ ] Results display below input

  **QA Scenarios**:
  ```
  Scenario: Search UI interaction
    Tool: Playwright
    Steps:
      1. Navigate to session
      2. Type "hello" in search
      3. Wait for results
    Expected Result: Results dropdown appears with matches
    Evidence: .omo/evidence/task-9-search-ui.png
  ```

  **Commit**: YES
  - Message: `feat: add chat search UI component`

- [ ] 10. Chat Export UI

  **What to do**:
  - Add "Export" button to session settings or chat header.
  - Dropdown to select format (JSON/MD/TXT).
  - Triggers download.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocked By**: 6

  **References**:
  - `src/components/session/session-settings.tsx` - Settings location

  **Acceptance Criteria**:
  - [ ] Export button visible
  - [ ] Clicking downloads file with correct extension

  **QA Scenarios**:
  ```
  Scenario: Export download
    Tool: Playwright
    Steps:
      1. Click Export
      2. Select Markdown
      3. Verify download
    Expected Result: File downloads as chat-export.md
    Evidence: .omo/evidence/task-10-export-download.png
  ```

  **Commit**: YES (groups with 9)
  - Message: `feat: add chat export UI`

- [ ] 11. Session Recap Panel

  **What to do**:
  - New sidebar panel component `SessionRecapPanel`.
  - Shows loading state while job runs.
  - Displays recap text when complete.
  - "Generate Recap" button triggers job.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocked By**: 7

  **References**:
  - `src/components/session/` - Panel patterns
  - `src/lib/event-bus.ts` - SSE for job progress

  **Acceptance Criteria**:
  - [ ] Panel renders in sidebar
  - [ ] Button triggers job
  - [ ] Progress shown via SSE
  - [ ] Recap text displayed on completion

  **QA Scenarios**:
  ```
  Scenario: Recap generation flow
    Tool: Playwright
    Steps:
      1. Open Recap panel
      2. Click Generate
      3. Wait for completion
    Expected Result: Recap text appears
    Evidence: .omo/evidence/task-11-recap-panel.png
  ```

  **Commit**: YES (groups with 9, 10)
  - Message: `feat: add session recap panel UI`

- [ ] 12. Recent Changes Dashboard Widget

  **What to do**:
  - Add widget to `src/app/(app)/dashboard/page.tsx`.
  - Fetches `/api/wiki/recent`.
  - Shows list of recent files with links.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocked By**: 8

  **References**:
  - `src/app/(app)/dashboard/page.tsx` - Dashboard structure

  **Acceptance Criteria**:
  - [ ] Widget renders on dashboard
  - [ ] Shows recent files
  - [ ] Links navigate to wiki pages

  **QA Scenarios**:
  ```
  Scenario: Dashboard widget
    Tool: Playwright
    Steps:
      1. Navigate to dashboard
      2. Verify Recent Changes widget
    Expected Result: Widget shows files
    Evidence: .omo/evidence/task-12-dashboard-widget.png
  ```

  **Commit**: YES (groups with 9-11)
  - Message: `feat: add recent changes dashboard widget`

### Phase 2: Core Features

- [ ] 13. NPCs API Endpoints

  **What to do**:
  - `GET /api/npcs` - List NPCs (filter by universe)
  - `POST /api/npcs` - Create NPC
  - `PUT /api/npcs/[id]` - Update NPC
  - `DELETE /api/npcs/[id]` - Delete NPC
  - Follow existing API patterns (`getAuthToken`, `camelizeKeys`, etc.).

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocked By**: 3 (NPCs table)

  **References**:
  - `src/app/api/personas/route.ts` - Similar CRUD pattern
  - `src/lib/error-response.ts`

  **Acceptance Criteria**:
  - [ ] CRUD operations work
  - [ ] Universe filtering works
  - [ ] Auth enforced

  **QA Scenarios**:
  ```
  Scenario: Create NPC
    Tool: Bash (curl)
    Steps:
      1. curl -X POST /api/npcs -d '{"name":"Shopkeeper", "is_canon":false}'
    Expected Result: 201, NPC object
    Evidence: .omo/evidence/task-13-create-npc.json
  ```

  **Commit**: YES
  - Message: `feat: add NPCs CRUD API endpoints`

- [ ] 14. NPCs UI Components

  **What to do**:
  - `src/components/npcs/npc-list.tsx` - List/Grid view
  - `src/components/npcs/npc-editor.tsx` - Create/Edit form
  - Fields: Name, Description, Personality, Behavior, Voice, Canon toggle.
  - Universe selector.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocked By**: 13

  **References**:
  - `src/components/personas/` - Similar UI patterns
  - `src/app/(app)/personas/page.tsx` - Page structure

  **Acceptance Criteria**:
  - [ ] List shows NPCs
  - [ ] Editor form saves correctly
  - [ ] Canon toggle works

  **QA Scenarios**:
  ```
  Scenario: NPC creation flow
    Tool: Playwright
    Steps:
      1. Navigate to NPCs page
      2. Click New NPC
      3. Fill form, Save
    Expected Result: NPC appears in list
    Evidence: .omo/evidence/task-14-npc-ui.png
  ```

  **Commit**: YES (groups with 13)
  - Message: `feat: add NPCs management UI`

- [ ] 15. NPC Evolution Logic

  **What to do**:
  - New job handler `src/lib/jobs/npc-evolution.ts`.
  - Scans recent messages involving NPC.
  - Updates `personality_traits` and `evolution_log` if `is_canon = false`.
  - Uses LLM to analyze interactions and suggest trait changes.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocked By**: 13

  **References**:
  - `src/lib/jobs/` - Job handler patterns
  - `src/lib/ollama.ts` - LLM calls

  **Acceptance Criteria**:
  - [ ] Job updates NPC traits
  - [ ] Canon NPCs are skipped
  - [ ] Evolution log appended

  **QA Scenarios**:
  ```
  Scenario: NPC evolution job
    Tool: Bash (node script)
    Steps:
      1. Create non-canon NPC
      2. Add messages interacting with NPC
      3. Trigger evolution job
    Expected Result: NPC traits updated
    Evidence: .omo/evidence/task-15-npc-evolution.txt
  ```

  **Commit**: YES (groups with 13, 14)
  - Message: `feat: add NPC evolution job handler`

- [ ] 16. Lore Extraction Job Handler

  **What to do**:
  - New job type `extract_lore_comprehensive`.
  - Handler in `src/lib/jobs/lore-extraction.ts`.
  - Scans ALL messages in session/universe.
  - LLM identifies entities, events, relationships.
  - Creates/updates wiki pages in `draft` status.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocked By**: 1 (Schema)

  **References**:
  - `src/lib/jobs/wiki-ingest.ts` - Similar wiki creation logic
  - `src/lib/wiki/file-io.ts` - `writeWikiPage`

  **Acceptance Criteria**:
  - [ ] Job scans messages
  - [ ] Creates draft wiki pages
  - [ ] Progress reported via SSE

  **QA Scenarios**:
  ```
  Scenario: Lore extraction job
    Tool: Bash (node script)
    Steps:
      1. Queue job for universe
      2. Wait for completion
      3. Check wiki directory for new files
    Expected Result: New draft files created
    Evidence: .omo/evidence/task-16-lore-extraction.txt
  ```

  **Commit**: YES
  - Message: `feat: add comprehensive lore extraction job`

- [ ] 17. Lore Extraction UI Trigger

  **What to do**:
  - Add "Extract Lore" button to Universe settings or Wiki page.
  - Triggers job, shows progress.
  - Links to review queue for draft pages.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocked By**: 16

  **References**:
  - `src/components/wiki/` - Wiki UI patterns
  - `src/lib/event-bus.ts` - Job progress SSE

  **Acceptance Criteria**:
  - [ ] Button triggers job
  - [ ] Progress shown
  - [ ] Link to review queue

  **QA Scenarios**:
  ```
  Scenario: Lore extraction UI
    Tool: Playwright
    Steps:
      1. Click Extract Lore
      2. Verify progress bar
    Expected Result: Job starts, progress updates
    Evidence: .omo/evidence/task-17-lore-ui.png
  ```

  **Commit**: YES (groups with 16)
  - Message: `feat: add lore extraction UI trigger`

- [ ] 18. Enforce Universe Isolation

  **What to do**:
  - Update `sessions` table: `universe_id` NOT NULL (migration needed).
  - Update session creation API to require `universe_id`.
  - Update Wiki API to enforce universe-scoped paths.
  - UI: Universe selector required before session creation.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6
  - **Blocked By**: 1 (Schema)

  **References**:
  - `src/app/api/sessions/route.ts` - Session creation
  - `src/lib/wiki/wiki-root.ts` - Path scoping

  **Acceptance Criteria**:
  - [ ] Session creation fails without `universe_id`
  - [ ] Wiki API rejects cross-universe paths
  - [ ] UI enforces selection

  **QA Scenarios**:
  ```
  Scenario: Session creation requires universe
    Tool: Bash (curl)
    Steps:
      1. curl -X POST /api/sessions -d '{"name":"Test"}'
    Expected Result: 400, error about universe_id
    Evidence: .omo/evidence/task-18-universe-enforcement.json
  ```

  **Commit**: YES
  - Message: `feat: enforce universe isolation for sessions and wiki`

### Phase 3: Advanced Polish

- [ ] 19. Wiki Version History UI

  **What to do**:
  - New tab/panel in Wiki editor: "History".
  - Fetches `wiki_versions` for current page.
  - Shows list of versions with timestamp, summary.
  - "Restore" button reverts to selected version.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7
  - **Blocked By**: 4 (Wiki versions table)

  **References**:
  - `src/components/wiki/wiki-editor.tsx` - Editor structure
  - `src/lib/wiki/history.ts` - (To be created)

  **Acceptance Criteria**:
  - [ ] History tab shows versions
  - [ ] Restore button works
  - [ ] File reverted on disk

  **QA Scenarios**:
  ```
  Scenario: Version restore
    Tool: Playwright
    Steps:
      1. Open Wiki page
      2. Go to History tab
      3. Click Restore on old version
    Expected Result: Page content reverts
    Evidence: .omo/evidence/task-19-version-restore.png
  ```

  **Commit**: YES
  - Message: `feat: add wiki version history UI`

- [ ] 20. Wiki Templates System

  **What to do**:
  - Create `src/lib/wiki/templates/` with `.md` files for each type.
  - API: `GET /api/wiki/templates` lists available templates.
  - UI: "Create from Template" button in Wiki creation flow.
  - Pre-fills editor with template content.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 8

  **References**:
  - `src/lib/wiki/file-io.ts` - File writing
  - `src/components/wiki/wiki-creation-modal.tsx` - Creation UI

  **Acceptance Criteria**:
  - [ ] Templates directory exists
  - [ ] API returns template list
  - [ ] UI allows selection
  - [ ] Editor pre-filled

  **QA Scenarios**:
  ```
  Scenario: Create from template
    Tool: Playwright
    Steps:
      1. Click New Page
      2. Select "Character" template
    Expected Result: Editor shows character template
    Evidence: .omo/evidence/task-20-templates.png
  ```

  **Commit**: YES
  - Message: `feat: add wiki templates system`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
- [ ] F2. **Code Quality Review** — `unspecified-high`
- [ ] F3. **Real Manual QA** — `unspecified-high`
- [ ] F4. **Scope Fidelity Check** — `deep`

---

## Commit Strategy

- **1**: `feat: allow symbols in usernames` - `src/lib/config.ts`, `src/lib/auth.ts`
- **2**: `feat: add FTS5 virtual table` - `scripts/init-db.ts`, `src/lib/schema-migrations.ts`
- **3**: `feat: add npcs table` - `scripts/init-db.ts`, `src/lib/schema-migrations.ts`
- **4**: `feat: add wiki_versions table` - `scripts/init-db.ts`, `src/lib/schema-migrations.ts`
- **5**: `feat: add chat search endpoint` - `src/app/api/sessions/[id]/messages/search/route.ts`
- **6**: `feat: add chat export endpoint` - `src/app/api/sessions/[id]/export/route.ts`
- **7**: `feat: add session recap trigger` - `src/app/api/sessions/[id]/recap/route.ts`
- **8**: `feat: add recent changes API` - `src/app/api/wiki/recent/route.ts`
- **9**: `feat: add chat search UI` - `src/components/chat/`
- **10**: `feat: add chat export UI` - `src/components/session/`
- **11**: `feat: add session recap panel` - `src/components/session/`
- **12**: `feat: add recent changes widget` - `src/app/(app)/dashboard/page.tsx`
- **13**: `feat: add NPCs API` - `src/app/api/npcs/`
- **14**: `feat: add NPCs UI` - `src/components/npcs/`, `src/app/(app)/npcs/page.tsx`
- **15**: `feat: add NPC evolution job` - `src/lib/jobs/npc-evolution.ts`
- **16**: `feat: add lore extraction job` - `src/lib/jobs/lore-extraction.ts`
- **17**: `feat: add lore extraction UI` - `src/components/wiki/`
- **18**: `feat: enforce universe isolation` - `src/app/api/sessions/`, `src/lib/wiki/`
- **19**: `feat: add version history UI` - `src/components/wiki/`
- **20**: `feat: add wiki templates` - `src/lib/wiki/templates/`, `src/components/wiki/`

---

## Success Criteria

### Verification Commands
```bash
npx next build  # Expected: Compiled successfully
curl http://localhost:3000/api/health  # Expected: 200 OK
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All builds pass
- [ ] Universe isolation enforced
- [ ] Session isolation enforced
- [ ] NPCs separate from Personas
