"use client";

import { useEffect, useState, FormEvent } from "react";
import { Plus, MapPin } from "lucide-react";
import Link from "next/link";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { LoreBrowser } from "@/components/lore/lore-browser";
import { useActiveUniverse } from "@/contexts/active-universe";
import { useApp } from "@/contexts/app-context";

interface Location {
  id: string;
  name: string;
  importance: string;
  parent_location_id: string | null;
  created_at: string;
}

export default function LorePage() {
  const { activeUniverse } = useActiveUniverse();
  const { activeGroup } = useApp();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [importance, setImportance] = useState("medium");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function loadLocations() {
    try {
      const params = new URLSearchParams();
      if (activeUniverse) params.set("universe_id", activeUniverse.id);
      if (activeGroup) params.set("group_id", activeGroup.id);
      const res = await fetch(`/api/locations${params.toString() ? "?" + params.toString() : ""}`);
      const data = await res.json();
      setLocations(data.locations || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLocations();
  }, [activeUniverse?.id, activeGroup?.id]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          importance,
          universe_id: activeUniverse?.id || null,
          group_id: activeGroup?.id || null,
        }),
      });

      if (res.ok) {
        setShowCreate(false);
        setName("");
        setImportance("medium");
        await loadLocations();
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/locations/${id}`, { method: "DELETE" });
    setLocations((prev) => prev.filter((l) => l.id !== id));
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Lore</h1>
          <p className="mt-1 text-xs text-text-muted">World-building and locations</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New Location
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
          <h2 className="text-sm font-medium text-text-primary mb-4">Add Location</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
                placeholder="e.g., The Blackwood Forest"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Importance</label>
              <select
                value={importance}
                onChange={(e) => setImportance(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {creating ? "Adding..." : "Add Location"}
            </button>
          </form>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-4 border-b border-border-default pb-2">
        <span className="text-xs font-medium text-text-accent border-b-2 border-accent pb-2 -mb-[10px]">
          Locations
        </span>
      </div>

      <LoreBrowser
        files={locations}
        loading={loading}
        onDelete={(id) => setDeleteTarget(id)}
      />

      <ConfirmationDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Delete Location"
        message="Delete this location? This cannot be undone."
        confirmVariant="danger"
      />
    </div>
  );
}
