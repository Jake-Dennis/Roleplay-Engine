# Initial Concept

A persistent narrative roleplay engine for AI-assisted, canon-aware storytelling. Built with Next.js, React, Tailwind CSS, and SQLite (with vector search via sqlite-vec). Uses external Ollama for LLM inference (Qwen3.5:9B) and Kokoro-82M for text-to-speech. Features include relationship memory with emotional persistence, incremental lore expansion, contradiction detection, multi-user group sessions, Obsidian-style markdown storage with wikilinks, async background job processing, and a dark-themed modern UI capped at 30fps for performance.

---

# Product Definition

## Project Name
Roleplay-Engine

## Vision
A persistent narrative roleplay engine that delivers canon-aware, AI-assisted storytelling with deep emotional continuity. The system remembers what matters—relationships, consequences, and lore—while expanding the world only when the story demands it.

## Target Users
- **Solo hobbyists** — Individual writers and roleplayers creating personal AI-assisted stories
- **RP groups** — Friends running collaborative roleplay sessions with shared narrative state
- **Worldbuilders** — Writers developing settings for novels, TTRPGs, or other creative projects

## Key Differentiator
**Relationship Memory** — The system's primary persistence layer is emotional continuity between characters. Trust, suspicion, loyalty, resentment, and shared history are tracked, evolved, and decayed over time, creating believable character dynamics that persist across sessions.

## Core Value Propositions
1. **Canon-Aware Storytelling** — AI generates content that respects established lore and franchise canon (Middle-earth, Elder Scrolls, Warhammer, original settings)
2. **Incremental World Building** — The world deepens only when narratively relevant; no full world simulation
3. **Persistent Emotional Continuity** — Relationships evolve through shared experiences and decay through inactivity
4. **Obsidian-Style Lore Management** — Markdown files with YAML frontmatter, `[[wikilink]]` backlinks, and graph relationships
5. **Multi-User Group Sessions** — Shared narrative state with per-user private thoughts and relationship views
6. **Contradiction Prevention** — AI-generated lore remains provisional until validated against immutable canon

## Design Principles
- **Narrative First** — Generate only what is narratively relevant; avoid simulation overhead
- **Localized Context** — AI receives only active scene context, not massive lore dumps
- **Async Processing** — Real-time chat never waits for embeddings, summarization, or analysis
- **User Authority** — User overrides always win; AI generation respects manual edits

## Platform Scope
Desktop web application running locally via `run.bat` on Windows. Node.js runtime with Next.js development or production server. No Docker required.

## Monetization
Open source and free. Community-driven development.

## Technical Constraints
- External Ollama server for LLM inference (Qwen3.5:9B, bge-m3 embeddings)
- External Kokoro-FastAPI server for TTS (Kokoro-82M)
- SQLite + sqlite-vec for local storage and vector search
- 8192 token context window budget per generation
- 30fps capped UI rendering for performance during long sessions
