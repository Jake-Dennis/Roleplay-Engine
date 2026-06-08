# JOB PROCESSING — src/lib/jobs/

## OVERVIEW
14 files implementing the async job system. On-demand processing via API triggers and idle tiers. No persistent workers. 20 job types across 12 handler modules.

## STRUCTURE
```
src/lib/jobs/
├── types.ts                    # 20 job types, 5 priorities, 5 statuses, constants
├── queue.ts                    # Core: queueJob, getUserJobs, updateJobProgress, markJobCompleted/Failed
├── job-processor.ts            # Orchestrator: processUserJobs, processJobsByType
├── summarization-handler.ts    # Message summarization (summarize_messages)
├── wiki-handler.ts (518L)      # 7 wiki job types: ingest, enrich, deepen, auto-extract, sync
├── embedding-handler.ts        # Vector embedding computation (generate_embeddings)
├── relationship-analysis-handler.ts # Relationship state detection (analyze_relationships)
├── decay-handler.ts            # Time-based relationship decay (decay_relationships)
├── relationship-summary-handler.ts  # Rewrite relationship summaries
├── archival-handler.ts         # Data retention/cleanup (archival_processing)
├── thread-analysis-handler.ts  # Narrative thread tracking (thread_analysis)
├── lore-extraction.ts          # Event/lore extraction (extract_lore_comprehensive)
├── npc-evolution.ts            # NPC personality evolution
├── session-recap.ts            # Full session narrative recap
└── scene-handler.ts            # Scene state extraction
```

## HANDLER CONVENTIONS
- **Signature**: Every handler exports `async process(job)` — receives full job_queue row.
- **Progress**: Call `updateJobProgress(jobId, progress, message)` from within handler.
- **Payload**: Read `job.payload` (JSON parse) for type-specific parameters.
- **Return**: Return result object → stored in `job.result` on completion.
- **Errors**: Throw on failure → processor catches and calls `markJobFailed()`.
- **Transactions**: Each handler manages its own DB transactions (better-sqlite3 synchronous).

## DISPATCH
The processor uses a switch statement on `job.type` to select the handler module. All 20 types map to 12 handler files (wiki-handler handles 7 types, lore-extraction handles 2).

## DEBOUNCE & DEDUP
| Mechanism | Window | Applied To |
|-----------|--------|------------|
| Dedup | 30s | All job types (identical type + scope) |
| Debounce | 60s | wiki_extract_event, thread_analysis |
| Debounce | 30s | scene_state_extract, analyze_relationships |

## ANTI-PATTERNS
- **Do NOT add persistent background workers** — jobs run on-demand via idle tiers or API triggers.
- **Do NOT skip retry handling** — all handlers must allow `markJobFailed()` to manage retries.
- **Do NOT make direct LLM calls without progress tracking** — use `updateJobProgress()` for long operations.
- **Do NOT enqueue duplicate jobs manually** — dedup/debounce is automatic in `queueJob()`.
