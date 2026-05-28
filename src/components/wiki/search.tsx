'use client';
import { useState, useEffect, useRef } from 'react';
import FlexSearch from 'flexsearch';
import type { Document as FlexSearchDocument, DocumentValue } from 'flexsearch';
import { useRouter } from 'next/navigation';
import { Search as SearchIcon, X, Loader2, AlertCircle, Lightbulb } from 'lucide-react';

interface WikiPage {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

interface SearchDocument {
  path: string;
  content: string;
  title: string;
  type: string;
  [key: string]: DocumentValue | DocumentValue[];
}

interface SearchProps {
  pages: WikiPage[];
  basePath?: string;
  isSearching?: boolean;
  error?: string | null;
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="px-3 py-4 text-center" role="status" aria-label={`No results for ${query}`}>
      <div className="flex justify-center mb-2">
        <div className="w-8 h-8 rounded-full bg-bg-raised border border-border-default flex items-center justify-center">
          <SearchIcon size={14} className="text-text-muted" />
        </div>
      </div>
      <p className="text-sm font-medium text-text-primary mb-1">No results for &ldquo;{query}&rdquo;</p>
      <div className="flex items-start gap-1.5 mt-2 text-xs text-text-muted">
        <Lightbulb size={12} className="mt-0.5 shrink-0 text-warning" />
        <div className="text-left">
          <p>Try different keywords</p>
          <p>Check spelling</p>
        </div>
      </div>
    </div>
  );
}

function SearchError({ error }: { error: string }) {
  return (
    <div className="px-3 py-4 text-center" role="alert" aria-label="Search unavailable">
      <div className="flex justify-center mb-2">
        <div className="w-8 h-8 rounded-full bg-error/10 flex items-center justify-center">
          <AlertCircle size={14} className="text-error" />
        </div>
      </div>
      <p className="text-sm font-medium text-text-primary mb-1">Search unavailable</p>
      <p className="text-xs text-text-muted">{error}</p>
    </div>
  );
}

function SearchLoading() {
  return (
    <div className="flex items-center justify-center gap-2 px-3 py-4" role="status" aria-label="Searching">
      <Loader2 size={14} className="animate-spin text-accent" />
      <span className="text-xs text-text-muted">Searching...</span>
    </div>
  );
}

export default function Search({ pages, basePath = '/wiki', isSearching = false, error }: SearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const indexRef = useRef<FlexSearchDocument<SearchDocument> | null>(null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [indexError, setIndexError] = useState<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const index = new FlexSearch.Document({
          document: {
            id: 'path',
            index: ['content', 'title'],
            store: ['title', 'type', 'path'],
          },
          tokenize: 'forward',
        });

        pages.forEach(page => {
          index.add({
            path: page.path,
            content: page.content,
            title: (page.frontmatter.title as string | undefined) || '',
            type: (page.frontmatter.type as string | undefined) || 'entity',
          });
        });

        indexRef.current = index as unknown as FlexSearchDocument<SearchDocument>;
        setIndexError(null);
      } catch {
        setIndexError('Failed to initialize search index');
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [pages]);

  useEffect(() => {
    if (!query || !indexRef.current) {
      setResults([]);
      return;
    }

    try {
      const searchResults = indexRef.current.search(query, { limit: 10 });
      const hits = (Array.isArray(searchResults) ? searchResults : [])
        .flatMap((r: { result?: unknown[] }) => r.result || []) as string[];
      setResults(hits.slice(0, 10));
      setIsOpen(true);
      setSelectedIndex(-1);
    } catch {
      setResults([]);
      setIndexError('Search query failed');
    }
  }, [query]);

  // Map singular frontmatter type to plural folder name used in wiki directory structure
  const typeToFolder: Record<string, string> = {
    entity: 'entities',
    concept: 'concepts',
    source: 'sources',
    synthesis: 'synthesis',
  };

  const navigateToPage = (path: string) => {
    const page = pages.find(p => p.path === path);
    if (page) {
      const pageType = page.frontmatter.type as string | undefined;
      const folderName = typeToFolder[pageType ?? ''] || pageType || '';
      router.push(`${basePath}/${folderName}/${page.path.split('/').pop()?.replace('.md', '')}`);
      setIsOpen(false);
      setQuery('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      navigateToPage(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const displayError = error || indexError;
  const showDropdown = isOpen && (results.length > 0 || query.length > 0 || isSearching || !!displayError);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-raised border border-border-default rounded-lg">
        <SearchIcon size={16} className="text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => (results.length > 0 || query.length > 0) && setIsOpen(true)}
          placeholder="Search wiki pages..."
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-text-muted"
          aria-label="Search wiki pages"
        />
        {query && (
          <button onClick={() => { setQuery(''); setIsOpen(false); setResults([]); }} aria-label="Clear search">
            <X size={14} className="text-text-muted" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-bg-elevated border border-border-default rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto" role="listbox" aria-label="Search results">
          {displayError ? (
            <SearchError error={displayError} />
          ) : isSearching ? (
            <SearchLoading />
          ) : query.length > 0 && results.length === 0 ? (
            <NoResults query={query} />
          ) : (
            results.map((result, i) => {
              const page = pages.find(p => p.path === result);
              if (!page) return null;
              return (
                <button
                  key={result}
                  onClick={() => navigateToPage(result)}
                  className={`w-full text-left px-3 py-2 hover:bg-bg-raised ${i === selectedIndex ? 'bg-bg-raised' : ''}`}
                  role="option"
                  aria-selected={i === selectedIndex}
                >
                  <p className="text-sm font-medium">{(page.frontmatter.title as string) || page.path.split('/').pop()?.replace('.md', '')}</p>
                  <p className="text-xs text-text-muted">{page.frontmatter.type as string} &bull; {page.path.split('/').pop()}</p>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
