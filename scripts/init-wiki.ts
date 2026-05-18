/**
 * Init Wiki
 *
 * Initializes the wiki directory structure and template files for a given user.
 * Run: npx tsx scripts/init-wiki.ts <userId>
 *
 * Creates:
 *   - data/{userId}/wiki/               (root)
 *   - data/{userId}/wiki/entities/      (characters, locations, objects)
 *   - data/{userId}/wiki/concepts/      (themes, ideas, mechanics)
 *   - data/{userId}/wiki/sources/       (raw documents, articles)
 *   - data/{userId}/wiki/synthesis/     (analyses, comparisons, answers)
 *   - data/{userId}/wiki/_review/       (draft pages pending review)
 *   - data/{userId}/wiki/WIKI_SCHEMA.md (schema definition)
 *   - data/{userId}/wiki/index.md       (auto-generated page index)
 *   - data/{userId}/wiki/log.md         (append-only operation log)
 */

import path from "path";
import fs from "fs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

const WIKI_FOLDERS = ["entities", "concepts", "sources", "synthesis", "_review"];

const WIKI_SCHEMA = `# WIKI_SCHEMA.md — LLM Wiki Schema

This file defines the structure, conventions, and rules for the LLM-maintained wiki.
All wiki pages MUST conform to this schema. LLM agents MUST read this file before
any wiki operation.

---

## 1. Page Types

| Type      | Description                                      | Folder       |
|-----------|--------------------------------------------------|--------------|
| entity    | Characters, locations, objects, factions         | entities/    |
| concept   | Themes, ideas, mechanics, lore rules             | concepts/    |
| source    | Raw documents, articles, session transcripts     | sources/     |
| synthesis | Analyses, comparisons, compound query answers    | synthesis/   |

---

## 2. Frontmatter Structure

Every wiki page MUST start with YAML frontmatter delimited by \`---\`.

\`\`\`yaml
---
title: <string>           # Required. Page title (used for wikilinks).
type: <string>            # Required. One of: entity, concept, source, synthesis.
status: <string>          # Required. One of: draft, reviewed, locked, rejected.
universe: <string>        # Optional. Universe scope for cross-universe wikilinks.
tags: <string[]>          # Optional. Comma-separated tags for categorization.
created: <ISO date>       # Auto. ISO 8601 date of creation.
updated: <ISO date>       # Auto. ISO 8601 date of last modification.
---
\`\`\`

### Status Values

| Status   | Meaning                                                  |
|----------|----------------------------------------------------------|
| draft    | LLM-generated, pending user review. Can be modified.     |
| reviewed | User-approved. Can still be modified with care.          |
| locked   | Immutable. LLM cannot modify without explicit override.  |
| rejected | Content rejected by user. Should be archived or deleted. |

---

## 3. Wikilink Conventions

| Format                        | Meaning                              |
|-------------------------------|--------------------------------------|
| \`[[Page Name]]\`              | Same-universe link                   |
| \`[[Universe::Page Name]]\`    | Cross-universe link                  |
| \`[[Page Name|display text]]\` | Aliased link                         |
| \`![[embed]]\`                 | File embed (image, document preview) |

### Rules

- Wikilinks are case-insensitive for resolution but preserve display casing.
- Cross-universe wikilinks MUST use the \`Universe::\` prefix to avoid ambiguity.
- Broken wikilinks (target page does not exist) MUST be flagged during lint.
- Orphan pages (no inbound AND no outbound links) MUST be flagged during lint.

---

## 4. Folder Organization

\`\`\`
data/{userId}/wiki/
├── entities/          # Characters, locations, objects, factions
│   ├── haleth.md
│   ├── riverwood.md
│   └── ...
├── concepts/          # Themes, ideas, mechanics
│   ├── magic-system.md
│   ├── political-structure.md
│   └── ...
├── sources/           # Raw documents, articles, transcripts
│   ├── session-2024-12-01.md
│   └── ...
├── synthesis/         # Analyses, comparisons, answers
│   ├── faction-relations-overview.md
│   └── ...
├── _review/           # Draft pages pending user review
│   ├── pending-haleth-backstory.md
│   └── ...
├── WIKI_SCHEMA.md     # This file
├── index.md           # Auto-generated page index (DO NOT EDIT)
└── log.md             # Append-only operation log
\`\`\`

### Naming Conventions

- File names: lowercase, kebab-case, max 100 characters.
- Sub-pages: \`entity-name/subject.md\` for split pages (e.g., \`haleth/background.md\`).
- No spaces or special characters in filenames (only \`[a-z0-9_-]\`).

---

## 5. Validation Workflow

LLM-generated pages start as \`draft\` and progress through review:

\`\`\`
draft ──(user approves)──► reviewed ──(user locks)──► locked
  │
  └──(user rejects)──► rejected
\`\`\`

- **draft**: LLM can create and modify freely. Changes highlighted for user review.
- **reviewed**: User has approved. LLM can modify with justification logged.
- **locked**: Immutable. LLM MUST NOT modify. Only user can unlock.
- **rejected**: Content rejected. LLM should not reference without explicit request.

---

## 6. Lint Rules

The lint pass (\`lintWiki\`) checks:

| Rule                    | Description                                        | Severity |
|-------------------------|----------------------------------------------------|----------|
| Orphan pages            | Pages with zero inbound AND zero outbound links    | warning  |
| Broken wikilinks        | \`[[Link]]\` where target page does not exist        | error    |
| Contradictions          | Two+ pages making conflicting claims about same topic | error  |
| Missing cross-refs      | Related concepts/entities not linked               | warning  |
| Max page size exceeded  | Page exceeds 10,000 character limit                | warning  |

### Enforcement

- Errors MUST be resolved before a page can be promoted from \`draft\` to \`reviewed\`.
- Warnings are advisory. LLM should attempt to resolve them.
- Contradiction resolution: newer source overrides older, but both versions are preserved in the log.
`;

const INDEX_TEMPLATE = `<!-- AUTO-GENERATED, DO NOT EDIT -->
<!-- This file is regenerated automatically when wiki pages are created, updated, or deleted. -->

# Wiki Index

## Entities

*(No entity pages yet)*

## Concepts

*(No concept pages yet)*

## Sources

*(No source pages yet)*

## Synthesis

*(No synthesis pages yet)*
`;

const LOG_TEMPLATE = `# Wiki Operation Log

<!--
Format:
## [YYYY-MM-DD] <operation> | <title>

Operations: ingest, query, lint, create, update, delete, migrate, validate, lock, reject

Each entry contains:
  - Timestamp (ISO 8601 date)
  - Operation type
  - Page title or reference
  - Brief description of what was done and why

This file is append-only. Do not edit or delete entries.
-->

*No operations logged yet.*
`;

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFileIfMissing(filePath: string, content: string) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`  Created: ${path.relative(process.cwd(), filePath)}`);
  } else {
    console.log(`  Exists:  ${path.relative(process.cwd(), filePath)}`);
  }
}

function main() {
  const userId = process.argv[2];

  if (!userId) {
    console.error("Usage: npx tsx scripts/init-wiki.ts <userId>");
    console.error("  <userId>  The user ID to initialize the wiki for.");
    process.exit(1);
  }

  const wikiRoot = path.join(DATA_DIR, userId, "wiki");

  console.log(`\nInitializing wiki for user: ${userId}`);
  console.log(`  Wiki root: ${wikiRoot}\n`);

  // 1. Create folder structure
  ensureDir(wikiRoot);
  for (const folder of WIKI_FOLDERS) {
    ensureDir(path.join(wikiRoot, folder));
  }
  console.log(`  Folders:  ${WIKI_FOLDERS.join(", ")}`);

  // 2. Create WIKI_SCHEMA.md
  writeFileIfMissing(path.join(wikiRoot, "WIKI_SCHEMA.md"), WIKI_SCHEMA);

  // 3. Create index.md
  writeFileIfMissing(path.join(wikiRoot, "index.md"), INDEX_TEMPLATE);

  // 4. Create log.md
  writeFileIfMissing(path.join(wikiRoot, "log.md"), LOG_TEMPLATE);

  console.log(`\nWiki initialized successfully at: ${wikiRoot}`);
  console.log("Run `npx tsx scripts/init-wiki.ts <anotherUserId>` for additional users.\n");
}

main();
