# Dependency Audit Report

**Date:** 2026-06-08
**Project:** Roleplay-Engine v0.1.0
**Node:** v24.14.1
**npm:** 11.11.0

---

## 1. Outdated Packages

**13 packages** are outdated (vs latest tag). Breakdown: 2 major, 3 minor, 7 patch, 1 special case.

| Package | Current | Wanted | Latest | Bump | Type | Notes |
|---|---|---|---|---|---|---|
| typescript | 5.9.3 | 5.9.3 | 6.0.3 | major | devDependencies | TypeScript 6.0 is a major release; breaking changes expected. Do not upgrade blindly — check TS 6 migration guide. |
| eslint | 9.39.4 | 9.39.4 | 10.4.1 | major | devDependencies | ESLint 10 is major. eslint-config-next@16.2.6 requires eslint >=9.0.0 (not 10.x yet). Must upgrade eslint-config-next first. |
| @types/node | 25.8.0 | 25.9.2 | 25.9.2 | minor | devDependencies | Safe minor bump — type additions only. |
| lucide-react | 1.16.0 | 1.17.0 | 1.17.0 | minor | dependencies | New icons, no breaking API changes in minor. |
| cytoscape | 3.33.3 | 3.34.0 | 3.34.0 | minor | dependencies | Minor bump — check cytoscape changelog for deprecations. |
| @next/bundle-analyzer | 16.2.6 | 16.2.7 | 16.2.7 | patch | devDependencies | Safe patch, tied to Next.js version. |
| eslint-config-next | 16.2.6 | 16.2.6 | 16.2.7 | patch | devDependencies | Patch; must upgrade alongside Next.js. |
| next | 16.2.6 | 16.2.6 | 16.2.7 | patch | dependencies | Patch release (likely bugfixes). Safe to update. |
| react | 19.2.6 | 19.2.7 | 19.2.7 | patch | dependencies | Patch; safe. Must match react-dom. |
| react-dom | 19.2.6 | 19.2.7 | 19.2.7 | patch | dependencies | Patch; keep in sync with react. |
| tsx | 4.22.3 | 4.22.4 | 4.22.4 | patch | devDependencies | Patch; safe. |
| @types/react | 19.2.14 | 19.2.17 | 19.2.17 | patch | devDependencies | Patch; safe — type updates. |
| @types/bcryptjs | 3.0.0 | 3.0.0 | 2.4.6 | ⚠ special | devDependencies | **DEPRECATED.** bcryptjs now ships its own types. @types/bcryptjs@3.0.0 is a stub package that simply re-exports cryptjs types. npm's latest tag points to 2.4.6 (for older TS versions), but the package itself marks 3.0.0 as deprecated. **Recommendation:** Remove @types/bcryptjs from devDependencies entirely — bcryptjs v3 ships its own types. |

### Version constraints from package.json

- 
ext is pinned exactly at **16.2.6** (no caret)
- eslint-config-next is pinned exactly at **16.2.6** (no caret)
- All other deps use ^ (compatible semver range)

---

## 2. Security Vulnerabilities

`
npm audit report

postcss  <8.5.10
Severity: moderate
PostCSS has XSS via Unescaped </style> in its CSS Stringify Output
GHSA: https://github.com/advisories/GHSA-qx2v-qp2m-jg93
fix available via 
pm audit fix --force
Will install next@9.3.3, which is a breaking change

2 moderate severity vulnerabilities
`

**Analysis:**

| Aspect | Details |
|---|---|
| Package | postcss (transitive via 
ext) |
| Severity | Moderate |
| Vector | XSS via unescaped </style> in CSS stringify output |
| Fix | 
pm audit fix --force would downgrade Next.js from 16.2.6 → 9.3.3 (unacceptable) |
| Actual fix | Upstream: postcss ≥8.5.10. Next.js must update its bundled postcss. |
| Action | **Wait for Next.js 16.2.8+** to include patched postcss. The current postcss in next's bundle is 8.4.49 (needs 8.5.10). Not directly patchable by the project. |

**Risk assessment:** Low. The XSS vector requires attacker-controlled CSS input in the stringify output. Next.js uses postcss internally for CSS processing; the attack surface through normal app usage is minimal.

---

## 3. Unused Dependencies

### depcheck results

**False positives** (reported as unused but actually used):

| Package | Why depcheck flags it | Actual usage |
|---|---|---|
| sqlite-vec | No direct import/equire in source | Loaded as a **native SQLite extension** via db.loadExtension() in src/lib/db.ts (lines 27-57). Referenced by path to platform-specific .dll/.so/.dylib files. |
| @tailwindcss/postcss | Only referenced in config | Used in postcss.config.ts as plugins["@tailwindcss/postcss"]: {}. Config files are not scanned by depcheck. |
| @types/bun | Never imported in source | Provides global type declarations for Bun test runner (un:test). Referenced by un test command in package.json. Used in 19 test files importing from un:test. |
| cross-env | Never imported in source | Used in npm script "analyze": "cross-env ANALYZE=true npx next build". CLI-only, never imported. |
| 	sx | Never imported in source | Used for running TypeScript scripts: 	sx scripts/init-db.ts, etc. CLI-only. |

**Verdict:** No genuinely unused dependencies. All packages serve a purpose.

### Manual check: cytoscape

✅ **USED.** Both cytoscape and eact-cytoscapejs are used in:
- src/components/wiki/graph-view.tsx — imports cytoscape types and dynamically imports eact-cytoscapejs
- src/components/wiki/react-cytoscapejs.d.ts — type declarations for the react wrapper

### Manual check: @next/bundle-analyzer

✅ **USED.** Imported and configured in 
ext.config.ts (lines 2, 43):
`	s
import bundleAnalyzer from "@next/bundle-analyzer";
const withBundleAnalyzer = bundleAnalyzer({ enabled: true });
export default process.env.ANALYZE === "true" ? withBundleAnalyzer(nextConfig) : nextConfig;
`
Activated via 
pm run analyze which sets ANALYZE=true.

---

## 4. Missing Dependencies

These packages are **imported in source code** but are **not listed** in package.json. They resolve through transitive dependencies.

| Package | Used in | Transitive provider | Risk |
|---|---|---|---|
| unified | src/lib/wiki/callout-remark-plugin.ts, embed-remark-plugin.ts | eact-markdown, emark-gfm, ehype-raw, ehype-sanitize | Low — core remark ecosystem package, multiple dependents |
| unist | Same files (types only) | Same transitive chain | Low — types package, broad compatibility |
| unist-util-visit | Same files (used at runtime) | eact-markdown, emark-gfm, ehype-raw | Low — stable utility used by many remark plugins |
| mdast | embed-remark-plugin.ts (types only) | eact-markdown → mdast-util-to-hast | Low — types package |

**Recommendation:** These are technically undeclared dependencies. Although they work because of transitive resolution, they should ideally be declared explicitly. For a production project, add them as explicit dependencies to avoid breakage if the transitive chain changes. However, in the remark/unified ecosystem, relying on transitive resolution for plugin-authorship packages is common practice.

---

## 5. Peer Dependency Compatibility

| Check | Status | Details |
|---|---|---|
| next ↔ react/react-dom | ✅ Compatible | next@16.2.6 peer: eact ^18.2.0 \|\| 19.0.0-rc \|\| ^19.0.0 — current react@19.2.6 ✅ |
| next ↔ react-dom | ✅ Compatible | Same peer range as react — current react-dom@19.2.6 ✅ |
| eslint-config-next ↔ eslint | ✅ Compatible | eslint-config-next@16.2.6 peer: eslint >=9.0.0 — current eslint@9.39.4 ✅ |
| eslint-config-next ↔ typescript | ✅ Compatible | eslint-config-next peer: 	ypescript >=3.3.1 — current typescript@5.9.3 ✅ |
| @dnd-kit/sortable ↔ @dnd-kit/core | ✅ Compatible | sortable@10.0.0 peer: @dnd-kit/core@^6.3.0 — current core@6.3.1 ✅ |
| react-cytoscapejs ↔ react | ✅ Compatible | react-cytoscapejs@2.0.0 peer: eact >=16.8.0 — current react@19.2.6 ✅ |

### ⚠ Pending peer compat issues

| Issue | Details |
|---|---|
| eslint@10.x + eslint-config-next | eslint-config-next@16.2.6 requires eslint >=9.0.0, which does NOT include 10.x. **Cannot upgrade eslint to 10.x until eslint-config-next supports it.** |
| typescript@6.x + eslint / project | TypeScript 6.0 is a major release. Verify that eslint-config-next (transitively 	ypescript-eslint@8.59.3) supports TS 6.x before upgrading. Also check that Next.js itself supports TS 6.x. |

---

## 6. Recommendations

### Immediate (safe, no breaking changes)

1. **Patch bump these** (run 
pm update or bump manually):
   - 
ext@16.2.7 (but pinned at 16.2.6 — unlock to ^16.2.6)
   - eact@19.2.7, eact-dom@19.2.7
   - @next/bundle-analyzer@16.2.7
   - @types/react@19.2.17, @types/node@25.9.2
   - lucide-react@1.17.0
   - cytoscape@3.34.0
   - 	sx@4.22.4

2. **Remove @types/bcryptjs** from devDependencies — it's deprecated. bcryptjs v3 ships its own types.

3. **Safe minor bumps:**
   - lucide-react@^1.17.0
   - cytoscape@^3.34.0
   - @types/node@^25.9.2

### Requires planning

4. **ESLint 10** — Wait for eslint-config-next to support eslint 10.x. Blocked by Next.js ecosystem.

5. **TypeScript 6** — Major upgrade. Requires:
   - Verification of 	ypescript-eslint@8.59.3 compatibility
   - Testing with 
ext build and 
pm run lint
   - Check for any TS 6 breaking changes (new syntax rules, type system changes)
   - **Recommend deferring** until project is in a stable phase

### Dependency hygiene

6. **Explicitly add transitive dependencies** (optional, low priority):
   - unified@^11.0.5
   - unist-util-visit@^5.1.0
   - @types/unist@^3.0.0 (devDep)
   - mdast-util-from-markdown or @types/mdast (as needed for types)

### Security

7. **Monitor Next.js releases** for postcss vulnerability fix. The bundled postcss (8.4.49) is flagged as moderate severity (XSS). No action possible until Next.js bumps its postcss dependency.

### Unlock pinned versions

8. **Consider using ^ range for Next.js** (
ext: "^16.2.6" instead of "16.2.6") to automatically receive patch updates. Currently pinned exactly — each patch requires manual bump.

---

## Summary

| Category | Count | Details |
|---|---|---|
| Outdated packages | 13 | 2 major, 3 minor, 7 patch, 1 special |
| Security vulns | 2 moderate | postcss XSS (blocked by Next.js) |
| Unused deps | 0 genuine | All 5 flagged are false positives |
| Missing deps | 4 | All transitive, ecosystem-standard practice |
| Peer conflicts | 0 current | 2 future: eslint 10, typescript 6 |

**Overall health:** Good. No blocking issues. Main actions: patch bumps, remove deprecated @types/bcryptjs, monitor next/postcss security fix.
