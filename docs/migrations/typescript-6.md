# TypeScript 6 Migration Plan

## Current Version
**5.9.3** (installed in node_modules via `^5` in package.json)

## Target Version
**6.0.x** (latest stable: 6.0.0, released March 23, 2026)

## Summary

TypeScript 6.0 is the last version built on the JavaScript codebase before the Go-powered TypeScript 7.0 takes over. It serves as a bridge release — changing nine compiler option defaults at once and deprecating legacy options. All deprecated options can be temporarily ignored with `"ignoreDeprecations": "6.0"` in tsconfig, but they will be **removed entirely in TypeScript 7.0**.

## Breaking Changes & Deprecations

### 1. Default Values Changed (9 options)

| Option | TS 5.x Default | TS 6.0 Default | Impact on This Project |
|--------|---------------|----------------|----------------------|
| `strict` | `false` | `true` | **No impact** — already set to `true` |
| `module` | `commonjs` | `esnext` | **No impact** — already set to `"esnext"` |
| `target` | `es3` | `es2025` | **Minor** — currently `ES2017`. Will not break, but may produce newer syntax |
| `moduleResolution` | `node10` | `bundler` | **No impact** — already set to `"bundler"` |
| `esModuleInterop` | `false` | `true` | **No impact** — already `true` (implied by esModuleInterop not explicitly set, but default interop behavior is already used) |
| `rootDir` | Inferred | `.` (tsconfig directory) | **No impact** — `noEmit: true`, so output path doesn't matter |
| `types` | All `@types/*` | `[]` (empty array) | **HIGH IMPACT** — must explicitly add `"types": ["node"]` (needed for globals from `@types/node` and `@types/bun`) |
| `noUncheckedSideEffectImports` | `false` | `true` | **Potential** — side-effect imports (`import './polyfill'`) may produce errors |
| `libReplacement` | `true` | `false` | **No impact** — not using custom lib files |

### 2. `rootDir` Now Defaults to `.`

Previously TypeScript inferred the common source directory. In TS 6.0, it defaults to the tsconfig directory.

**Impact on this project:** None. We use `noEmit: true`, so output paths are irrelevant.

### 3. `types` Now Defaults to `[]`

**This is the highest-impact change for this project.**

Currently the tsconfig has no `types` array, which means in TS 5.x all `@types/*` packages were auto-included. In TS 6.0, nothing is auto-included.

**What will break:**
- Global Node.js types (`process`, `Buffer`, `__dirname`, etc.) from `@types/node`
- Global Bun types from `@types/bun`
- Global Jest globals (`describe`, `it`, `expect`) from `@types/bun` (Bun includes Jest-compatible API)
- Global DOM types — these come from `lib: ["dom"]`, not `@types/*`, so they are NOT affected

**Fix:** Add to tsconfig.json:
```json
"types": ["node", "bun"]
```

### 4. `baseUrl` Deprecated

**Impact:** No impact — this project does not use `baseUrl`.

### 5. `moduleResolution: classic` Removed

**Impact:** No impact — we use `"bundler"`.

### 6. `moduleResolution: node` (node10) Deprecated

**Impact:** No impact — we use `"bundler"`.

### 7. AMD, UMD, SystemJS Module Values Deprecated

**Impact:** No impact — we use `"esnext"`.

### 8. `target: es5` Deprecated

**Impact:** No impact — we use `"ES2017"`.

### 9. `--downlevelIteration` Deprecated

**Impact:** No impact — not used.

### 10. `--outFile` Removed

**Impact:** No impact — not used.

### 11. `esModuleInterop: false` and `allowSyntheticDefaultImports: false` No Longer Allowed

**Impact:** No impact — already using default interop behavior.

### 12. `alwaysStrict: false` No Longer Allowed

**Impact:** No impact — never set.

### 13. Legacy `module` Keyword for Namespaces Now Errors

**Impact:** **Potential.** Search the codebase for any `module Foo { ... }` syntax that should use `namespace Foo { ... }` instead. Ambient module declarations (`declare module "..."`) are unaffected.

### 14. `asserts` Keyword on Imports Deprecated

**Impact:** No impact — import assertions not used (we use `with` syntax if any).

### 15. `no-default-lib` Directive Removed

**Impact:** No impact — not used.

### 16. CLI File Arguments with tsconfig.json Now Errors

**Impact:** **Potential.** Check build scripts and package.json scripts for `tsc` invocations with explicit file arguments. The project uses `next build` not `tsc` directly, so likely no impact.

### 17. `dom` lib Now Includes `dom.iterable` and `dom.asynciterable`

**Impact:** No impact — beneficial simplification if we had separate `dom.iterable`. Current config uses `"lib": ["dom", "dom.iterable", "esnext"]` — can simplify to `"lib": ["dom", "esnext"]`.

### 18. New `es2025` Target and Lib Option

**Impact:** Informational. Not required, but we could update `target` from `ES2017` to a newer target if desired.

### 19. `--stableTypeOrdering` Flag Available

**Impact:** Only needed for TS 6.0 → 7.0 migration diagnostics. Not recommended for day-to-day use (up to 25% slowdown).

## Migration Steps

### Phase 1: Preparation (no code changes)

1. Read the official migration guide: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html
2. Install the `ts5to6` codemod tool: `npx @andrewbranch/ts5to6 --help`
3. Run a dry-run build with TS 6.0 to identify errors:
   ```bash
   npm install typescript@beta --save-dev
   npx tsc --noEmit 2> ts6-errors.log
   ```

### Phase 2: tsconfig.json Changes

1. **Add `types` array:**
   ```json
   "types": ["node", "bun"]
   ```
   (Testing may reveal additional entries needed.)

2. **Simplify `lib` array** (optional, quality-of-life):
   ```json
   "lib": ["dom", "esnext"]
   ```
   Removes redundant `dom.iterable` and `dom.asynciterable`.

3. **Add `ignoreDeprecations` temporarily** if needed:
   ```json
   "ignoreDeprecations": "6.0"
   ```
   Remove this once all deprecations are addressed.

### Phase 3: Code Changes

1. Search for legacy `module` keyword used as namespace:
   ```bash
   rg '^(export\s+)?module\s+' --include '*.ts' --include '*.tsx'
   ```
2. Update any `import * as X from "Y"` patterns if `esModuleInterop` changes affect module shapes.
3. Fix any `noUncheckedSideEffectImports` errors by validating side-effect imports.

### Phase 4: Dependency Updates

1. Update `typescript` in `package.json`:
   ```json
   "typescript": "^6.0.0"
   ```
2. Run `npm install` to update.
3. Check for `@types/*` package compatibility (they are versioned independently of TS).

### Phase 5: Build & Test

1. Run `npx tsc --noEmit` to verify zero type errors.
2. Run `npm run build` to verify Next.js build succeeds.
3. Run `npm run lint` to verify linter compatibility.
4. Run `npm run dev` and smoke-test the app.

## Dependencies to Update

| Package | Current | Target | Notes |
|---------|---------|--------|-------|
| `typescript` | `^5` | `^6.0.0` | Core upgrade |
| `@types/node` | `^25.9.2` | keep | Already on latest; verify TS 6 compat |
| `@types/bun` | `^1.3.14` | keep | Verify TS 6 compat |
| `@types/react` | `^19.2.17` | keep | Verify TS 6 compat |
| `@types/react-dom` | `^19` | keep | Verify TS 6 compat |
| `@types/better-sqlite3` | `^7.6.13` | keep | Verify TS 6 compat |
| `@types/cytoscape` | `^3.21.9` | keep | Verify TS 6 compat |
| `@types/jsdom` | `^28.0.3` | keep | Verify TS 6 compat |

## Blocker Assessment

**No known blockers identified.** The project already uses modern tsconfig values (`strict: true`, `moduleResolution: bundler`, `module: esnext`, `noEmit: true`), which means most of the breaking changes have zero impact. The highest-impact change (`types: []`) has a straightforward fix.

## Blockers

- (none identified — all changes are manageable)

## Recommended Tools

- **`npx @andrewbranch/ts5to6 --fixBaseUrl .`** — automatically migrates `baseUrl` to explicit `paths` entries (not needed here but useful as reference)
- **`npx @andrewbranch/ts5to6 --fixRootDir .`** — inserts explicit `rootDir` (not needed here since `noEmit: true`)

## Rollback Plan

If the upgrade causes issues:
1. Revert `typescript` to `^5` in package.json
2. Revert any tsconfig.json changes
3. Run `npm install`
4. Remove `"ignoreDeprecations"` if added
