"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Loader2 } from "lucide-react";

interface SearchResult {
  id: string;
  content: string;
  snippet: string;
  senderName: string | null;
  personaName: string | null;
  timestamp: string;
}

interface ChatSearchProps {
  sessionId: string;
}

export function ChatSearch({ sessionId }: ChatSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      const frame = requestAnimationFrame(() => {
        setResults([]);
        setLoading(false);
      });
      return () => cancelAnimationFrame(frame);
    }

    const timer = setTimeout(() => {
      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      fetch(
        `/api/sessions/${sessionId}/messages/search?q=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal }
      )
        .then((res) => {
          if (!res.ok) throw new Error("Search failed");
          return res.json();
        })
        .then((data) => {
          setResults(data.results || []);
          setLoading(false);
          setIsOpen(true);
          setSelectedIndex(-1);
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            setLoading(false);
            setResults([]);
          }
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query, sessionId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Scroll to message in chat
  const scrollToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Brief highlight flash
      el.classList.add("ring-2", "ring-accent", "ring-offset-1", "ring-offset-bg-base");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-accent", "ring-offset-1", "ring-offset-bg-base");
      }, 2000);
    }
    setIsOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        scrollToMessage(results[selectedIndex].id);
      } else if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    },
    [results, selectedIndex, scrollToMessage]
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  }, []);

  const hasContent = query.trim().length > 0;
  const showDropdown = isOpen && hasContent;

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-raised px-2.5 py-1.5 transition-colors focus-within:border-accent">
        <Search size={14} className="shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => hasContent && setIsOpen(true)}
          placeholder="Search messages..."
          className="w-36 bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none sm:w-48"
          aria-label="Search chat messages"
        />
        {query && (
          <button
            onClick={handleClear}
            className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary"
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border-default bg-bg-elevated shadow-lg">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-4">
              <Loader2 size={14} className="animate-spin text-accent" />
              <span className="text-xs text-text-muted">Searching...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full border border-border-default bg-bg-raised">
                <Search size={14} className="text-text-muted" />
              </div>
              <p className="text-xs font-medium text-text-primary">
                No results for &ldquo;{query}&rdquo;
              </p>
              <p className="mt-1 text-xxs text-text-muted">
                Try different keywords
              </p>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto" role="listbox">
              <div className="border-b border-border-default px-3 py-1.5">
                <span className="text-xxs text-text-muted">
                  {results.length} result{results.length !== 1 ? "s" : ""}
                </span>
              </div>
              {results.map((result, i) => (
                <button
                  key={result.id}
                  onClick={() => scrollToMessage(result.id)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full border-b border-border-default px-3 py-2 text-left last:border-b-0 transition-colors ${
                    i === selectedIndex
                      ? "bg-bg-raised"
                      : "hover:bg-bg-raised"
                  }`}
                  role="option"
                  aria-selected={i === selectedIndex}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xxs font-medium text-text-accent">
                      {result.personaName || result.senderName || "AI Narrator"}
                    </span>
                    <span className="text-xxs text-text-muted">
                      {new Date(result.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div
                    className="mt-1 text-xs leading-snug text-text-secondary [&_mark]:bg-accent/20 [&_mark]:text-text-primary [&_mark]:rounded-sm [&_mark]:px-0.5"
                    dangerouslySetInnerHTML={{ __html: result.snippet }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
