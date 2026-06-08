# Plan 024: Chat Session Fixes

## Goal
Fix the embedding model mismatch (bge-m3 not pulled), infinite retry in generateEmbedding, missing retry in generateTextStream, and missing pre-flight model check — all of which were blocking chat sessions from working.

## Tasks

### Layer 1 (parallel, no deps)
- [ ] Fix 1: `config.ts` — Change `embeddingModel` default from `bge-m3` to `qwen3-embedding:8b` (actually pulled on Ollama). Add clarifying comments about fallback chain.
- [ ] Fix 2: `ollama.ts` — Add `checkModelAvailable()` function that queries `/api/tags` and checks if a specific model is available. Fast (~3s timeout) pre-flight check.
- [ ] Fix 3: `ollama.ts` — `generateEmbedding()`: Limit infinite retry loop to 5 attempts with exponential backoff. Throw after max retries so callers can fall back gracefully.
- [ ] Fix 4: `ollama.ts` — `generateTextStream()`: Add retry loop (3 attempts with delay) around the fetch + initial response check, matching `generateText()`'s behavior.

### Layer 2 (depends on Layer 1)
- [ ] Fix 5: `retrieval.ts` — Pass `userId` to `generateEmbedding()` call so user's configured embedding model (from settings) is used, not the hardcoded default.
- [ ] Fix 6: `generate/[id]/route.ts` — Add pre-flight model check before retrieval pipeline + remove stale skip-preflight comment + reuse pre-resolved model name in stream callback.

### Layer 3 (depends on Layer 2)
- [ ] Verify: TypeScript compilation clean on changed files. Git diff review.

## Verification
- [ ] Fix 1: `Select-String -Path "src/lib/config.ts" -Pattern "embeddingModel"` shows `qwen3-embedding:8b`
- [ ] Fix 2: `Select-String -Path "src/lib/ollama.ts" -Pattern "export async function checkModelAvailable"` exists
- [ ] Fix 3: `Select-String -Path "src/lib/ollama.ts" -Pattern "maxEmbeddingRetries"` exists
- [ ] Fix 4: `Select-String -Path "src/lib/ollama.ts" -Pattern "for \(let attempt = 1; attempt <= OLLAMA_CONFIG.retryAttempts; attempt"` exists in generateTextStream
- [ ] Fix 5: `Select-String -Path "src/lib/retrieval.ts" -Pattern "generateEmbedding\(query, \{ userId \}\)"` exists
- [ ] Fix 6: `Select-String -Path "src/app/api/generate/[id]/route.ts" -Pattern "checkModelAvailable"` exists
- [ ] TypeScript: `npx tsc --noEmit --pretty 2>&1` shows no new errors from our changed files
