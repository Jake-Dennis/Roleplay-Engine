'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import wikiLinkPlugin from '@flowershow/remark-wiki-link';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { checkPageSize } from '@/lib/wiki/page-split';
import { FilePlus, AlertTriangle, AlertCircle } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  frontmatter?: Record<string, any>;
  existingPages?: string[]; // For wikilink exists detection
  wikiRoute?: string; // Base route for wiki pages, default '/wiki'
  isLoading?: boolean;
  error?: string | null;
  pageTitle?: string; // For "Create this page" CTA
  onCreatePage?: (title?: string) => void;
}

function SkeletonContent() {
  return (
    <div className="wiki-content animate-pulse" role="status" aria-label="Loading page content">
      {/* Title skeleton */}
      <div className="h-8 w-3/4 bg-bg-highlight rounded mb-4" />
      {/* Frontmatter badges skeleton */}
      <div className="flex gap-2 mb-6">
        <div className="h-6 w-16 bg-bg-highlight rounded" />
        <div className="h-6 w-20 bg-bg-highlight rounded" />
        <div className="h-6 w-12 bg-bg-highlight rounded" />
      </div>
      {/* Paragraph skeletons */}
      <div className="space-y-3">
        <div className="h-3 w-full bg-bg-highlight rounded" />
        <div className="h-3 w-5/6 bg-bg-highlight rounded" />
        <div className="h-3 w-4/6 bg-bg-highlight rounded" />
      </div>
      <div className="space-y-3 mt-4">
        <div className="h-3 w-full bg-bg-highlight rounded" />
        <div className="h-3 w-3/4 bg-bg-highlight rounded" />
      </div>
      <div className="space-y-3 mt-4">
        <div className="h-3 w-5/6 bg-bg-highlight rounded" />
        <div className="h-3 w-2/3 bg-bg-highlight rounded" />
      </div>
      <span className="sr-only">Loading page content...</span>
    </div>
  );
}

function ErrorContent({ error, pageTitle, onCreatePage }: { error: string | null; pageTitle?: string; onCreatePage?: (title?: string) => void }) {
  const isNotFound = error?.toLowerCase().includes('not found') || error?.toLowerCase().includes('404');

  if (isNotFound) {
    return (
      <div className="wiki-content py-12 text-center" role="alert" aria-label="Page not found">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-bg-raised border border-border-default flex items-center justify-center">
            <FilePlus size={24} className="text-text-muted" />
          </div>
        </div>
        <p className="text-lg font-medium text-text-primary mb-1">Page not found</p>
        <p className="text-sm text-text-muted mb-4">
          {pageTitle
            ? `&ldquo;${pageTitle}&rdquo; doesn&apos;t exist yet.`
            : 'This page hasn&apos;t been created.'}
        </p>
        {onCreatePage && (
          <button
            onClick={() => onCreatePage(pageTitle)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-text-primary text-sm font-medium hover:bg-accent-hover transition-colors"
            aria-label={`Create page: ${pageTitle || 'new page'}`}
          >
            <FilePlus size={14} />
            Create this page
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="wiki-content" role="alert" aria-label="Error loading page">
      <div className="p-4 rounded-lg bg-error/10 border border-error/20">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="text-error mt-0.5 shrink-0" />
          <div>
            <p className="text-error font-medium">Error loading page</p>
            <p className="text-text-muted text-sm mt-1">{error || 'An unexpected error occurred.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders wiki markdown content with:
 * - Wiki frontmatter badge bar (title, type, status, tags)
 * - GFM tables, strikethrough, task lists
 * - [[wikilinks]] via @flowershow/remark-wiki-link
 * - Raw HTML (rehype-raw) sanitized via rehype-sanitize
 * - Loading skeleton and error states
 */
export default function MarkdownRenderer({
  content,
  frontmatter,
  existingPages = [],
  wikiRoute = '/wiki',
  isLoading = false,
  error = null,
  pageTitle,
  onCreatePage,
}: MarkdownRendererProps) {
  if (isLoading) {
    return <SkeletonContent />;
  }

  if (error) {
    return <ErrorContent error={error} pageTitle={pageTitle} onCreatePage={onCreatePage} />;
  }

  return (
    <div className="wiki-content">
      {(() => {
        const pageSize = content ? checkPageSize(content) : null;
        if (pageSize) {
          if (pageSize.overLimit) {
            return (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                  <p className="text-red-400 text-sm font-medium">
                    Page exceeds maximum size ({pageSize.size.toLocaleString()} / {pageSize.max.toLocaleString()} chars) &mdash; consider splitting
                  </p>
                </div>
              </div>
            );
          }
          if (pageSize.warning) {
            return (
              <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-yellow-400 text-sm font-medium">
                    Page approaching size limit ({pageSize.size.toLocaleString()} / {pageSize.max.toLocaleString()} chars)
                  </p>
                </div>
              </div>
            );
          }
        }
        return null;
      })()}

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
