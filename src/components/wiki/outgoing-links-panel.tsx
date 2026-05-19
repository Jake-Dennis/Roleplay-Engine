'use client';
import Link from 'next/link';
import { parseWikilinks, resolveWikilink } from '@/lib/wiki/wikilinks';
import type { WikiPage } from '@/lib/wiki/file-io';
import { Link2 } from 'lucide-react';

interface OutgoingLinksPanelProps {
  content: string;
  allPages: WikiPage[];
  basePath?: string;
  universe?: string;
}

function EmptyState() {
  return (
    <div className="text-sm text-center py-6 px-4" role="status" aria-label="No outgoing links">
      <div className="flex justify-center mb-3">
        <div className="w-10 h-10 rounded-full bg-bg-raised border border-border-default flex items-center justify-center">
          <Link2 size={16} className="text-text-muted" />
        </div>
      </div>
      <p className="font-medium text-text-primary mb-1">No outgoing links</p>
      <p className="text-text-muted text-xs">This page doesn&apos;t link to any other pages yet.</p>
    </div>
  );
}

function buildPageUrl(basePath: string, page: WikiPage): string {
  const slug = page.path.split('/').pop()?.replace('.md', '') ?? '';
  return `${basePath}/${page.frontmatter.type}/${slug}`;
}

function buildLinkUrl(basePath: string, linkName: string): string {
  return `${basePath}/${linkName.toLowerCase().replace(/\s+/g, '-')}`;
}

export default function OutgoingLinksPanel({ content, allPages, basePath = '/wiki', universe }: OutgoingLinksPanelProps) {
  const allLinks = parseWikilinks(content);
  const links = allLinks.filter((link) => !link.isEmbed);

  if (links.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="text-sm">
      <p className="font-medium mb-2 px-2">
        {links.length} outgoing link{links.length !== 1 ? 's' : ''}
      </p>
      {links.map((link, i) => {
        const resolvedPath = resolveWikilink(link.name, allPages, universe);
        const resolvedPage = resolvedPath
          ? allPages.find((p) => p.path === resolvedPath)
          : undefined;
        const exists = resolvedPath !== null && resolvedPage !== undefined;

        const href =
          exists && resolvedPage
            ? buildPageUrl(basePath, resolvedPage)
            : buildLinkUrl(basePath, link.name);

        const displayText = link.alias || link.name;

        return (
          <div key={i} className="mb-2 px-2">
            <Link
              href={href}
              className={`font-medium block transition-colors ${
                exists
                  ? 'text-blue-400 hover:text-blue-300'
                  : 'text-red-400 hover:text-red-300'
              }`}
            >
              {displayText}
            </Link>
            {link.context && (
              <p className="text-xs text-text-muted mt-1 line-clamp-2">
                ...{link.context}...
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
