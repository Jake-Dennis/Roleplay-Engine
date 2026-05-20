# Draft: Wiki/Lore/Chat Improvement Plan

## User's Answers (All Confirmed)

### Username Flexibility
- **Allow symbols**: Usernames can use uppercase, lowercase, numbers, and symbols.
- **Action**: Update `usernamePattern` in `config.ts` and error message in `auth.ts`.

### Persona vs NPC
- **Separate systems**: Personas = user's playable characters, NPCs = LLM-controlled with behavior/voice settings.

### NPC Behavior
- **Natural evolution**: NPCs evolve dynamically based on interactions UNLESS marked as "canon" (fixed personality/traits that don't change)
- This means NPCs need: personality traits, relationship memory, evolution tracking, and a "canon lock" flag

### Universe Binding
- **Universe isolation**: Each wiki and lore stays separate per universe — no cross-contamination.

### Session ↔ Universe
- **One-to-one**: A session belongs to exactly ONE universe. No cross-universe sessions.

### Chat-Session Binding
- **Session isolation**: Sessions are separate stories within a universe — no cross-session conflicts.

### Lore Extraction Scope
- **Scan ALL messages**: Comprehensive extraction, not just new ones since last run.

### Export Format
- **All three**: JSON (structured/data), Markdown (readable), TXT (plain) — user wants versatility.

### Version History
- **Both**: File-based (`.history/` directory for diffs) AND DB-based (new table for metadata/querying).

### Plan Scope
- **Phased approach**: Three separate plans — Phase 1 (quick wins), Phase 2 (structural), Phase 3 (advanced).

## Architecture Decisions (Derived)

### NPC System Design
- New table: `npcs` with `id`, `user_id`, `universe_id`, `name`, `description`, `personality_traits TEXT`, `behavior_patterns TEXT`, `voice_id`, `is_canon BOOLEAN DEFAULT 0`, `evolution_log TEXT`
- `is_canon = true` → personality locked, no evolution
- `is_canon = false` → personality evolves based on interaction history
- `evolution_log` tracks how NPC has changed over time (for debugging/rollback)

### Session-Universe Binding
- Enforce `sessions.universe_id NOT NULL` (currently nullable)
- UI: Universe selector required before creating a session
- API: Reject session creation without `universe_id`

### Lore Extraction Pipeline
- New job: `extract_lore_comprehensive` — scans ALL messages in a session/universe
- LLM analyzes messages → identifies entities, events, relationships → creates/updates wiki pages
- Output: `draft` status wiki pages for human review
- Runs on-demand or idle tier, not per-message (too expensive)

### Export System
- Single endpoint: `GET /api/sessions/[id]/export?format=json|md|txt`
- JSON: Full message tree with metadata, personas, timestamps
- Markdown: Chronological log with headers, sender names, timestamps
- TXT: Plain transcript, minimal formatting
- All three generated from same data pipeline, different formatters

### Version History (Dual)
- **File-based**: `data/{userId}/wiki/.history/{slug}/{timestamp}.md` — full file snapshots
- **DB-based**: `wiki_versions` table — `id`, `page_path`, `user_id`, `version_number`, `change_summary`, `timestamp`, `file_snapshot_path`
- UI shows DB metadata, "Restore" button pulls from file snapshot
- DB enables querying ("show me all versions of X"), files enable actual restoration
