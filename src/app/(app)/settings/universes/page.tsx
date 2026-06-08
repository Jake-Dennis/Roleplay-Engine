"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Globe, Edit2, Save, X, Check } from "lucide-react";
import Link from "next/link";

interface Universe {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  canonMode: "strict" | "loose" | "custom";
  loreSource: string | null;
  tone: string | null;
  timePeriod: string | null;
  boundaries: string[] | null;
  createdAt: string;
}

export default function UniverseSettingsPage() {
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; canonMode: "strict" | "loose" | "custom"; loreSource: string; tone: string; timePeriod: string; boundaries: string }>({ name: "", description: "", canonMode: "strict", loreSource: "", tone: "", timePeriod: "", boundaries: "" });
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/universes")
      .then((r) => r.json())
      .then((data) => { setUniverses(data.universes || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function startEdit(u: Universe) {
    setEditingId(u.id);
    setEditForm({
      name: u.name,
      description: u.description || "",
      canonMode: u.canonMode,
      loreSource: u.loreSource || "",
      tone: u.tone || "",
      timePeriod: u.timePeriod || "",
      boundaries: Array.isArray(u.boundaries) ? u.boundaries.join("\n") : "",
    });
  }

  async function handleSave(id: string) {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: editForm.name,
        description: editForm.description || null,
        canon_mode: editForm.canonMode,
        lore_source: editForm.loreSource || null,
        tone: editForm.tone || null,
        time_period: editForm.timePeriod || null,
        boundaries: editForm.boundaries ? editForm.boundaries.split("\n").map((s) => s.trim()).filter(Boolean) : [],
      };

      const res = await fetch(`/api/universes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditingId(null);
        setSavedId(id);
        setTimeout(() => setSavedId(null), 3000);
        const data = await res.json();
        setUniverses((prev) => prev.map((u) => (u.id === id ? { ...u, ...data.universe } : u)));
      }
    } finally {
      setSaving(false);
    }
  }

  function formatCanonMode(mode: string): string {
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center text-xs text-text-muted">
        Loading universes...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-base font-semibold text-text-primary">Universe Settings</h1>
          <p className="mt-1 text-xs text-text-muted">Edit canon mode, lore sources, tone, and boundaries</p>
        </div>
      </div>

      {universes.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-8 text-center">
          <Globe className="mx-auto h-8 w-8 text-text-muted mb-3" />
          <p className="text-xs text-text-muted">No universes yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {universes.map((u) => (
            <div key={u.id} className="rounded-xl border border-border-default bg-bg-elevated p-4">
              {editingId === u.id ? (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs text-text-secondary">Name</label>
                    <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-text-secondary">Description</label>
                    <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent" rows={2} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs text-text-secondary">Canon Mode</label>
                      <select value={editForm.canonMode} onChange={(e) => setEditForm({ ...editForm, canonMode: e.target.value as "strict" | "loose" | "custom" })}
                        className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary">
                        <option value="strict">Strict</option>
                        <option value="loose">Loose</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-text-secondary">Lore Source</label>
                      <input type="text" value={editForm.loreSource} onChange={(e) => setEditForm({ ...editForm, loreSource: e.target.value })}
                        className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent" placeholder="e.g. wiki, book, custom" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-text-secondary">Tone</label>
                    <input type="text" value={editForm.tone} onChange={(e) => setEditForm({ ...editForm, tone: e.target.value })}
                      className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent" placeholder="e.g. dark, humorous, epic" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-text-secondary">Time Period</label>
                    <input type="text" value={editForm.timePeriod} onChange={(e) => setEditForm({ ...editForm, timePeriod: e.target.value })}
                      className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent" placeholder="e.g. medieval, cyberpunk, 1920s" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-text-secondary">Boundaries <span className="text-text-muted">(one per line)</span></label>
                    <textarea value={editForm.boundaries} onChange={(e) => setEditForm({ ...editForm, boundaries: e.target.value })}
                      className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent" rows={3} placeholder="No magic technology&#10;No time travel" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleSave(u.id)} disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                      <Save className="h-3 w-3" /> Save
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-primary">
                      <X className="h-3 w-3" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-text-primary">{u.name}</h3>
                      {u.description && <p className="mt-0.5 text-xs text-text-muted line-clamp-1">{u.description}</p>}
                    </div>
                    <button onClick={() => startEdit(u)}
                      className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors shrink-0 ml-3">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xxs text-text-muted">
                    <span>Canon: {formatCanonMode(u.canonMode)}</span>
                    {u.tone && <span>Tone: {u.tone}</span>}
                    {u.timePeriod && <span>Period: {u.timePeriod}</span>}
                    {u.loreSource && <span>Lore: {u.loreSource}</span>}
                  </div>
                  {savedId === u.id && (
                    <div className="flex items-center gap-1.5 mt-2 rounded-lg border border-success/20 bg-success/10 px-3 py-1.5 text-xxs text-success">
                      <Check className="h-3 w-3" /> Saved
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
