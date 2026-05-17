# Plan: Settings Page

## Goal
Create a user settings page with password change, TTS settings (auto-play, volume, skip-long-messages), and connection status indicators for Ollama and Kokoro.

## Graph Analysis
- **Affected Systems**: Auth API, TTS API, Ollama health check, Kokoro health check, UI navigation
- **Dependency Chain**: `api/auth/password/route.ts` → `api/tts/voices/route.ts` → `api/health/route.ts` → `settings/page.tsx`
- **Centrality**: LOW — new page, minimal cross-system impact

## Affected Files
| File | Change |
|------|--------|
| `src/app/(app)/settings/page.tsx` | New settings page |
| `src/app/api/auth/password/route.ts` | Already exists, verify |
| `src/app/api/tts/voices/route.ts` | Already exists, verify |
| `src/app/api/health/route.ts` | Add Ollama + Kokoro status |
| `src/app/(app)/layout.tsx` | Add Settings link to sidebar |
| `src/components/settings/password-form.tsx` | New component |
| `src/components/settings/tts-settings.tsx` | New component |
| `src/components/settings/connection-status.tsx` | New component |

## Database Changes
```sql
-- Store TTS preferences per user
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (user_id, key)
);
```

## Risks
- **LOW**: Password change requires current password verification
- **LOW**: TTS settings stored in localStorage vs database (decide persistence strategy)
- **LOW**: Health check endpoints may timeout if services are down

## Execution Phases

### Phase 1: Health Check API
1. Create/update `GET /api/health` endpoint
2. Check Ollama: `GET http://192.168.4.2:11434/api/tags`
3. Check Kokoro: `GET http://192.168.4.2:8880/v1/audio/voices`
4. Return status: `{ ollama: "connected"|"unavailable", kokoro: "connected"|"unavailable" }`

### Phase 2: Settings Page UI
1. Create `src/app/(app)/settings/page.tsx`
2. Add Settings link to sidebar navigation
3. Three sections: Account, TTS, Connection Status

### Phase 3: Password Change Form
1. Current password field
2. New password field with validation (8+ chars, 1 letter, 1 number)
3. Confirm new password field
4. Submit to `PUT /api/auth/password`
5. Show success/error messages

### Phase 4: TTS Settings
1. Auto-play toggle (on/off)
2. Volume slider (0-100%)
3. Skip long messages toggle (on/off, threshold: 500 chars)
4. Narrator voice selector (dropdown of available voices)
5. Speech speed slider (0.5x - 2.0x)
6. Store in localStorage (per-user, no server round-trip needed)

### Phase 5: Connection Status
1. Live indicator for Ollama (green/red dot + text)
2. Live indicator for Kokoro (green/red dot + text)
3. Auto-refresh every 30 seconds
4. Show model name and voice count when connected

## Validation
- Change password with correct current password, verify success
- Change password with wrong current password, verify rejection
- Toggle TTS settings, verify they persist across page reloads
- Disconnect Ollama, verify status shows "unavailable"
- Reconnect Ollama, verify status auto-updates

## Rollback
- Remove settings page and sidebar link
- Remove health check endpoint
- Remove user_settings table (if created)
