"use client";

/**
 * IndividualMemories Component
 *
 * List of narrative memories specific to this user.
 * Add/remove memories from personal view.
 * Option to promote memory to shared state (owner approval required).
 *
 * Stored in private_state.memories array.
 */

import { useState, useCallback } from "react";
import { Plus, Trash2, ArrowUpRight, Bookmark } from "lucide-react";

interface IndividualMemory {
  id: string;
  title: string;
  content: string;
  timestamp: string;
  promoted: boolean;
}

interface IndividualMemoriesProps {
  memories: IndividualMemory[];
  onChange: (memories: IndividualMemory[]) => void;
}

export function IndividualMemories({ memories, onChange }: IndividualMemoriesProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const addMemory = useCallback(() => {
    if (!newTitle.trim()) return;
    const memory: IndividualMemory = {
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      content: newContent.trim(),
      timestamp: new Date().toISOString(),
      promoted: false,
    };
    onChange([memory, ...memories]);
    setNewTitle("");
    setNewContent("");
    setShowAddForm(false);
  }, [newTitle, newContent, memories, onChange]);

  const deleteMemory = useCallback(
    (id: string) => {
      onChange(memories.filter((m) => m.id !== id));
    },
    [memories, onChange]
  );

  const promoteMemory = useCallback(
    (id: string) => {
      onChange(
        memories.map((m) =>
          m.id === id ? { ...m, promoted: true } : m
        )
      );
    },
    [memories, onChange]
  );

  function formatTimestamp(ts: string) {
    const date = new Date(ts);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div className="space-y-3">
      {/* Add button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1 rounded bg-accent/10 px-2.5 py-1.5 text-xxs font-medium text-accent transition-colors hover:bg-accent/20"
        >
          <Plus className="h-3 w-3" />
          Add Memory
        </button>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="space-y-2 rounded-lg bg-bg-elevated p-3">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Memory title..."
            className="w-full rounded border border-border-default bg-bg-base px-2 py-1.5 text-xs text-text-primary placeholder-text-muted focus:border-accent"
            autoFocus
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="What happened..."
            className="w-full rounded border border-border-default bg-bg-base px-2 py-1.5 text-xs text-text-primary placeholder-text-muted resize-none focus:border-accent"
            rows={3}
          />
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewTitle("");
                setNewContent("");
              }}
              className="rounded bg-bg-base px-2.5 py-1 text-xxs text-text-muted transition-colors hover:bg-bg-highlight"
            >
              Cancel
            </button>
            <button
              onClick={addMemory}
              disabled={!newTitle.trim()}
              className="rounded bg-accent px-2.5 py-1 text-xxs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Memory
            </button>
          </div>
        </div>
      )}

      {/* Memory list */}
      {memories.length === 0 ? (
        <div className="text-center py-6 text-text-muted">
          <Bookmark className="h-5 w-5 mx-auto mb-1 opacity-50" />
          <p className="text-xxs">No personal memories yet</p>
          <p className="text-xxs mt-1">Track events important to your character</p>
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map((memory) => (
            <div
              key={memory.id}
              className={`group rounded-lg px-3 py-2 transition-colors ${
                memory.promoted
                  ? "bg-accent/5 border border-accent/20"
                  : "bg-bg-elevated hover:bg-bg-highlight"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-medium text-text-primary">
                      {memory.title}
                    </h4>
                    {memory.promoted && (
                      <span className="text-xxs text-accent font-medium flex items-center gap-0.5">
                        <ArrowUpRight className="h-2.5 w-2.5" />
                        Promoted
                      </span>
                    )}
                  </div>
                  {memory.content && (
                    <p className="text-xxs text-text-secondary mt-0.5 whitespace-pre-wrap">
                      {memory.content}
                    </p>
                  )}
                  <span className="text-xxs text-text-muted mt-1 block">
                    {formatTimestamp(memory.timestamp)}
                  </span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!memory.promoted && (
                    <button
                      onClick={() => promoteMemory(memory.id)}
                      className="rounded p-1 text-text-muted transition-colors hover:text-accent hover:bg-bg-raised"
                      title="Promote to shared memory (requires owner approval)"
                    >
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteMemory(memory.id)}
                    className="rounded p-1 text-text-muted transition-colors hover:text-error hover:bg-bg-raised"
                    title="Delete memory"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
