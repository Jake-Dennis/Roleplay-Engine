# Plan: Connection Status Indicator

## Goal
Add a live connection status indicator in the footer showing real-time Ollama and Kokoro TTS connection state with auto-refresh.

## Graph Analysis
- **Affected Systems**: Health check API, footer layout, SSE polling
- **Dependency Chain**: `api/health/route.ts` → `layout.tsx` footer → `use-connection-status.ts` hook
- **Centrality**: LOW — new UI component, no database changes

## Affected Files
| File | Change |
|------|--------|
| `src/app/api/health/route.ts` | Create or update health endpoint |
| `src/app/(app)/layout.tsx` | Add footer with status indicators |
| `src/hooks/use-connection-status.ts` | New polling hook |
| `src/components/ui/connection-indicator.tsx` | New component |

## Risks
- **LOW**: Health checks may timeout — need reasonable timeout (3s)
- **LOW**: Polling every 30s adds minimal server load
- **LOW**: Should not block UI if health endpoint fails

## Execution Phases

### Phase 1: Health Check API
1. Create `GET /api/health` endpoint
2. Ping Ollama: `GET http://192.168.4.2:11434/api/tags` with 3s timeout
3. Ping Kokoro: `GET http://192.168.4.2:8880/v1/audio/voices` with 3s timeout
4. Return `{ ollama: { status, model?, error? }, kokoro: { status, voices?, error? } }`

### Phase 2: Connection Status Hook
1. Create `useConnectionStatus()` hook
2. Poll `/api/health` every 30 seconds
3. Track loading, error, and data states
4. Expose `ollamaStatus`, `kokoroStatus`, `lastChecked`

### Phase 3: Footer UI
1. Add footer bar to app layout (fixed bottom, subtle)
2. Show Ollama status: green dot + "Connected" / red dot + "Unavailable"
3. Show Kokoro status: green dot + "Connected" / red dot + "Unavailable"
4. Show last checked timestamp on hover
5. Click to manually refresh

## Validation
- Start app with Ollama running, verify green indicator
- Stop Ollama, verify indicator turns red within 30s
- Click to refresh, verify immediate update
- Verify footer doesn't overlap content

## Rollback
- Remove footer from layout
- Remove health check endpoint
- Remove connection status hook
