# Plan 023: AI Wiki Editing UI + Cleanup

## Goal
Deliver the missing Plan 007 frontend (AI-assisted wiki editing) plus all outstanding cleanup items: stale comments, `.env.local`, orphan scripts, `.omo/` directory, and security review.

## Background
- Plans 001–022 all archived. Backend wiki jobs (enrich, deepen, generate-rumors) exist in `src/lib/jobs/wiki-handler.ts`
- Missing: the UI layer that lets users trigger those jobs and get AI text transformations
- Cleanup items from stale backlog

---

## Tasks

### Layer 1 (parallel, no deps) — Quick Cleanup

- [ ] **1a: Fix stale "via middleware" comment** (assigned: @builder)
  - `src/lib/idle-processing.ts:6` → s/via middleware/via proxy/
  - **Verify:** `grep "via middleware" src/lib/idle-processing.ts` returns empty

- [ ] **1b: Add OLLAMA_HOST to .env.local** (assigned: @builder)
  - Append `OLLAMA_HOST=http://localhost:11434/v1` after `PORT=3000`
  - **Verify:** `Select-String "OLLAMA_HOST" .env.local` returns the line

- [ ] **1c: Clean up orphan scripts + `.omo/`** (assigned: @builder)
  - Delete `.omo/` directory entirely (gitignored, 35 items, obsolete OMO workflow)
  - Delete `scripts/_graphify_*.py` (14 files, obsolete manual graphify workflow — the graphify skill handles this automatically now)
  - Delete `scripts/_archive/` (directory, obsolete archival scripts)
  - Fix `scripts/_check_chunks.py` lines 26-27: remove dead `.omo/evidence/` path references
  - **Verify:** `.omo/` does not exist; `scripts/_graphify_step*` files do not exist; `_check_chunks.py` has no `.omo/evidence/` string

- [ ] **1d: Security review of app-layout-shell.tsx** (assigned: @security)
  - Review `src/app/(app)/app-layout-shell.tsx` for prompt-injection-like embedded system-reminder content
  - Report findings as comment in the file or ADR
  - **Verify:** Security review output documented

### Layer 2 (parallel) — AI Wiki Editing API Endpoints

- [ ] **2a: Create AI text manipulation API endpoints** (assigned: @builder)
  - Create `src/app/api/wiki/text/rewrite/route.ts` — POST: rewrites selected text via Ollama
  - Create `src/app/api/wiki/text/expand/route.ts` — POST: expands selected text via Ollama
  - Create `src/app/api/wiki/text/summarize/route.ts` — POST: summarizes selected text via Ollama
  - Create `src/app/api/wiki/text/improve/route.ts` — POST: improves selected text via Ollama
  - Create `src/app/api/wiki/text/generate/route.ts` — POST: generates a full wiki page from a user prompt
  - Each endpoint: accepts `{ text: string, context?: string, userId, universeId }`, calls `generateText()` with appropriate prompt, returns transformed text
  - The generate endpoint also creates the wiki page via file-io and returns the new page path
  - **Verify:** Each endpoint responds 200 to a valid POST with `{ text: "test passage", userId: "test" }` (use `curl` or `fetch` test)

- [ ] **2b: Create wiki job-trigger API endpoints** (assigned: @builder)
  - Create `src/app/api/wiki/enrich/route.ts` — POST: queues a `wiki_enrich_entity` job, returns jobId
  - Create `src/app/api/wiki/deepen/route.ts` — POST: queues a `wiki_deepen_page` job, returns jobId
  - Create `src/app/api/wiki/generate-rumors/route.ts` — POST: queues a `wiki_generate_rumors` job, returns jobId
  - Each endpoint: accepts `{ userId, universeId, pagePath? }`, calls `queueJob()`, returns `{ jobId }`
  - **Verify:** POST to each endpoint returns `{ jobId: "..." }` with 200

### Layer 3 (depends on Layer 2) — AI Wiki Editing UI Components

- [ ] **3a: Create-page-from-prompt modal** (assigned: @builder)
  - Create `src/components/wiki/create-from-prompt-modal.tsx`
  - Textarea for user's description (placeholder: "Describe the wiki page to create...")
  - Type dropdown (entities/concepts) + subtype dropdown (loaded from config API)
  - "Generate" button → POST to `/api/wiki/text/generate`, shows loading state
  - On success: navigates to the new page via `router.push()`
  - On error: shows error message inline
  - Styled consistently with TemplateSelector/NewFolderModal
  - **Verify:** Component renders in story/test; API call path matches endpoint

- [ ] **3b: Page header AI buttons (Enrich, Deepen, Generate Rumors)** (assigned: @builder)
  - Add to `src/app/(app)/wiki/[...slug]/page.tsx` in the header bar (view mode section, after Edit button)
  - Three buttons: "Enrich", "Deepen", "Generate Rumors" — each with an icon (from lucide-react)
  - On click: POST to the corresponding API endpoint, show a brief "Job queued" notification
  - Use the existing `activeUniverse.id` and page path for the request
  - Disable buttons while a job is in progress
  - Extract buttons into a small inline component to keep page.tsx manageable
  - **Verify:** Buttons appear in view mode header; POST fires on click with correct payload

- [ ] **3c: Selection toolbar (inline AI text operations)** (assigned: @builder)
  - Create `src/components/wiki/selection-toolbar.tsx`
  - Shows as a floating toolbar when text is selected in **edit mode** (MarkdownEditor textarea)
  - Buttons: "Rewrite", "Expand", "Summarize", "Improve" — each with an icon
  - On click: sends selected text to the corresponding API endpoint
  - Shows loading state while API processes
  - On completion: replaces the selected text in the editor with the AI response (or inserts expanded text at cursor)
  - Position is relative to the textarea (attach below the selected range)
  - Integrate into the wiki page by passing `editBody`/`setEditBody` and the textarea ref to the toolbar
  - **Verify:** Text selection in editor shows toolbar; clicking a button transforms the text

### Layer 4 (depends on Layer 3) — Verification & Archive

- [ ] **4a: Verify all changes** (assigned: @reviewer)
  - Build passes (`npm run build` or `next build`)
  - All test files pass (run affected test files)
  - Verify each layer's check items
  - **Verify:** `npm run build` exits 0

- [ ] **4b: Archive plan + commit** (assigned: @git)
  - Archive plan to `.opencode/plans/completed/`
  - Commit with message: `feat: AI wiki editing UI + cleanup — selection toolbar, enrich/deepen/rumor buttons, create-from-prompt modal, stale comments, orphan scripts`
  - Push to origin
  - **Verify:** `git log -1 --oneline` shows the commit

---

## Verification

- [ ] Layer 1a: `grep "via middleware" src/lib/idle-processing.ts` returns empty
- [ ] Layer 1b: `Select-String "OLLAMA_HOST" .env.local` returns success
- [ ] Layer 1c: `.omo/` directory doesn't exist; `scripts/_graphify_*` files gone; `_check_chunks.py` has no `.omo/evidence/`
- [ ] Layer 1d: Security review completed, no actionable vulnerabilities
- [ ] Layer 2a: `curl -X POST http://localhost:3000/api/wiki/text/rewrite -H "Content-Type: application/json" -d '{"text":"hello world","userId":"test"}'` returns 200
- [ ] Layer 2b: `curl -X POST http://localhost:3000/api/wiki/enrich -H "Content-Type: application/json" -d '{"userId":"test","universeId":"test"}'` returns `{ jobId: "..." }`
- [ ] Layer 3a: Create-from-prompt modal renders, generates and navigates to a new page
- [ ] Layer 3b: Enrich/Deepen/Rumor buttons visible in wiki view mode header, queue jobs on click
- [ ] Layer 3c: Selection toolbar appears on text selection in editor, transforms text on click
- [ ] Layer 4a: `npm run build` exits 0, no TypeScript errors
