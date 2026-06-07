# Plan 011: Remove Legacy Benchmark System

## Goal
Remove the old/legacy benchmark system (separate DB table, component, API route, and script) that has been superseded by the new benchmark on `/settings/benchmark`. The old system had its own `benchmark_results` table, spawned child processes, and a 518-line component on the server settings page.

## Tasks

### Layer 1 (parallel, no deps)
- [ ] task A: Replace `ContextBenchmarkSection` on server settings page with a link to `/settings/benchmark` (assigned: @builder)
- [ ] task B: Delete old component `src/components/settings/context-benchmark.tsx` (assigned: @builder)
- [ ] task C: Delete old API route `src/app/api/settings/benchmark/route.ts` (assigned: @builder)
- [ ] task D: Delete old script `scripts/benchmark-context.mjs` (assigned: @builder)
- [ ] task E: Remove `benchmark_results` table creation from `src/lib/server-config.ts` (assigned: @builder)

### Layer 2 (depends on Layer 1)
- [ ] task F: Verify cleanup — grep for leftover references to old benchmark (assigned: @reviewer)

### Layer 3 (depends on Layer 2)
- [ ] task G: Build & test to confirm nothing broken (assigned: @tester)

## Verification
- [ ] Old component deleted: `powershell -Command "if (Test-Path 'src/components/settings/context-benchmark.tsx') { exit 1 }"`
- [ ] Old API route deleted: `powershell -Command "if (Test-Path 'src/app/api/settings/benchmark/route.ts') { exit 1 }"`
- [ ] Old script deleted: `powershell -Command "if (Test-Path 'scripts/benchmark-context.mjs') { exit 1 }"`
- [ ] No benchmark_results refs in server-config: `powershell -Command "Select-String 'src/lib/server-config.ts' -Pattern 'benchmark_results' | Where-Object { $_.Line -notmatch 'removed' } | ForEach-Object { exit 1 }"`
- [ ] Build passes: `npm run build`
- [ ] Tests pass: `bun test src/lib/benchmark`
