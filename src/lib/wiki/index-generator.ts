import { WikiPage, listWikiPages } from './file-io';
import { parseWikilinks } from './wikilinks';
import fs from 'fs';
import path from 'path';

const AUTO_GEN_HEADER = '<!-- AUTO-GENERATED, DO NOT EDIT -->\n<!-- This file is regenerated automatically when wiki pages are created, updated, or deleted. -->\n\n';

/**
 * Generate the wiki index.md from all existing wiki pages.
 * Groups pages by frontmatter type (entity, concept, source, synthesis)
 * and lists each page as a wikilink with its first line summary and status.
 *
 * Returns the path to the written index file.
 */
export function generateIndex(wikiRoot: string): string {
  const pages = listWikiPages(wikiRoot);

  const entities = pages.filter(p => p.frontmatter.type === 'entity');
  const concepts = pages.filter(p => p.frontmatter.type === 'concept');
  const sources = pages.filter(p => p.frontmatter.type === 'source');
  const synthesis = pages.filter(p => p.frontmatter.type === 'synthesis');

  const sections = [
    { title: 'Entities', pages: entities },
    { title: 'Concepts', pages: concepts },
    { title: 'Sources', pages: sources },
    { title: 'Synthesis', pages: synthesis },
  ];

  let index = AUTO_GEN_HEADER + '# Wiki Index\n\n';

  for (const section of sections) {
    index += `## ${section.title}\n\n`;
    if (section.pages.length === 0) {
      index += `*(No ${section.title.toLowerCase()} pages yet)*\n\n`;
    } else {
      for (const page of section.pages) {
        const title = page.frontmatter.title || path.basename(page.path, '.md');
        const status = page.frontmatter.status || 'draft';
        const summary = page.content.split('\n')[0]?.substring(0, 100) || '';
        index += `- [[${title}]] — ${summary} (status: ${status})\n`;
      }
      index += '\n';
    }
  }

  const indexPath = path.join(wikiRoot, 'index.md');
  fs.writeFileSync(indexPath, index, 'utf-8');
  return indexPath;
}

/**
 * Regenerate the index after a page is created or updated.
 * Delegates to generateIndex for simplicity — the full index is rebuilt each time.
 */
export function updateIndexEntry(wikiRoot: string, _pagePath: string): string {
  return generateIndex(wikiRoot);
}

/**
 * Regenerate the index after a page is deleted.
 * Delegates to generateIndex for simplicity — the full index is rebuilt each time.
 */
export function removeIndexEntry(wikiRoot: string, _pagePath: string): string {
  return generateIndex(wikiRoot);
}
