'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react';

export interface WikiPage {
  path: string;
  title: string;
  type?: string;
}

export interface WikiQuickSwitcherProps {
  open: boolean;
  onClose: () => void;
  pages: WikiPage[];
}

const TYPE_BADGE_CLASSES: Record<string, string> = {
  entity: 'bg-info/10 text-info border border-info/20',
  concept: 'bg-success/10 text-success border border-success/20',
  source: 'bg-warning/10 text-warning border border-warning/20',
  synthesis: 'bg-accent/10 text-accent border border-accent/20',
};

const KBD_CLASS =
  'inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded bg-bg-highlight border border-border-default text-text-secondary';

const FOOTER_HINTS: ReadonlyArray<{ label: string; icon: 'up' | 'down' | 'enter' | 'text'; text?: string }> = [
  { label: 'navigate', icon: 'up' },
  { label: '', icon: 'down' },
  { label: 'open', icon: 'enter' },
  { label: 'close', icon: 'text', text: 'esc' },
];

const NO_QUERY_LIMIT = 50;

function charactersAppearInOrder(title: string, query: string): boolean {
  if (!query) return false;
  const t = title.toLowerCase();
  const q = query.toLowerCase();
  let idx = 0;
  for (let i = 0; i < t.length && idx < q.length; i++) {
    if (t[i] === q[idx]) idx++;
  }
  return idx === q.length;
}

function scorePage(page: WikiPage, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const titleLower = page.title.toLowerCase();
  const pathLower = page.path.toLowerCase();
  if (titleLower === q) return 100;
  if (titleLower.startsWith(q)) return 50;
  if (titleLower.includes(q)) return 10;
  if (pathLower.includes(q)) return 5;
  if (charactersAppearInOrder(page.title, query)) return 3;
  return 0;
}

function renderHintIcon(icon: 'up' | 'down' | 'enter' | 'text', text?: string) {
  if (icon === 'up') return <ArrowUp className="h-3 w-3" />;
  if (icon === 'down') return <ArrowDown className="h-3 w-3" />;
  if (icon === 'enter') return <CornerDownLeft className="h-3 w-3" />;
  return <>{text}</>;
}

export default function WikiQuickSwitcher({ open, onClose, pages }: WikiQuickSwitcherProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const router = useRouter();

  const results = useMemo(() => {
    if (!query) return pages.slice(0, NO_QUERY_LIMIT);
    return pages
      .map((page) => ({ page, score: scorePage(page, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.page.title.localeCompare(b.page.title);
      })
      .map((entry) => entry.page);
  }, [pages, query]);

  useEffect(() => {
    if (activeIndex >= results.length) {
      setActiveIndex(results.length > 0 ? results.length - 1 : 0);
    }
  }, [results.length, activeIndex]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => {
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const navigateToPage = useCallback(
    (path: string) => {
      onClose();
      router.push(`/wiki/${path}`);
    },
    [onClose, router]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (results.length > 0) setActiveIndex((current) => (current + 1) % results.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (results.length > 0) setActiveIndex((current) => (current - 1 + results.length) % results.length);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const page = results[activeIndex];
        if (page) navigateToPage(page.path);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [results, activeIndex, navigateToPage, onClose]
  );

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose]
  );

  const handleQueryChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setActiveIndex(0);
  }, []);

  if (!open) return null;

  const showEmpty = query.length > 0 && results.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Quick switcher"
    >
      <div className="relative w-full max-w-xl bg-bg-elevated border border-border-default rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-default">
          <Search className="h-4 w-4 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            placeholder="Search wiki pages..."
            className="flex-1 bg-transparent text-text-primary text-base placeholder:text-text-muted focus:outline-none"
            aria-label="Search wiki pages"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-bg-raised hover:text-text-primary"
            aria-label="Close quick switcher"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[400px] overflow-y-auto py-2">
          {showEmpty ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              No pages found for &lsquo;{query}&rsquo;
            </div>
          ) : (
            <>
              {query.length === 0 && <div className="px-4 pb-1 text-xxs text-text-muted">Type to search&hellip;</div>}
              {results.map((page, index) => {
                const isActive = index === activeIndex;
                return (
                  <div
                    key={page.path}
                    role="option"
                    aria-selected={isActive}
                    data-active={isActive ? 'true' : undefined}
                    className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${isActive ? 'bg-accent-muted' : 'hover:bg-bg-highlight'}`}
                    onClick={() => navigateToPage(page.path)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-text-primary text-sm font-medium truncate">{page.title}</div>
                      <div className="text-text-muted text-xs truncate">{page.path}</div>
                    </div>
                    {page.type && TYPE_BADGE_CLASSES[page.type] && (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xxs uppercase tracking-wider ${TYPE_BADGE_CLASSES[page.type]}`}>
                        {page.type}
                      </span>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-border-default text-xxs text-text-muted">
          {FOOTER_HINTS.map((hint) => (
            <span key={hint.label + hint.icon} className="flex items-center gap-1">
              <kbd className={KBD_CLASS}>{renderHintIcon(hint.icon, hint.text)}</kbd>
              {hint.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
