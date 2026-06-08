# Plan 020: Test Coverage — Integration

## Goal
Add integration tests for key API routes, component tests for high-value UI components, set up CI via GitHub Actions, and add bunfig.toml with coverage configuration.

## Tasks

### Layer 1 (parallel, no deps)

- [ ] **1a: Add integration tests for key API routes** (assigned: @tester)
  Create integration tests in `src/app/api/__tests__/` (create dir if needed):
  - `auth.test.ts`:
    - POST /api/auth/register — create user, verify response
    - POST /api/auth/login — valid/invalid credentials
    - POST /api/auth/logout — cookie clearing
    - GET /api/auth/me — authenticated/unauthenticated
  - `sessions.test.ts`:
    - POST /api/sessions — create session
    - GET /api/sessions — list sessions
    - POST /api/sessions/[id]/turn — send a turn, verify response shape
  - `wiki.test.ts`:
    - GET /api/wiki — list pages (empty)
    - POST /api/wiki — create page
    - GET /api/wiki/[...slug] — get page
    - PUT /api/wiki/[...slug] — update page
  - `generate.test.ts`:
    - POST /api/generate/[id] — verify SSE stream starts (mock Ollama)
  - Use `mock.module()` for `@/lib/db` and `@/lib/ollama` to avoid real DB/LLM calls

- [ ] **1b: Add component tests for high-value components** (assigned: @tester)
  Create meaningful tests (not stubs) for:
  - `src/components/ui/modal.tsx`:
    - Render children when open
    - Close on escape key
    - Close on backdrop click
  - `src/components/session/session-list.tsx`:
    - Render list of sessions
    - Loading state
    - Empty state
  - `src/components/wiki/file-tree.tsx`:
    - Render folder hierarchy
    - Expand/collapse folders
    - Select file
  - `src/components/chat/chat-window.tsx`:
    - Render messages
    - Scroll to bottom on new message
  - Use `@testing-library/react` with `jsdom` environment
  - Install test dependencies if needed (`@testing-library/react`, `jsdom`)

- [ ] **1c: Set up CI and bunfig.toml** (assigned: @docs)
  - Create `bunfig.toml` at project root:
    ```toml
    [test]
    root = "src"
    coverage = true
    coverageDir = "coverage"
    coverageThreshold = 0
    ```
  - Create `.github/workflows/test.yml`:
    ```yaml
    name: Test
    on: [push, pull_request]
    jobs:
      test:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: oven-sh/setup-bun@v2
          - run: bun install
          - run: bun test
    ```
  - Create `.github/workflows/lint.yml`:
    ```yaml
    name: Lint
    on: [push, pull_request]
    jobs:
      lint:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: oven-sh/setup-bun@v2
          - run: bun install
          - run: bun run lint
    ```

## Verification
- [ ] 1a: API integration tests exist for auth, sessions, wiki, generate — all pass
- [ ] 1b: Component tests exist for modal, session-list, file-tree, chat-window — all pass
- [ ] 1c: `bunfig.toml` created, `.github/workflows/` with test and lint workflows created
- [ ] Full: `npm test` passes, `npm run build` compiles clean
