"use client";

/**
 * CharacterEditor Component
 *
 * CRUD for active character layers within a timeline.
 * Each character entry has: name, role, canon status (stored in metadata).
 */

import { useState } from "react";
import { UserCheck, Trash2 } from "lucide-react";
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

interface CharacterEditorProps {
  layers: TimelineLayer[];
  timelineId: string;
  showAddForm: boolean;
  onAddComplete: () => void;
  onCancelAdd: () => void;
  onUpdate: () => void;
}

const ROLES = ["protagonist", "antagonist", "ally", "mentor", "neutral", "minor"] as const;
const CANON_STATUSES = ["canon", "soft_canon", "rumor", "non_canon"] as const;

export function CharacterEditor({
  layers,
  timelineId,
  showAddForm,
  onAddComplete,
  onCancelAdd,
  onUpdate,
}: CharacterEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [role, setRole] = useState("neutral");
  const [canonStatus, setCanonStatus] = useState("canon");
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
          layerType: "active_characters",
          name: name.trim(),
          description: description.trim() || null,
          metadata: {
            role,
            canonStatus,
          },
        }),
      });
      setName("");
      setDescription("");
      setRole("neutral");
      setCanonStatus("canon");
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

  const roleColors: Record<string, string> = {
    protagonist: "text-accent",
    antagonist: "text-error",
    ally: "text-success",
    mentor: "text-warning",
    neutral: "text-text-muted",
    minor: "text-text-muted/50",
  };

  const canonColors: Record<string, string> = {
    canon: "text-success",
    soft_canon: "text-warning",
    rumor: "text-text-muted",
    non_canon: "text-error",
  };

  if (layers.length === 0 && !showAddForm) {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-8 text-center">
        <UserCheck className="mx-auto h-8 w-8 text-text-muted" />
        <p className="mt-2 text-xs text-text-muted">No active characters defined yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="rounded-xl border border-border-default bg-bg-elevated p-4 space-y-3">
          <h3 className="text-xs font-medium text-text-primary">New Active Character</h3>
          <div>
            <label className="mb-1 block text-xxs text-text-muted">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary"
              placeholder="e.g., Haleth the Ranger"
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
              placeholder="Brief description..."
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xxs text-text-muted">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xxs text-text-muted">Canon Status</label>
              <select
                value={canonStatus}
                onChange={(e) => setCanonStatus(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-primary"
              >
                {CANON_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
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
              {saving ? "Saving..." : "Add Character"}
            </button>
          </div>
        </form>
      )}

      {/* Character list */}
      {layers.map((layer) => {
        const role = (layer.metadata?.role as string | undefined) || "neutral";
        const canonStatus = (layer.metadata?.canonStatus as string | undefined) || "canon";
        return (
          <div
            key={layer.id}
            className="group rounded-lg border border-border-default bg-bg-elevated px-4 py-3 hover:bg-bg-highlight transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-3.5 w-3.5 text-accent" />
                  <h4 className="text-xs font-medium text-text-primary">{layer.name}</h4>
                  <span className={`text-xxs font-medium capitalize ${roleColors[role] || "text-text-muted"}`}>
                    {role}
                  </span>
                  <span className={`text-xxs font-medium capitalize ${canonColors[canonStatus] || "text-text-muted"}`}>
                    {canonStatus.replace("_", " ")}
                  </span>
                </div>
                {layer.description && (
                  <p className="text-xxs text-text-secondary mt-1">{layer.description}</p>
                )}
              </div>
              <button
                onClick={() => setDeleteTarget(layer.id)}
                className="shrink-0 opacity-0 group-hover:opacity-100 rounded p-1 text-text-muted transition-all hover:text-error hover:bg-bg-raised"
                title="Delete character"
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
        title="Delete Character"
        message="Delete this character entry? This cannot be undone."
        confirmVariant="danger"
      />
    </div>
  );
}
