"use client";

/**
 * FactionEditor Component
 *
 * CRUD for faction layers within a timeline.
 * Each faction has: name, description, alignment, territory (stored in metadata).
 */

import { useState } from "react";
import { Users, Trash2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

interface TimelineLayer {
  id: string;
  layer_type: string;
  name: string;
  description: string | null;
  start_year: number | null;
  end_year: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface FactionEditorProps {
  layers: TimelineLayer[];
  timelineId: string;
  showAddForm: boolean;
  onAddComplete: () => void;
  onCancelAdd: () => void;
  onUpdate: () => void;
}

const ALIGNMENTS = ["neutral", "good", "evil", "lawful", "chaotic", "neutral_good", "neutral_evil"] as const;

export function FactionEditor({
  layers,
  timelineId,
  showAddForm,
  onAddComplete,
  onCancelAdd,
  onUpdate,
}: FactionEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [alignment, setAlignment] = useState("neutral");
  const [territory, setTerritory] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/timelines/${timelineId}/layers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layerType: "faction",
          name: name.trim(),
          description: description.trim() || null,
          metadata: {
            alignment,
            territory: territory.trim() || null,
          },
        }),
      });
      setName("");
      setDescription("");
      setAlignment("neutral");
      setTerritory("");
      onAddComplete();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/timelines/${timelineId}/layers/${id}`, { method: "DELETE" });
    setDeleteTarget(null);
    onUpdate();
  }

  const alignmentColors: Record<string, string> = {
    neutral: "text-text-muted",
    good: "text-success",
    evil: "text-error",
    lawful: "text-accent",
    chaotic: "text-warning",
    neutral_good: "text-success",
    neutral_evil: "text-error",
  };

  if (layers.length === 0 && !showAddForm) {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-8 text-center">
        <Users className="mx-auto h-8 w-8 text-text-muted" />
        <p className="mt-2 text-xs text-text-muted">No factions defined yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="rounded-xl border border-border-default bg-bg-elevated p-4 space-y-3">
          <h3 className="text-xs font-medium text-text-primary">New Faction</h3>
          <div>
            <label className="mb-1 block text-xxs text-text-muted">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary"
              placeholder="e.g., The Northern Alliance"
              required
              maxLength={200}
            />
          </div>
          <div>
            <label className="mb-1 block text-xxs text-text-muted">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary resize-none"
              placeholder="Brief description of this faction..."
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xxs text-text-muted">Alignment</label>
              <select
                value={alignment}
                onChange={(e) => setAlignment(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary"
              >
                {ALIGNMENTS.map((a) => (
                  <option key={a} value={a}>{a.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xxs text-text-muted">Territory</label>
              <input
                value={territory}
                onChange={(e) => setTerritory(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary"
                placeholder="e.g., Northern Highlands"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancelAdd}
              className="rounded-lg bg-bg-raised px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Saving..." : "Add Faction"}
            </button>
          </div>
        </form>
      )}

      {/* Faction list */}
      {layers.map((layer) => {
        const alignment = (layer.metadata?.alignment as string | undefined) || "neutral";
        const territory = layer.metadata?.territory as string | undefined;
        return (
          <div
            key={layer.id}
            className="group rounded-lg border border-border-default bg-bg-elevated px-4 py-3 hover:bg-bg-highlight transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-accent" />
                  <h4 className="text-xs font-medium text-text-primary">{layer.name}</h4>
                  <span className={`text-xxs font-medium capitalize ${alignmentColors[alignment] || "text-text-muted"}`}>
                    {alignment.replace("_", " ")}
                  </span>
                </div>
                {layer.description && (
                  <p className="text-xxs text-text-secondary mt-1">{layer.description}</p>
                )}
                {territory && (
                  <p className="text-xxs text-text-muted mt-1">Territory: {territory}</p>
                )}
              </div>
              <button
                onClick={() => setDeleteTarget(layer.id)}
                className="shrink-0 opacity-0 group-hover:opacity-100 rounded p-1 text-text-muted transition-all hover:text-error hover:bg-bg-raised"
                title="Delete faction"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      <ConfirmationDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Delete Faction"
        message="Delete this faction? This cannot be undone."
        confirmVariant="danger"
      />
    </div>
  );
}
