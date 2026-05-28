/**
 * SessionCreator Component
 *
 * Form for creating a new roleplaying session.
 * Extracted from session/new/page.tsx.
 *
 * Usage:
 *   <SessionCreator
 *     universes={universes}
 *     onCreate={(data) => handleCreate(data)}
 *     onCancel={() => navigate('/session')}
 *   />
 */

"use client";

import { useState, FormEvent } from "react";
import { Sparkles } from "lucide-react";

interface Universe {
  id: string;
  name: string;
  group_id: string | null;
}

interface SessionCreateData {
  name: string;
  universe_id: string | null;
  type: string;
}

interface SessionCreatorProps {
  universes: Universe[];
  onCreate: (data: SessionCreateData) => Promise<void>;
  onCancel?: () => void;
}

export function SessionCreator({ universes, onCreate }: SessionCreatorProps) {
  const [name, setName] = useState("");
  const [universeId, setUniverseId] = useState("");
  const [type, setType] = useState("solo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filter universes based on session type
  const filteredUniverses = type === "solo"
    ? universes.filter((u) => !u.group_id)
    : universes.filter((u) => u.group_id);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!universeId) {
      setError("Please select a universe");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await onCreate({
        name: name.trim(),
        universe_id: universeId,
        type,
      });
    } catch {
      setError("Failed to create session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-6">
      <h1 className="text-base font-semibold text-text-primary">New Session</h1>
      <p className="mt-1 text-xs text-text-muted">
        Create a new roleplaying session
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs text-text-secondary">
            Session name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-accent"
            placeholder="e.g., The Lost Temple Adventure"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-text-secondary">
            Universe <span className="text-error">*</span>
          </label>
          <select
            value={universeId}
            onChange={(e) => setUniverseId(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent"
            required
          >
            <option value="">Select Universe</option>
            {filteredUniverses.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-text-secondary">Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType("solo")}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                type === "solo"
                  ? "border-accent bg-accent/10 text-text-accent"
                  : "border-border-default bg-bg-raised text-text-secondary hover:bg-bg-highlight"
              }`}
            >
              Solo
            </button>
            <button
              type="button"
              onClick={() => setType("group")}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                type === "group"
                  ? "border-accent bg-accent/10 text-text-accent"
                  : "border-border-default bg-bg-raised text-text-secondary hover:bg-bg-highlight"
              }`}
            >
              Group
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-xs text-error">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !name.trim() || !universeId}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              Creating...
            </>
          ) : (
            "Create Session"
          )}
        </button>
      </form>
    </div>
  );
}
