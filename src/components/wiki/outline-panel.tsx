'use client';

import { useState, useEffect, useMemo } from 'react';
import { ListOrdered } from 'lucide-react';

interface OutlinePanelProps {
  content: string;
  className?: string;
}

interface HeadingItem {
  level: number;
  text: string;
  slug: string;
}

/**
 * Slugify heading text to match rehype-slug conventions:
 * lowercase, spaces → hyphens, strip non-alphanumeric except hyphens.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Parse headings from raw markdown content using regex.
 * Matches ATX headings (# through ######).
 */
function parseHeadings(content: string): HeadingItem[] {
  const regex = /^(#{1,6})\s+(.+)$/gm;
  const headings: HeadingItem[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    if (text) {
      headings.push({ level, text, slug: slugify(text) });
    }
  }
  return headings;
}

export default function OutlinePanel({ content, className = '' }: OutlinePanelProps) {
  const [activeSlug, setActiveSlug] = useState<string>('');

  const headings = useMemo(() => parseHeadings(content), [content]);

  useEffect(() => {
    if (headings.length === 0) return;

    const slugs = headings.map(h => h.slug);
    let observer: IntersectionObserver | null = null;

    const setupObserver = () => {
      const elements: HTMLElement[] = [];

      slugs.forEach(slug => {
        const el = document.getElementById(slug);
        if (el) elements.push(el);
      });

      // If elements aren't in the DOM yet (render hasn't happened), retry
      if (elements.length === 0) {
        const raf = requestAnimationFrame(() => {
          headings.forEach(h => {
            const el = document.getElementById(h.slug);
            if (el) elements.push(el);
          });
          if (elements.length > 0) initObserver(elements);
        });
        return () => cancelAnimationFrame(raf);
      }

      initObserver(elements);
    };

    const initObserver = (elements: HTMLElement[]) => {
      observer = new IntersectionObserver(
        (entries) => {
          // Find the first topmost visible heading
          let firstVisibleSlug: string | null = null;
          let firstIdx = Infinity;

          for (const entry of entries) {
            if (entry.isIntersecting) {
              const idx = slugs.indexOf(entry.target.id);
              if (idx !== -1 && idx < firstIdx) {
                firstIdx = idx;
                firstVisibleSlug = entry.target.id;
              }
            }
          }

          if (firstVisibleSlug) {
            setActiveSlug(firstVisibleSlug);
          }
        },
        {
          rootMargin: '-80px 0px -60% 0px',
          threshold: 0,
        },
      );

      elements.forEach(el => observer?.observe(el));
    };

    const teardown = setupObserver();

    return () => {
      if (typeof teardown === 'function') teardown();
      if (observer) observer.disconnect();
    };
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <div className={`text-sm ${className}`}>
      <p className="font-medium mb-2 px-2 flex items-center gap-2 text-text-primary">
        <ListOrdered size={14} className="text-text-muted shrink-0" />
        Outline
      </p>
      <nav aria-label="Table of contents">
        <ul className="space-y-0.5">
          {headings.map((h, i) => {
            const indent = 8 + (h.level - 1) * 12;
            return (
              <li key={i}>
                <button
                  onClick={() => {
                    const el = document.getElementById(h.slug);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth' });
                      setActiveSlug(h.slug);
                    }
                  }}
                  title={h.text}
                  className={`w-full text-left text-xs rounded transition-colors truncate ${
                    activeSlug === h.slug
                      ? 'text-accent bg-accent/10 font-medium'
                      : 'text-text-muted hover:text-text-primary hover:bg-bg-raised'
                  }`}
                  style={{ padding: `4px 8px 4px ${indent}px` }}
                >
                  {h.text}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
