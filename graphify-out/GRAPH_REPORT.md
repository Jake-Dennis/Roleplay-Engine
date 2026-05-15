# Graph Report - Roleplay-Engine  (2026-05-16)

## Corpus Check
- 44 files · ~24,536 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 524 nodes · 601 edges · 56 communities (47 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `76d0c7d2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 25 edges
2. `AGENTS.md - Engineering Orchestration System` - 23 edges
3. `Roleplay-Engine: Full Implementation Plan` - 20 edges
4. `5. Narrative Systems` - 12 edges
5. `5.11 Message Actions` - 11 edges
6. `Project Context` - 10 edges
7. `6. TTS System (Kokoro)` - 10 edges
8. `Text-to-Speech (TTS)` - 9 edges
9. `verifyToken()` - 8 edges
10. `RenderLoop` - 8 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `getUserById()`  [EXTRACTED]
  src/app/api/auth/me/route.ts → src/lib/auth.ts
- `POST()` --calls--> `getDb()`  [EXTRACTED]
  src/app/api/generate/[id]/route.ts → src/lib/db.ts
- `POST()` --calls--> `getDb()`  [EXTRACTED]
  src/app/api/sessions/[id]/messages/route.ts → src/lib/db.ts
- `PUT()` --calls--> `getDb()`  [EXTRACTED]
  src/app/api/sessions/[id]/messages/[messageId]/route.ts → src/lib/db.ts
- `DELETE()` --calls--> `getDb()`  [EXTRACTED]
  src/app/api/sessions/[id]/messages/[messageId]/route.ts → src/lib/db.ts

## Communities (56 total, 9 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (36): DELETE(), GET(), PUT(), authenticateUser(), AuthToken, createUser(), generateToken(), getUserById() (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (43): Agent Definitions, AGENTS.md - Engineering Orchestration System, code:block1 (1. graph analysis), code:bash (@orchestrator [task description]), code:bash (@architect [architecture task]), code:json ({), code:block3 (@orchestrator refactor auth system), code:json ({) (+35 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (27): 5.10 Group Session Real-Time Sync, 5.1 Scene State Layer, 5.2 Contradiction Prevention System, 5.3 Canon Layers, 5.4 Narrative Importance System, 5.5 Relationship Decay & Evolution, 5.6 Intent Analysis, 5.7 Idle-Time Narrative Enrichment (+19 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (24): API Endpoint, code:block31 (GET http://192.168.4.2:8880/v1/audio/voices), code:json ({), code:yaml (npc:), code:yaml (character:), code:block35 ("af_bella(2)+af_sky(1)"   # 67% bella, 33% sky), code:block36 (POST http://192.168.4.2:8880/v1/audio/speech), code:json ({) (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (23): 6.1 Configuration, 6.2 Voice Auto-Discovery, 6.3 TTS Client, 6.4 Voice Assignment System, 6.5 TTS Queue & Playback, 6.6 Audio Caching, 6.7 TTS in Chat, 6.8 TTS API Endpoints (+15 more)

### Community 5 - "Community 5"
Cohesion: 0.1
Nodes (21): 5.11 Message Actions, Button Layout, Button Visibility Matrix, code:block26 (┌─────────────────────────────────────────────┐), code:block27 (1. User clicks [🔄 Regenerate] on AI message MSG-1043), code:block28 (1. User clicks [✏️ Edit] on message MSG-1042), code:json ({), code:block30 (1. User clicks [🗑️ Delete] on message MSG-1043) (+13 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (20): Available Actions, Background Job System, Button Visibility, code:block15 (Before:), code:block16 (Before:), code:yaml (queue_task:), code:text (Relationships/), code:yaml (state: generated_unverified) (+12 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (19): 3. Scene State Layer, Canon Enforcement, Canon Layers, code:yaml (scene_state:), code:yaml (message_summary:), code:text (User Message), code:block23 (new_value = current_value × (0.5 ^ (days_inactive / half_lif), code:block4 (data/) (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (16): 5. Narrative Memory, Async Processing Philosophy, Canon-Aware Roleplay, code:text (Universe Layer), Core Narrative Layers, Core Philosophy, Core Stack, Core System Goal (+8 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (14): 12. Project Structure, 13. run.bat, 15. Dependencies, 16. Key Design Decisions, 17. Risk Assessment, 1. Architecture Overview, code:block1 (┌───────────────────────────────────────────────────────────), code:block61 (Roleplay-Engine/) (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (9): ChatWindow(), ChatWindowProps, Message, MessageBubble(), MessageBubbleProps, MessageInput(), MessageInputProps, Message (+1 more)

### Community 11 - "Community 11"
Cohesion: 0.15
Nodes (12): code:bash (# Add commands here), code:bash (# Add test commands here), Description, Domain Knowledge, Important Conventions, Key Constraints, Links, Project Context (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.26
Nodes (8): buildPrompt(), POST(), checkOllamaConnection(), generateTextStream(), isOllamaAvailable(), OllamaEmbedRequest, OllamaEmbedResponse, OllamaGenerateRequest

### Community 14 - "Community 14"
Cohesion: 0.18
Nodes (11): Archival Thresholds, Chat Memory Structure, code:yaml (message:), code:text ([SCENE STATE]), code:yaml (narrative_importance:), code:block28 (score = (emotional × 0.35) + (local × 0.25) + (canonical × 0), Composite Score (for retrieval ranking), Context Budget (+3 more)

### Community 15 - "Community 15"
Cohesion: 0.2
Nodes (10): Authentication Migration, code:block10 (@orchestrator refactor [system]), code:block11 (1. Graph analysis), code:block12 (@orchestrator [bug description]), code:block13 (1. Debugger), code:block14 (@orchestrator redesign auth for [requirement]), code:block15 (1. Architect), Large Refactor (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.22
Nodes (9): 2. Timeline Layer, code:yaml (turn_mode: freeform    # freeform or ordered), code:yaml (time_period:), Group Session API, Group Session Flow, Group Sessions, Real-Time Sync, Session Types (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.22
Nodes (9): 3.1 Design, 3.2 Auth Flow, 3.3 JWT Structure, 3.4 API Endpoints, 3.5 Registration Validation, 3. Authentication System, code:block4 (┌──────────┐     POST /api/auth/login      ┌──────────┐), code:json ({) (+1 more)

### Community 18 - "Community 18"
Cohesion: 0.22
Nodes (9): 4.1 Session Types, 4.2 Group Session Architecture, 4.3 Group Session Flow, 4.4 Turn Management (Optional), 4.5 Group Session API, 4. Group Session System, code:block7 (Session: "The Eastern Ruins Expedition"), code:block8 (1. Owner creates session, invites users by username) (+1 more)

### Community 19 - "Community 19"
Cohesion: 0.22
Nodes (9): 5.1 Configuration, 5.2 Ollama Client, 5.3 API Usage, 5.4 Connection Health Check, 7. Ollama Integration, code:javascript (// config/ollama.js), code:block50 (┌──────────────┐     HTTP POST      ┌──────────────────┐), code:block51 (POST http://192.168.4.2:11434/api/generate) (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.36
Nodes (6): DATA_DIR, Database, ensureDir(), fs, main(), path

### Community 21 - "Community 21"
Cohesion: 0.25
Nodes (8): 6. Events, code:yaml (event:), code:text (User Input), code:yaml (id: npc_haleth), Event Structure, Event Types, Metadata Example, Retrieval Pipeline

### Community 22 - "Community 22"
Cohesion: 0.25
Nodes (8): 1. Universe Layer, 4. Relationship Memory, code:yaml (relationship:), code:yaml (narrative_state:), code:block5 (Session: "The Eastern Ruins Expedition"), code:yaml (universe:), Group Session Architecture, Narrative Thread Tracking

### Community 23 - "Community 23"
Cohesion: 0.25
Nodes (8): 14. Implementation Phases, Phase 1: Foundation (Week 1-2), Phase 2: Authentication (Week 2-3), Phase 3: Core Session (Week 3-4), Phase 4: Narrative Systems (Week 4-5), Phase 5: Group Sessions (Week 5-6), Phase 6: Background Jobs (Week 6-7), Phase 7: Polish (Week 7-8)

### Community 24 - "Community 24"
Cohesion: 0.25
Nodes (8): 7.1 Design Philosophy, 7.2 Implementation, 7.3 React Integration, 7.4 What Updates at 30fps, 7.5 What Does NOT Update at 30fps, 9. 30fps Refresh Rate System, code:javascript (// lib/render-loop.js), code:javascript (// hooks/useRenderLoop.js)

### Community 25 - "Community 25"
Cohesion: 0.29
Nodes (6): ADR-NNN: [Title], Consequences, Context, Decision, Status, Tradeoffs

### Community 26 - "Community 26"
Cohesion: 0.4
Nodes (5): config, middleware(), protectedRoutes, publicRoutes, verifyToken()

### Community 27 - "Community 27"
Cohesion: 0.33
Nodes (6): 1. Localized Context, 2. Incremental Expansion, 3. Persistent Narrative Consequence, code:yaml (location:), code:yaml (location:), Design Principles

### Community 28 - "Community 28"
Cohesion: 0.33
Nodes (6): 30fps Refresh Rate System, Color Palette, Theme, UI Specification, What Does NOT Update at 30fps, What Updates at 30fps

### Community 29 - "Community 29"
Cohesion: 0.33
Nodes (6): 10. Background Job System, 8.1 Architecture, 8.2 Job Types & Priorities, 8.3 Idle Detection, code:block57 (┌─────────────────────────────────────────────┐), code:javascript (// Track user activity)

### Community 30 - "Community 30"
Cohesion: 0.33
Nodes (6): 2.1 Data Ownership Model, 2.2 User Data Directory Structure, 2.3 Database Schema (global.db), 2. Multi-User Data Isolation, code:block2 (data/), code:sql (-- Users)

### Community 31 - "Community 31"
Cohesion: 0.4
Nodes (4): code:bash (npm run dev), Deploy on Vercel, Getting Started, Learn More

### Community 32 - "Community 32"
Cohesion: 0.4
Nodes (5): Authentication, Endpoints, Method, Password Constraints, Username Constraints

### Community 33 - "Community 33"
Cohesion: 0.4
Nodes (5): Backlink Format, code:text (Universe/), code:markdown (---), Link Types, Obsidian-Style Storage

### Community 34 - "Community 34"
Cohesion: 0.4
Nodes (5): 6.1 Color Palette, 6.2 UI Layout, 8. Dark Theme UI, code:css (/* Tailwind config - Dark Theme */), code:block54 (┌───────────────────────────────────────────────────────────)

### Community 35 - "Community 35"
Cohesion: 0.4
Nodes (5): 11. Retrieval Pipeline, 9.1 Flow, 9.2 Context Budget, code:block59 (User Input), code:block60 (Total context window: 8192 tokens (Qwen3.5:9B))

### Community 37 - "Community 37"
Cohesion: 0.5
Nodes (4): Deployment, Inference, Runtime, Text-to-Speech

### Community 38 - "Community 38"
Cohesion: 0.5
Nodes (4): High Priority, Idle-Time Only, Medium Priority, Recommended Job Types

### Community 43 - "Community 43"
Cohesion: 0.67
Nodes (3): Classification Method, Intent Analysis, Intent Categories

### Community 44 - "Community 44"
Cohesion: 0.67
Nodes (3): System Scope, The System Is, The System Is NOT

### Community 45 - "Community 45"
Cohesion: 0.67
Nodes (3): Conflict Resolution, Override Workflow, User Overrides

## Knowledge Gaps
- **253 isolated node(s):** `eslintConfig`, `nextConfig`, `config`, `Database`, `path` (+248 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Roleplay-Engine: Full Implementation Plan` connect `Community 9` to `Community 2`, `Community 34`, `Community 4`, `Community 35`, `Community 17`, `Community 18`, `Community 19`, `Community 23`, `Community 24`, `Community 29`, `Community 30`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `5. Narrative Systems` connect `Community 2` to `Community 9`, `Community 5`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `Text-to-Speech (TTS)` connect `Community 3` to `Community 8`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `config` to the rest of the system?**
  _253 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._