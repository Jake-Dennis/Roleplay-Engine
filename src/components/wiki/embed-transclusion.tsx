'use client';

import React, { Suspense } from 'react';
import { FileQuestion, AlertCircle, Loader2 } from 'lucide-react';
import Image from 'next/image';
import dynamic from 'next/dynamic';

// Lazy import MarkdownRenderer to avoid circular dependency
const MarkdownRenderer = dynamic(
  () => import('@/components/wiki/markdown-renderer'),
  { ssr: false }
);

// Image extensions that trigger image embed rendering
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i;

export interface EmbedTransclusionProps {
  target: string;
  section?: string;
  blockId?: string;
  dimensions?: string;
  content?: string | null;
  depth?: number;
  existingPages?: string[];
  wikiRoute?: string;
  universeId?: string;
}

const MAX_EMBED_DEPTH = 2;

/**
 * Parse dimensions string like "100x200" or "100" into width/height.
 */
function parseDimensions(dimensions?: string): { width?: string; height?: string } {
  if (!dimensions) return {};
  const parts = dimensions.split('x');
  return {
    width: parts[0] || undefined,
    height: parts[1] || undefined,
  };
}

/**
 * Embed transclusion component for Obsidian-style ![[...]] syntax.
 *
 * Features:
 * - Image embeds: renders <img> with optional dimensions
 * - Note embeds: renders embedded content via MarkdownRenderer recursively
 * - Circular embed detection: depth > 2 shows placeholder
 * - Loading state: shows "Embed loading..." when content not provided
 * - Missing target: shows "Page not found" when content is empty/null
 */
export default function EmbedTransclusion({
  target,
  section,
  blockId,
  dimensions,
  content,
  depth = 0,
  existingPages,
  wikiRoute,
  universeId,
}: EmbedTransclusionProps) {
  const isImage = IMAGE_EXTENSIONS.test(target);

  // Circular embed detection
  if (depth > MAX_EMBED_DEPTH) {
    return (
      <div className="wiki-embed wiki-embed-circular border-l-4 border-l-yellow-500 bg-yellow-500/10 rounded-lg p-3 my-3">
        <div className="flex items-center gap-2 text-yellow-400 text-sm">
          <AlertCircle size={14} className="shrink-0" />
          <span>Circular embed detected: {target}</span>
        </div>
      </div>
    );
  }

  // Loading state
  if (content === undefined) {
    return (
      <div className="wiki-embed wiki-embed-loading border-l-4 border-l-blue-500 bg-blue-500/10 rounded-lg p-3 my-3">
        <div className="flex items-center gap-2 text-blue-400 text-sm">
          <Loader2 size={14} className="shrink-0 animate-spin" />
          <span>Embed loading...</span>
        </div>
      </div>
    );
  }

  // Missing target / page not found
  if (!content || content.trim() === '') {
    return (
      <div className="wiki-embed wiki-embed-missing border-l-4 border-l-red-500 bg-red-500/10 rounded-lg p-3 my-3">
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <FileQuestion size={14} className="shrink-0" />
          <span>Page not found: {target}</span>
        </div>
      </div>
    );
  }

  // Image embed
  if (isImage) {
    const { width, height } = parseDimensions(dimensions);
    return (
      <div className="wiki-embed wiki-embed-image my-4">
        <Image
          src={`/api/wiki/file?name=${encodeURIComponent(target)}&universe_id=${universeId || ''}`}
          alt={target}
          width={width ? parseInt(width, 10) : 800}
          height={height ? parseInt(height, 10) : 600}
          className="max-w-full h-auto rounded-lg border border-border"
          unoptimized
        />
      </div>
    );
  }

  // Note embed — render content with MarkdownRenderer recursively
  const nextDepth = depth + 1;

  return (
    <div className="wiki-embed wiki-embed-note border-l-4 border-l-gray-500 bg-bg-elevated/50 rounded-lg p-4 my-4 text-sm">
      {(section || blockId) && (
        <div className="text-xs text-text-muted mb-2 font-medium">
          {target}
          {section && `#${section}`}
          {blockId && `#^${blockId}`}
        </div>
      )}
      <div className="embed-content">
        <Suspense fallback={
          <div className="flex items-center gap-2 text-text-muted text-xs py-2">
            <Loader2 size={12} className="animate-spin" />
            <span>Loading embed...</span>
          </div>
        }>
          <MarkdownRenderer
            content={content}
            existingPages={existingPages}
            wikiRoute={wikiRoute}
            depth={nextDepth}
            universeId={universeId}
          />
        </Suspense>
      </div>
    </div>
  );
}
