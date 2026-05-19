This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## LLM Wiki System

This project includes an LLM-maintained wiki for world-building. Wiki content is stored as markdown files with YAML frontmatter, organized under `data/{userId}/wiki/`.

### Key Features

- **Markdown-first** - All content is readable without the application
- **Wikilinks** - Obsidian-style `[[links]]` with cross-universe namespace support (`[[Universe::Page]]`)
- **Graph view** - Force-directed visualization of page connections (Cytoscape.js)
- **Backlinks** - Dynamic backlink panel derived from wikilink graph
- **Full-text search** - FlexSearch-powered search with keyboard navigation
- **LLM operations** - Ingest sources, query with synthesis, lint for contradictions
- **Validation workflow** - Frontmatter status: draft -> reviewed -> locked
- **Concurrent edit protection** - Timestamp-based conflict detection with diff saving

### Documentation

- [Migration Guide](docs/wiki-migration.md) - Architecture, step-by-step migration, troubleshooting
- [Schema Reference](docs/wiki-schema-reference.md) - Frontmatter fields, page types, wikilink conventions
