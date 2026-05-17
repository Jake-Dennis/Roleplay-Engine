# Phase 4: Integration & Completeness

## Goal
Close remaining gaps between implementation plan and actual codebase. Focus on missing lib modules, hooks, critical API routes, and the startup script.

## Gap Analysis Summary

| Category | Missing | Priority |
|----------|---------|----------|
| **Lib Modules** | `importance.ts` (4-axis scoring) | HIGH |
| **Lib Modules** | `backlinks.ts` (wikilink parsing lib) | HIGH |
| **Lib Modules** | `prompt-builder.ts` (separate from retrieval) | MEDIUM |
| **Lib Modules** | `voice-discovery.ts` (separate from tts.ts) | MEDIUM |
| **Hooks** | `useAuth` (auth state management) | HIGH |
| **Hooks** | `useSession` (session state management) | HIGH |
| **Hooks** | `useTTS` (TTS state + playback) | MEDIUM |
| **Hooks** | `useVoices` (voice list + assignment) | MEDIUM |
| **Components** | `MessageBubble` (with action buttons) | HIGH |
| **Components** | `MessageInput` (input area) | HIGH |
| **Components** | `TypingIndicator` (animated dots) | LOW |
| **Components** | `MessageActionBar` (TTS/Copy/Edit/Regen/Delete) | HIGH |
| **API Routes** | `/api/tts/voices/refresh` | MEDIUM |
| **API Routes** | `/api/tts/voices/combine` | MEDIUM |
| **API Routes** | `/api/tts/voice/:entityType/:entityId` (per-entity) | MEDIUM |
| **API Routes** | `/api/relationships/[id]/decay` | LOW |
| **Infrastructure** | `run.bat` startup script | HIGH |
| **Infrastructure** | `config/ollama.ts` (centralized config) | LOW |

## Execution Plan

### 4A: Missing Lib Modules
1. Create `src/lib/importance.ts` — 4-axis importance scoring with composite calculation
2. Create `src/lib/backlinks.ts` — Wikilink parsing, resolution, link type inference
3. Create `src/lib/prompt-builder.ts` — Extract from `retrieval.ts` assemblePrompt
4. Create `src/lib/voice-discovery.ts` — Extract from `tts.ts` voice auto-discovery

### 4B: Missing Hooks
5. Create `src/hooks/use-auth.ts` — Auth state (user, loading, login, logout)
6. Create `src/hooks/use-session.ts` — Session state (current session, participants, turn)
7. Create `src/hooks/use-tts.ts` — TTS state (playing, queue, settings)
8. Create `src/hooks/use-voices.ts` — Voice list + assignment management

### 4C: Missing Components
9. Create `src/components/chat/message-bubble.tsx` — Message with action buttons
10. Create `src/components/chat/message-input.tsx` — Textarea + send button
11. Create `src/components/chat/message-action-bar.tsx` — TTS/Copy/Edit/Regen/Delete
12. Create `src/components/chat/typing-indicator.tsx` — Animated dots

### 4D: Missing API Routes
13. Create `/api/tts/voices/refresh/route.ts` — Re-discover voices from Kokoro
14. Create `/api/tts/voices/combine/route.ts` — Combine voices via Kokoro
15. Create `/api/tts/voice/[entityType]/[entityId]/route.ts` — Per-entity voice assignment
16. Create `/api/relationships/[id]/decay/route.ts` — Decay calculation endpoint

### 4E: Infrastructure
17. Create `run.bat` — Startup script with health checks
18. Create `config/ollama.ts` — Centralized Ollama configuration

## Validation
- All new lib modules exported and importable
- All hooks tested with mock data
- All API routes return correct status codes
- `run.bat` starts the app successfully
- Full test suite passes (403+ tests)
