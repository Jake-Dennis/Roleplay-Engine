# Graph Report - .  (2026-05-18)

## Corpus Check
- Large corpus: 286 files · ~183,075 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 1280 nodes · 2693 edges · 109 communities (85 shown, 24 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

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
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 287 edges
2. `verifyToken()` - 68 edges
3. `ensureGroupSupport()` - 61 edges
4. `useApp()` - 39 edges
5. `generateText()` - 35 edges
6. `isGroupMember()` - 32 edges
7. `useActiveUniverse()` - 26 edges
8. `EventBus` - 25 edges
9. `processJob()` - 24 edges
10. `PUT()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `JobsPage()` --calls--> `useActiveUniverse()`  [EXTRACTED]
  src/app/(app)/jobs/page.tsx → src/contexts/active-universe.tsx
- `RelationshipsPage()` --calls--> `parseEmotions()`  [INFERRED]
  src/app/(app)/relationships/page.tsx → src/lib/relationship-viz.ts
- `SessionListPage()` --calls--> `useApp()`  [EXTRACTED]
  src/app/(app)/session/page.tsx → src/contexts/app-context.tsx
- `UniverseListPage()` --calls--> `useApp()`  [EXTRACTED]
  src/app/(app)/universe/page.tsx → src/contexts/app-context.tsx
- `GET()` --calls--> `ensureGroupSupport()`  [INFERRED]
  src/app/api/universes/[id]/route.ts → src/lib/group-migrations.ts

## Communities (109 total, 24 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (83): POST(), DELETE(), GET(), POST(), getEntitiesNeedingEmbeddings(), archiveLowImportanceMemories(), compressOldSummaries(), deepenActiveLocations() (+75 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (39): DELETE(), formatBytes(), GET(), POST(), POST(), checkKokoro(), checkOllama(), GET() (+31 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (51): getSessionSettings(), POST(), isVecAvailable(), deleteEmbedding(), EmbeddingResult, ensureVectorTable(), getEmbedding(), getEntityText() (+43 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (37): DELETE(), GET(), POST(), GET(), DELETE(), GET(), PUT(), GET() (+29 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (40): GET(), hasRelationshipAccess(), POST(), GET(), getFileOwnerId(), hasRelationshipAccess(), PUT(), LoreFrontmatter (+32 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (24): ensureTable(), GET(), POST(), ensureColumn(), POST(), POST(), POST(), EventBus (+16 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (32): GET(), POST(), PUT(), aliveDeadRule, Contradiction, CONTRADICTION_RULES, ContradictionRule, detectAllContradictions() (+24 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (27): ENTRY_TYPE_ICONS, ENTRY_TYPE_LABELS, IMPORTANCE_COLORS, TimelineEntry, CANON_STATUSES, CharacterEditor(), CharacterEditorProps, ROLES (+19 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (24): PUT(), GET(), PUT(), GET(), hasRelationshipAccess(), POST(), GET(), POST() (+16 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (33): dependencies, bcryptjs, better-sqlite3, clsx, jose, jsonwebtoken, lucide-react, next (+25 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (25): CharactersPage(), NPC, VoiceDetail, useActiveUniverse(), ActiveState, AppContext, AppContextType, AppProvider() (+17 more)

### Community 11 - "Community 11"
Cohesion: 0.10
Nodes (24): calculateImportance(), decayRecency(), ImportanceLevel, ImportanceResult, ImportanceScores, LEVEL_VALUES, scoreToTier(), ArchivalAction (+16 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (17): useApp(), DashboardPage(), Session, Group, GroupsPage(), GroupDetail, GroupDetailPage(), GroupMember (+9 more)

### Community 13 - "Community 13"
Cohesion: 0.10
Nodes (18): IndividualMemories(), IndividualMemoriesProps, IndividualMemory, EmotionKey, EMOTIONS, PersonalRelationship, PersonalRelationships(), PersonalRelationshipsProps (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.12
Nodes (17): EMOTION_COLORS, EmotionBar(), EmotionBarProps, EvolutionEntry, RelationshipHistory(), RelationshipHistoryProps, DecayIndicator(), DecayStatus (+9 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (15): CanonLayerSelectorProps, ARC_TYPE_LABELS, CANON_TIER_COLORS, CANON_TIER_LABELS, ENTRY_TYPE_ICONS, ENTRY_TYPE_LABELS, ESCALATION_COLORS, IMPORTANCE_COLORS (+7 more)

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (13): TypingIndicator(), classifyIntent(), Intent, INTENT_KEYWORDS, CharacterDeclarationModal(), CharacterDeclarationModalProps, SceneState, SceneStatePanel() (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.23
Nodes (16): GET(), getUniverseOwnerId(), POST(), CANON_MIGRATION_MAP, CANON_TIERS, CanonTier, migrateCanonStatus(), buildMarkdown() (+8 more)

### Community 19 - "Community 19"
Cohesion: 0.35
Nodes (10): DELETE(), ensureParticipantColumns(), GET(), getFileOwnerId(), hasEntityAccess(), hasUniverseAccess(), parseBoundaries(), PUT() (+2 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (13): content, db, dirs, exists, expected, extra, indexes, missing (+5 more)

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (14): buildRelationshipGraph(), calculateEmotionVectors(), calculateStrength(), EMOTION_COLORS, getDominantEmotion(), layoutForceDirected(), parseEmotions(), RelationshipGraph (+6 more)

### Community 22 - "Community 22"
Cohesion: 0.23
Nodes (12): authenticateUser(), changePassword(), createUser(), generateToken(), hashPassword(), initializeUserDataDirectory(), validatePassword(), validateUsername() (+4 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (12): LAYERS, LayerStats, LayerViewer(), LayerViewerProps, CanonEditorPage(), Location, NPC, TabKey (+4 more)

### Community 24 - "Community 24"
Cohesion: 0.30
Nodes (13): APP_CONFIG, parseFrontmatter(), parseWikilinks(), syncDbToFrontmatter(), syncFrontmatterToDb(), DELETE(), GET(), getEntityOwnerId() (+5 more)

### Community 25 - "Community 25"
Cohesion: 0.14
Nodes (10): dbCheck, groupSession, invColNames, invExists, scColNames, scExists, sColNames, soloSession (+2 more)

### Community 26 - "Community 26"
Cohesion: 0.21
Nodes (10): AuthToken, getUserById(), getUserByUsername(), User, GET(), ensureParticipantColumns(), GET(), ensureColumn() (+2 more)

### Community 27 - "Community 27"
Cohesion: 0.18
Nodes (11): Job, JOB_TYPE_LABELS, JOB_TYPES, JobsPage(), PRIORITY_COLORS, Stats, STATUS_COLORS, StatusBadge() (+3 more)

### Community 28 - "Community 28"
Cohesion: 0.19
Nodes (9): AppLayoutShell(), AppUser, GroupSelector, NavItem, navItems, SessionSelector, UniverseSelector, IdleConfig (+1 more)

### Community 29 - "Community 29"
Cohesion: 0.17
Nodes (6): UseTTSResult, TtsCallback, TtsErrorCallback, TtsQueue, TtsRequest, TtsResult

### Community 30 - "Community 30"
Cohesion: 0.33
Nodes (11): buildSystemPrompt(), classifyIntent(), compressContext(), CompressedContext, compressLore(), compressMessages(), compressRelationships(), estimateTokens() (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.17
Nodes (9): apiRoutes, authSrc, configSrc, loginSrc, protectedPages, publicPages, rand, requests (+1 more)

### Community 32 - "Community 32"
Cohesion: 0.22
Nodes (9): Backlink, getBacklinks(), getOutgoingLinks(), parseAndResolveLinks(), parseWikilinks(), ResolvedLink, resolveWikilink(), storeBacklinks() (+1 more)

### Community 33 - "Community 33"
Cohesion: 0.31
Nodes (7): StreamingText(), StreamingTextProps, useMeasuredFPS(), useRenderLoop(), JobProgress(), JobProgressProps, FPSCounter()

### Community 34 - "Community 34"
Cohesion: 0.25
Nodes (4): api, ApiClient, ApiOptions, ApiResponse

### Community 35 - "Community 35"
Cohesion: 0.25
Nodes (6): FrontmatterData, ParsedMarkdown, parseFrontmatter(), parseSimpleYaml(), stringifyFrontmatter(), LoreEditorProps

### Community 36 - "Community 36"
Cohesion: 0.24
Nodes (8): Backlink, CANON_LABELS, CANON_OPTIONS, IMPORTANCE_OPTIONS, LoreEditorPage(), LoreFile, WikilinkSuggestion, renderMarkdownPreview()

### Community 37 - "Community 37"
Cohesion: 0.27
Nodes (9): buildFrontmatter(), DATA_DIR, dbPath, LORE_TYPES, LoreFrontmatter, LoreType, main(), parseFrontmatter() (+1 more)

### Community 38 - "Community 38"
Cohesion: 0.22
Nodes (8): ChatWindow(), ChatWindowProps, Message, MessageItem, MessageItemProps, EditHistory(), EditHistoryProps, EditRecord

### Community 39 - "Community 39"
Cohesion: 0.39
Nodes (8): DELETE(), GET(), POST(), PUT(), rowToJson(), VALID_ARC_TYPES, VALID_ESCALATION, VALID_STATUSES

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (8): Message, Participant, SceneState, Session, TurnConfig, useSession(), UseSessionResult, SessionChatPage()

### Community 42 - "Community 42"
Cohesion: 0.36
Nodes (6): DATA_DIR, Database, ensureDir(), fs, main(), path

### Community 43 - "Community 43"
Cohesion: 0.29
Nodes (6): Event, EventsPage(), Event, EVENT_TYPE_COLORS, EventTimeline(), EventTimelineProps

### Community 44 - "Community 44"
Cohesion: 0.29
Nodes (6): Invitation, Session, SessionListPage(), Session, SessionList(), SessionListProps

### Community 45 - "Community 45"
Cohesion: 0.46
Nodes (7): DELETE(), GET(), POST(), PUT(), rowToJson(), VALID_ENTRY_TYPES, VALID_IMPORTANCE

### Community 46 - "Community 46"
Cohesion: 0.29
Nodes (6): created_at, description, status, track_id, type, updated_at

### Community 47 - "Community 47"
Cohesion: 0.43
Nodes (6): DateFormatOptions, DEFAULT_OPTIONS, formatDate(), formatDateTime(), formatRelative(), formatTime()

### Community 48 - "Community 48"
Cohesion: 0.29
Nodes (6): count, db, messages, sessions, tables, users

### Community 49 - "Community 49"
Cohesion: 0.29
Nodes (7): Context Budget (8192 tokens), Incremental World Expansion, Intent Analysis System, Localized Context Design, Narrative First Philosophy, Prompt Assembly, Retrieval Pipeline

### Community 50 - "Community 50"
Cohesion: 0.33
Nodes (5): LoreBrowser(), LoreBrowserProps, LoreFile, Location, LorePage()

### Community 51 - "Community 51"
Cohesion: 0.38
Nodes (5): ConnectionStatus, LOADING_STATUS, ServiceStatus, useConnectionStatus(), ConnectionIndicator()

### Community 52 - "Community 52"
Cohesion: 0.33
Nodes (6): config, JWT_SECRET, middleware(), protectedRoutes, publicRoutes, verifyToken()

### Community 53 - "Community 53"
Cohesion: 0.33
Nodes (4): ARC_TYPE_LABELS, ESCALATION_COLORS, NarrativeThread, STATUS_COLORS

### Community 54 - "Community 54"
Cohesion: 0.47
Nodes (5): fs, main(), path, t(), title()

### Community 55 - "Community 55"
Cohesion: 0.47
Nodes (5): fs, main(), path, t(), title()

### Community 56 - "Community 56"
Cohesion: 0.33
Nodes (4): OllamaEmbeddingModel, OllamaModel, ServerSettings, TTSCacheStats

### Community 57 - "Community 57"
Cohesion: 0.33
Nodes (4): ESCALATION_COLORS, NarrativeThread, STATUS_ICONS, ThreadTrackerProps

### Community 58 - "Community 58"
Cohesion: 0.33
Nodes (4): GraphEdge, GraphNode, RelationshipGraphProps, TYPE_COLORS

### Community 59 - "Community 59"
Cohesion: 0.40
Nodes (3): UseVoicesResult, VoiceAssignment, VoiceInfo

### Community 60 - "Community 60"
Cohesion: 0.70
Nodes (4): main(), req(), t(), title()

### Community 61 - "Community 61"
Cohesion: 0.70
Nodes (4): main(), req(), t(), title()

### Community 63 - "Community 63"
Cohesion: 0.40
Nodes (3): Backlink, BacklinkPanelProps, LINK_TYPE_LABELS

### Community 64 - "Community 64"
Cohesion: 0.40
Nodes (3): LoreEntity, typeIcons, WikilinkAutocompleteProps

### Community 65 - "Community 65"
Cohesion: 0.40
Nodes (4): Participant, ParticipantList(), ParticipantListProps, TurnConfig

### Community 66 - "Community 66"
Cohesion: 0.60
Nodes (4): GET(), POST(), rowToJson(), VALID_LAYER_TYPES

### Community 69 - "Community 69"
Cohesion: 0.50
Nodes (4): Phase 1: Core Generation Loop, Phase 2: Background Processing, Phase 3: UI Components, Phase 4: Integration & Polish

### Community 77 - "Community 77"
Cohesion: 0.67
Nodes (3): formatTime(), TTSIndicator(), TTSIndicatorProps

### Community 79 - "Community 79"
Cohesion: 0.67
Nodes (3): Phase Completion Checkpointing, Quality Gates (lint/tsc/build), Test-Driven Development Workflow

### Community 81 - "Community 81"
Cohesion: 0.67
Nodes (3): Async Processing Philosophy, Background Job System, Idle-Time Narrative Enrichment

### Community 82 - "Community 82"
Cohesion: 0.67
Nodes (3): Canon Layers System, Contradiction Prevention, User Override System

### Community 83 - "Community 83"
Cohesion: 0.67
Nodes (3): 30fps Render Loop, Dark Modern Theme, Text-to-Speech System (Kokoro)

### Community 84 - "Community 84"
Cohesion: 0.67
Nodes (3): Narrative Importance Scoring, Narrative Memory System, Narrative Thread Tracking

### Community 85 - "Community 85"
Cohesion: 0.67
Nodes (3): Group Session Architecture, Multi-User Data Isolation, Real-Time Sync (SSE)

### Community 86 - "Community 86"
Cohesion: 0.67
Nodes (3): Persistent Narrative Consequence, Relationship Decay System, Relationship Memory System

## Knowledge Gaps
- **407 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+402 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `Community 3` to `Community 0`, `Community 1`, `Community 2`, `Community 4`, `Community 5`, `Community 6`, `Community 8`, `Community 11`, `Community 18`, `Community 19`, `Community 22`, `Community 24`, `Community 26`, `Community 30`, `Community 32`, `Community 39`, `Community 45`, `Community 48`, `Community 66`?**
  _High betweenness centrality (0.273) - this node is a cross-community bridge._
- **Why does `Intent` connect `Community 17` to `Community 2`, `Community 38`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `classifyIntent()` connect `Community 17` to `Community 2`, `Community 38`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `ensureGroupSupport()` (e.g. with `GET()` and `PUT()`) actually correct?**
  _`ensureGroupSupport()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _430 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.061009817671809255 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.052884615384615384 - nodes in this community are weakly interconnected._