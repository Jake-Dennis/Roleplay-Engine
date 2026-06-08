# Phase 3A: Code Quality & Maintainability — Learnings

**Date:** 2026-05-25
**Status:** In Progress

## Current State

### Already Complete (pre-existing)
- **Task 3A.2**: `logger.ts` exists at `src/lib/logger.ts`. Zero `console.log(` calls remain in `src/`.
- **Task 3A.4**: `error-response.ts` exists at `src/lib/error-response.ts`. Used in 79+ files across the codebase.
- **Task 3A.5**: `getAuthToken()` migration — only 1 file (`logout/route.ts`) still used `cookies.get("auth-token")`, now fixed.

### Remaining Work

#### Task 3A.1a: Split job-processor.ts
- **File**: `src/lib/job-processor.ts` — 874 lines
- **Already extracted** (6 handlers in `src/lib/jobs/`):
  - `summarization-handler.ts` (summarize_messages, compress_memories)
  - `wiki-handler.ts` (8 wiki job types)
  - `npc-evolution.ts` (npc_evolution)
  - `lore-extraction.ts` (extract_lore_comprehensive)
  - `session-recap.ts` (generate_session_recap)
  - `scene-handler.ts` (scene_state_extract)
- **Still inline** (6 handlers to extract):
  - `handleGenerateEmbeddings` (22 lines) → `embedding-handler.ts`
  - `handleAnalyzeRelationships` (59 lines) → `relationship-analysis-handler.ts`
  - `handleDecayRelationships` (118 lines) → `decay-handler.ts`
  - `handleRefineRelationshipSummary` (70 lines) → `relationship-summary-handler.ts`
  - `handleArchivalProcessing` (57 lines) → `archival-handler.ts`
  - `handleThreadAnalysis` (64 lines) → `thread-analysis-handler.ts`
  - Plus ~19 queue management functions that would need to move to a queue module

#### Task 3A.1c: Split settings/page.tsx
- **File**: `src/app/(app)/settings/page.tsx` — 617 lines
- **Already extracted**: `OllamaSettingsSection` (ollama-settings.tsx), `TTSSettingsSection` (tts-settings.tsx)
- **Still inline** (4 sections to extract):
  - ServerInfoSection (~35 lines, read-only)
  - ConnectionStatusSection (~70 lines, health indicators)
  - NarratorVoiceSection (~42 lines, dropdown + save)
  - ChangePasswordSection (~72 lines, form validation)

#### Task 3A.3: Magic Numbers
- Config.ts has TIME, CONTENT_LIMITS, TIMEOUTS, IDLE_TIERS, OLLAMA_CONFIG, TTS_CONFIG, AUTH_CONFIG, APP_CONFIG
- 22 files already import from config.ts
- Key remaining hardcoded values:
  - `(1000 * 60 * 60 * 24)` day-conversion pattern in 10+ files (should use TIME.ONE_DAY)
  - `num_ctx` values (2048/4096/8192/16384) in 15+ files
  - `temperature` values (0.1/0.2/0.3/0.4) in 18 files
  - `MAX_FILE_SIZE = 10 * 1024 * 1024` in upload route
  - Client hooks duplicate server config (use-idle-tracker, use-connection-status)
