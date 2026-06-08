# LIBRARY UTILITIES — src/lib/

## OVERVIEW
61 flat utility files + 6 subdirectories for subsystems that have grown beyond single files. Business logic layer: auth, DB, LLM, jobs, relationships, TTS, wiki, benchmark, idle tasks, validation, and tests.

## STRUCTURE
```
src/lib/
├── auth.ts, auth-token.ts, auth-edge.ts, with-auth.ts  # Auth: JWT, bcrypt, token extraction, HOF
├── jobs/                       # Job processing (19 files, see jobs/AGENTS.md)
├── benchmark/                  # Ollama model benchmarking (10 files)
├── idle/                       # Idle-time wiki & relationship processing tasks (2 files)
├── validation/                 # Shared input validation utilities (1 file)
├── __tests__/                  # Flat test files (6 files, bun:test)
├── db.ts                       # SQLite singleton (WAL mode, foreign keys)
├── ollama.ts                   # Ollama client (text, stream, embeddings)
├── ollama-busy.ts              # Ollama busy-state tracking
├── ollama-meta.ts              # Ollama model metadata queries
├── prompt-builder.ts           # Prompt assembly for LLM calls
├── prompts.ts                  # Shared prompt templates
├── config.ts                   # OLLAMA_CONFIG, TTS_CONFIG, AUTH_CONFIG, APP_CONFIG
├── server-config.ts            # Server-side configuration
├── types.ts                    # Shared type definitions
├── entity-constants.ts         # Entity type definitions
├── event-bus.ts                # In-process event bus for SSE
├── retrieval.ts                # Context retrieval pipeline
├── vector-search.ts            # sqlite-vec search with fallback
├── embeddings.ts               # Embedding generation
├── semantic-contradiction.ts   # Semantic contradiction detection
├── job-processor.ts            # Job queue execution (no persistent workers)
├── idle-processing.ts          # Idle-time tier processing (5/10/15/30min)
├── relationship-access.ts      # Relationship DB access utilities
├── relationship-analysis.ts    # Relationship analysis logic
├── relationship-constants.ts   # Relationship constants
├── relationship-decay.ts       # Relationship emotional decay
├── relationship-markdown.ts    # Relationship markdown rendering
├── relationship-types.ts       # Relationship type definitions
├── relationship-viz.ts         # Relationship visualization helpers
├── emotion-utils.ts            # Emotion utility functions
├── tts.ts                      # TTS configuration
├── tts-queue.ts                # TTS queue management
├── voice-discovery.ts          # TTS voice discovery
├── backlinks.ts                # Wikilink backlink computation
├── canon-tiers.ts              # Canon tier management
├── entity-extraction.ts        # Entity extraction from text
├── entity-resolution.ts        # Entity resolution/linking
├── importance.ts               # Content importance scoring
├── scene-extraction.ts         # Scene extraction from narratives
├── contradiction-detector.ts   # Lore contradiction detection
├── message-summarizer.ts       # Message summarization
├── memory-compression.ts       # Memory compression by age tier
├── markdown-utils.ts           # Markdown utilities
├── render-loop.ts              # 30fps render loop
├── summarization.ts            # Text summarization
├── intent-analyzer.ts          # Semantic intent analysis
├── date-formatter.ts           # Date formatting utilities
├── api-client.ts               # Typed client-side API client with retry
├── group-migrations.ts         # Group migration utilities
├── universe-utils.ts           # Universe-level utilities
├── schema-migrations.ts        # DB schema migration helpers
├── session-columns.ts          # Session column name utilities
├── row-to-json.ts              # SQLite row-to-JSON conversion
├── validation.ts               # Input validation helpers
├── error-response.ts           # Standardized error response builder
├── response-utils.ts           # HTTP response utilities
├── rate-limiter.ts             # Request rate limiter
├── safe-json.ts                # Safe JSON parse utilities
├── logger.ts                   # Structured logging
├── startup-check.ts            # App startup validation checks
├── shutdown.ts                 # Graceful shutdown handling
└── wiki/                       # Wiki subsystem (43 files, see wiki/AGENTS.md)
```

### `benchmark/`
- **Purpose**: Automated Ollama model benchmarking — probes a model's context window limit, max predict token capacity, and combined (context × predict) performance. Produces a `BenchmarkReport` with recommended `num_ctx` and `num_predict` values, plus an optional roleplay memory/accuracy test.
- **Key files**:
  - `types.ts` — All benchmark interfaces: `BenchmarkConfig`, `ContextTestResult`, `PredictTestResult`, `CombinationResult`, `RoleplayTestResult`, `BenchmarkReport`
  - `orchestrator.ts` — `runBenchmark()` / `runBenchmarkBackground()`: top-level entry point that runs the full pipeline (connectivity check → model metadata → context test → predict test → combination grid → auto-tune recommendation) with stage-by-stage progress callbacks
  - `context-test.ts` — Binary search through exponentially doubling context sizes to find the model's working `num_ctx` limit (uses a tiny `num_predict` to isolate context VRAM usage)
  - `predict-test.ts` — Tests max `num_predict` output capacity at a fixed small context (2048 tokens)
  - `combination-test.ts` — Grid search testing context × predict combinations to find balanced pairs (up to 5 context sizes)
  - `auto-tune.ts` — `generateRecommendation()`: selects the best (num_ctx, num_predict) pair via product-scoring, falling back to independent maxes with safety margin
  - `roleplay-test.ts` — A lore pack ("The Emberwild Frontier") used to benchmark a model's roleplay memory: fact recall rate, format adherence, and contradiction detection across multiple turns
  - `job-store.ts` — In-memory `Map<string, BenchmarkJob>` + JSON file persistence under `data/benchmarks/{userId}/`. Tracks status, progress, stage, and completed reports per job
- **Entry points**: Call `runBenchmark({ config, userId, onProgress })` to run the full benchmark. Use `job-store.ts` to create, update, persist, and load benchmark jobs. Benchmark results are surfaced via the benchmark API endpoints.

### `idle/`
- **Purpose**: Decomposed idle-time processing tasks for wiki and relationship subsystems. These modules are called by the main `idle-processing.ts` tier system (flat file above), keeping each domain's logic colocated rather than in a single monolithic file.
- **Key files**:
  - `wiki-tasks.ts` — Wiki idle operations by tier:
    - Tier 1: `wikiCompressSummaries()` (summarize + promote stale drafts), `wikiRefineRelationships()` (create/update relationship wiki pages from DB)
    - Tier 2: `wikiDeepenPages()` (append LLM-generated connections to old pages), `wikiEnrichEntities()` (add details to high-importance entity pages)
    - Tier 3: `wikiGenerateRumors()` (create rumor pages from recent events), `wikiArchive()` (mark old drafts as archived with one-sentence summary)
    - Tier 4: `wikiDecayRelationships()` (apply emotional half-life decay to relationship wiki pages via DB relationship data)
  - `relationship-tasks.ts` — Relationship idle operations:
    - `processRelationshipIdleAnalysis()` — Direct analysis of sessions needing relationship updates
    - `queueRelationshipIdleJobs()` — Populates the job queue with relationship decay, summarization, and embedding jobs
    - `processRelationshipIdleTier()` — Tier-based job queuing: 5min (compress/refine), 10min (embeddings), 15min (archive), 30min (decay + summarize)
    - `processRemainingQueuedJobs()` — Drains all remaining queued jobs in priority order (catch-all, no limit)
- **Entry points**: Functions are called from `idle-processing.ts` tier dispatch. For direct use: `wikiCompressSummaries(userId, universeId)`, `processRelationshipIdleAnalysis(userId)`, `processRemainingQueuedJobs(userId)`.

### `validation/`
- **Purpose**: Shared, lightweight input validation utilities used across lib modules and API routes.
- **Key files**:
  - `uuid-validator.ts` — `isValidUUID(id)`: regex-based UUID format check (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
- **Entry points**: `import { isValidUUID } from "@/lib/validation/uuid-validator"` wherever user-provided UUIDs need format validation before DB queries.

### `__tests__/`
- **Purpose**: Flat test files for lib modules, run with `bun:test`. Tests create temporary in-memory databases and mock dependencies rather than requiring a live server or Ollama.
- **Key files**:
  - `helpers.ts` — Shared test infrastructure: `createTestDb()` (in-memory SQLite with core tables), `createTestUser()`, `createTestUniverse()`, `createTestSession()`. All tests import from here for consistent setup.
  - `frontmatter.test.ts` — 12 cases covering wiki frontmatter parse, serialize, validate, `EMPTY_FRONTMATTER` shape, and ISO timestamp preservation
  - `wiki-prompt-integration.test.ts` — 520-line end-to-end test of the wiki→retrieval→prompt pipeline (7 layers: index parsing, relevance scoring, page resolution, page reading, prompt assembly with lore, budget truncation, full end-to-end)
  - `syntax-highlighter.test.ts` — 23 cases for the markdown syntax highlighter (block tokens, inline tokens, HTML safety, edge cases)
  - `safe-json.test.ts` — Tests for `safeParse` and `safeParseWarn` with valid/invalid JSON and fallback behavior
  - `get-active-job-model.test.ts` — 3 cases for the job model resolver with mocked DB dependencies (toggle ON/OFF, model set/null)
- **Entry points**: Run with `bun test src/lib/__tests__/`. Import `helpers.ts` in new test files for `createTestDb()`, `createTestUser()`, etc.

## CONVENTIONS
- **Flat-first, subdirectory when warranted** — most utilities remain flat files. Subdirectories (`wiki/`, `jobs/`, `benchmark/`, `idle/`, `validation/`) are created when a clear subsystem emerges with multiple cohesive files.
- **No barrel exports** — import directly from file path.
- **Raw SQL** — `db.prepare("...").get/all/run()` with `?` parameters. No ORM.
- **Types co-located** — interfaces live with their implementation files, or in a local `types.ts` within the subdirectory.
- **Config centralized** — `config.ts` exports all app constants.

## ANTI-PATTERNS
- **Do NOT add ORM** — raw better-sqlite3 is the pattern.
- **Do NOT import from `data/`** — runtime storage, not source code.
- **Do not put business logic in test files** — `__tests__/helpers.ts` provides shared setup; tests should exercise code, not duplicate it.
