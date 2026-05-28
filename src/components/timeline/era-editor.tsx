"use client";

/**
 * EraEditor Component
 *
 * CRUD for era layers within a timeline.
 * Each era has: name, description, start_year, end_year.
 */

import { useState } from "react";
import { Calendar, Trash2 } from "lucide-react";
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

interface EraEditorProps {
  layers: TimelineLayer[];
  timelineId: string;
  showAddForm: boolean;
  onAddComplete: () => void;
  onCancelAdd: () => void;
  onUpdate: () => void;
}

export function EraEditor({
  layers,
  timelineId,
  showAddForm,
  onAddComplete,
  onCancelAdd,
  onUpdate,
}: EraEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startYear, setStartYear] = useState("");
  const [endYear, setEndYear] = useState("");
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
          layerType: "era",
          name: name.trim(),
          description: description.trim() || null,
          startYear: startYear ? parseInt(startYear) : null,
          endYear: endYear ? parseInt(endYear) : null,
        }),
      });
      setName("");
      setDescription("");
      setStartYear("");
      setEndYear("");
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

  if (layers.length === 0 && !showAddForm) {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-8 text-center">
        <Calendar className="mx-auto h-8 w-8 text-text-muted" />
        <p className="mt-2 text-xs text-text-muted">No eras defined yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="rounded-xl border border-border-default bg-bg-elevated p-4 space-y-3">
          <h3 className="text-xs font-medium text-text-primary">New Era</h3>
          <div>
            <label className="mb-1 block text-xxs text-text-muted">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary"
              placeholder="e.g., Age of Fire"
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
              placeholder="Brief description of this era..."
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xxs text-text-muted">Start Year</label>
              <input
                type="number"
                value={startYear}
                onChange={(e) => setStartYear(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary"
                placeholder="e.g., 1000"
              />
            </div>
            <div>
              <label className="mb-1 block text-xxs text-text-muted">End Year</label>
              <input
                type="number"
                value={endYear}
                onChange={(e) => setEndYear(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary"
                placeholder="e.g., 2000"
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
              {saving ? "Saving..." : "Add Era"}
            </button>
          </div>
        </form>
      )}

      {/* Era list */}
      {layers.map((layer) => (
        <div
          key={layer.id}
          className="group rounded-lg border border-border-default bg-bg-elevated px-4 py-3 hover:bg-bg-highlight transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-accent" />
                <h4 className="text-xs font-medium text-text-primary">{layer.name}</h4>
              </div>
              {layer.description && (
                <p className="text-xxs text-text-secondary mt-1">{layer.description}</p>
              )}
              {(layer.start_year || layer.end_year) && (
                <p className="text-xxs text-text-muted mt-1">
                  {layer.start_year || "Unknown"} — {layer.end_year || "Present"}
                </p>
              )}
            </div>
            <button
              onClick={() => setDeleteTarget(layer.id)}
              className="shrink-0 opacity-0 group-hover:opacity-100 rounded p-1 text-text-muted transition-all hover:text-error hover:bg-bg-raised"
              title="Delete era"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}

      <ConfirmationDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Delete Era"
        message="Delete this era? This cannot be undone."
        confirmVariant="danger"
      />
    </div>
  );
}
