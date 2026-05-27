# SQLite Schema Reference — Roleplay-Engine

**Last Updated**: 2026-05-27
**Source DB**: `data/global.db` (WAL mode, foreign_keys = ON)
**Total Tables**: 40 (35 standard + 4 vec0 virtual + 1 FTS5)

---

## Table of Contents

- [1. users](#users)
- [2. sessions](#sessions)
- [3. session_participants](#session_participants)
- [4. session_config](#session_config)
- [5. universes](#universes)
- [6. timelines](#timelines)
- [7. timeline_layers](#timeline_layers)
- [8. scene_states](#scene_states)
- [9. relationships](#relationships)
- [10. relationship_evolution](#relationship_evolution)
- [11. narrative_anchors](#narrative_anchors)
- [12. entity_mentions](#entity_mentions)
- [13. contradiction_flags](#contradiction_flags)
- [14. npcs](#npcs)
- [15. locations](#locations)
- [16. events](#events)
- [17. messages](#messages)
- [18. messages_fts](#messages_fts) (FTS5 virtual)
- [19. message_summaries](#message_summaries)
- [20. narrative_threads](#narrative_threads)
- [21. job_queue](#job_queue)
- [22. embedding_index](#embedding_index)
- [23. embedding_vectors](#embedding_vectors)
- [24. backlinks](#backlinks)
- [25. wiki_versions](#wiki_versions)
- [26. entity_validations](#entity_validations)
- [27. voice_assignments](#voice_assignments)
- [28. tts_cache](#tts_cache)
- [29. token_denylist](#token_denylist)
- [30. narrative_memories](#narrative_memories)
- [31. decision_points](#decision_points)
- [32. vec_messages](#vec_messages) (vec0 virtual)
- [33. vec_npcs](#vec_npcs) (vec0 virtual)
- [34. vec_memories](#vec_memories) (vec0 virtual)
- [35. vec_lore](#vec_lore) (vec0 virtual)
- [36. groups](#groups)
- [37. group_members](#group_members)
- [38. personas](#personas)
- [39. invitations](#invitations)
- [40. message_edits](#message_edits)

---

## users

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| username | TEXT | UNIQUE, NOT NULL, COLLATE NOCASE | Login name, case-insensitive |
| password_hash | TEXT | NOT NULL | bcrypt(12) hash |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Account creation timestamp |
| last_login | DATETING | — | Last successful login |
| last_idle_t | INTEGER | DEFAULT 0 | Idle processing tier index |
| settings | TEXT | DEFAULT '{}' | JSON user preferences |
| password_changed_at | DATETIME | — | Token rotation timestamp |
| last_active_group_id | TEXT | — | Group-migrations: active group context |
| last_active_session_id | TEXT | — | Group-migrations: active session context |
| last_active_universe_id | TEXT | — | Group-migrations: active universe context |

**Created in**: `scripts/init-db.ts:26`
**Columns added by migration**: `password_changed_at` via `src/lib/schema-migrations.ts:14`; `last_active_group_id`, `last_active_session_id`, `last_active_universe_id` via `src/lib/group-migrations.ts:60-62`
**Indexes**: (none defined on users table directly)

---

## sessions

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| owner_id | TEXT | NOT NULL, FK -> users(id) | Session creator |
| name | TEXT | NOT NULL | Display name |
| universe_id | TEXT | FK -> universes(id) | Linked universe |
| timeline_id | TEXT | FK -> timelines(id) | Active timeline |
| persona_id | TEXT | FK -> personas(id) ON DELETE SET NULL | Active persona |
| status | TEXT | DEFAULT 'active' | 'active', 'paused', 'completed' |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |
| updated_at | DATETIME | — | Last update time |
| narrative_tension | REAL | DEFAULT 0.3 | Story tension level 0-1 |
| pacing | REAL | DEFAULT 0.3 | Story pacing 0-1 |
| narrative_phase | TEXT | DEFAULT 'setup' | 'setup', 'rising_action', 'climax', 'resolution' |
| active_goals | TEXT | — | JSON array of current goals |
| active_conflicts | TEXT | — | JSON array of active conflicts |
| group_id | TEXT | — | Group-migrations: owning group |
| type | TEXT | DEFAULT 'solo' | Group-migrations: 'solo', 'group', 'multi' |

**Created in**: `scripts/init-db.ts:38`
**Columns added by migration**: `narrative_tension`, `pacing`, `narrative_phase`, `active_goals`, `active_conflicts` via `src/lib/schema-migrations.ts:358-398`; `group_id`, `type` via `src/lib/group-migrations.ts:45,51`
**Indexes**: idx_sessions_owner ON sessions(owner_id); idx_sessions_status ON sessions(status); idx_sessions_universe ON sessions(universe_id)

---

## session_participants

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| session_id | TEXT | PK, FK -> sessions(id) | Composite PK |
| user_id | TEXT | PK, FK -> users(id) | Composite PK |
| role | TEXT | DEFAULT 'participant' | 'owner', 'participant', 'observer' |
| character_name | TEXT | — | In-character name |
| private_state | TEXT | — | JSON private context |
| joined_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Join timestamp |

**Created in**: `scripts/init-db.ts:56`
**Indexes**: idx_participants_user ON session_participants(user_id)

---

## session_config

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| session_id | TEXT | PK, NOT NULL, FK -> sessions(id) | Composite PK |
| key | TEXT | PK, NOT NULL | Config key name |
| value | TEXT | — | Config value |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last modified |

**Created in**: `scripts/init-db.ts:67`
**Indexes**: idx_session_config_lookup ON session_config(session_id, key)

---

## universes

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| name | TEXT | NOT NULL | Universe name |
| description | TEXT | — | Short description |
| canon_mode | TEXT | DEFAULT 'strict' | 'strict', 'flexible', 'experimental' |
| lore_source | TEXT | — | Source of lore data |
| tone | TEXT | — | Narrative tone |
| time_period | TEXT | — | Setting time period |
| boundaries | TEXT | — | JSON content boundaries |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |
| group_id | TEXT | — | Group-migrations: owning group |

**Created in**: `scripts/init-db.ts:76`
**Columns added by migration**: `time_period` via `src/lib/schema-migrations.ts:436`; `group_id` via `src/lib/group-migrations.ts:48`
**Indexes**: (none defined on universes table directly)

---

## timelines

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| universe_id | TEXT | FK -> universes(id) | Parent universe |
| era | TEXT | — | Era label |
| year | INTEGER | — | Current year in setting |
| restrictions | TEXT | — | JSON timeline constraints |
| active_factions | TEXT | — | JSON active faction list |

**Created in**: `scripts/init-db.ts:90`
**Indexes**: idx_timelines_universe ON timelines(universe_id)

---

## timeline_layers

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| timeline_id | TEXT | FK -> timelines(id) | Parent timeline |
| universe_id | TEXT | FK -> universes(id) | Parent universe |
| layer_type | TEXT | NOT NULL | 'era', 'faction', 'active_characters' |
| name | TEXT | NOT NULL | Layer name |
| description | TEXT | — | Layer description |
| start_year | INTEGER | — | Start year |
| end_year | INTEGER | — | End year |
| metadata | TEXT | — | JSON: faction details, character lists |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Created in**: `scripts/init-db.ts:101`
**Indexes**: (none defined)

---

## scene_states

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| session_id | TEXT | NOT NULL, FK -> sessions(id) | Parent session |
| active_location_id | TEXT | — | Current location UUID |
| current_goal | TEXT | — | Current scene goal |
| emotional_tone | TEXT | — | Scene emotional tone |
| current_intent | TEXT | — | Schema-migrations: character intent |
| active_npcs | TEXT | — | JSON array of active NPC UUIDs |
| active_threads | TEXT | — | JSON array of active thread UUIDs |
| scene_summary | TEXT | — | Running scene summary |
| scene_type | TEXT | — | Schema-migrations: scene category |
| scene_tension | REAL | DEFAULT 0.5 | Tension level 0-1 |
| conflict_type | TEXT | — | Schema-migrations: type of conflict |
| stakes | TEXT | — | Schema-migrations: what's at stake |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last update |

**Created in**: `scripts/init-db.ts:116`
**Columns added by migration**: `current_intent` via `src/lib/schema-migrations.ts:93`; `scene_type` via `src/lib/schema-migrations.ts:322`; `scene_tension` via `src/lib/schema-migrations.ts:332`; `conflict_type` via `src/lib/schema-migrations.ts:340`; `stakes` via `src/lib/schema-migrations.ts:350`
**Indexes**: (none defined)

---

## relationships

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| universe_id | TEXT | FK -> universes(id) | Parent universe |
| source_entity | TEXT | NOT NULL | First entity name/ID |
| target_entity | TEXT | NOT NULL | Second entity name/ID |
| emotional_state | TEXT | — | JSON emotional vector |
| shared_history | TEXT | — | Shared narrative history |
| relationship_stage | TEXT | — | Stage label |
| decay_rates | TEXT | — | JSON decay configuration |
| updated_at | DATETIME | — | Last updated |

**Created in**: `scripts/init-db.ts:134`
**Indexes**: idx_relationships_user ON relationships(user_id); idx_relationships_universe ON relationships(universe_id)

---

## relationship_evolution

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| relationship_id | TEXT | NOT NULL, FK -> relationships(id) | Parent relationship |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| emotional_state | TEXT | — | Snapshot of emotional state |
| relationship_stage | TEXT | — | Stage at this point |
| trigger_event | TEXT | — | Event that caused evolution |
| recorded_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | When recorded |

**Created in**: `scripts/init-db.ts:148`
**Indexes**: idx_relationship_evolution_rel ON relationship_evolution(relationship_id)

---

## narrative_anchors

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| relationship_id | TEXT | NOT NULL, FK -> relationships(id) | Parent relationship |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| anchor_type | TEXT | NOT NULL | Type of narrative anchor |
| description | TEXT | — | Anchor description |
| emotional_impact | TEXT | — | Emotional significance |
| irreversible | INTEGER | DEFAULT 1 | Boolean: can this be undone? |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Created in**: `scripts/init-db.ts:159`
**Indexes**: idx_narrative_anchors_rel ON narrative_anchors(relationship_id); idx_narrative_anchors_user ON narrative_anchors(user_id)

---

## entity_mentions

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| entity_name | TEXT | NOT NULL | Entity name (case-sensitive) |
| source_table | TEXT | NOT NULL | Table where entity is referenced |
| source_id | TEXT | NOT NULL | Row UUID in source table |
| frequency | INTEGER | DEFAULT 1 | Mention count |
| last_seen_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last mention timestamp |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | First mention timestamp |

**Unique constraint**: UNIQUE(user_id, entity_name, source_table, source_id)

**Created in**: `scripts/init-db.ts:171`
**Indexes**: idx_entity_mentions_user ON entity_mentions(user_id); idx_entity_mentions_name ON entity_mentions(entity_name)

---

## contradiction_flags

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| entity_name | TEXT | NOT NULL | Conflicting entity name |
| page_a | TEXT | NOT NULL | Source page A |
| page_b | TEXT | NOT NULL | Source page B |
| claim_a | TEXT | NOT NULL | Claim from page A |
| claim_b | TEXT | NOT NULL | Claim from page B |
| contradiction_type | TEXT | DEFAULT 'unknown' | Category of contradiction |
| severity | TEXT | DEFAULT 'medium' | 'low', 'medium', 'high', 'critical' |
| status | TEXT | DEFAULT 'open' | 'open', 'resolved', 'dismissed' |
| detected_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | When detected |
| resolved_at | DATETIME | — | When resolved |
| resolution | TEXT | — | Resolution notes |

**Created in**: `scripts/init-db.ts:184`
**Indexes**: idx_contradiction_flags_user ON contradiction_flags(user_id); idx_contradiction_flags_status ON contradiction_flags(status); idx_contradiction_flags_entity ON contradiction_flags(entity_name)

---

## npcs

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| universe_id | TEXT | FK -> universes(id) | Parent universe |
| name | TEXT | NOT NULL | NPC name |
| description | TEXT | — | Physical/appearance description |
| personality_traits | TEXT | — | JSON personality vector |
| behavior_patterns | TEXT | — | JSON behavior rules |
| voice_id | TEXT | — | TTS voice identifier |
| is_canon | BOOLEAN | DEFAULT 0 | Whether NPC is canon |
| evolution_log | TEXT | — | JSON evolution history |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |
| updated_at | DATETIME | — | Last update |
| canon_layer | TEXT | DEFAULT 'generated_lore' | Group-migrations: canon tier |

**Created in**: `scripts/init-db.ts:204`
**Columns added by migration**: `canon_layer` via `src/lib/group-migrations.ts:54`
**Indexes**: idx_npcs_user ON npcs(user_id); idx_npcs_universe ON npcs(universe_id)

---

## locations

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| universe_id | TEXT | FK -> universes(id) | Parent universe |
| name | TEXT | NOT NULL | Location name |
| description | TEXT | — | Location description |
| known_info | TEXT | — | Publicly known information |
| hidden_info | TEXT | — | Secret/hidden information |
| tags | TEXT | — | JSON tag array |
| is_canon | BOOLEAN | DEFAULT 0 | Whether location is canon |
| canon_layer | TEXT | DEFAULT 'generated_lore' | Canon tier |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last update |

**Created in**: `scripts/init-db.ts:220`
**Indexes**: (none defined)

---

## events

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| universe_id | TEXT | FK -> universes(id) | Parent universe |
| title | TEXT | — | Event title |
| event_type | TEXT | — | Type classification |
| description | TEXT | — | Event description |
| participants | TEXT | — | JSON array of participant IDs |
| location_id | TEXT | — | Location UUID (no FK) |
| occurred_at | TEXT | — | Vague timestamp ("age 12", "Tuesday") |
| outcome | TEXT | — | Event outcome |
| consequences | TEXT | — | Schema-migrations: aftermath |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Created in**: `scripts/init-db.ts:236`
**Columns added by migration**: `consequences` via `src/lib/schema-migrations.ts:67`
**Indexes**: idx_events_user ON events(user_id); idx_events_universe ON events(universe_id)

---

## messages

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| session_id | TEXT | NOT NULL, FK -> sessions(id) | Parent session |
| sender_id | TEXT | FK -> users(id) | Message sender |
| content | TEXT | NOT NULL | Message body |
| timestamp | DATETIME | DEFAULT CURRENT_TIMESTAMP | Sent timestamp |
| location_context | TEXT | — | JSON location reference |
| emotional_tone | TEXT | — | Detected emotional tone |
| parent_message_id | TEXT | FK -> messages(id) | Self-referential: branching/edits |
| is_deleted | INTEGER | DEFAULT 0 | Soft-delete flag |
| deleted_at | DATETIME | — | When soft-deleted |
| persona_id | TEXT | — | Group-migrations: persona UUID |

**Created in**: `scripts/init-db.ts:252`
**Columns added by migration**: `persona_id` via `src/lib/group-migrations.ts:87`
**Indexes**: idx_messages_session ON messages(session_id, timestamp); idx_messages_deleted ON messages(session_id, is_deleted); idx_messages_session_deleted_ts ON messages(session_id, is_deleted, timestamp)
**Triggers**: messages_fts_insert, messages_fts_update, messages_fts_delete (sync FTS index)

---

## messages_fts

FTS5 virtual table. Synchronized with `messages` via triggers: content search across messages.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| content | TEXT | FTS5 indexed | Message body (unindexed in FTS) |
| session_id | TEXT | FTS5 indexed | Session scope for search |
| sender_id | TEXT | FTS5 indexed | Sender filter |

**Created in**: `scripts/init-db.ts:266`
**Triggers**:
- `messages_fts_insert` (AFTER INSERT ON messages): inserts rowid, content, session_id, sender_id into messages_fts
- `messages_fts_update` (AFTER UPDATE ON messages): updates content, session_id, sender_id in messages_fts
- `messages_fts_delete` (AFTER DELETE ON messages): deletes rowid from messages_fts

---

## message_summaries

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| source_message_id | TEXT | FK -> messages(id) | Original message ID |
| message_id | TEXT | FK -> messages(id) | Schema-migrations: polymorphic access |
| summary_type | TEXT | — | Schema-migrations: 'semantic', 'emotional', 'relationship_impact', 'lore_extracted' |
| content | TEXT | — | Schema-migrations: summary content (polymorphic) |
| summary | TEXT | — | Short summary text |
| emotional_tone | TEXT | — | Detected emotional tone |
| relationship_effects | TEXT | — | JSON: impacted relationships |
| lore_extracted | TEXT | — | JSON: extracted lore facts |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Created in**: `scripts/init-db.ts:286`
**Columns added by migration**: `message_id`, `summary_type`, `content` via `src/lib/schema-migrations.ts:102-120`
**Indexes**: (none defined)

---

## narrative_threads

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| universe_id | TEXT | FK -> universes(id) | Parent universe |
| session_id | TEXT | FK -> sessions(id) | Parent session |
| title | TEXT | NOT NULL | Thread title |
| description | TEXT | — | Schema-migrations: thread description |
| arc_type | TEXT | DEFAULT 'thread' | Schema-migrations: 'thread', 'arc', 'quest', 'subplot' |
| status | TEXT | DEFAULT 'active' | 'active', 'paused', 'resolved', 'abandoned' |
| escalation_level | TEXT | DEFAULT 'low' | 'low', 'medium', 'high', 'critical' |
| name | TEXT | — | Schema-migrations: alternate name |
| summary | TEXT | — | Schema-migrations: thread summary |
| key_entities | TEXT | — | Schema-migrations: JSON entity list |
| unresolved_items | TEXT | — | Schema-migrations: JSON open questions |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |
| updated_at | DATETIME | — | Schema-migrations: last update |
| resolved_at | DATETIME | — | Schema-migrations: resolution timestamp |

**Created in**: `scripts/init-db.ts:300`
**Columns added by migration**: `description`, `arc_type`, `updated_at`, `resolved_at`, `name`, `summary`, `key_entities`, `unresolved_items` via `src/lib/schema-migrations.ts:124-177`
**Indexes**: idx_narrative_threads_universe ON narrative_threads(universe_id)

---

## job_queue

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| universe_id | TEXT | FK -> universes(id) | Scope |
| type | TEXT | NOT NULL | Job type identifier |
| priority | TEXT | DEFAULT 'medium' | 'low', 'medium', 'high', 'critical' |
| status | TEXT | DEFAULT 'queued' | 'queued', 'processing', 'completed', 'failed', 'cancelled' |
| payload | TEXT | — | JSON job parameters |
| progress | REAL | DEFAULT 0 | Progress 0-1 |
| progress_message | TEXT | — | Human-readable status |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |
| processed_at | DATETIME | — | When processing started/completed |
| error | TEXT | — | Error message if failed |
| result | TEXT | — | JSON result data |
| retry_count | INTEGER | DEFAULT 0 | Current retry attempt |
| max_retries | INTEGER | DEFAULT 3 | Maximum retry attempts |

**Created in**: `scripts/init-db.ts:320`
**Indexes**: idx_job_queue_status ON job_queue(status, priority); idx_job_queue_universe ON job_queue(universe_id); idx_jobs_user_status_type ON job_queue(user_id, status, type, priority)

---

## embedding_index

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| universe_id | TEXT | FK -> universes(id) | Scope |
| entity_type | TEXT | NOT NULL | Entity type: 'message', 'npc', 'location', 'memory', 'lore' |
| entity_id | TEXT | NOT NULL | UUID of the source entity |
| text_content | TEXT | — | Text that was embedded |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Created in**: `scripts/init-db.ts:339`
**Indexes**: idx_embedding_user_type ON embedding_index(user_id, entity_type); idx_embedding_universe ON embedding_index(universe_id)

---

## embedding_vectors

1:1 relationship with `embedding_index` via `embedding_id` PK/FK.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| embedding_id | TEXT | PK, FK -> embedding_index(id) | References embedding_index 1:1 |
| vector_data | TEXT | NOT NULL | JSON array of float embeddings |

**Created in**: `scripts/init-db.ts:350`; also created at `src/lib/embeddings.ts:158` (same schema, idempotent)
**Indexes**: (none — PK is the index)

---

## backlinks

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| universe_id | TEXT | FK -> universes(id) | Scope |
| source_type | TEXT | NOT NULL | Entity type linking FROM |
| source_id | TEXT | NOT NULL | Entity UUID linking FROM |
| target_type | TEXT | NOT NULL | Entity type linking TO |
| target_id | TEXT | NOT NULL | Entity UUID linking TO |
| link_type | TEXT | — | Relationship type label |
| context_snippet | TEXT | — | Surrounding text context |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | When link was recorded |

**Unique constraint**: UNIQUE(source_type, source_id, target_type, target_id)

**Created in**: `scripts/init-db.ts:356`
**Indexes**: idx_backlinks_universe ON backlinks(universe_id)

---

## wiki_versions

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| page_path | TEXT | NOT NULL | Wiki page file path |
| user_id | TEXT | NOT NULL, FK -> users(id) | Editor |
| version_number | INTEGER | NOT NULL | Sequential version number |
| change_summary | TEXT | — | Edit summary |
| file_snapshot_path | TEXT | — | Path to archived file snapshot |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | When version was saved |

**Created in**: `scripts/init-db.ts:371`
**Indexes**: idx_wiki_versions_page ON wiki_versions(page_path, user_id)

---

## entity_validations

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| universe_id | TEXT | FK -> universes(id) | Scope |
| entity_type | TEXT | NOT NULL | Type of validated entity |
| entity_id | TEXT | NOT NULL | UUID of validated entity |
| state | TEXT | DEFAULT 'generated_unverified' | 'generated_unverified', 'verified', 'contradicted', 'overridden' |
| generated_by | TEXT | — | LLM model or system that generated |
| validation_notes | TEXT | — | Notes from validation |
| validated_by | TEXT | — | User or system that validated |
| validated_at | DATETIME | — | When validated |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Created in**: `scripts/init-db.ts:384`
**Indexes**: idx_entity_validations_universe ON entity_validations(universe_id)

---

## voice_assignments

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| entity_type | TEXT | NOT NULL | Type of entity |
| entity_id | TEXT | NOT NULL | UUID of entity |
| voice_name | TEXT | NOT NULL | TTS voice identifier |
| voice_speed | REAL | DEFAULT 1.0 | Speech speed multiplier |
| volume | REAL | DEFAULT 0.8 | Volume level 0-1 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |
| updated_at | DATETIME | — | Last update |

**Unique constraint**: UNIQUE(user_id, entity_type, entity_id)

**Created in**: `scripts/init-db.ts:399`
**Indexes**: idx_voice_assignments_entity ON voice_assignments(user_id, entity_type, entity_id)

---

## tts_cache

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| text_hash | TEXT | NOT NULL | Hash of source text |
| voice_name | TEXT | NOT NULL | TTS voice used |
| text_content | TEXT | — | Original source text |
| audio_format | TEXT | DEFAULT 'mp3' | 'mp3', 'wav', 'ogg' |
| audio_path | TEXT | — | Path to audio file |
| duration_ms | INTEGER | — | Audio duration in ms |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Cache entry created |
| last_used | DATETIME | — | Last access timestamp |
| use_count | INTEGER | DEFAULT 1 | Access count |

**Created in**: `scripts/init-db.ts:413`
**Indexes**: idx_tts_cache_hash ON tts_cache(user_id, text_hash)

---

## token_denylist

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| token_id | TEXT | PK | JWT token ID (jti) |
| expires_at | DATETIME | NOT NULL | Token expiry (for cleanup) |

**Created in**: `scripts/init-db.ts:428`
**Indexes**: idx_denylist_expires ON token_denylist(expires_at)

---

## narrative_memories

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| session_id | TEXT | FK -> sessions(id) | Related session |
| universe_id | TEXT | FK -> universes(id) | Related universe |
| type | TEXT | NOT NULL | Memory type: 'character', 'plot', 'location', 'lore', 'relationship' |
| content | TEXT | NOT NULL | Memory content |
| importance | TEXT | — | 'low', 'medium', 'high', 'critical' |
| related_entities | TEXT | — | JSON array of related entity UUIDs |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Created in**: `scripts/init-db.ts:437`
**Indexes**: idx_memories_user_created_importance ON narrative_memories(user_id, created_at, importance)

---

## decision_points

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| session_id | TEXT | NOT NULL, FK -> sessions(id) | Parent session |
| user_id | TEXT | NOT NULL, FK -> users(id) | Player |
| prompt | TEXT | NOT NULL | Decision prompt presented to player |
| choices_made | TEXT | — | JSON: chosen path |
| narrative_context | TEXT | — | JSON: context at decision time |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | When decision was presented |

**Created in**: `scripts/init-db.ts:480`
**Indexes**: idx_decision_points_session ON decision_points(session_id); idx_decision_points_user ON decision_points(user_id)

---

## vec_messages

vec0 virtual table for vector similarity search on messages. Requires sqlite-vec extension.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| embedding | float[1024] | vec0 column | bge-m3 1024-dim embedding |
| metadata | TEXT | — | JSON: entity reference |

**Created in**: `scripts/init-db.ts:504`

---

## vec_npcs

vec0 virtual table for vector similarity search on NPCs. Requires sqlite-vec extension.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| embedding | float[1024] | vec0 column | bge-m3 1024-dim embedding |
| metadata | TEXT | — | JSON: entity reference |

**Created in**: `scripts/init-db.ts:509`

---

## vec_memories

vec0 virtual table for vector similarity search on narrative memories. Requires sqlite-vec extension.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| embedding | float[1024] | vec0 column | bge-m3 1024-dim embedding |
| metadata | TEXT | — | JSON: entity reference |

**Created in**: `scripts/init-db.ts:514`

---

## vec_lore

vec0 virtual table for vector similarity search on lore content. Requires sqlite-vec extension.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| embedding | float[1024] | vec0 column | bge-m3 1024-dim embedding |
| metadata | TEXT | — | JSON: entity reference |

**Created in**: `scripts/init-db.ts:519`

---

## groups

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| owner_id | TEXT | NOT NULL, FK -> users(id) | Group creator/owner |
| name | TEXT | NOT NULL | Group name |
| description | TEXT | — | Group description |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Created in**: `src/lib/group-migrations.ts:27`
**Indexes**: (none defined)

---

## group_members

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| group_id | TEXT | PK, FK -> groups(id) | Composite PK |
| user_id | TEXT | PK, FK -> users(id) | Composite PK |
| role | TEXT | DEFAULT 'member' | 'owner', 'admin', 'member' |
| joined_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Join timestamp |

**Created in**: `src/lib/group-migrations.ts:36`
**Indexes**: (none defined)

---

## personas

SillyTavern-style character card storage.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK -> users(id) | Owner |
| name | TEXT | NOT NULL | Persona name |
| description | TEXT | — | Character description |
| personality | TEXT | — | SillyTavern field: personality summary |
| scenario | TEXT | — | SillyTavern field: scenario context |
| first_mes | TEXT | — | SillyTavern field: first message |
| mes_example | TEXT | — | SillyTavern field: example messages |
| creator_notes | TEXT | — | SillyTavern field: creator notes |
| system_prompt | TEXT | — | SillyTavern field: system prompt override |
| post_history_instructions | TEXT | — | SillyTavern field: post-history instructions |
| tags | TEXT | — | SillyTavern field: categorization tags |
| writing_style | TEXT | — | Prose style guidance |
| avatar_url | TEXT | — | Avatar image URL |
| llm_model | TEXT | — | Preferred LLM model |
| tts_voice | TEXT | — | TTS voice override |
| is_active | INTEGER | DEFAULT 0 | Currently selected persona |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Created in**: `src/lib/group-migrations.ts:65`
**Columns added by migration**: `personality`, `scenario`, `first_mes`, `mes_example`, `creator_notes`, `system_prompt`, `post_history_instructions`, `tags` via `src/lib/group-migrations.ts:90-97` (SillyTavern compatibility fields)
**Indexes**: (none defined)

---

## invitations

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| session_id | TEXT | NOT NULL, FK -> sessions(id) | Session to join |
| inviter_id | TEXT | NOT NULL, FK -> users(id) | Who sent invitation |
| invitee_id | TEXT | NOT NULL, FK -> users(id) | Who is invited |
| status | TEXT | DEFAULT 'pending' | 'pending', 'accepted', 'declined', 'cancelled' |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Invitation timestamp |

**Unique constraint**: UNIQUE(session_id, invitee_id)

**Created in**: `src/app/api/sessions/[id]/invite/route.ts:14`
**Indexes**: (none defined)

---

## message_edits

Created ad-hoc on message edit. No explicit FK constraints (message_id/user_id are plain TEXT).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID |
| message_id | TEXT | NOT NULL | Edited message UUID (no FK) |
| user_id | TEXT | NOT NULL | Editor UUID (no FK) |
| old_content | TEXT | NOT NULL | Content before edit |
| new_content | TEXT | NOT NULL | Content after edit |
| edited_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Edit timestamp |

**Created in**: `src/app/api/sessions/[id]/messages/[messageId]/route.ts:70`
**Indexes**: (none defined)

---

## Index Master List

All 35 indexes defined across the schema:

| # | Index Name | Table | Columns | Source |
|---|------------|-------|---------|--------|
| 1 | idx_contradiction_flags_user | contradiction_flags | user_id | init-db.ts:199 |
| 2 | idx_contradiction_flags_status | contradiction_flags | status | init-db.ts:200 |
| 3 | idx_contradiction_flags_entity | contradiction_flags | entity_name | init-db.ts:201 |
| 4 | idx_wiki_versions_page | wiki_versions | page_path, user_id | init-db.ts:381 |
| 5 | idx_denylist_expires | token_denylist | expires_at | init-db.ts:434 |
| 6 | idx_messages_session | messages | session_id, timestamp | init-db.ts:450 |
| 7 | idx_messages_deleted | messages | session_id, is_deleted | init-db.ts:451 |
| 8 | idx_sessions_owner | sessions | owner_id | init-db.ts:452 |
| 9 | idx_sessions_status | sessions | status | init-db.ts:453 |
| 10 | idx_sessions_universe | sessions | universe_id | init-db.ts:454 |
| 11 | idx_participants_user | session_participants | user_id | init-db.ts:455 |
| 12 | idx_job_queue_status | job_queue | status, priority | init-db.ts:456 |
| 13 | idx_job_queue_universe | job_queue | universe_id | init-db.ts:457 |
| 14 | idx_embedding_user_type | embedding_index | user_id, entity_type | init-db.ts:458 |
| 15 | idx_embedding_universe | embedding_index | universe_id | init-db.ts:459 |
| 16 | idx_relationships_user | relationships | user_id | init-db.ts:460 |
| 17 | idx_relationships_universe | relationships | universe_id | init-db.ts:461 |
| 18 | idx_relationship_evolution_rel | relationship_evolution | relationship_id | init-db.ts:462 |
| 19 | idx_narrative_anchors_rel | narrative_anchors | relationship_id | init-db.ts:463 |
| 20 | idx_narrative_anchors_user | narrative_anchors | user_id | init-db.ts:464 |
| 21 | idx_entity_mentions_user | entity_mentions | user_id | init-db.ts:465 |
| 22 | idx_entity_mentions_name | entity_mentions | entity_name | init-db.ts:466 |
| 23 | idx_events_user | events | user_id | init-db.ts:467 |
| 24 | idx_events_universe | events | universe_id | init-db.ts:468 |
| 25 | idx_npcs_user | npcs | user_id | init-db.ts:469 |
| 26 | idx_npcs_universe | npcs | universe_id | init-db.ts:470 |
| 27 | idx_voice_assignments_entity | voice_assignments | user_id, entity_type, entity_id | init-db.ts:471 |
| 28 | idx_tts_cache_hash | tts_cache | user_id, text_hash | init-db.ts:472 |
| 29 | idx_narrative_threads_universe | narrative_threads | universe_id | init-db.ts:473 |
| 30 | idx_entity_validations_universe | entity_validations | universe_id | init-db.ts:474 |
| 31 | idx_backlinks_universe | backlinks | universe_id | init-db.ts:475 |
| 32 | idx_timelines_universe | timelines | universe_id | init-db.ts:476 |
| 33 | idx_session_config_lookup | session_config | session_id, key | init-db.ts:477 |
| 34 | idx_decision_points_session | decision_points | session_id | init-db.ts:489 |
| 35 | idx_decision_points_user | decision_points | user_id | init-db.ts:490 |
| — | idx_messages_session_deleted_ts | messages | session_id, is_deleted, timestamp | init-db.ts:493 |
| — | idx_memories_user_created_importance | narrative_memories | user_id, created_at, importance | init-db.ts:494 |
| — | idx_jobs_user_status_type | job_queue | user_id, status, type, priority | init-db.ts:495 |

Note: Last 3 are composite indexes created alongside the index batch (total 35 indexes, 38 CREATE INDEX statements including the 3 from contradiction_flags).

---

## Triggers

| Trigger | Event | Timing | Table | Action |
|---------|-------|--------|-------|--------|
| messages_fts_insert | INSERT | AFTER | messages | INSERT INTO messages_fts(rowid, content, session_id, sender_id) VALUES (new.rowid, new.content, new.session_id, new.sender_id) |
| messages_fts_update | UPDATE | AFTER | messages | UPDATE messages_fts SET content = new.content, session_id = new.session_id, sender_id = new.sender_id WHERE rowid = new.rowid |
| messages_fts_delete | DELETE | AFTER | messages | DELETE FROM messages_fts WHERE rowid = old.rowid |

---

## Foreign Key Reference Graph

### Tables referenced by others (parent tables)

| Parent Table | Referenced By (child table columns) |
|--------------|-------------------------------------|
| **users** | sessions(owner_id), session_participants(user_id), universes(user_id), timelines(user_id), timeline_layers(user_id), relationships(user_id), relationship_evolution(user_id), narrative_anchors(user_id), entity_mentions(user_id), contradiction_flags(user_id), npcs(user_id), locations(user_id), events(user_id), messages(sender_id), narrative_threads(user_id), job_queue(user_id), embedding_index(user_id), backlinks(user_id), wiki_versions(user_id), entity_validations(user_id), voice_assignments(user_id), tts_cache(user_id), narrative_memories(user_id), decision_points(user_id), groups(owner_id), group_members(user_id), personas(user_id), invitations(inviter_id), invitations(invitee_id) |
| **sessions** | session_participants(session_id), session_config(session_id), scene_states(session_id), messages(session_id), narrative_threads(session_id), decision_points(session_id), invitations(session_id), narrative_memories(session_id) |
| **universes** | sessions(universe_id), timelines(universe_id), timeline_layers(universe_id), relationships(universe_id), npcs(universe_id), locations(universe_id), events(universe_id), narrative_threads(universe_id), job_queue(universe_id), embedding_index(universe_id), backlinks(universe_id), entity_validations(universe_id), narrative_memories(universe_id) |
| **messages** | message_summaries(source_message_id), message_summaries(message_id), messages(parent_message_id) [self-ref] |
| **relationships** | relationship_evolution(relationship_id), narrative_anchors(relationship_id) |
| **embedding_index** | embedding_vectors(embedding_id) [1:1] |
| **personas** | sessions(persona_id) [ON DELETE SET NULL], messages(persona_id) |
| **groups** | group_members(group_id) |
| **timelines** | timeline_layers(timeline_id), sessions(timeline_id) |

### Tables with no incoming FK references
- token_denylist
- message_edits

### Self-referential FK
- messages(parent_message_id) -> messages(id)

### Tables with no outgoing FK references (leaf tables)
- token_denylist
- message_edits
- messages_fts (virtual)
- vec_messages (virtual)
- vec_npcs (virtual)
- vec_memories (virtual)
- vec_lore (virtual)

---

## Summary

| Table Type | Count |
|------------|-------|
| Standard tables | 35 |
| FTS5 virtual | 1 |
| vec0 virtual | 4 |
| **Total** | **40** |
| Indexes | 35 |
| Triggers | 3 |
| Unique constraints (composite) | 5 |
