# Roleplay-Engine

AI-assisted roleplay sessions with a self-hosted LLM, persistent wiki world-building, and real-time narrative generation.

## Quick Description

Roleplay-Engine is a Next.js application for running AI-assisted roleplay sessions using a self-hosted Ollama LLM. It combines a markdown-first wiki system for persistent world-building with real-time narrative generation, relationship tracking, and TTS voice support. The entire stack runs on your own hardware no external API dependencies.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Vector Search | sqlite-vec (optional, graceful fallback) |
| LLM | Ollama (self-hosted, default: qwen3.5:4b) |
| Text-to-Speech | Kokoro TTS (self-hosted) |
| Styling | Tailwind CSS v4 (CSS-first `@theme` tokens) |
| Auth | JWT via jose + bcryptjs |
| Markdown | gray-matter + react-markdown |
| Search | FlexSearch (full-text) |
| Graph Viz | Cytoscape.js |
| IK | `@/*` import alias mapping to `./src/*` |

## Architecture

```
Roleplay-Engine/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (app)/              # Authenticated pages (sidebar layout)
│   │   ├── api/                # REST route handlers (route.ts)
│   │   ├── login/ / register/  # Auth pages
│   │   ├── layout.tsx          # Root layout (force-dynamic, Inter font)
│   │   └── page.tsx            # Redirects to /login
│   ├── components/             # UI components by feature
│   │   ├── wiki/               # Wiki UI components
│   │   ├── chat/ / session/    # Session and chat UI
│   │   ├── timeline/ / canon/  # Timeline and canon layers
│   │   ├── relationships/      # Relationship management UI
│   │   ├── tts/                # Text-to-speech controls
│   │   └── ui/                 # Shared primitives
│   ├── hooks/                  # Custom React hooks (use-* prefix)
│   ├── lib/                    # Business logic
│   │   ├── wiki/               # Wiki subsystem (I/O, wikilinks, ingest, query)
│   │   └── jobs/               # Background job processing
│   └── middleware.ts           # Auth middleware (primarily no-op)
├── data/                       # Runtime storage (SQLite + wiki markdown)
├── docs/                       # Wiki system documentation
└── scripts/                    # Utility scripts
```

The request flow works like this. A user sends a message from the chat UI, which hits the session API. The server assembles context from recent messages, wiki lore, narrative memories, character relationships, and active story threads. It sends the assembled prompt to a local Ollama instance for generation. The response streams back to the client via SSE, with optional TTS audio generated through Kokoro. Background jobs handle wiki enrichment, memory compression, and relationship decay during idle time.

## Getting Started

### Prerequisites

- Node.js 20 or later
- An Ollama instance (local or network, defaults to 192.168.4.2:11434)
- Kokoro TTS service (optional, defaults to 192.168.4.2:8880)

### Setup

```bash
git clone <repo-url>
cd Roleplay-Engine
npm install
cp .env.example .env.local
```

Edit `.env.local` to match your environment:

- Set `JWT_SECRET` to a base64-encoded secret (generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
- Set `OLLAMA_HOST` and `OLLAMA_PORT` if your Ollama instance is not at the default address
- Set `TTS_HOST` and `TTS_PORT` if you are running Kokoro TTS
- Adjust `OLLAMA_MODEL` to your preferred model (default: qwen3.5:4b)

Start the development server:

```bash
npm run dev
```

The app binds to `http://0.0.0.0:3000` by default.

### Commands

| Command | Description |
|---------|------------|
| `npm run dev` | Start dev server (binds 0.0.0.0:3000) |
| `npm run build` | Production build |
| `npm run start` | Production server (binds 0.0.0.0) |
| `npm run lint` | Run ESLint |
| `npm run analyze` | Bundle analysis |

## Key Features

- **AI roleplay** - Self-hosted LLM generates narrative responses with context from wiki lore, memories, and relationships
- **Wiki system** - Markdown-first world-building with YAML frontmatter, stored as `.md` files in `data/{userId}/wiki/`
- **Wikilinks** - Obsidian-style `[[links]]` with cross-universe namespace support (`[[Universe::Page]]`) and 3-pass resolution
- **Relationship tracking** - Track emotional states, shared history, and evolution between characters over time
- **Narrative threading** - Active story threads with escalation tracking and resolution management
- **Timeline management** - Multi-era timelines with layers for factions, active characters, and events
- **TTS voices** - Kokoro-based text-to-speech with per-character voice assignments and caching
- **SSE streaming** - Real-time response streaming via Server-Sent Events for generation and job progress
- **Group sessions** - Multi-user sessions with turn management and participant roles
- **Wikilink graph** - Force-directed visualization of page connections via Cytoscape.js
- **Full-text search** - FlexSearch-powered search across wiki content with keyboard navigation
- **LLM operations** - Ingest external sources, query wiki content with synthesis, lint for contradictions
- **Validation workflow** - Wiki pages flow through draft (LLM-created), reviewed (human-approved), and locked (immutable) states
- **Concurrent edit protection** - Timestamp-based conflict detection with diff saving for collaborative wiki editing
- **Memory compression** - Automatic narrative memory summarization by age tier to keep context within budget
- **Background jobs** - Idle-time processing tiers (5/10/15/30 min) handle enrichment, compression, and maintenance

## Docs Index

- [AGENTS.md](AGENTS.md) - Project knowledge base with architecture, conventions, and anti-patterns
- [Schema Reference](docs/historical-evidence/omo/refs/schema.md) - Database schema, tables, indexes, and relationships
- [API Catalog](docs/historical-evidence/omo/refs/api-catalog.md) - Complete API route reference
- [Wiki Schema Reference](docs/wiki-schema-reference.md) - Frontmatter fields, page types, wikilink conventions
- [Wiki Migration Guide](docs/wiki-migration.md) - Architecture, step-by-page migration, troubleshooting

## License and Acknowledgments

Roleplay-Engine is released under the [MIT License](LICENSE). Built with Next.js, better-sqlite3, Ollama, Tailwind CSS, and open-source components. Thanks to the open-source communities behind these projects.
