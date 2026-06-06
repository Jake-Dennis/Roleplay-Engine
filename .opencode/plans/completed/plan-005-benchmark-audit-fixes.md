# Plan 005: Benchmark Audit Fixes

## Goal
Fix all 14 bugs found in the full benchmark audit. The core issue is that `generateText()`/`generateTextStream()`/`generateEmbedding()` in `ollama.ts` have no `ollamaHost` option, so the benchmark's configured Ollama URL is silently ignored — generation calls hit the wrong host. Fix the URL chain, hardware detection, auto-tune data, UI type mismatches, and display bugs.

## Tasks

### Layer 1 (parallel, no deps)

- [ ] **1a: Add `ollamaHost` to `generateText` options** (assigned: @architect)
  - Add `ollamaHost?: string` to the options parameter type in `ollama.ts`
  - Use it: `const baseUrl = options?.ollamaHost || (options?.userId ? getUserOllamaUrl(options.userId) : OLLAMA_CONFIG.baseUrl)`
  - This ensures `ollamaHost` takes priority over both user settings and env defaults

- [ ] **1b: Add `ollamaHost` to `generateTextStream` options** (assigned: @architect)
  - Same pattern as 1a but for the streaming variant
  - Add `ollamaHost?: string` to options type
  - Update `baseUrl` resolution to use it first

- [ ] **1c: Add `ollamaHost` to `generateEmbedding` options** (assigned: @architect)
  - Same pattern for embedding variant
  - Update `baseUrl` resolution

- [ ] **1d: Pass `ollamaHost` in benchmark's `attemptGeneration`** (assigned: @builder)
  - `context-test.ts:73` — pass `ollamaHost` from the function parameter to `generateText` options
  - `context-test.ts:222` — same for retry call
  - `context-test.ts:298` — same for verification pass

- [ ] **1e: Pass `ollamaHost` and `embeddingModel` in throughput tests** (assigned: @builder)
  - `throughput-test.ts` — pass `ollamaHost` to `generateTextStream` calls in `runGenerationTest` and `warmUpModel`
  - Pass `ollamaHost` to `generateEmbedding` calls in `runEmbeddingTest`
  - Use `config` parameter to get `ollamaHost` instead of `OLLAMA_CONFIG`

- [ ] **1f: Pass `ollamaHost` in memory tests** (assigned: @builder)
  - `memory-test.ts:62` — pass ollamaHost to `generateText` calls
  - `memory-test.ts:133` — same for multi-turn
  - `memory-test.ts:142` — same for consistency query
  - `memory-test.ts:196` — same for summarization

- [ ] **1g: Fix UI type mismatches** (assigned: @builder)
  - `page.tsx:127` — change `status: "pending" | ...` to `status: "queued" | "running" | "completed" | "failed"`
  - `page.tsx:103` — remove `timeoutMs: number` from config type
  - `page.tsx:109` — change `hardware: HardwareInfo` to `hardware?: HardwareInfo`
  - `page.tsx:122` — add `warnings: string[]` if missing

- [ ] **1h: Fix quick mode and test descriptions** (assigned: @builder)
  - `page.tsx:494` — update quick mode description to match actual sizes
  - `page.tsx:495` — update full mode description to match actual sizes

### Layer 2 (depends on Layer 1)

- [ ] **2a: Re-enable hardware detection for auto-tune** (assigned: @builder, depends on 1a)
  - `orchestrator.ts` — call `getSystemInfo()` instead of hardcoding `minimalHardware`
  - Pass real hardware to `generateAutoTuneRecommendation`
  - Include hardware in the `BenchmarkReport`

- [ ] **2b: Fix throughput test to use benchmark config's embedding model** (assigned: @builder, depends on 1e)
  - `throughput-test.ts` — pass `embeddingModel` as a parameter instead of reading from `OLLAMA_CONFIG`
  - Update `runThroughputTests` signature to accept `embeddingModel`
  - Update orchestrator to pass it

- [ ] **2c: Fix TestHistoryLog context sizes** (assigned: @builder, depends on 1g)
  - `page.tsx:667` — compute context sizes dynamically based on `quickMode` and `totalTests` instead of hardcoding
  - Or derive from the actual test results when available
  - Same for `page.tsx:679` throughput sizes

### Layer 3 (depends on Layer 2)

- [ ] **3a: Verify and run tests** (assigned: @tester, depends on 2a, 2b, 2c)
  - Run `bun test src/lib/benchmark/__tests__/`
  - Verify all 46+ tests pass
  - Update tests if function signatures changed

- [ ] **3b: Build check** (assigned: @reviewer, depends on 3a)
  - Run `npm run build` and verify no errors
  - Fix any type errors

## Verification
- [ ] `bun test src/lib/benchmark/__tests__/` — all 46+ tests pass
- [ ] `npm run build` — no errors
- [ ] `python scripts/verify-plan.py .opencode/plans/plan-005-benchmark-audit-fixes.md` — exit 0
- [ ] Confirm `generateText` accepts `ollamaHost` option and prefers it over defaults
- [ ] Confirm benchmark context-test passes `ollamaHost` to `generateText`
- [ ] Confirm benchmark throughput-test passes `ollamaHost` to `generateTextStream` and `generateEmbedding`
- [ ] Confirm benchmark memory-test passes `ollamaHost` to `generateText`
- [ ] Confirm hardware detection is re-enabled and real data flows to auto-tune
- [ ] Confirm throughput test uses benchmark config's embedding model, not `OLLAMA_CONFIG.embeddingModel`
- [ ] Confirm UI type for `status` includes `"queued"` instead of `"pending"`
- [ ] Confirm UI description for quick/full mode matches actual test sizes
