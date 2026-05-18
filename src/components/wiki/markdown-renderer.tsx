'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import wikiLinkPlugin from '@flowershow/remark-wiki-link';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

interface MarkdownRendererProps {
  content: string;
  frontmatter?: Record<string, any>;
  existingPages?: string[]; // For wikilink exists detection
  wikiRoute?: string; // Base route for wiki pages, default '/wiki'
  isLoading?: boolean;
  error?: string | null;
}

/**
 * Renders wiki markdown content with:
 * - Wiki frontmatter badge bar (title, type, status, tags)
 * - GFM tables, strikethrough, task lists
 * - [[wikilinks]] via @flowershow/remark-wiki-link
 * - Raw HTML (rehype-raw) sanitized via rehype-sanitize
 * - Loading and error states
 */
export default function MarkdownRenderer({
  content,
  frontmatter,
  existingPages = [],
  wikiRoute = '/wiki',
  isLoading = false,
  error = null,
}: MarkdownRendererProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-text-muted">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-error/10 border border-error/20">
        <p className="text-error font-medium">Error loading page</p>
        <p className="text-text-muted text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="wiki-content">
      {frontmatter && (
        <div className="mb-6 p-4 rounded-lg bg-bg-raised border border-border">
          <div className="flex flex-wrap gap-2">
            {frontmatter.title && (
              <span className="px-2 py-1 rounded bg-primary/10 text-primary text-sm font-medium">
                {frontmatter.title}
              </span>
            )}
            {frontmatter.type && (
              <span className="px-2 py-1 rounded bg-accent/10 text-accent text-sm">
                {frontmatter.type}
              </span>
            )}
            {frontmatter.status && (
              <span className={`px-2 py-1 rounded text-sm ${
                frontmatter.status === 'draft' ? 'bg-yellow-500/10 text-yellow-400' :
                frontmatter.status === 'reviewed' ? 'bg-blue-500/10 text-blue-400' :
                frontmatter.status === 'locked' ? 'bg-red-500/10 text-red-400' :
                'bg-gray-500/10 text-gray-400'
              }`}>
                {frontmatter.status}
              </span>
            )}
            {frontmatter.tags?.map((tag: string) => (
              <span key={tag} className="px-2 py-1 rounded bg-bg-elevated text-text-muted text-sm">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="prose prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[
            remarkGfm,
            [wikiLinkPlugin, {
              permalinks: existingPages,
              pageResolver: (name: string) => [name.toLowerCase().replace(/\s+/g, '-')],
              hrefTemplate: (permalink: string) => `${wikiRoute}/${permalink}`,
            }],
          ]}
          rehypePlugins={[rehypeRaw, rehypeSanitize]}
          components={{
            a: ({ href, className, children, ...props }) => {
              const isWikiLink = className?.includes('internal');
              const isNew = className?.includes('new');
              return (
                <a
                  href={href}
                  className={`${isWikiLink ? (isNew ? 'text-red-400 hover:text-red-300' : 'text-blue-400 hover:text-blue-300') : ''}`}
                  {...props}
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
