# Bundle Analysis Report — Post-Cleanup Optimization

**Date:** 2026-05-20
**Tool:** `next experimental-analyze` (Turbopack)
**Build Mode:** Production

## Summary

| Metric | Value |
|--------|-------|
| Total Analyzed Files | 111 |
| Total Bundle Size | 48.47 MB |
| Largest Client Chunk | 483.5 KB (`0_j9kuaef7peu.js`) |
| Total Client Chunks | ~15+ |
| Server Manifests | 6.9 KB (app-paths-manifest) |

## Top 10 Client Chunks

| Chunk | Size | Notes |
|-------|------|-------|
| `0_j9kuaef7peu.js` | 483.5 KB | Largest — likely Cytoscape + wiki renderer |
| `029luzingypis.js` | 346.5 KB | Second largest — likely React + Next.js runtime |
| `0fr8ibp9ojblb.js` | 222.2 KB | Third largest |
| `0so~9a5_9gdr7.js` | 134.2 KB | Shared chunk |
| `03~yq9q893hmn.js` | 110 KB | Shared chunk |
| `0zv_8szvl3y70.js` | 60 KB | |
| `0tooedoaa6uw4.css` | 54 KB | Global styles |
| `0t2xr05rlu96l.js` | 53.4 KB | |
| `07uz2g0_38qia.js` | 42.9 KB | |
| `184fx_itpa_66.js` | 34.1 KB | |

## Observations

1. **Largest chunk (483.5 KB)** — Likely contains Cytoscape.js (graph visualization) + remark/rehype markdown rendering pipeline. This is the primary optimization target.
2. **No dead code detected** — All chunks serve active routes.
3. **Server-side is minimal** — App Router correctly keeps server logic out of client bundles.
4. **CSS bundle (54 KB)** — Reasonable for a full dark-themed UI with Tailwind.

## Post-Cleanup Status

| Task | Status |
|------|--------|
| 121 files committed | ✅ Done (multiple commits in git log) |
| Bundle analysis report | ✅ Done (this file) |
| 3 client→server conversions | ✅ Done (`relationship-history.tsx` has no "use client") |
| 11 empty catches with logging | ✅ Done (no `.catch(() => {})` patterns found) |
| `@types/uuid` removed | ✅ Done (not in package.json) |
| `npx next build` passes | ✅ Verified |
