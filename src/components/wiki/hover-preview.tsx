'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, FileX } from 'lucide-react';
import { CONTENT_LIMITS } from '@/lib/config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreviewData {
  title: string;
  content: string; // first 200 chars, plain text
  type?: string;
  status?: string;
}

interface HoverPreviewProps {
  visible: boolean;
  position: { x: number; y: number };
  loading: boolean;
  data: PreviewData | null;
  error: string | null;
}

interface UseHoverPreviewReturn {
  visible: boolean;
  position: { x: number; y: number };
  loading: boolean;
  data: PreviewData | null;
  error: string | null;
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
  onMouseMove: (e: React.MouseEvent) => void;
}

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

const previewCache = new Map<string, PreviewData>();

// ---------------------------------------------------------------------------
// Markdown stripping utility
// ---------------------------------------------------------------------------

function stripMarkdown(text: string): string {
  return text
    // Remove code blocks (```...```)
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    .replace(/`[^`]*`/g, '')
    // Remove images ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Remove links [text](url)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic markers
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
    // Remove strikethrough
    .replace(/~~([^~]+)~~/g, '$1')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove blockquote markers
    .replace(/^>\s?/gm, '')
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Collapse multiple whitespace
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Viewport clamping
// ---------------------------------------------------------------------------

const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 200;
const OFFSET = 12;

function clampPosition(x: number, y: number): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let clampedX = x + OFFSET;
  let clampedY = y + OFFSET;

  // If popover would overflow right edge, position to the left of cursor
  if (clampedX + POPOVER_WIDTH > vw) {
    clampedX = x - POPOVER_WIDTH - OFFSET;
  }

  // If popover would overflow bottom edge, position above cursor
  if (clampedY + POPOVER_HEIGHT > vh) {
    clampedY = y - POPOVER_HEIGHT - OFFSET;
  }

  // Ensure never off-screen on left/top
  clampedX = Math.max(0, clampedX);
  clampedY = Math.max(0, clampedY);

  return { x: clampedX, y: clampedY };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHoverPreview(
  target: string,
  existingPages: string[] = [],
  universeId?: string
): UseHoverPreviewReturn {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Normalize target to a slug for API lookup
  const normalizeTarget = useCallback((name: string): string => {
    let slug = name.trim().toLowerCase().replace(/\s+/g, '-');
    // Strip .md extension if present
    if (slug.endsWith('.md')) slug = slug.slice(0, -3);
    // Handle Universe::Page notation
    if (slug.includes('::')) {
      slug = slug.split('::').slice(1).join('::');
    }
    return slug;
  }, []);

  const fetchPreview = useCallback(async () => {
    const slug = normalizeTarget(target);

    // Check cache first
    if (previewCache.has(slug)) {
      const cached = previewCache.get(slug)!;
      if (mountedRef.current) {
        setData(cached);
        setLoading(false);
        setError(null);
      }
      return;
    }

    // Check if page exists in known pages list (compare basename, not full path)
    const exists = existingPages.some((page) => {
      const basename = page.split('/').pop()?.split('\\').pop() || '';
      const normalized = basename.toLowerCase().replace(/\s+/g, '-').replace(/\.md$/, '');
      return normalized === slug;
    });

    if (!exists) {
      if (mountedRef.current) {
        setError('Page not found');
        setLoading(false);
      }
      return;
    }

    if (mountedRef.current) {
      setLoading(true);
    }

    try {
      const response = await fetch(`/api/wiki/${encodeURIComponent(slug)}?universe_id=${universeId || ''}`);

      if (!response.ok) {
        if (mountedRef.current) {
          setError('Page not found');
          setLoading(false);
        }
        return;
      }

      const json = await response.json();
      const page = json.page;

      if (!page) {
        if (mountedRef.current) {
          setError('Page not found');
          setLoading(false);
        }
        return;
      }

      const rawContent = page.content || '';
      const plainText = stripMarkdown(rawContent);
      const preview: PreviewData = {
        title: page.frontmatter?.title || slug,
        content: plainText.slice(0, CONTENT_LIMITS.SHORT),
        type: page.frontmatter?.type,
        status: page.frontmatter?.status,
      };

      // Store in cache
      previewCache.set(slug, preview);

      if (mountedRef.current) {
        setData(preview);
        setLoading(false);
        setError(null);
      }
    } catch {
      if (mountedRef.current) {
        setError('Failed to load preview');
        setLoading(false);
      }
    }
  }, [target, existingPages, normalizeTarget, universeId]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onMouseEnter = useCallback(
    () => {
      clearTimer();
      timerRef.current = setTimeout(() => {
        setVisible(true);
        fetchPreview();
      }, 300);
    },
    [fetchPreview, clearTimer]
  );

  const onMouseLeave = useCallback(() => {
    clearTimer();
    setVisible(false);
  }, [clearTimer]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    setPosition(clampPosition(e.clientX, e.clientY));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  return {
    visible,
    position,
    loading,
    data,
    error,
    onMouseEnter,
    onMouseLeave,
    onMouseMove,
  };
}

// ---------------------------------------------------------------------------
// Portal Component
// ---------------------------------------------------------------------------

/**
 * Hover preview popover rendered as a portal at document.body.
 * Displays a preview of a wiki page when hovering over a wikilink.
 */
export default function HoverPreview({ visible, position, loading, data, error }: HoverPreviewProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!mounted || !visible) return null;

  const popover = (
    <div
      role="tooltip"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 9999,
        width: `${POPOVER_WIDTH}px`,
        maxHeight: `${POPOVER_HEIGHT}px`,
      }}
      className="pointer-events-none rounded-lg border border-border-default bg-bg-elevated shadow-xl overflow-hidden"
    >
      {loading && (
        <div className="flex items-center justify-center gap-2 p-4">
          <Loader2 size={16} className="animate-spin text-accent" />
          <span className="text-sm text-text-muted">Loading preview...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4">
          <FileX size={16} className="text-error shrink-0" />
          <span className="text-sm text-error">{error}</span>
        </div>
      )}

      {data && (
        <div className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-sm font-semibold text-text-primary truncate flex-1">
              {data.title}
            </h4>
            {data.type && (
              <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-xs font-medium shrink-0">
                {data.type}
              </span>
            )}
            {data.status && (
              <span
                className={`px-1.5 py-0.5 rounded text-xs shrink-0 ${
                  data.status === 'draft'
                    ? 'bg-yellow-500/10 text-yellow-400'
                    : data.status === 'reviewed'
                      ? 'bg-blue-500/10 text-blue-400'
                      : data.status === 'locked'
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-gray-500/10 text-gray-400'
                }`}
              >
                {data.status}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted leading-relaxed line-clamp-4">
            {data.content}
            {data.content.length >= 200 ? '...' : ''}
          </p>
        </div>
      )}
    </div>
  );

  return createPortal(popover, document.body);
}
