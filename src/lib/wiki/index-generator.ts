import { WikiPage, listWikiPages } from './file-io';
import { parseWikilinks } from './wikilinks';
import fs from 'fs';
import path from 'path';

const AUTO_GEN_HEADER = '<!-- AUTO-GENERATED, DO NOT EDIT -->\n<!-- This file is regenerated automatically when wiki pages are created, updated, or deleted. -->\n\n';

/**
 * Must match SCAN_FOLDERS in file-io.ts.
 * Add new folders here to automatically include them in the index.
 */
const SCAN_FOLDERS = ["entities", "concepts", "sources", "synthesis", "_review"];

const SECTION_LABELS: Record<string, string> = {
  entities: "Entities",
  concepts: "Concepts",
  sources: "Sources",
  synthesis: "Synthesis",
  _review: "Under Review",
};

/**
 * Normalize a file path to use forward slashes for cross-platform folder matching.
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Generate the wiki index.md from all existing wiki pages.
 * Groups pages by their source folder (matching SCAN_FOLDERS)
 * and lists each page as a wikilink with its first line summary and status.
 *
 * Returns the path to the written index file.
 */
export function generateIndex(wikiRoot: string): string {
  const pages = listWikiPages(wikiRoot);

  const assigned = new Set<string>();
  let index = AUTO_GEN_HEADER + '# Wiki Index\n\n';

  for (const folder of SCAN_FOLDERS) {
    const label = SECTION_LABELS[folder] || folder.charAt(0).toUpperCase() + folder.slice(1);
    const folderPages = pages.filter(p => {
      const match = normalizePath(p.path).includes(`/${folder}/`);
      if (match) assigned.add(p.path);
      return match;
    });

    index += `## ${label}\n\n`;
    if (folderPages.length === 0) {
      index += `*(No ${label.toLowerCase()} pages yet)*\n\n`;
    } else {
      for (const page of folderPages) {
        const title = page.frontmatter.title || path.basename(page.path, '.md');
        const status = page.frontmatter.status || 'draft';
        const summary = page.content.split('\n')[0]?.substring(0, 100) || '';
        index += `- [[${title}]] — ${summary} (status: ${status})\n`;
      }
      index += '\n';
    }
  }

  // Catch any pages not in a known folder (edge case / future-proofing)
  const otherPages = pages.filter(p => !assigned.has(p.path));
  if (otherPages.length > 0) {
    index += `## Other\n\n`;
    for (const page of otherPages) {
      const title = page.frontmatter.title || path.basename(page.path, '.md');
      const status = page.frontmatter.status || 'draft';
      const summary = page.content.split('\n')[0]?.substring(0, 100) || '';
      index += `- [[${title}]] — ${summary} (status: ${status})\n`;
    }
    index += '\n';
  }

  const indexPath = path.join(wikiRoot, 'index.md');
  fs.writeFileSync(indexPath, index, 'utf-8');
  return indexPath;
}

let pendingRegeneration = false;
let lastRegeneration = 0;
const DEBOUNCE_MS = 5000;

/**
 * Debounced wrapper around generateIndex().
 * Only runs once per 5 seconds even if called multiple times.
 */
export function generateIndexDebounced(wikiRoot: string): void {
  const now = Date.now();
  if (pendingRegeneration || now - lastRegeneration < DEBOUNCE_MS) {
    return; // Already scheduled or too soon
  }
  pendingRegeneration = true;
  setImmediate(() => {
    try {
      generateIndex(wikiRoot);
      lastRegeneration = Date.now();
    } finally {
      pendingRegeneration = false;
    }
  });
}

/**
 * Regenerate the index after a page is created or updated.
 * Delegates to generateIndex for simplicity — the full index is rebuilt each time.
 */
export function updateIndexEntry(wikiRoot: string): string {
  return generateIndex(wikiRoot);
}

/**
 * Regenerate the index after a page is deleted.
 * Delegates to generateIndex for simplicity — the full index is rebuilt each time.
 */
export function removeIndexEntry(wikiRoot: string): string {
  return generateIndex(wikiRoot);
}
