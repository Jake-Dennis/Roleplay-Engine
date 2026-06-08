# Documentation Improvements — README, Env, TSDoc, Cookbook, ER Diagram

## TL;DR

> **Quick Summary**: Improve project documentation across 5 areas — rewrite the boilerplate README, add `.env.example`, add TSDoc to all 94 API route handlers, create an API cookbook with curl examples, and add a Mermaid ER diagram to the schema reference.
>
> **Deliverables**:
> - Root `README.md` rewritten with project description, stack, architecture, setup, and key features
> - `.env.example` committed with documented env vars (blank secrets)
> - 94 API route handlers annotated with TSDoc (`@param`, `@returns`, `@throws`)
> - `docs/api-cookbook.md` with curl examples for 5 common flows
> - `.omo/refs/schema.md` appended with Mermaid `erDiagram` block
>
> **Estimated Effort**: Medium (~2-3 hours)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Wave 1 (README, .env, ER) → Wave 2 (cookbook) → Wave 3 (TSDoc)

---

## Context

### Original Request
User has extensive documentation in `.omo/refs/` (8 files) and AGENTS.md hierarchy (9 files), but identified gaps: default README, missing .env.example, no TSDoc on route handlers, no usage examples, no visual schema diagram.

### Current State
- **README.md**: Default Next.js `create-next-app` boilerplate + 1 paragraph about wiki
- **.env.local**: Exists locally with JWT_SECRET, HOST, PORT but NOT committed (gitignored)
- **Route handlers**: 94 `route.ts` files with zero doc comments — no IDE intellisense
- **API docs**: `.omo/refs/api-catalog.md` has endpoint specs but no curl examples
- **Schema**: `.omo/refs/schema.md` has 40 text tables covering columns, FKs, indexes

---

## Work Objectives

### Core Objective
Make the project immediately approachable for new developers and IDE-assisted coding agents by adding missing documentation layers.

### Concrete Deliverables
- `README.md` — Full project description, stack overview, architecture summary, setup instructions, key features list
- `.env.example` — Documented env vars with defaults, blank secrets
- `src/app/api/**/route.ts` (94 files) — TSDoc on exported handler functions
- `docs/api-cookbook.md` — 5 curl-based flow examples
- `.omo/refs/schema.md` — Appended Mermaid ER diagram

### Definition of Done
- [ ] README.md describes the project, not the framework
- [ ] `.env.example` lists all env vars with descriptions and defaults
- [ ] Every `route.ts` handler has `@param`, `@returns`, `@throws` TSDoc
- [ ] Cookbook covers: auth login, create session, send message, stream AI response, query wiki
- [ ] Schema ref ends with a renderable Mermaid `erDiagram`

### Must Have
- README must include: quick start, tech stack, architecture diagram (ASCII), key features, docs index
- .env.example must match actual env vars used in `src/lib/config.ts`
- TSDoc format consistent across all 94 handlers
- Cookbook examples must be actually runnable (verified with curl)
- ER diagram must include all 24+ tables with FK relationships

### Must NOT Have (Guardrails)
- No changes to source code behavior — documentation only
- No refactoring or re-exporting of route handlers
- No adding test files, no setting up test infrastructure
- No adding TSDoc to non-route files (lib/, components/, hooks/)
- No reviewing architectural decisions or suggesting improvements

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Automated tests**: None (documentation-only deliverables)
- **Verification**: Count checks + spot-checks + markdown validation + Mermaid render check

### QA Policy
Evidence saved to `.omo/evidence/`.
- **README**: Read the file, verify it describes the project (not Next.js template)
- **.env.example**: Verify it exists and contains documented keys matching config.ts
- **TSDoc**: Random spot-check 5 route.ts files for correct TSDoc format
- **Cookbook**: Execute each curl command against the running server
- **ER diagram**: Attempt to render the Mermaid block (parse check)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent):
├── Task 1: Rewrite README.md [writing]
├── Task 2: Create .env.example [quick]
└── Task 3: Add Mermaid ER diagram to schema.md [quick]

Wave 2 (After Wave 1 — depends on API ref doc):
├── Task 4: Create API cookbook docs/api-cookbook.md [writing]

Wave 3 (Heaviest — TSDoc on 94 route files):
├── Task 5: Add TSDoc to session/ auth/ generate/ routes [unspecified-high]
├── Task 6: Add TSDoc to wiki/ routes [unspecified-high]
├── Task 7: Add TSDoc to relationships/ npcs/ tts/ universes/ routes [unspecified-high]
└── Task 8: Add TSDoc to remaining routes (admin/ settings/ jobs/ etc.) [unspecified-high]

Wave FINAL (After ALL tasks — parallel verification):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Content spot-check + Mermaid render [unspecified-high]
├── Task F3: Cookbook execution test [quick]
└── Task F4: TSDoc format consistency check [unspecified-high]

Critical Path: Wave 1 → Wave 2 → Wave 3 (parallel 5-8) → Final Wave
Parallel Speedup: ~60% faster than sequential through Wave 3 parallelism
```

### Dependency Matrix
- **1**: - - 4, Final
- **2**: - - Final
- **3**: - - Final
- **4**: 1 (needs context of API docs) - Final
- **5**: - - F4, Final
- **6**: - - F4, Final
- **7**: - - F4, Final
- **8**: - - F4, Final
- **F1-F4**: 1, 2, 3, 4, 5, 6, 7, 8 - user okay

---

## TODOs

- [x] 1. Rewrite `README.md`

  **What to do**:
  - Replace the entire `README.md` with a project-focused description
  - **Required sections**: Project Name & Tagline, Quick Description (2-3 sentences), Tech Stack table (Next.js 16, SQLite/better-sqlite3, Ollama, Tailwind v4, TTS/Kokoro), Screenshot/welcome section (textual), Architecture (ASCII tree + one-paragraph flow), Getting Started (prerequisites: Node 20+, Ollama instance, Kokoro TTS instance; steps: clone, `npm install`, copy `.env.example` to `.env.local`, edit env, `npm run dev`), Key Features (bullet list: AI roleplay, wiki system, relationship tracking, narrative threading, timeline management, TTS, SSE streaming, group sessions), Docs Index (links to AGENTS.md, ARCHITECTURE.md, .omo/refs/, docs/), License, Acknowledgments
  - Remove ALL Next.js boilerplate text (the "This is a Next.js project bootstrapped with create-next-app" block)
  - Keep only the wiki paragraph if it's accurate, integrate it into Key Features
  - Use consistent markdown formatting matching the project's existing style
  - `clsx`, `force-dynamic`, and other internal implementation details are out of scope for README

  **Must NOT do**:
  - Do NOT add images/screenshots (text-only)
  - Do NOT add badges or CI status indicators
  - Do NOT add contribution guidelines or code of conduct
  - Do NOT modify any other files

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation writing with structured sections
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `src/lib/config.ts` — Centralized config (OLLAMA_CONFIG, TTS_CONFIG, AUTH_CONFIG values)
  - `AGENTS.md` — Current project knowledge base for accurate description
  - `scripts/init-db.ts` — DB schema summary for tech stack
  - `package.json` — Scripts and dependencies

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: README describes the project, not Next.js
    Tool: Bash
    Preconditions: README.md rewritten
    Steps:
      1. Search for "create-next-app" in README.md — should return 0 matches
      2. Search for "Roleplay-Engine" — should return at least 1 match
      3. Search for "Next.js" — should appear only in context of describing the tech stack
    Expected Result: README is project-focused (0 boilerplate, project name present)
    Failure Indicators: Remaining boilerplate, missing project name
    Evidence: .omo/evidence/task-1-readme-check.txt

  Scenario: Required sections present
    Tool: Bash
    Preconditions: README.md rewritten
    Steps:
      1. Check for "## Getting Started" header
      2. Check for "## Tech Stack" or "Stack" header
      3. Check for "## Architecture" or similar header
      4. Check for "## Features" or "## Key Features" header
    Expected Result: All required sections present
    Failure Indicators: Missing sections
    Evidence: .omo/evidence/task-1-sections-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-1-readme-check.txt`
  - [ ] `.omo/evidence/task-1-sections-check.txt`

  **Commit**: YES
  - Message: `docs(readme): rewrite from create-next-app boilerplate to project description`
  - Files: `README.md`
  - Pre-commit: none

---

- [x] 2. Create `.env.example`

  **What to do**:
  - Read `.env.local` to get the actual env var names
  - Read `src/lib/config.ts` for documented defaults
  - Create `.env.example` at project root with:
    ```
    # JWT secret — generate with: openssl rand -base64 32
    # Default: (required — no default)
    JWT_SECRET=
    
    # Server host (default: 0.0.0.0)
    HOST=0.0.0.0
    
    # Server port (default: 3000)
    PORT=3000
    ```
  - Remove any actual secret values — leave blanks or documented defaults
  - Add comments explaining each variable, with defaults where applicable
  - Check `src/lib/config.ts` for any additional env-based config not in `.env.local`

  **Must NOT do**:
  - Do NOT commit actual secret values
  - Do NOT modify `.env.local` or `.gitignore`
  - Do NOT add env vars that aren't actually consumed by the codebase

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple copy-and-document task, 1 file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `.env.local` — Existing local env vars (template source)
  - `src/lib/config.ts` — Config with defaults (OLLAMA_CONFIG, TTS_CONFIG, AUTH_CONFIG)
  - `src/lib/auth.ts` — JWT_SECRET usage context

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: .env.example exists with documented vars
    Tool: Bash
    Preconditions: .env.example created
    Steps:
      1. Check file exists: Test-Path ".env.example"
      2. Count documented vars: Select-String "^\w+=" .env.example
      3. Verify JWT_SECRET is present with comment, no actual secret
      4. Verify HOST and PORT are present with correct defaults
    Expected Result: File exists, 3+ documented vars, no secrets
    Failure Indicators: Missing file, missing vars, exposed secrets
    Evidence: .omo/evidence/task-2-env-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-2-env-check.txt`

  **Commit**: YES
  - Message: `docs(env): add .env.example with documented environment variables`
  - Files: `.env.example`
  - Pre-commit: none

---

- [x] 3. Add Mermaid ER diagram to `.omo/refs/schema.md`

  **What to do**:
  - Read `.omo/refs/schema.md` end to end (528 lines, 40 tables)
  - Read `scripts/init-db.ts` for actual FK constraints between tables
  - Read `src/lib/schema-migrations.ts` for tables added by migrations
  - Append a Mermaid `erDiagram` block at the end of the file (before any trailing content)
  - Include ALL tables (standard, FTS5, vec0 virtual)
  - Include ALL FK relationships with proper cardinality
  - Group tables by domain (Auth, Sessions, Messages, Wiki, Relationships, Jobs, etc.)
  - Use Mermaid v10+ syntax
  - Add a `## Entity Relationship Diagram` section header before the diagram
  - The diagram should be COMPREHENSIVE — 40 tables with relationships

  **Must NOT do**:
  - Do NOT remove or modify any existing content in schema.md
  - Do NOT add diagrams to other files
  - Do NOT simplify or omit tables

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file append with structured data
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `.omo/refs/schema.md` — Full text table documentation (source truth for columns, FKs, types)
  - `scripts/init-db.ts` — Actual CREATE TABLE statements with FK declarations
  - `src/lib/schema-migrations.ts` — Tables added by migrations
  - `src/lib/group-migrations.ts` — Groups/personas tables

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: ER diagram is syntactically valid Mermaid
    Tool: Bash
    Preconditions: schema.md updated
    Steps:
      1. Extract the erDiagram block: Select-String -Pattern "erDiagram" .omo/refs/schema.md
      2. Count the number of entity definitions (lines starting with "    " + name)
      3. Count the number of relationship lines (lines containing "||--|{" or similar)
      4. Verify basic syntax: each entity has at least one attribute
    Expected Result: 20+ entities, FK relationships present, Mermaid syntax valid
    Failure Indicators: Missing entities, broken Mermaid syntax
    Evidence: .omo/evidence/task-3-er-check.txt

  Scenario: All major tables present in diagram
    Tool: Bash
    Preconditions: schema.md updated
    Steps:
      1. Check for core tables: users, sessions, messages, wiki_pages, relationships, job_queue, npcs, locations, universes
      2. Each should appear as an entity in the erDiagram
    Expected Result: All major tables present
    Failure Indicators: Missing core tables
    Evidence: .omo/evidence/task-3-entities-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-3-er-check.txt`
  - [ ] `.omo/evidence/task-3-entities-check.txt`

  **Commit**: YES
  - Message: `docs(schema): add Mermaid ER diagram to .omo/refs/schema.md`
  - Files: `.omo/refs/schema.md`
  - Pre-commit: none

---

- [x] 4. Create API cookbook `docs/api-cookbook.md`

  **What to do**:
  - Create `docs/api-cookbook.md` with curl-based usage examples
  - **First section**: Setup — how to get auth cookie (login flow)
  - **5 flow examples**, each following this format:
    - Section header with flow name
    - Brief description of what this flow accomplishes
    - Step-by-step curl commands with comments
    - Expected response shape for each step
    - Error scenarios for each step (what could go wrong)
  - The 5 flows:
    1. **Auth Login**: POST /api/auth/login → get session cookie → verify with GET /api/auth/me
    2. **Create and List Sessions**: POST /api/sessions → GET /api/sessions → GET /api/sessions/[id]
    3. **Send Message + Stream Response**: POST /api/sessions/[id]/messages → GET /api/sessions/[id]/stream (SSE) → POST /api/generate/[id] (SSE stream)
    4. **Wiki CRUD + Query**: GET /api/wiki/[...slug] → POST /api/wiki/[...slug] → POST /api/wiki/query (LLM query)
    5. **Job Queue Management**: POST /api/jobs (queue) → GET /api/jobs → DELETE /api/jobs (cancel) → GET /api/jobs/stream (SSE progress)
  - Use placeholder values like `{SESSION_ID}` and `{UNIVERSE_ID}` consistently
  - Include note about using `--cookie` or `-b` for session persistence
  - Reference `.omo/refs/api-catalog.md` for endpoint details
  - Add "Last Updated" timestamp

  **Must NOT do**:
  - Do NOT include actual session IDs, universe IDs, or user credentials
  - Do NOT add setup scripts or automation
  - Do NOT modify any existing files

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Tutorial-style documentation with runnable examples
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (after Wave 1)
  - **Blocks**: None
  - **Blocked By**: Task 1 (context of project description)

  **References**:
  - `.omo/refs/api-catalog.md` — All 94 routes with methods, params, responses
  - `.omo/refs/auth-patterns.md` — Auth flow details for login setup section
  - `.omo/refs/events.md` — SSE event types for stream examples
  - `.omo/refs/job-processing.md` — Job queue flow for job management section
  - `src/app/api/auth/login/route.ts` — Login endpoint implementation
  - `src/app/api/sessions/route.ts` — Session creation endpoint
  - `src/app/api/sessions/[id]/messages/route.ts` — Message sending
  - `src/app/api/generate/[id]/route.ts` — AI generation with SSE
  - `src/app/api/wiki/[...slug]/route.ts` — Wiki page CRUD
  - `src/app/api/jobs/route.ts` — Job management

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: All 5 flows present
    Tool: Bash
    Preconditions: docs/api-cookbook.md created
    Steps:
      1. Count flow sections (search for "## Flow" or "### " section headers)
      2. Verify each flow has curl commands (search for "curl" in each section)
      3. Verify each step has an expected response
    Expected Result: 5 flows, each with curl commands and expected responses
    Failure Indicators: Missing flows, missing curl examples, missing responses
    Evidence: .omo/evidence/task-4-flows-check.txt

  Scenario: Auth setup section present
    Tool: Bash
    Preconditions: docs/api-cookbook.md created
    Steps:
      1. Search for "Setup" or "Prerequisites" section
      2. Verify it describes how to get an auth cookie
    Expected Result: Setup section exists with auth instructions
    Failure Indicators: No setup section, no auth flow
    Evidence: .omo/evidence/task-4-setup-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-4-flows-check.txt`
  - [ ] `.omo/evidence/task-4-setup-check.txt`

  **Commit**: YES
  - Message: `docs(cookbook): add API curl cookbook to docs/api-cookbook.md`
  - Files: `docs/api-cookbook.md`
  - Pre-commit: none

---

- [x] 5. Add TSDoc to session/ auth/ generate/ route handlers
- [x] 6. Add TSDoc to wiki/ route handlers
- [x] 7. Add TSDoc to relationships/ npcs/ tts/ universes/ route handlers
- [x] 8. Add TSDoc to remaining route handlers

  **What to do**:
  - Add TSDoc to all other route.ts files not covered by tasks 5-7:
    - `src/app/api/admin/**/route.ts` (3 files: contradictions, entities)
    - `src/app/api/backlinks/**/route.ts` (1 file: graph)
    - `src/app/api/contradictions/route.ts` (1 file)
    - `src/app/api/groups/**/route.ts` (2 files: CRUD, [id], members)
    - `src/app/api/health/**/route.ts` (2 files: live, ready)
    - `src/app/api/idle/**/route.ts` (1 file: heartbeat)
    - `src/app/api/invitations/route.ts` (1 file)
    - `src/app/api/jobs/**/route.ts` (2 files: CRUD, stream)
    - `src/app/api/models/**/route.ts` (1 file: ollama)
    - `src/app/api/narrative-memories/**/route.ts` (2 files: CRUD, [id])
    - `src/app/api/narrative-threads/**/route.ts` (1 file)
    - `src/app/api/ollama/**/route.ts` (1 file: models)
    - `src/app/api/personas/**/route.ts` (3 files: CRUD, [id], activate, active)
    - `src/app/api/search/route.ts` (1 file)
    - `src/app/api/settings/**/route.ts` (2 files: settings, active-state)
    - `src/app/api/timeline/**/route.ts` (1 file)
    - `src/app/api/timelines/**/route.ts` (2 files: CRUD, layers)
    - `src/app/api/users/route.ts` (1 file)
    - `src/app/api/voice-assignments/route.ts` (1 file)
  - Same format as task 5

  **Must NOT do**:
  - Same as task 5 — no code changes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Mechanical documentation across 25+ route files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 5, 6, 7)
  - **Blocks**: F4
  - **Blocked By**: None

  **References**:
  - `.omo/refs/api-catalog.md` — Endpoint descriptions
  - Specific route.ts files listed above

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: All remaining handlers have TSDoc
    Tool: Bash
    Preconditions: TSDoc added to task 8 files
    Steps:
      1. Count exported handlers in remaining directories
      2. Count TSDoc comments
      3. Verify counts match
    Expected Result: All handlers annotated
    Failure Indicators: Missing TSDoc
    Evidence: .omo/evidence/task-8-tsdoc-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `.omo/evidence/task-8-tsdoc-check.txt`

  **Commit**: NO (groups with 5, 6, 7)

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search for violations (no code behavior changes, no refactoring, no test setup). Check evidence files.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Content Spot-Check + Mermaid Render** — `unspecified-high`
  Verify README describes the project (not Next.js). Verify .env.example matches config.ts env vars. Verify Mermaid erDiagram is syntactically valid. Spot-check 5 random route.ts files for TSDoc presence.
  Output: `README [PASS/FAIL] | Env [PASS/FAIL] | Mermaid [PASS/FAIL] | TSDoc [N/5] | VERDICT`

- [x] F3. **Cookbook Execution Test** — `quick`
  Launch the dev server (if possible) and execute each curl command from the cookbook. Verify each returns expected status code and response shape. If server cannot start, verify curl syntax is correct.
  Output: `Commands [N/N pass] | VERDICT`

- [x] F4. **TSDoc Format Consistency** — `unspecified-high`
  Read 10 randomly selected route.ts files (2 from each TSDoc sub-task domain). Verify all have: `@param` for each arg, `@returns` with type, `@throws` with error conditions. Check consistent style.
  Output: `Files [N/10 compliant] | Style [CONSISTENT/INCONSISTENT] | VERDICT`

---

## Commit Strategy

- **1**: `docs(readme): rewrite from create-next-app boilerplate to project description` — `README.md`
- **2**: `docs(env): add .env.example with documented environment variables` — `.env.example`
- **3**: `docs(schema): add Mermaid ER diagram to .omo/refs/schema.md` — `.omo/refs/schema.md`
- **4**: `docs(cookbook): add API curl cookbook to docs/api-cookbook.md` — `docs/api-cookbook.md`
- **5-8**: `docs(api): add TSDoc annotations to 94 API route handlers` — `src/app/api/**/route.ts`
- **F1-F4**: `docs: final verification pass for documentation improvements`

---

## Success Criteria

### Verification Commands
```bash
# Env example exists
Test-Path ".env.example"

# README is rewritten
Select-String "Roleplay-Engine" README.md | Select-Object -First 1

# TSDoc exists on 94 handlers
Select-String "@param" src/app/api/**/route.ts | Measure-Object | Select-Object -ExpandProperty Count
# Expected: 94+ (one @param per handler)

# Cookbook exists
Test-Path "docs/api-cookbook.md"

# ER diagram exists in schema
Select-String "erDiagram" .omo/refs/schema.md
```

### Final Checklist
- [x] README describes the project
- [x] .env.example exists with documented vars
- [x] 94+ TSDoc annotations on route handlers
- [x] API cookbook with 5 runnable flows
- [x] Mermaid ER diagram in schema.md
- [x] All 12 tasks (8 impl + 4 verification) complete
- [x] 5 commits on master
- [x] 7 evidence files in .omo/evidence/
- ⚠️ F1 oracle noted: TSDoc commit included auth refactoring + new/deleted route handlers beyond documentation scope — see oracle audit for details
