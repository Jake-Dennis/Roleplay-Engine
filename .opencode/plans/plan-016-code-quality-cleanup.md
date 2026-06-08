# Plan 016: Code Quality Cleanup

## Goal
Fix all 79 lint errors and 67 warnings: eliminate the 4 production `any` types, fix 5 `set-state-in-effect` violations, convert `require()` to `import`, remove/reintegrate dead code, and exclude archived scripts from ESLint.

## Tasks

### Layer 1 (parallel, no deps)

- [ ] **1a: Fix 4 production `no-explicit-any` usages** (assigned: @builder)
  - `src/lib/wiki/bulk-move.ts:294,304` — replace `any` with proper types (check the function signatures and expected data shapes)
  - `src/lib/wiki/bulk-recategorize.ts:318` — replace `any` with proper type
  - `src/app/api/wiki/merge/route.ts:97` — replace `any` with proper type
  - Verify: `npm run lint` shows fewer `no-explicit-any` errors

- [ ] **1b: Fix 5 `set-state-in-effect` violations** (assigned: @builder)
  For each, either:
  - A. Move setState into a callback (e.g., event handler)
  - B. Replace with `useMemo` for derived state
  - C. Use `useLayoutEffect` if truly needed for layout sync
  - D. Use `useRef` to track if effect is mounted

  Files:
  1. `src/app/(app)/settings/benchmark/page.tsx:253` — `fetchModels()` in effect
  2. `src/app/(app)/settings/server/page.tsx:144` — `setAuthError(false)` in effect
  3. `src/components/settings/server-info-section.tsx:41` — `setOllamaHost()` in effect
  4. `src/components/wiki/markdown-editor.tsx:93` — `setOverlayHtml()` in effect
  5. `src/components/wiki/wiki-quick-switcher.tsx:90` — `setActiveIndex()` in effect

- [ ] **1c: Convert `require()` to `import` in ollama.ts** (assigned: @builder)
  - `src/lib/ollama.ts:302`: `const { TTS_CONFIG } = require("./config");`
  - Change to `import { TTS_CONFIG } from "./config";`
  - Check if this causes circular dependency (the `require` was likely used to avoid one)
  - If circular, restructure the module dependency (e.g., extract TTS_CONFIG into its own module)
  - Verify: `npm run build` compiles clean

- [ ] **1d: Handle 10 dead code files** (assigned: @builder)
  For each file, decide: delete or keep with a `@deprecated` annotation?
  - `src/lib/message-summarizer.ts` (198 lines)
  - `src/lib/api-client.ts` (111 lines)
  - `src/hooks/use-auth.ts` (~80 lines)
  - `src/hooks/use-tts.ts` (~60 lines)
  - `src/hooks/use-local-storage.ts` (~40 lines)
  - `src/hooks/use-voices.ts` (~50 lines)
  - `src/components/session/session-header.tsx` (217 lines)
  - `src/lib/entity-resolution.ts` (~100 lines)
  - `src/lib/wiki/prompt-subtypes.ts` (~150 lines)
  - `src/components/ui/error-boundary.tsx` (~40 lines)

  For each:
  - Grep for imports: if truly zero imports, mark with `@deprecated` comment header
  - If they're useful utilities that should exist, add a TODO to integrate them
  - DO NOT delete files that have test files depending on them

- [ ] **1e: Exclude docs/historical-evidence from ESLint** (assigned: @builder)
  - Read the ESLint flat config (`eslint.config.js` or `eslint.config.mjs`)
  - Add `ignores: ["docs/historical-evidence/"]` to the config
  - OR add `'docs/historical-evidence/**': 'off'` in the rules
  - Verify: `npm run lint` shows ~33 fewer problems

### Layer 2 (depends on Layer 1)

- [ ] **2a: Clean up remaining unused imports** (assigned: @builder, depends on 1e)
  - Target the most frequent patterns:
    - Remove unused `unauthorizedError` imports from 5 route files
    - Remove unused `userId` destructuring from 5 route files
    - Remove unused `TTS_CONFIG` from `src/app/api/tts/stream/route.ts`
    - Remove unused imports from test files (`retrieval`, `UNIVERSES`, `section`, `createIndexMd`, `lines`, `listWikiPages`, `readAndMigrateConfig`, `beforeEach`)
  - Fix 3 `exhaustive-deps` warnings
  - Fix `prefer-const` in `src/app/api/benchmark/roleplay/route.ts:83`

## Verification
- [ ] 1a: 4 `any` types replaced — `npm run lint` errors reduced by 4
- [ ] 1b: 5 `set-state-in-effect` fixes applied — affected components still render correctly
- [ ] 1c: `require()` removed from ollama.ts — `npm run build` passes
- [ ] 1d: 10 dead code files handled (deleted or @deprecated) — no broken imports
- [ ] 1e: docs/historical-evidence excluded — `npm run lint` shows ~33 fewer problems
- [ ] 2a: Unused import cleanup — `npm run lint` shows < 50 problems
- [ ] Full: `npm test` passes (253/253), `npm run build` compiles clean
