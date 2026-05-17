# Plan: TTS Streaming

## Goal
Enable chunked TTS audio playback during narrative generation so audio begins before full text is generated, using Kokoro's `stream: true` mode.

## Graph Analysis
- **Affected Systems**: TTS API route, chat UI audio playback, Kokoro client integration
- **Dependency Chain**: `api/tts/generate/route.ts` → `lib/kokoro.ts` → `session/[id]/page.tsx` (Audio playback)
- **Centrality**: MEDIUM — isolated to TTS subsystem, no database changes

## Affected Files
| File | Change |
|------|--------|
| `src/lib/kokoro.ts` | Add streaming TTS method |
| `src/app/api/tts/stream/route.ts` | New streaming endpoint |
| `src/app/(app)/session/[id]/page.tsx` | Use streaming audio playback |
| `src/components/chat/chat-window.tsx` | TTS streaming indicator |

## Risks
- **MEDIUM**: Kokoro-FastAPI `stream: true` may return chunks in a format that needs parsing
- **LOW**: Web Audio API buffering for streaming chunks
- **LOW**: Fallback to non-streaming if Kokoro doesn't support streaming

## Execution Phases

### Phase 1: Kokoro Streaming Client
1. Add `generateSpeechStream(text, voice, speed)` to `lib/kokoro.ts`
2. POST to Kokoro with `stream: true` in request body
3. Parse streaming response chunks (likely binary audio chunks)
4. Handle connection errors gracefully

### Phase 2: Streaming API Endpoint
1. Create `POST /api/tts/stream` endpoint
2. Proxy Kokoro streaming response to client
3. Set appropriate headers for streaming audio
4. Add authentication check

### Phase 3: UI Integration
1. Update TTS playback in session page to use streaming endpoint
2. Use Web Audio API to queue and play chunks as they arrive
3. Show "speaking..." indicator during streaming
4. Add stop button that works mid-stream
5. Fallback to non-streaming if streaming fails

## Validation
- Generate TTS for long message, verify audio starts before text generation completes
- Test stop button mid-stream, verify clean cleanup
- Verify fallback to non-streaming mode when Kokoro streaming unavailable
- Test with different voice combinations

## Rollback
- Revert to non-streaming TTS endpoint
- Remove streaming API route
