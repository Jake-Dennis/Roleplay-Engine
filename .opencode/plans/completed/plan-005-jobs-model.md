# Plan 005: Jobs Model — separate LLM for background jobs

## Goal
Add a setting that lets the user route background jobs (summarization, NPC
evolution, wiki enrichment, etc.) to a *different* (typically smaller/cheaper)
model than the one used for chat. The new model picks up per-model settings
from `model_defaults[jobModel]` automatically because that map is keyed by
model name. Single toggle, single model slot — no per-job-type config.

## User Story
> "I want to use `qwen3:32b` for chat (smart, slow) but `llama3.2:3b` for jobs
> (fast, cheap, good-enough for extraction/summarization)."

## Data Model
Add two columns to `server_config` (additive — existing rows read `null`/0):

| Column | Type | Default | Meaning |
|--------|------|---------|---------|
| `ollama_job_model` | TEXT | `NULL` | Model name to use for jobs. `NULL` = use chat model. |
| `ollama_use_jobs_model` | INTEGER | 0 | Master toggle. `0` = ignore `ollama_job_model`, use chat model. |

`ollama.useJobsModel: boolean` and `ollama.jobModel: string \| null` are
exposed on `ResolvedServerConfig.ollama` (matching the existing
`useCustomSampling` pattern).

## Resolver Chain
New helper in `src/lib/ollama.ts`:

```typescript
export function getActiveJobModel(userId: string): string {
  const cfg = getServerConfig();
  if (cfg.ollama.useJobsModel && cfg.ollama.jobModel) {
    return cfg.ollama.jobModel;
  }
  return getUserModels(userId).llmModel; // chat model
}
```

`generateText(prompt, { userId, model })` already accepts an explicit `model`
parameter and prefers it over `getUserModels(userId).llmModel`. So job
handlers just need to add `model: getActiveJobModel(userId)` to their
options.

`resolveModelOptions` and `resolveNumCtx` are UNCHANGED — they already take
a `model` parameter and look up per-model settings from `model_defaults[model]`.
The cascade is:

```
generateText is called with model = getActiveJobModel(userId)
  → resolveModelOptions(model, explicit)
    → cfg.ollama.useCustomSampling ? modelDefaults[model] : undefined
  → resolveNumCtx(model, explicit)
    → modelDefaults[model]?.numCtx ?? undefined
```

So if the user has tuned `model_defaults["llama3.2:3b"]`, those settings
apply automatically when jobs use that model.

## Tasks

### Layer 1 (parallel, no deps)
- [ ] 1.1 Schema: add `ollama_job_model` + `ollama_use_jobs_model` to
      `server-config.ts` — column, `emptyRow()`, `ServerConfigUpdate`,
      resolved `ollama` block, and the inline migration in
      `getServerConfig()`/`updateServerConfig()`. (assigned: @builder)
- [ ] 1.2 Helper: add `getActiveJobModel(userId)` to `src/lib/ollama.ts`,
      exported. (assigned: @builder)
- [ ] 1.3 API: extend `src/app/api/settings/route.ts` GET to return
      `useJobsModel` and `jobModel`; PUT to accept them (both camelCase and
      snake_case). (assigned: @builder)

### Layer 2 (depends on Layer 1 — needs getActiveJobModel)
- [ ] 2.1 Add `model: getActiveJobModel(userId)` to the 14
      `generateText({...})` call sites in `src/lib/jobs/` and
      `src/lib/summarization.ts`:
      - `summarization-handler.ts` (3 calls) — already has `userId`
      - `summarization.ts` (`processSummarization(sessionId)`) — needs
        `userId` looked up from `sessions` table first
      - `thread-analysis-handler.ts`
      - `lore-extraction.ts`
      - `wiki-handler.ts` (5 calls)
      - `npc-evolution.ts`
      - `session-recap.ts`
      - `archival-handler.ts`
      - `relationship-summary-handler.ts`
      (assigned: @builder)
- [ ] 2.2 Unit test for `getActiveJobModel` — covers 3 cases:
      toggle off (returns chat model), toggle on + model set (returns job
      model), toggle on + model null (returns chat model).
      (assigned: @tester)

### Layer 3 (depends on Layer 1 — needs API contract)
- [ ] 3.1 UI: extend `OllamaSettingsSection` props + JSX — add a "Use
      separate model for jobs" checkbox and a "Jobs model" `<select>`
      (visible only when toggle is on, uses `localModels` list, includes
      "not local" warning). Reuses existing model dropdown styling.
      (assigned: @builder)
- [ ] 3.2 Page state: extend `src/app/(app)/settings/server/page.tsx` —
      add `useJobsModel` and `jobModel` state, populate from GET, save via
      the existing `handleSaveModelSettings`-style path (extend or add
      parallel `handleSaveJobsModel`). Show inline success/error feedback
      consistent with the rest of the page.
      (assigned: @builder)

### Layer 4 (verification, depends on all above)
- [ ] 4.1 Build passes, 14/14 benchmark tests pass, new
      `getActiveJobModel` test passes.
      (assigned: @reviewer)

## Verification
- [ ] Schema diff includes the new columns. `python -c "import subprocess; r=subprocess.run(['git','diff','src/lib/server-config.ts'],capture_output=True,text=True); print(r.stdout.count('ollama_job_model') + r.stdout.count('ollama_use_jobs_model'))"`
- [ ] Helper exported from ollama.ts. `python -c "import subprocess; r=subprocess.run(['git','grep','-c','export function getActiveJobModel','src/lib/ollama.ts'],capture_output=True,text=True); print(r.stdout.strip())"`
- [ ] API accepts and returns the new fields. `python -c "import subprocess; r=subprocess.run(['git','grep','-c','ollama_use_jobs_model','src/app/api/settings/route.ts'],capture_output=True,text=True); print(r.stdout.strip())"`
- [ ] API accepts and returns the new fields (camelCase). `python -c "import subprocess; r=subprocess.run(['git','grep','-c','useJobsModel','src/app/api/settings/route.ts'],capture_output=True,text=True); print(r.stdout.strip())"`
- [ ] All background-path call sites route through getActiveJobModel. `python "C:\Users\JakeP\AppData\Local\Temp\opencode\verify-jobs-model.py"`
- [ ] Test file exists. `python -c "import os; assert os.path.isfile('src/lib/__tests__/get-active-job-model.test.ts'); print('OK')"`
- [ ] Test passes. `bun test src/lib/__tests__/get-active-job-model.test.ts`
- [ ] All tests pass. `bun test src/lib`
- [ ] Build passes. `npm run build`

## Anti-Patterns (do NOT do)
- **Do NOT** add a per-job-type model table. Single model slot for all jobs.
- **Do NOT** change `resolveModelOptions`/`resolveNumCtx` signatures. The
  per-model settings cascade is already model-keyed; we just route the
  right model in.
- **Do NOT** change `generateText` to know about jobs. The handler resolves
  the model and passes it explicitly — `generateText` is provider-agnostic.
- **Do NOT** add migration steps that `DROP COLUMN`. Additive only — old
  rows just see `null`/0.
- **Do NOT** store the job model in `users.settings`. It's a server-wide
  admin choice, not per-user.
- **Do NOT** add a "per-handler override" UI. If we ever need that, ship
  it as a separate feature.

## Out of Scope (defer)
- Per-job-type model selection (npc-evolution wants a bigger model, etc.)
  — add only if users ask.
- Auto-detection of "smallest good-enough model" — explicit user choice only.
- Switching the embedding model separately — embeddings are a separate
  concern and currently always use `getUserModels().embeddingModel`.
- Migration of any existing user data — there is none, this is purely
  additive.
