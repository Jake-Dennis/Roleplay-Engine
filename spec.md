# Persistent Narrative RP Engine Specification

## Overview

This system is a persistent narrative roleplay engine designed for:

- Long-form AI-assisted roleplay
    
- Canon-aware storytelling
    
- Persistent relationship memory
    
- Incremental lore expansion
    
- Retrieval-driven context assembly
    
- Structured narrative continuity
    
- Obsidian-style lore organization
    
- Asynchronous memory processing
    

The system is NOT a world simulator.

The goal is to create:

- believable narrative continuity,
    
- emotionally persistent characters,
    
- evolving storylines,
    
- localized lore generation,
    
- responsive roleplay.
    

The system should behave like an adaptive narrative framework rather than a simulated autonomous universe.

---

# Core Philosophy

## Narrative First

The system should generate and expand only what is narratively relevant.

The world exists through:

- player interaction,
    
- story progression,
    
- relationship development,
    
- discoveries,
    
- narrative relevance.
    

The system should avoid:

- full world simulation,
    
- unnecessary procedural systems,
    
- global autonomous activity,
    
- simulated economies,
    
- excessive background world state.
    

---

# Design Principles

## 1. Localized Context

The AI should only receive:

- active scene context,
    
- nearby lore,
    
- relevant memories,
    
- active relationships,
    
- recent events,
    
- current narrative threads.
    

Avoid:

- massive lore dumps,
    
- entire world context,
    
- irrelevant historical information,
    
- inactive NPC retrieval.
    

---

## 2. Incremental Expansion

The world should deepen only when the story touches it.

Example:

Initial retrieval:

```yaml
location:
  name: Eastern Ruins

known_information:
  - Orc activity
```

Later expansion:

```yaml
location:
  name: Eastern Ruins

known_information:
  - Orc activity
  - Ancient watchtower

hidden_information:
  - Buried Angmar relics
```

---

## 3. Persistent Narrative Consequence

The most important persistence layer is:

- what happened,
    
- who remembers,
    
- how relationships changed,
    
- unresolved tensions,
    
- emotional continuity.
    

Not simulation state.

---

# High-Level Architecture

```text
Universe Layer
    ↓
Timeline Layer
    ↓
Location Layer
    ↓
Scene State
    ↓
Relationship Memory
    ↓
Narrative Memory
    ↓
Context Retrieval
    ↓
Prompt Assembly
    ↓
LLM Generation
    ↓
Memory Persistence
    ↓
Background Enrichment
```

---

# Core Stack

|Layer|Technology|
|---|---|
|Frontend|Next.js|
|UI|React|
|Styling|Tailwind CSS|
|Icons|Lucide React|
|Database|SQLite|
|Embeddings|BGE-M3|
|Generation|Qwen3.5:9B|
|Inference Backend|Ollama|
|Vector Search|sqlite-vec|
|Storage|Markdown + SQLite metadata|

---

# System Scope

## The System Is

- a narrative engine,
    
- a continuity system,
    
- a lore memory framework,
    
- an adaptive storytelling platform.
    

## The System Is NOT

- a civilization simulator,
    
- a real-time world simulator,
    
- a procedural economy engine,
    
- an autonomous AI world.
    

---

# Canon-Aware Roleplay

The system should support settings such as:

- Middle-earth
    
- Elder Scrolls
    
- Warhammer
    
- Original settings
    

Canon consistency should remain a primary concern.

---

# Canon Layers

```yaml
canon_layers:
  immutable_canon:
    description: Cannot be contradicted

  soft_canon:
    description: Expandable without contradiction

  generated_lore:
    description: AI-generated persistent lore

  session_lore:
    description: Temporary narrative state

  rumors:
    description: Unverified information
```

---

# Narrative Retrieval Philosophy

The system retrieves:

- nearby lore,
    
- active NPCs,
    
- relationship memories,
    
- recent events,
    
- active narrative threads,
    
- current scene context.
    

The system avoids retrieving:

- distant irrelevant lore,
    
- inactive characters,
    
- unrelated timelines,
    
- unnecessary world detail.
    

---

# Core Narrative Layers

# 1. Universe Layer

Defines:

- franchise,
    
- world rules,
    
- canon source,
    
- tone,
    
- narrative boundaries.
    

Example:

```yaml
universe:
  name: Middle-earth
  canon_mode: strict
  lore_source: Tolkien
```

---

# 2. Timeline Layer

Defines:

- current era,
    
- timeline restrictions,
    
- available factions,
    
- active canon characters.
    

Example:

```yaml
time_period:
  age: Third Age
  year: 3018
```

---

# 3. Scene State Layer

Tracks immediate narrative context.

Example:

```yaml
scene_state:
  active_location: Bree
  current_goal: Track Orcs

  active_npcs:
    - Haleth
    - Innkeeper

  emotional_tone: tense

  active_threads:
    - Missing traveler
    - Orc sightings
```

This layer is critical for:

- immersion,
    
- pacing,
    
- contextual retrieval,
    
- immediate continuity.
    

---

# 4. Relationship Memory

Relationships are one of the most important persistence systems.

The system should track:

- trust,
    
- suspicion,
    
- loyalty,
    
- resentment,
    
- attraction,
    
- respect,
    
- fear,
    
- shared history.
    

Example:

```yaml
relationship:
  source: haleth
  target: player

emotional_state:
  trust: 0.62
  suspicion: 0.31
  respect: 0.71

shared_history:
  - Shared campfire discussion
  - Orc ambush survival

relationship_stage:
  cautious_allies
```

---

# 5. Narrative Memory

The system stores:

- discoveries,
    
- conversations,
    
- betrayals,
    
- promises,
    
- mysteries,
    
- important choices,
    
- consequences.
    

Narrative memory should be prioritized over raw chat logs.

---

# Chat Memory Structure

## Raw Messages

Stores exact conversation history.

Example:

```yaml
message:
  id: MSG-1042
  speaker: player
  location: bree

content: |
  Have Rangers passed through recently?
```

---

## Message Summaries

Every important interaction should generate:

- semantic summaries,
    
- emotional summaries,
    
- relationship impact summaries,
    
- lore extraction summaries.
    

Example:

```yaml
message_summary:
  source_message: MSG-1042

summary:
  Player questioned the innkeeper about Rangers.

emotional_tone:
  - cautious
  - investigative

relationship_effects:
  trust: +0.02

lore_extracted:
  - Rangers seen east of Bree
```

---

# Narrative Thread Tracking

The system should track:

- unresolved mysteries,
    
- active tensions,
    
- recurring conflicts,
    
- ongoing investigations,
    
- emotional arcs.
    

Example:

```yaml
narrative_state:
  active_arc:
    id: ARC-104

  unresolved_threads:
    - Missing Ranger
    - Eastern Orc activity

  escalation_level: medium
```

---

# Retrieval Pipeline

```text
User Input
    ↓
Intent Analysis
    ↓
Scene Retrieval
    ↓
Relationship Retrieval
    ↓
Narrative Memory Retrieval
    ↓
Lore Retrieval
    ↓
Context Compression
    ↓
Prompt Assembly
    ↓
LLM Generation
```

---

# Prompt Assembly

Prompt sections should remain structured.

Example:

```text
[SCENE STATE]

[ACTIVE RELATIONSHIPS]

[RELEVANT MEMORIES]

[ACTIVE LORE]

[CANON RULES]

[NARRATIVE RULES]

[USER INPUT]
```

---

# Async Processing Philosophy

Realtime roleplay should remain lightweight.

The chat system should NEVER wait for:

- embeddings,
    
- summarization,
    
- indexing,
    
- lore expansion,
    
- memory compression,
    
- relationship analysis.
    

These should happen asynchronously.

---

# Realtime RP Pipeline

```text
User Message
    ↓
Retrieve Relevant Context
    ↓
Generate Narrative Response
    ↓
Store Raw Interaction
    ↓
Queue Background Jobs
    ↓
Return Response Immediately
```

---

# Background Job System

The system should use asynchronous workers.

Example job:

```yaml
queue_task:
  id: TASK-2041
  type: summarize_message
  priority: high
  status: queued
```

---

# Recommended Job Types

## High Priority

- summarize_message
    
- generate_embedding
    
- relationship_analysis
    
- extract_event
    

## Medium Priority

- expand_location_lore
    
- enrich_npc
    
- generate_rumors
    
- thread_analysis
    

## Idle-Time Only

- memory_compression
    
- lore_deepening
    
- archival_processing
    
- retrieval_optimization
    

---

# Important Constraint

Background jobs should NOT simulate the world.

They should only:

- enrich narrative potential,
    
- deepen active lore,
    
- improve continuity,
    
- strengthen retrieval quality.
    

---

# Idle-Time Narrative Enrichment

When the user is inactive, workers may:

- deepen active locations,
    
- expand rumors,
    
- enrich NPC backstories,
    
- compress memories,
    
- refine relationship summaries,
    
- optimize retrieval indexes.
    

The world should not autonomously evolve without narrative relevance.

---

# Relationship-Centric Retrieval

The system should organize interaction histories by relationship.

Example:

```text
Relationships/
 ├── Player_Haleth/
 ├── Player_Aragorn/
 ├── Haleth_Aragorn/
```

This allows retrieval of:

- emotional history,
    
- recurring topics,
    
- unresolved tensions,
    
- shared experiences,
    
- trust progression.
    

---

# Obsidian-Style Storage

The system should support:

- markdown entries,
    
- backlinks,
    
- metadata,
    
- graph relationships,
    
- editable lore,
    
- user overrides.
    

Example structure:

```text
Universe/
Locations/
NPCs/
Relationships/
Events/
Sessions/
StoryArcs/
Canon/
Generated/
```

---

# Metadata Example

```yaml
id: npc_haleth
name: Haleth
entity_type: npc
canon_status: generated
location: bree
importance: medium

relationships:
  - player
  - bree_rangers

tags:
  - ranger
  - suspicious
```

---

# Narrative Importance System

Every entity and memory should track importance.

Example:

```yaml
narrative_importance:
  emotional: high
  local: medium
  canonical: low
  recency: high
```

This helps:

- retrieval ranking,
    
- memory compression,
    
- archival decisions,
    
- context prioritization.
    

---

# Relationship Evolution

Relationships should evolve dynamically.

Example:

```yaml
relationship_decay:
  trust_decay_rate: low
  resentment_decay_rate: very_low
```

The goal is persistent emotional continuity.

---

# Contradiction Prevention

Generated lore should remain provisional until validated.

Example:

```yaml
state: generated_unverified
```

Later:

```yaml
state: validated
```

This prevents:

- canon corruption,
    
- recursive hallucinations,
    
- unstable lore continuity.
    

---

# Core System Goal

The final experience should feel like:

- a persistent narrative world,
    
- a living lore archive,
    
- an adaptive storytelling engine,
    
- a canon-aware roleplay framework.
    

The system should:

- remember important narrative events,
    
- preserve emotional continuity,
    
- retrieve only relevant context,
    
- expand lore carefully,
    
- maintain consistent characterization,
    
- generate only what the story needs.
    

The system should NOT attempt to fully simulate reality.