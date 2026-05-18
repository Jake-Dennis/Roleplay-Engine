# Technology Stack

## Core Language
- **TypeScript 5** — Strict mode enabled, ES2017 target, module resolution via bundler

## Framework
- **Next.js 16.2.6** — App Router architecture, route groups `(app)`, API routes, server components
- **React 19.2.6** — Component library with hooks, contexts, and custom providers

## Styling & UI
- **Tailwind CSS 4** — Utility-first CSS with `@tailwindcss/postcss`
- **Lucide React** — Icon library
- **clsx** — Conditional className utility

## Database & Storage
- **better-sqlite3** — Synchronous SQLite driver for Node.js
- **sqlite-vec** — SQLite extension for vector similarity search
- **Filesystem** — Markdown files with YAML frontmatter for lore storage (Obsidian-style)

## Authentication & Security
- **bcryptjs** — Password hashing (cost factor 12)
- **jose** — JWT token generation and verification
- **jsonwebtoken** — JWT utilities
- **HttpOnly cookies** — XSS-protected token storage

## AI & External Services
- **Ollama** — External inference server (192.168.4.2:11434)
  - Generation model: `qwen3.5:9b`
  - Embedding model: `bge-m3`
- **Kokoro-FastAPI** — External TTS server (192.168.4.2:8880)
  - Model: Kokoro-82M
  - OpenAI-compatible Speech endpoint

## Development & Quality
- **ESLint 9** — Linting with `eslint-config-next`
- **TypeScript strict mode** — No `any` suppression, isolated modules

## Runtime & Deployment
- **Node.js** — Windows runtime via `run.bat`
- **npm** — Package manager
- **No Docker** — Direct Node.js execution
