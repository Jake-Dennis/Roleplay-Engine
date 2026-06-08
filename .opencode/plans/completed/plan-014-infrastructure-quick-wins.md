# Plan 014: Infrastructure Quick Wins

## Goal
Add 4 missing DB indexes to eliminate full table scans on every generation request, unlock exact-pinned Next.js versions for auto-patches, and perform safe dependency version bumps.

## Tasks

### Layer 1 (parallel, no deps)

- [ ] **1a: Add 4 missing DB indexes** (assigned: @builder)
  - Add to `scripts/init-db.ts`:
    ```sql
    CREATE INDEX IF NOT EXISTS idx_scene_states_session ON scene_states(session_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_narrative_memories_lookup ON narrative_memories(user_id, session_id, universe_id);
    CREATE INDEX IF NOT EXISTS idx_narrative_anchors_user_universe ON narrative_anchors(user_id, universe_id);
    CREATE INDEX IF NOT EXISTS idx_entity_mentions_user_freq ON entity_mentions(user_id, frequency DESC);
    ```
  - Also check if there's a migration file or schema file that needs updating
  - Verify: the statements are idempotent (IF NOT EXISTS) and safe to run on existing DBs

- [ ] **1b: Unlock pinned next versions** (assigned: @builder)
  - In `package.json`, change `"next": "16.2.6"` to `"next": "^16.2.6"`
  - In `package.json`, change `"eslint-config-next": "16.2.6"` to `"eslint-config-next": "^16.2.6"`
  - Run `npm install` to update lockfile

- [ ] **1c: Safe dependency patch bumps** (assigned: @builder)
  - Update these to latest in `package.json`:
    - `"react": "^19.2.7"`, `"react-dom": "^19.2.7"`
    - `"@types/react": "^19.2.17"`, `"@types/node": "^25.9.2"`
    - `"lucide-react": "^1.17.0"`, `"cytoscape": "^3.34.0"`
    - `"tsx": "^4.22.4"`, `"@next/bundle-analyzer": "^16.2.7"`
  - Run `npm install`
  - Verify: `npm run build` + `npm test` both pass

## Verification
- [ ] 1a: `powershell -NoProfile -Command "if (Select-String -Path scripts/init-db.ts -Pattern 'idx_scene_states_session' -SimpleMatch) { exit 0 } else { exit 1 }"` — should exit 0 (indexes exist in init-db.ts)
- [ ] 1b: `npm run build` — should exit 0 (build passes with unlocked deps)
- [ ] 1c: `npm test` — should exit 0 (253/253 tests pass)
