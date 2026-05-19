# CUSTOM HOOKS — src/hooks/

## OVERVIEW
10 custom hooks. All client-only. Consistent return shape: `{ data, loading, error, refresh }`.

## HOOKS
| Hook | Purpose | Dependencies |
|------|---------|--------------|
| `useAuth` | Auth state, login/logout/refresh | `useRouter` |
| `useSession` | Session data, messages, turn management | Session API endpoints |
| `useTTS` | TTS playback, queue integration | TTS API, audio player |
| `useEntityFetch<T>` | Generic fetch with loading/error state | Fetch API |
| `useRenderLoop` | Subscribe to 30fps render loop | `render-loop.ts` |
| `useIdleTracker` | User idle detection + heartbeat | Idle API endpoint |
| `useConnectionStatus` | Ollama/Kokoro health polling | Health API endpoints |
| `useLocalStorage<T>` | Persistent client-side settings | `window.localStorage` |
| `useVoices` | TTS voice discovery/assignment | TTS voice API |
| `useAudioPlayer` | Audio playback lifecycle | HTML Audio API |

## CONVENTIONS
- **Return shape**: `{ data, loading, error, refresh }` — consistent across all hooks.
- **Prefix**: `use-` in filenames, `use` in function names.
- **Client-only**: All hooks use browser APIs or React hooks — never import in server components.
- **Generic typing**: `useEntityFetch<T>` accepts type parameter for response shape.

## ANTI-PATTERNS
- **Do NOT use hooks in server components** — all hooks are client-only.
- **Do NOT break return shape convention** — components expect `{ data, loading, error, refresh }`.
- **Do NOT add side effects outside hooks** — encapsulate logic in custom hooks.
