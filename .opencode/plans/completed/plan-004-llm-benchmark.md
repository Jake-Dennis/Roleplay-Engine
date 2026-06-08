# Plan 004: LLM Hardware Benchmark & Auto-Tune

## Goal
Add a benchmark system that detects hardware, measures context window limits, token throughput, and roleplay memory retention — then auto-configures optimal numCtx.

## Current Status (as of 2026-06-06)

**~85% Complete** — Core infrastructure, API, UI, CLI, and docs are done. Missing: actual memory retention test implementations + unit tests.

## Tasks

### Layer 1 (parallel, no deps) — ✅ COMPLETE
- [x] T1: Hardware detection module (`src/lib/benchmark/system-info.ts`) — nvidia-smi, os.cpus, os.totalmem
- [x] T2: Ollama model metadata reader (`src/lib/ollama-meta.ts`) — /api/show for num_ctx, parameter size, quantization
- [x] T3: Benchmark types & interfaces (`src/lib/benchmark/types.ts`) — result shapes, test configs

### Layer 2 (depends on Layer 1) — ⚠️ MOSTLY COMPLETE
- [x] T4: Context window binary search (`src/lib/benchmark/context-test.ts`) — finds max num_ctx before OOM
- [x] T5: Token throughput measurement (`src/lib/benchmark/throughput-test.ts`) — tokens/sec at various contexts
- [ ] T6: Memory retention tests — **NEEDS IMPLEMENTATION**
  - [ ] Create `src/lib/benchmark/memory-test.ts` with real implementations:
    - Needle-in-haystack test (inject fact, retrieve at 25%/50%/75% depth)
    - Multi-turn consistency test (entity/fact consistency over N turns)
    - Summarization fidelity test (key fact preservation at compression)
  - [ ] Replace placeholder in `orchestrator.ts:runMemoryRetentionTests()` with real calls

### Layer 3 (depends on Layer 2) — ✅ COMPLETE
- [x] T7: Benchmark orchestrator (`src/lib/benchmark/orchestrator.ts`) — runs all tests, produces JSON report
- [x] T8: Auto-tune logic (`src/lib/benchmark/auto-tune.ts`) — suggests numCtx from VRAM + test results

### Layer 4 (depends on Layer 3) — ✅ COMPLETE
- [x] T9: API routes
  - `POST /api/benchmark` — start job, returns jobId
  - `GET /api/benchmark` — list user's jobs
  - `GET /api/benchmark/[jobId]` — get job status/result
  - `DELETE /api/benchmark/[jobId]` — delete job
- [x] T10: CLI script (`scripts/benchmark-llm.ts`) — headless runner with --detect-only, --meta-only, --json, --save

### Layer 5 (depends on Layer 4) — ✅ COMPLETE
- [x] T11: Settings UI page (`src/app/(app)/settings/benchmark/page.tsx`) — run/view results, apply auto-tune
- [x] T12: Settings integration — OllamaSettingsSection has "Benchmark" button, score badge, auto-tune suggestion

### Layer 6 (depends on Layer 5) — ❌ INCOMPLETE
- [ ] T13: Tests (`src/lib/benchmark/__tests__/*.ts`) — **EMPTY DIRECTORY**
  - [ ] `system-info.test.ts` — hardware detection, fallback logic
  - [ ] `context-test.test.ts` — binary search logic, OOM detection, early stop
  - [ ] `throughput-test.test.ts` — token estimation, warm-up, size filtering
  - [ ] `auto-tune.test.ts` — VRAM estimation, quantization mapping, recommendation logic
  - [ ] `orchestrator.test.ts` — progress callbacks, abort handling, score calculation
  - [ ] `memory-test.test.ts` — needle retrieval, multi-turn, summarization fidelity
- [x] T14: Documentation (`docs/llm-benchmark.md`) — usage, interpreting results, manual override

## Verification Commands

```bash
# T1: Hardware detection
npx ts-node scripts/benchmark-llm.ts --detect-only

# T2: Model metadata
npx ts-node scripts/benchmark-llm.ts --model qwen3.5:4b --meta-only

# T4: Context test (quick mode)
npx ts-node scripts/benchmark-llm.ts --model qwen3.5:4b --quick

# T5: Throughput verification (part of above)

# T6: Memory tests - run full benchmark and check scores
npx ts-node scripts/benchmark-llm.ts --model qwen3.5:4b --quick

# T7: Orchestrator produces valid JSON
npx ts-node scripts/benchmark-llm.ts --model qwen3.5:4b --quick --json

# T8: Auto-tune suggests numCtx ≤ 80% VRAM limit, ≥ model default
# (check output of above for "Recommended numCtx")

# T9: API test
# POST /api/benchmark with {model: "qwen3.5:4b", quickMode: true} → returns jobId
# GET /api/benchmark/[jobId] → returns progress/report

# T10: CLI exits 0 on success
npx ts-node scripts/benchmark-llm.ts --model qwen3.5:4b --quick && echo "exit: $?"

# T11: Settings page loads at /settings/benchmark

# T13: Unit tests
npm test -- src/lib/benchmark/__tests__  # (when tests exist)
```

## Acceptance Criteria

| Task | Criteria |
|------|----------|
| T6 Memory Tests | Needle retrieval > 0.8 at 50% depth; Multi-turn consistency > 0.7; Summarization fidelity > 0.8 |
| T13 Unit Tests | ≥ 80% line coverage on benchmark lib; all tests pass |
| T9 API | POST returns 202 + jobId; GET returns progress 0→100; report includes all sections |
| T11 UI | Page loads, shows progress timeline, displays results with apply button |

## Implementation Notes

### Memory Test Implementation Approach

**Needle-in-Haystack:**
1. Generate context of size N with "needle" fact injected at depth D%
2. Prompt model to find the needle
3. Score by semantic similarity of retrieved answer to expected fact

**Multi-Turn Consistency:**
1. Establish entities/facts in first turn
2. Continue conversation for N turns
3. Query model about initial entities
4. Score by entity consistency + factual drift

**Summarization Fidelity:**
1. Generate text of ~N tokens with key facts
2. Ask model to summarize to ~N/10 tokens
3. Check key facts preserved in summary

### Test Framework
- Use Vitest (already in project) or Jest
- Mock `generateText`/`generateTextStream` from `ollama.ts` for deterministic tests
- Test binary search logic with mock OOM/success responses
- Test auto-tune with known hardware + model configs

## Dependencies

```
Layer 1 (types, system-info, ollama-meta)
    ↓
Layer 2 (context-test, throughput-test, memory-test) ← memory-test.ts NEEDS CREATION
    ↓
Layer 3 (orchestrator, auto-tune) ← orchestrator needs memory-test import
    ↓
Layer 4 (API routes, CLI)
    ↓
Layer 5 (UI page, settings integration)
    ↓
Layer 6 (tests, docs)
```

## Next Steps (Priority Order)

1. **Create `src/lib/benchmark/memory-test.ts`** with real implementations
2. **Update `orchestrator.ts`** to import and use `memory-test.ts`
3. **Write unit tests** in `src/lib/benchmark/__tests__/`
4. **Run verification commands** to confirm everything works
5. **Archive plan** to `.opencode/plans/completed/`