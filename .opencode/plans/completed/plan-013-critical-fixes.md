# Plan 013: Critical Runtime Fixes

## Goal
Fix the 3 critical runtime-impacting issues found in the audit: the benchmark page crash (ReferenceError on every render), 2 duplicate dead files, and 1 piece of dead config. Also remove the deprecated `@types/bcryptjs` package.

## Tasks

### Layer 1 (parallel, no deps)

- [ ] **1a: Fix benchmark page crash** (assigned: @builder)
  - In `src/app/(app)/settings/benchmark/page.tsx`:
    - Move `const fetchUserSettings = async () => {...}` and `const fetchHistory = async () => {...}` ABOVE the `useEffect` that calls them (before line 196)
    - OR convert them to `function` declarations (which ARE hoisted)
    - OR wrap them in `useCallback` with appropriate deps
  - Fix the 3 `react-hooks/exhaustive-deps` warnings while at it (add missing `fetchHistory` dep)
  - Verify: `npm run build` compiles clean, no ReferenceError on page load

- [ ] **1b: Delete dead duplicate files** (assigned: @builder)
  - Verify `src/components/chat/ChatWindow.tsx` is NOT imported anywhere (grep first)
  - Verify `src/hooks/useRenderLoop.ts` is NOT imported anywhere (grep first)
  - Delete `ChatWindow.tsx`
  - Delete `useRenderLoop.ts`

- [ ] **1c: Delete tailwind.config.ts** (assigned: @builder)
  - Verify no file imports it (grep across src/ and config files)
  - Confirm Tailwind v4 works via `@theme` in `globals.css`
  - Delete `tailwind.config.ts`

- [ ] **1d: Remove deprecated @types/bcryptjs** (assigned: @builder)
  - Remove `@types/bcryptjs` from `devDependencies` in `package.json`
  - Verify `npm install` works (bcryptjs v3 ships its own types)
  - Run `npx tsc --noEmit` to confirm no type resolution errors

### Layer 2 (depends on Layer 1)
- [ ] **1e: Patch safe dependency bumps** (assigned: @builder, depends on 1d)
  - Bump react@19.2.7, react-dom@19.2.7
  - Bump @types/react@19.2.17, @types/node@25.9.2
  - Bump lucide-react@1.17.0, cytoscape@3.34.0
  - Bump tsx@4.22.4, @next/bundle-analyzer@16.2.7
  - Run `npm install` and verify `npm run build` + `npm test`

## Verification
- [ ] 1a: `powershell -NoProfile -Command "if (cmd /c 'npm run lint 2>&1' | Select-String 'immutability') { exit 1 }"` — should exit 0 (no immutability errors)
- [ ] 1b: `powershell -NoProfile -Command "$a=Test-Path 'src/components/chat/ChatWindow.tsx';$b=Test-Path 'src/hooks/useRenderLoop.ts';if ($a -or $b) { exit 1 }"` — should exit 0 (both files deleted)
- [ ] 1c: `powershell -NoProfile -Command "if (Test-Path 'tailwind.config.ts') { exit 1 }"` — should exit 0 (file deleted)
- [ ] 1d: `powershell -NoProfile -Command "if (Select-String -Path package.json -Pattern '@types/bcryptjs' -SimpleMatch) { exit 1 }"` — should exit 0 (package removed)
- [ ] 1e: `npm test` — should exit 0 (253/253 tests pass)
