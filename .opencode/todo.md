# Roleplay-Engine — OpenCode Todo

Persistent cross-session task checklist. Updated by the conductor before, during, and after each work cycle.

**Last updated:** 2026-06-09 (Cycle 7 — all timeout fixes)

---

## Active Work

(none)

## Recently Completed

### Cycle 7 — Full timeout fix (run.bat + undici agent + config)
- **run.bat:** `Net.WebClient.Timeout` → `Invoke-RestMethod -TimeoutSec 4`, TTS default `192.168.6.1` → `192.168.4.2`
- **ollama.ts:** Added undici Agent with 30-min headersTimeout/bodyTimeout → undici's internal 10s default was killing cold-starts before AbortSignal could fire
- **config.ts:** Timeout 600s → 1800s, embedding 120s → 600s
- **startup-check.ts:** URL construction uses `OLLAMA_CONFIG.baseUrl` now

---

## Backlog

(none — all items completed)

---

## Completed Plans History

- 2026-06-09 — **Cycle 7**: run.bat fixes + undici agent + timeouts (all files staged)
- 2026-06-09 — **Plan 024**: Chat session fixes committed `6833761`
- 2026-06-08 — **Plan 023**: AI Wiki Editing UI + Cleanup (`67afc28`)
- 2026-06-07 — **Plan 006**: Rich Wiki Editor (archived)
- 2026-06-07 — **Plan 005**: Jobs Model (archived)
- 2026-06-06 — **Plans 011-022**: All archived
- 2026-06-05 — **Plans 001-004**: All archived
