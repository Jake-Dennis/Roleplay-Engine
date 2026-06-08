# Per-Universe Wiki — Learnings

## T11 — Wiki directory cleanup on universe DELETE

**2026-05-22**

- Added `import { getWikiRoot } from '@/lib/wiki/wiki-root'` and `import fs from 'fs'` to `src/app/api/universes/[id]/route.ts`
- Added wiki directory cleanup in DELETE handler: after session dependency check, before cascade DB deletions
- Uses `getWikiRoot(decoded.sub, id)` to compute path, `fs.existsSync()` guard, `fs.rmSync()` with `{ recursive: true, force: true }`
- Position ensures ownership already verified; cleanup happens before DB cascade to avoid orphaned files if cascade fails
- Build passes (zero errors)

## T10 — Frontend wiki components pass `universe_id`

**2026-05-22**

- `recent-changes-widget.tsx`: Added `import { useApp }` from `@/contexts/app-context`, destructured `activeUniverse`, appended `&universe_id=${activeUniverse?.id || ''}` to GET `/api/wiki/recent`, added `activeUniverse` to useEffect dependency array
- `version-history.tsx`: Added `import { useApp }`, destructured `activeUniverse`, appended `&universe_id` to GET `/api/wiki/history`, added `universeId: activeUniverse?.id` to POST restore body
- `hover-preview.tsx`: Added optional `universeId?: string` param to `useHoverPreview` function signature, replaced no-op template literal in fetch URL with `/api/wiki/${slug}?universe_id=${universeId || ''}`, added `universeId` to `fetchPreview` useCallback dependency array
- `embed-transclusion.tsx`: Added `universeId?: string` to `EmbedTransclusionProps` interface, destructured `universeId` in component params, appended `&universe_id=${universeId || ''}` to image src URL
- Key pattern: `activeUniverse` from `useApp()` has shape `{ id, name, group_id }` and can be `null` — always use optional chaining
- Build passes (zero errors)

## T12 — Flat wiki cleanup + full smoke test

**2026-05-22**

- Removed 2 flat wiki directories (`data/51f611d4-.../wiki/` and `data/a750ee1c-.../wiki/`) — both contained only stock content (index.md, log.md)
- Zero flat wiki dirs remaining after cleanup
- `npx next build` passes — compiled successfully (zero errors, 3 pre-existing warnings)
- 35 files modified total; 27 in scope for per-universe-wiki, 8 from concurrent wiki-auto-extract plan (toast integration, SSE events, prompts, event bus)
- No TODO/FIXME/HACK/xxx/@ts-ignore/as any stubs found in any changed wiki file
- One new empty `catch {}` in `wiki-revisions/route.ts` is a deliberate graceful fallback pattern (parse request body, fall back to flat root if no universeId)
- All evidence saved to `.omo/evidence/task-12-*.txt`
- Next: Final Verification Wave (F1-F4)

## T13 — MarkdownRenderer passes universeId to WikiLink + EmbedTransclusion

**2026-05-22**

- Added `universeId?: string` to `MarkdownRendererProps` interface in `markdown-renderer.tsx`
- Added `universeId` to destructured props in `MarkdownRenderer` function component
- Added `universeId` to `WikiLink` function component interface + destructured props
- Passed `universeId` to `useHoverPreview(pageName, existingPages, wikiRoute, universeId)` — the 4th param already existed
- Passed `universeId={universeId}` to `<EmbedTransclusion>` in the embed render branch
- Passed `universeId={universeId}` to `<WikiLink>` in the wikilink anchor handler
- Updated both `<MarkdownRenderer>` callers in `wiki/[...slug]/page.tsx` — view mode (line 307) and preview mode (line 336) — added `universeId={activeUniverse?.id}`
- Updated recursive `<MarkdownRenderer>` call in `embed-transclusion.tsx` — added `universeId={universeId}`
- Without this fix: hover previews and image embeds fetched from flat wiki root (broken). With fix: all secondary wiki interactions respect per-universe isolation.
- `npx next build` passes (zero errors)
