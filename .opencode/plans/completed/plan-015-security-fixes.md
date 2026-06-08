# Plan 015: Security Fixes

## Goal
Fix the 2 medium-severity security findings: SSRF via user-settable TTS/Ollama URL (ollama.ts), and the conditional cookie `secure` flag.

## Tasks

### Layer 1 (parallel, no deps)

- [ ] **1a: Fix SSRF via user-settable TTS/Ollama URL** (assigned: @security)
  - Read `src/lib/ollama.ts` — find `getUserTtsUrl()` (line ~287) and `getUserOllamaUrl()` (line ~266)
  - Add URL validation that rejects:
    - Cloud metadata IPs: `169.254.169.254` (AWS/GCP/Azure)
    - Loopback: `127.0.0.0/8`, `::1`
    - Private ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
  - Options:
    - A. Add an allowlist: only allow specific CIDRs (e.g., LAN ranges only)
    - B. Add a denylist: reject known dangerous IPs and allow the rest
    - C. Use a URL class to validate and sanitize
  - Read `src/lib/config.ts` to check if TTS_CONFIG and OLLAMA_CONFIG have host validation
  - Also check `src/lib/tts.ts` for how the URL is consumed
  - Verify: existing LAN-based configuration still works (default is `192.168.6.1:11434`)

- [ ] **1b: Fix cookie secure flag** (assigned: @security)
  - Read `src/app/api/auth/login/route.ts` and `src/app/api/auth/logout/route.ts`
  - Change `secure: process.env.NODE_ENV === "production"` to `secure: true`
  - OR add a `COOKIE_SECURE` env var: `secure: process.env.COOKIE_SECURE !== "false"`
  - Update `.env.example` if adding a new env var
  - Verify: login/logout workflows still work

- [ ] **1c: Fix wiki POST directory sanitization** (assigned: @security, optional)
  - Read `src/app/api/wiki/route.ts` lines 95-101
  - Add `path.normalize()` or reject `..` sequences in the `dir` portion of `pagePath`
  - Verify: existing wiki page creation API calls still work

## Verification
- [ ] 1a: `powershell -NoProfile -Command "if ((Select-String -Path src/lib/ollama.ts -Pattern 'isValidServiceUrl' -SimpleMatch) -and (Select-String -Path src/lib/ollama.ts -Pattern '127.0.0.0/8' -SimpleMatch)) { exit 0 } else { exit 1 }"` — should exit 0 (validation function exists with loopback check)
- [ ] 1b: `powershell -NoProfile -Command "$login = Select-String -Path src/app/api/auth/login/route.ts -Pattern 'secure: true' -SimpleMatch; $logout = Select-String -Path src/app/api/auth/logout/route.ts -Pattern 'secure: true' -SimpleMatch; if ($login -and $logout) { exit 0 } else { exit 1 }"` — should exit 0 (both routes use secure: true)
- [ ] 1c: `powershell -NoProfile -Command "if (Select-String -Path src/app/api/wiki/route.ts -Pattern 'path traversal is not allowed' -SimpleMatch) { exit 0 } else { exit 1 }"` — should exit 0 (wiki route rejects path traversal)
