# ESLint 10 Migration Plan

## Current Version
**9.39.4** (installed in node_modules via `^9` in package.json)

## Target Version
**10.0.x** (latest stable: 10.4.0, released May 15, 2026)

## Summary

ESLint v10.0.0 was released on February 6, 2026. It is a major release that finalizes the flat config migration, removes the legacy eslintrc config system, drops support for older Node.js versions, and introduces several API breaking changes for plugin/integration developers. ESLint v9.x reaches end-of-life on **2026-08-06**.

## Dependency Versions

| Package | Current Version | Notes |
|---------|---------------|-------|
| `eslint` | 9.39.4 | Core — `^9` in package.json |
| `eslint-config-next` | 16.2.6 | Next.js ESLint config |
| `typescript-eslint` | 8.59.3 | Consolidated package (replaces @typescript-eslint/*) |
| `@typescript-eslint/eslint-plugin` | 8.59.3 | Part of typescript-eslint v8 |
| `@typescript-eslint/parser` | 8.59.3 | Part of typescript-eslint v8 |
| `eslint-plugin-import` | 2.32.0 | Used transitively? |
| `eslint-plugin-jsx-a11y` | 6.10.2 | Used transitively by eslint-config-next |
| `eslint-plugin-react` | 7.37.5 | Used transitively by eslint-config-next |
| `eslint-plugin-react-hooks` | 7.1.1 | Used transitively by eslint-config-next |

## Current ESLint Configuration

The project already uses **flat config** (`eslint.config.mjs`), which is the required format for ESLint 10. The config imports:
- `defineConfig` and `globalIgnores` from `eslint/config`
- `nextVitals` from `eslint-config-next/core-web-vitals`
- `nextTs` from `eslint-config-next/typescript`

No `.eslintrc.*` files exist — the project is already on the flat config format.

## Breaking Changes

### 1. Node.js Version Requirement Bumped

**Change:** Node.js `^20.19.0 || ^22.13.0 || >=24` required. Versions < v20.19, v21.x, and v23.x are dropped.

**Impact:** **Check current Node.js version.** If running Node.js < 20.19.0 or 21.x/23.x, must upgrade. Most modern systems are on 22+ or 24+.

**Fix:** `node --version` to verify. Upgrade Node.js if needed.

### 2. Legacy eslintrc Config System Removed

**Change:** The `.eslintrc.*` config format is completely removed. `FlatESLint`, `LegacyESLint`, `FileEnumerator` are gone. `Linter` methods `defineParser()`, `defineRule()`, `defineRules()`, `getRules()` removed. `shouldUseFlatConfig()` always returns `true`.

**Impact:** **No impact** — project already uses `eslint.config.mjs` (flat config). No `.eslintrc` files exist.

### 3. New Configuration File Lookup Algorithm

**Change:** ESLint now locates `eslint.config.*` by starting from the directory of each linted file (not the current working directory). The `v10_config_lookup_from_file` flag has been removed. In monorepo setups, this is more intuitive.

**Impact:** **Low impact.** The project is a single Next.js app (not a monorepo), so lookup from linted file vs. CWD should produce identical results. The `v10_config_lookup_from_file` flag is not used. If linting scripts reference files outside the project root, verify the config is still found.

### 4. JSX Reference Tracking Now Enabled

**Change:** ESLint v10 tracks JSX references in scope analysis. Previously, JSX identifiers were not recognized as variable references, causing false positives with `no-unused-vars`.

**Impact:** **Positive** — this eliminates the need for workarounds like `eslint-plugin-react`'s `jsx-uses-vars` rule. May reduce false positives in existing lint results. Verify no new false negatives appear.

### 5. `eslint:recommended` Updated

**Change:** Three new rules enabled in `eslint:recommended`:
- `no-unassigned-vars` — disallow variables never assigned
- `no-useless-assignment` — disallow assignments with no effect
- `preserve-caught-error` — require catch parameters to be used

**Impact:** **Low impact.** May surface new lint warnings. Inspect and fix as needed.

### 6. `eslint-env` Comments Now Error

**Change:** `/* eslint-env */` comments (from the legacy config system) now cause lint errors.

**Impact:** **No impact** — search codebase for `eslint-env` comments (unlikely to exist).

### 7. Jiti < 2.2.0 No Longer Supported

**Change:** ESLint v10 drops support for jiti versions prior to 2.2.0.

**Impact:** **No impact** — the project uses flat config (`.mjs`), not TypeScript config files, so jiti is not involved.

### 8. Deprecated Rule Context Members Removed

**Change:** The following `context` members are removed:
- `context.getCwd()` → use `context.cwd`
- `context.getFilename()` → use `context.filename`
- `context.getPhysicalFilename()` → use `context.physicalFilename`
- `context.getSourceCode()` → use `context.sourceCode`
- `context.parserOptions` → use `context.languageOptions`
- `context.parserPath` — no replacement

**Impact:** **No impact** — no custom ESLint rules in this project.

### 9. Deprecated SourceCode Methods Removed

**Change:** Removed methods: `getTokenOrCommentBefore()`, `getTokenOrCommentAfter()`, `isSpaceBetweenTokens()`, `getJSDocComment()`.

**Impact:** **No impact** — no custom ESLint rules in this project.

### 10. `LintMessage#nodeType` Property Removed

**Change:** The `nodeType` property on `LintMessage` objects is removed.

**Impact:** **No impact** — not used in custom integrations (no custom formatters, no programmatic API usage beyond basic lint script).

### 11. `--color`/`--no-color` CLI Flag Precedence

**Change:** CLI flags now take higher precedence than environment variables for colorized output.

**Impact:** **Low.** The project runs `eslint` via `npm run lint`. Verify output is as expected if piping or redirecting.

### 12. `no-shadow-restricted-names` Now Reports `globalThis`

**Change:** The rule now treats `globalThis` as a restricted name by default.

**Impact:** **Low.** Check if any code shadows `globalThis`. If so, rename the variable.

### 13. RuleTester API Changes

**Change:** Stricter validation — valid test cases cannot have `errors` or `output` properties. Fixer methods require string `text`. `Program` node range now covers entire source.

**Impact:** **No impact** — no custom ESLint rules or tests in this project.

### 14. Fixer Methods Require String `text` Arguments

**Change:** All rule fixer methods that accept a `text` argument now require it to be a string.

**Impact:** **No impact** — no custom rules.

## Migration Steps

### Phase 1: Pre-Upgrade Checks

1. **Verify Node.js version:**
   ```bash
   node --version
   ```
   Must be `^20.19.0 || ^22.13.0 || >=24`.

2. **Verify flat config is ready:**
   - Confirm `eslint.config.mjs` is the only ESLint config file
   - Confirm no `.eslintrc*` files exist (already verified — none present)
   - Confirm no `ESLINT_USE_FLAT_CONFIG` in environment/scripts

3. **Audit current lint output:**
   ```bash
   npm run lint 2>&1 | tee pre-upgrade-lint.log
   ```
   Save baseline for comparison.

### Phase 2: Upgrade Dependencies

1. **Update `eslint` in `package.json`:**
   ```json
   "eslint": "^10"
   ```

2. **Update peer configs:**
   - `eslint-config-next`: Check if v16.2.6+ supports ESLint 10. As of April 2026, there was an open compatibility issue (vercel/next.js#91702). If still unresolved, install with `--legacy-peer-deps`.
   - `@eslint/js`: Verify version compatibility (ESLint 10 ships with `@eslint/js` v10).

3. **Update `typescript-eslint` (if bundled):**
   - `typescript-eslint` v8.59.3 should be ESLint 10 compatible (v8 supports flat config).
   - Verify via: `npx eslint --version` and check plugin loading.

4. **Run install:**
   ```bash
   npm install
   ```

### Phase 3: Config Adjustments

1. **Update `eslint.config.mjs` if needed:**
   - Check that `defineConfig` from `eslint/config` works with ESLint 10.
   - Verify `globalIgnores` function signature hasn't changed.

2. **Review `eslint:recommended` additions:**
   - If the Next.js configs use `eslint:recommended`, the three new rules will be active.
   - Decide whether to disable any: add to the `rules` section if needed.

3. **Simplify config** (optional):
   - Remove any `jsx-uses-vars` workarounds — JSX references are now tracked natively.
   - Remove any deprecated rule option workarounds (e.g., `radix` rule string options `"always"`/`"as-needed"`).

### Phase 4: Run & Verify

1. **Run ESLint:**
   ```bash
   npm run lint 2>&1 | tee post-upgrade-lint.log
   ```

2. **Compare with baseline:**
   - New `eslint:recommended` rules may add warnings
   - JSX tracking may fix false positives (check for previously disabled `no-unused-vars` for JSX-only imports)
   - Verify no new errors from removed APIs or changed defaults

3. **Fix any new issues:**
   - Address new `eslint:recommended` rule violations
   - Address any `no-shadow-restricted-names` for `globalThis`
   - Remove any `eslint-env` comments if found

4. **Run full build:**
   ```bash
   npm run build
   ```

### Phase 5: Integration Checks

1. Run `npm run dev` and verify the dev server starts without ESLint errors.
2. If using VS Code ESLint extension, reload the window to pick up the new version.

## Dependencies to Update

| Package | Current | Target | Notes |
|---------|---------|--------|-------|
| `eslint` | `^9` | `^10` | Core upgrade |
| `eslint-config-next` | `^16.2.6` | keep | **Blocker** — verify ESLint 10 compat |
| `typescript-eslint` (transitive) | 8.59.3 | keep | v8 supports ESLint 10 flat config |
| `@eslint/js` (transitive) | bundled with eslint | verify | ESLint 10 ships @eslint/js v10 |

## Known Blocker

### `eslint-config-next` ESLint 10 Compatibility

As of June 2026, **`eslint-config-next` v16.2.6 may not declare ESLint 10 as a peer dependency**, causing npm install conflicts.

**Status:** An open GitHub issue exists (vercel/next.js#91702) tracking this.

**Workarounds:**
1. **`--legacy-peer-deps`**: Install with `npm install --legacy-peer-deps` to bypass peer dependency conflicts.
2. **Override peer deps**: Add an `overrides` or `pnpm.overrides` entry in `package.json`.
3. **Stay on ESLint 9**: ESLint 9 is LTS-supported until August 2026. Wait for `eslint-config-next` to declare ESLint 10 support.
4. **Use `@eslint/compat`**: If eslint-config-next doesn't load correctly, the `@eslint/compat` package provides `fixupConfigRules()` to bridge legacy configs.

**Recommended approach:** Install with `--legacy-peer-deps` and verify lint works. If it doesn't, stay on ESLint 9 until eslint-config-next catches up.

## Rollback Plan

If the upgrade fails:
1. Revert `eslint` to `^9` in `package.json`
2. Revert any config changes
3. Run `npm install`
4. Verify lint passes
5. ESLint 9 is supported until **2026-08-06**, providing a comfortable window

## Additional Notes

- The project's `eslint.config.mjs` already uses modern flat config APIs (`defineConfig` from `eslint/config`, `globalIgnores`). This is the recommended ESLint 10 pattern.
- No `.eslintrc` migration is needed — this was the hardest part of ESLint 10 for most projects, and this project already completed it.
- The primary risk is `eslint-config-next` peer dependency compatibility, not the config format or API changes.
