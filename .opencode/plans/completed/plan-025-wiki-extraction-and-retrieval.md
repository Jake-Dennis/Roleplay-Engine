# Plan 025: Wiki Extraction & Retrieval Improvements

## Goal
Improve the wiki auto-extraction prompt to produce richer, more numerous entities, and improve how those entities feed back into the generation prompt so the AI actually references them during storytelling.

## Tasks

### Layer 1 (parallel, no deps)
- [ ] A1: Update extraction prompt in `src/lib/prompts.ts` — increase limit to 10 entities, remove "skip passing mentions", add extraction guidance for characters/locations/factions, ask for richer 2-3 sentence descriptions including appearance and role (assigned: @architect)
- [ ] A2: Update `src/lib/wiki/auto-extract.ts` — build universe context from existing wiki pages (read universe overview, existing entities/concepts) and pass to the prompt; increase maxOps from 3 to 6 (assigned: @builder)
- [ ] C1: Update `src/lib/retrieval.ts` `getWikiContext()` — read the universe overview/concept pages and inject as the first lore entry so the AI always knows what world it's in (assigned: @builder)
- [ ] C2: Update `src/lib/prompt-builder.ts` — expand Active Entities section to include descriptions from lore entries; improve WIKILINK_INSTRUCTION to explain wiki usage more specifically (assigned: @builder)
- [ ] C3: Update `src/lib/config.ts` — increase LORE budget from 0.20 to 0.25 (assigned: @builder)

### Layer 2 (depends on Layer 1)
- [ ] Review: All changes reviewed by @reviewer

## Verification
- [ ] A1: `python -c "with open('src/lib/prompts.ts') as f: c=f.read(); assert 'Max 10 entities' in c and '2-3 sentences covering' in c and 'Skip passing mentions' not in c; print('OK: extraction prompt updated')"`
- [ ] A2: `python -c "with open('src/lib/wiki/auto-extract.ts') as f: c=f.read(); assert 'Math.min(entities.length, 6)' in c and 'function buildUniverseContext' in c; print('OK: maxOps 6 + context builder')"`
- [ ] C1: `python -c "with open('src/lib/retrieval.ts') as f: c=f.read(); assert 'aboutPath' in c and 'concepts' in c and 'about.md' in c; print('OK: universe overview in retrieval')"`
- [ ] C2: `python -c "with open('src/lib/prompt-builder.ts') as f: c=f.read(); assert 'CRITICAL' in c and 'loreMap' in c; print('OK: prompt-builder updated')"`
- [ ] C3: `python -c "with open('src/lib/config.ts') as f: c=f.read(); idx=c.find('LORE:'); assert idx>=0 and '0.25' in c[idx:idx+15]; print('OK: LORE budget 0.25')"`

## Files Changed
- `src/lib/prompts.ts` — extraction prompt template
- `src/lib/wiki/auto-extract.ts` — universe context building, maxOps increase
- `src/lib/retrieval.ts` — getWikiContext universe overview injection
- `src/lib/prompt-builder.ts` — active entities descriptions, WIKILINK_INSTRUCTION
- `src/lib/config.ts` — LORE budget increase
