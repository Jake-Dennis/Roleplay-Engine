"use client";

/**
 * PersonalRelationships Component
 *
 * View and override shared relationship data with personal views.
 * Store personal emotion values in private_state.relationships.
 *
 * Shows both shared and personal views side-by-side.
 */

import { useState, useCallback } from "react";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";

const EMOTIONS = [
  "trust",
  "suspicion",
  "loyalty",
  "resentment",
  "attraction",
  "respect",
  "fear",
] as const;

type EmotionKey = (typeof EMOTIONS)[number];

interface PersonalRelationship {
  targetName: string;
  emotionOverrides: Record<string, number>;
  notes: string;
}

interface PersonalRelationshipsProps {
  relationships: Record<string, PersonalRelationship>;
  onChange: (relationships: Record<string, PersonalRelationship>) => void;
}

export function PersonalRelationships({
  relationships,
  onChange,
}: PersonalRelationshipsProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTargetName, setNewTargetName] = useState("");

  const addRelationship = useCallback(() => {
    if (!newTargetName.trim()) return;
    const key = newTargetName.trim().toLowerCase();
    if (relationships[key]) return;

    onChange({
      ...relationships,
      [key]: {
        targetName: newTargetName.trim(),
        emotionOverrides: {},
        notes: "",
      },
    });
    setNewTargetName("");
    setShowAddForm(false);
  }, [newTargetName, relationships, onChange]);

  const deleteRelationship = useCallback(
    (key: string) => {
      const next = { ...relationships };
      delete next[key];
      onChange(next);
    },
    [relationships, onChange]
  );

  const updateEmotion = useCallback(
    (key: string, emotion: EmotionKey, value: number) => {
      const rel = relationships[key];
      if (!rel) return;
      onChange({
        ...relationships,
        [key]: {
          ...rel,
          emotionOverrides: { ...rel.emotionOverrides, [emotion]: value },
        },
      });
    },
    [relationships, onChange]
  );

  const updateNotes = useCallback(
    (key: string, notes: string) => {
      const rel = relationships[key];
      if (!rel) return;
      onChange({
        ...relationships,
        [key]: { ...rel, notes },
      });
    },
    [relationships, onChange]
  );

  const entries = Object.values(relationships);

  return (
    <div className="space-y-3">
      {/* Add button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1 rounded bg-accent/10 px-2.5 py-1.5 text-xxs font-medium text-accent transition-colors hover:bg-accent/20"
        >
          <Plus className="h-3 w-3" />
          Add Personal View
        </button>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="flex gap-2">
          <input
            value={newTargetName}
            onChange={(e) => setNewTargetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addRelationship();
              if (e.key === "Escape") {
                setShowAddForm(false);
                setNewTargetName("");
              }
            }}
            placeholder="Character/NPC name..."
            className="flex-1 rounded border border-border-default bg-bg-elevated px-2 py-1.5 text-xs text-text-primary placeholder-text-muted focus:border-accent"
            autoFocus
          />
          <button
            onClick={addRelationship}
            disabled={!newTargetName.trim()}
            className="rounded bg-accent px-2.5 py-1.5 text-xxs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={() => {
              setShowAddForm(false);
              setNewTargetName("");
            }}
            className="rounded bg-bg-elevated px-2.5 py-1.5 text-xxs text-text-muted transition-colors hover:bg-bg-highlight"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Relationship list */}
      {entries.length === 0 ? (
        <div className="text-center py-6 text-text-muted">
          <Heart className="h-5 w-5 mx-auto mb-1 opacity-50" />
          <p className="text-xxs">No personal relationship views yet</p>
          <p className="text-xxs mt-1">Add overrides for how you perceive characters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((rel) => {
            const key = rel.targetName.toLowerCase();
            return (
              <RelationshipCard
                key={key}
                relationship={rel}
                onUpdateEmotion={(emotion, value) =>
                  updateEmotion(key, emotion, value)
                }
                onUpdateNotes={(notes) => updateNotes(key, notes)}
                onDelete={() => deleteRelationship(key)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function RelationshipCard({
  relationship,
  onUpdateEmotion,
  onUpdateNotes,
  onDelete,
}: {
  relationship: PersonalRelationship;
  onUpdateEmotion: (emotion: EmotionKey, value: number) => void;
  onUpdateNotes: (notes: string) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg bg-bg-elevated overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-medium text-text-primary hover:text-accent transition-colors"
        >
          {expanded ? (
            <EyeOff className="h-3 w-3 text-text-muted" />
          ) : (
            <Eye className="h-3 w-3 text-accent" />
          )}
          {relationship.targetName}
        </button>
        <button
          onClick={onDelete}
          className="rounded p-1 text-text-muted transition-colors hover:text-error hover:bg-bg-raised"
          title="Remove personal view"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 py-2 space-y-3">
          {/* Emotion sliders */}
          <div className="space-y-1.5">
            <label className="text-xxs font-medium text-text-muted">
              Emotion Overrides
            </label>
            {EMOTIONS.map((emotion) => {
              const value = relationship.emotionOverrides[emotion] ?? 0;
              return (
                <div key={emotion} className="flex items-center gap-2">
                  <span className="w-20 text-xxs text-text-secondary capitalize">
                    {emotion}
                  </span>
                  <input
                    type="range"
                    min={-5}
                    max={5}
                    value={value}
                    onChange={(e) =>
                      onUpdateEmotion(emotion, parseInt(e.target.value))
                    }
                    className="flex-1 h-1 accent-accent"
                  />
                  <span
                    className={`w-6 text-right text-xxs font-mono ${
                      value > 0
                        ? "text-green-400"
                        : value < 0
                        ? "text-error"
                        : "text-text-muted"
                    }`}
                  >
                    {value > 0 ? `+${value}` : value}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xxs font-medium text-text-muted">
              Personal Notes
            </label>
            <textarea
              value={relationship.notes}
              onChange={(e) => onUpdateNotes(e.target.value)}
              placeholder="Your personal view of this relationship..."
              className="w-full rounded border border-border-default bg-bg-base px-2 py-1.5 text-xs text-text-primary placeholder-text-muted resize-none focus:border-accent mt-1"
              rows={2}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Import for empty state icon
import { Heart } from "lucide-react";
