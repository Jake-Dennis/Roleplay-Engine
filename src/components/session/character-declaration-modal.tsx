/**
 * CharacterDeclarationModal Component
 *
 * Modal for declaring a character name when joining a group session.
 *
 * Usage:
 *   <CharacterDeclarationModal
 *     open={showModal}
 *     sessionId="session-id"
 *     takenCharacters={["Aragorn", "Legolas"]}
 *     onJoin={(characterName) => handleJoin(characterName)}
 *     onCancel={() => setShowModal(false)}
 *   />
 */

"use client";

import { useState } from "react";
import { Users, X } from "lucide-react";

interface CharacterDeclarationModalProps {
  open: boolean;
  sessionId: string;
  takenCharacters: string[];
  onJoin: (characterName: string) => Promise<void>;
  onCancel: () => void;
}

export function CharacterDeclarationModal({
  open,
  sessionId: _sessionId,
  takenCharacters,
  onJoin,
  onCancel,
}: CharacterDeclarationModalProps) {
  const [characterName, setCharacterName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!characterName.trim()) return;

    setLoading(true);
    setError("");

    try {
      await onJoin(characterName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-border-default bg-bg-elevated p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">Declare Your Character</h2>
          </div>
          <button
            onClick={onCancel}
            className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-text-muted mb-4">
          Choose the character name you'll play as in this session. This name will be visible to other participants.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">
              Character name
            </label>
            <input
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
              placeholder="e.g., Aragorn, Legolas, Gandalf"
              required
              autoFocus
            />
          </div>

          {takenCharacters.length > 0 && (
            <div className="rounded-lg bg-bg-raised px-3 py-2">
              <p className="text-xxs text-text-muted mb-1">Already taken:</p>
              <div className="flex flex-wrap gap-1">
                {takenCharacters.map((name) => (
                  <span
                    key={name}
                    className="rounded bg-bg-highlight px-2 py-0.5 text-xxs text-text-muted"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-xs text-error">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs font-medium text-text-secondary hover:bg-bg-highlight"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !characterName.trim()}
              className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Joining..." : "Join Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
