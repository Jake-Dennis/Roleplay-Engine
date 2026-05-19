# LIBRARY UTILITIES — src/lib/

## OVERVIEW
37 flat utility files + `wiki/` subdirectory (14 files). Business logic layer: auth, DB, LLM, jobs, relationships, TTS, wiki.

## STRUCTURE
```
src/lib/
├── auth.ts / auth-token.ts     # JWT, bcrypt, token extraction
├── db.ts                       # SQLite singleton (WAL mode, foreign keys)
├── ollama.ts                   # Ollama client (text, stream, embeddings)
├── prompt-builder.ts           # Prompt assembly for LLM calls
├── config.ts                   # OLLAMA_CONFIG, TTS_CONFIG, AUTH_CONFIG, APP_CONFIG
├── job-processor.ts            # Job queue execution (no persistent workers)
├── idle-processing.ts          # Idle-time tier processing (5/10/15/30min)
├── idle-enrichment.ts          # Wiki enrichment during idle time
├── event-bus.ts                # In-process event bus for SSE
├── retrieval.ts                # Context retrieval pipeline
├── vector-search.ts            # sqlite-vec search with fallback
├── backlinks.ts                # Wikilink backlink computation
├── canon-tiers.ts              # Canon tier management
├── entity-constants.ts         # Entity type definitions
├── importance.ts               # Content importance scoring
├── relationship-*.ts           # Relationship analysis, decay, markdown, viz
├── message-summarizer.ts       # Message summarization
├── memory-compression.ts       # Memory compression by age tier
├── tts.ts / tts-queue.ts       # TTS config and queue
├── voice-discovery.ts          # TTS voice discovery
├── markdown-renderer.ts        # Server-side markdown rendering
├── markdown-utils.ts           # Markdown utilities
├── render-loop.ts              # 30fps render loop
├── summarization.ts            # Text summarization
├── intent-analyzer.ts          # Semantic intent analysis
├── semantic-*.ts               # Semantic search fallbacks
├── date-formatter.ts           # Date formatting utilities
├── api-client.ts               # Typed client-side API client with retry
├── embeddings.ts               # Embedding generation
├── group-migrations.ts         # Group migration utilities
└── wiki/                       # Wiki subsystem (see wiki/AGENTS.md)
```

## CONVENTIONS
- **Flat structure** — all utilities are siblings. Only `wiki/` has a subdirectory.
- **No barrel exports** — import directly from file path.
- **Raw SQL** — `db.prepare("...").get/all/run()` with `?` parameters. No ORM.
- **Types co-located** — interfaces live with their implementation files.
- **Config centralized** — `config.ts` exports all app constants.

## ANTI-PATTERNS
- **Do NOT create new subdirectories** unless a clear subsystem emerges (wiki/ is the only one).
- **Do NOT add ORM** — raw better-sqlite3 is the pattern.
- **Do NOT import from `data/`** — runtime storage, not source code.
