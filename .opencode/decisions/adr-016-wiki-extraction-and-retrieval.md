# ADR-016: Wiki Extraction and Retrieval Improvements

**Date:** 2026-06-09
**Status:** Accepted

## Context

The wiki auto-extraction system was producing sparse, low-quality entities (3 entities per turn, thin descriptions, no universe context). During story generation, the AI was receiving minimal wiki context — only 2-3 entries with generic descriptions in the [KNOWN WORLD] section, no world-level overview, and no descriptions for active entities.

## Decision

### A) Extraction Changes

1. **Universe context injection**: Build a context string from existing wiki pages (`concepts/about.md` + entity pages) and pass it to the LLM extraction prompt. Previously this was hardcoded to `""`.

2. **Increased limits**: Max entities per turn from 5 → 10, max relationships 5 → 8, max operations per turn 3 → 6.

3. **Prompt guidance**: Removed "Skip passing mentions" which was too conservative. Added explicit guidance to include minor characters, always include the location, and write richer 2-3 sentence descriptions.

4. **Context budget**: `buildUniverseContext()` capped at 1500 characters to avoid overflowing the extraction model's context window.

### C) Retrieval Pipeline Changes

1. **Universe overview as forced entry**: The universe overview page (`concepts/about.md`) is now always the first lore entry in the generation prompt, giving the AI world-level context even when no entity matches the current scene.

2. **Deduplication protection**: Before injecting the overview, check if it's already in the scored entries (from the index). `ensureOverviewInResult()` helper protects the overview from being sliced out by the re-ranking `.slice(0, 10)` calls.

3. **Budget rebalance**: LORE budget increased from 20% → 25% of available tokens. MESSAGES reduced from 38% → 33% to compensate, keeping the total at 100%.

4. **Active entities with descriptions**: The [ACTIVE ENTITIES] section now cross-references lore entries to show descriptions alongside entity names, giving the AI richer context.

5. **WIKILINK_INSTRUCTION emphasis**: Updated to explain that wikilinks are critical for the wiki knowledge base, and the AI should use them for ALL named entities including minor characters.

## Consequences

- **Positive**: AI will have more wiki context during generation (universe overview + more entities with descriptions). Extraction will produce more entities per turn with richer descriptions.
- **Negative**: Extraction prompt is now larger (universe context + more entities). The 1500 char budget mitigates context overflow risk.
- **Risk**: The `ensureOverviewInResult()` approach adds complexity to the re-ranking logic. If the overview needs to be demoted in the future, this code must be updated.
- **Budget rebalance**: Messages went from 38% → 33%, meaning ~275 fewer tokens of conversation history. For most sessions this is negligible (1-2 messages).
