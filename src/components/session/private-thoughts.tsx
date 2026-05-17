"use client";

/**
 * PrivateThoughts Component
 *
 * Text area for private notes/thoughts with auto-save, timestamped entries,
 * and search/filter functionality.
 *
 * Stored in private_state.thoughts array.
 */

import { useState, useCallback } from "react";
import { Plus, Search, Trash2, Clock } from "lucide-react";

interface PrivateThought {
  id: string;
  content: string;
  timestamp: string;
}

interface PrivateThoughtsProps {
  thoughts: PrivateThought[];
  onChange: (thoughts: PrivateThought[]) => void;
}

export function PrivateThoughts({ thoughts, onChange }: PrivateThoughtsProps) {
  const [newThought, setNewThought] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const addThought = useCallback(() => {
    if (!newThought.trim()) return;
    const thought: PrivateThought = {
      id: crypto.randomUUID(),
      content: newThought.trim(),
      timestamp: new Date().toISOString(),
    };
    onChange([thought, ...thoughts]);
    setNewThought("");
  }, [newThought, thoughts, onChange]);

  const deleteThought = useCallback(
    (id: string) => {
      onChange(thoughts.filter((t) => t.id !== id));
    },
    [thoughts, onChange]
  );

  const filtered = searchQuery
    ? thoughts.filter((t) =>
        t.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : thoughts;

  function formatTimestamp(ts: string) {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  }

  return (
    <div className="space-y-3">
      {/* Add new thought */}
      <div className="flex gap-2">
        <textarea
          value={newThought}
          onChange={(e) => setNewThought(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              addThought();
            }
          }}
          placeholder="Add a private thought..."
          className="flex-1 rounded border border-border-default bg-bg-elevated px-2 py-1.5 text-xs text-text-primary placeholder-text-muted resize-none focus:border-accent"
          rows={2}
        />
        <button
          onClick={addThought}
          disabled={!newThought.trim()}
          className="self-end flex items-center gap-1 rounded bg-accent px-2.5 py-1.5 text-xxs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>

      {/* Search */}
      {thoughts.length > 3 && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text-muted" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search thoughts..."
            className="w-full rounded border border-border-default bg-bg-elevated pl-7 pr-2 py-1 text-xs text-text-primary placeholder-text-muted focus:border-accent"
          />
        </div>
      )}

      {/* Thought list */}
      {filtered.length === 0 ? (
        <div className="text-center py-6 text-text-muted">
          <MessageSquare className="h-5 w-5 mx-auto mb-1 opacity-50" />
          <p className="text-xxs">
            {searchQuery ? "No thoughts match your search" : "No private thoughts yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((thought) => (
            <div
              key={thought.id}
              className="group rounded-lg bg-bg-elevated px-3 py-2 hover:bg-bg-highlight transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="flex-1 text-xs text-text-primary whitespace-pre-wrap">
                  {thought.content}
                </p>
                <button
                  onClick={() => deleteThought(thought.id)}
                  className="opacity-0 group-hover:opacity-100 rounded p-1 text-text-muted transition-all hover:text-error hover:bg-bg-raised"
                  title="Delete thought"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-1 mt-1 text-text-muted">
                <Clock className="h-2.5 w-2.5" />
                <span className="text-xxs">{formatTimestamp(thought.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Import for empty state icon
import { MessageSquare } from "lucide-react";
