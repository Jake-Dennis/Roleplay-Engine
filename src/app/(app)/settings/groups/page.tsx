"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Users, Edit2, Save, X, Trash2, Plus, Check } from "lucide-react";
import Link from "next/link";

interface Group {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  createdAt: string;
  ownerName: string;
  memberCount: number;
  sessionCount: number;
  universeCount: number;
}

export default function GroupSettingsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/groups")
      .then((r) => r.json())
      .then((data) => { setGroups(data.groups || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function startEdit(g: Group) {
    setEditingId(g.id);
    setEditName(g.name);
    setEditDescription(g.description || "");
  }

  async function handleSave(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, description: editDescription }),
      });
      if (res.ok) {
        setEditingId(null);
        setSavedId(id);
        setTimeout(() => setSavedId(null), 3000);
        const data = await res.json();
        setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name: data.group.name, description: data.group.description } : g)));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete group "${name}"? This cannot be undone.`)) return;
    try {
      await fetch(`/api/groups/${id}`, { method: "DELETE" });
      setGroups((prev) => prev.filter((g) => g.id !== id));
    } catch { /* ignore */ }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDescription }),
      });
      if (res.ok) {
        const data = await res.json();
        setGroups((prev) => [...prev, { ...data.group, ownerName: "", memberCount: 1, sessionCount: 0, universeCount: 0 }]);
        setShowCreate(false);
        setNewName("");
        setNewDescription("");
      }
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center text-xs text-text-muted">
        Loading groups...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/settings" className="text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-base font-semibold text-text-primary">Group Settings</h1>
            <p className="mt-1 text-xs text-text-muted">Manage group names, descriptions, and membership</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {/* Create group */}
      {showCreate && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5 space-y-4">
          <h3 className="text-sm font-medium text-text-primary">New Group</h3>
          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
              placeholder="Group name"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">Description (optional)</label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
              rows={3}
              placeholder="Group description"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Create Group
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="flex items-center gap-1.5 rounded-lg border border-border-default px-3.5 py-2 text-xs text-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Group list */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-text-muted mb-3" />
          <p className="text-xs text-text-muted">No groups yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="rounded-xl border border-border-default bg-bg-elevated p-4">
              {editingId === g.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary focus:border-accent"
                    rows={2}
                    placeholder="Description"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSave(g.id)}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                    >
                      <Save className="h-3 w-3" />
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-primary"
                    >
                      <X className="h-3 w-3" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-text-primary">{g.name}</h3>
                      {g.description && (
                        <p className="mt-0.5 text-xs text-text-muted line-clamp-2">{g.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-3">
                      <button
                        onClick={() => startEdit(g)}
                        className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(g.id, g.name)}
                        className="rounded-lg p-1.5 text-text-muted hover:text-error hover:bg-error/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xxs text-text-muted">
                    <span>{g.memberCount} member{g.memberCount !== 1 ? "s" : ""}</span>
                    <span>{g.sessionCount} session{g.sessionCount !== 1 ? "s" : ""}</span>
                    <span>{g.universeCount} universe{g.universeCount !== 1 ? "s" : ""}</span>
                    <span className="ml-auto">Owner: {g.ownerName}</span>
                  </div>
                  {savedId === g.id && (
                    <div className="flex items-center gap-1.5 mt-2 rounded-lg border border-success/20 bg-success/10 px-3 py-1.5 text-xxs text-success">
                      <Check className="h-3 w-3" />
                      Saved
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
