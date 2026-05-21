"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Globe,
  Trash2,
  Sparkles,
  Search,
  AlertCircle,
  Check,
} from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useApp } from "@/contexts/app-context";

interface Universe {
  id: string;
  name: string;
  canon_mode: string;
  lore_source: string | null;
  tone: string | null;
  boundaries: string[];
  created_at: string;
}

export default function UniverseListPage() {
  const router = useRouter();
  const { activeGroup, refreshAll } = useApp();
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [tone, setTone] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadUniverses() {
    try {
      const url = activeGroup ? `/api/universes?group_id=${activeGroup.id}` : "/api/universes?scope=personal";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load universes");
      const json = await res.json();
      setUniverses(json.universes || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load universes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUniverses();
  }, [activeGroup?.id]);

  // Clear messages after 3s
  useEffect(() => {
    if (error || success) {
      const t = setTimeout(() => { setError(null); setSuccess(null); }, 4000);
      return () => clearTimeout(t);
    }
  }, [error, success]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/universes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          tone: tone.trim() || null,
          group_id: activeGroup?.id || null,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setShowCreate(false);
        setName("");
        setTone("");
        setSuccess(`${json.universe.name}" created`);
        refreshAll();
        await loadUniverses();
      } else {
        setError(json.error || "Failed to create universe");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/universes/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok) {
        setSuccess("Universe deleted");
        await loadUniverses();
      } else {
        setError(json.error || "Failed to delete universe");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const filtered = universes.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    (u.tone && u.tone.toLowerCase().includes(search.toLowerCase())) ||
    u.canon_mode.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">
            {activeGroup ? `${activeGroup.name} Universes` : "Universes"}
          </h1>
          <p className="mt-1 text-xs text-text-muted">
            {activeGroup ? `Worlds in ${activeGroup.name}` : "Your roleplaying worlds"}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New Universe
        </button>
      </div>

      {/* Error / Success banners */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          <Check className="h-3.5 w-3.5 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
          <h2 className="text-sm font-medium text-text-primary mb-4">Create Universe</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
                placeholder="e.g., Middle-earth"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Tone (optional)</label>
              <input
                type="text"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
                placeholder="e.g., dark fantasy, lighthearted adventure"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search universes..."
          className="w-full rounded-lg border border-border-default bg-bg-elevated pl-9 pr-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span className="text-xs">Loading universes...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
          <Globe className="mx-auto h-10 w-10 text-text-muted" />
          <h3 className="mt-3 text-sm font-medium text-text-primary">
            {search ? "No matching universes" : "No universes"}
          </h3>
          <p className="mt-1 text-xs text-text-muted">
            {search ? "Try a different search term" : "Create a universe to define your world"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((universe) => (
            <div
              key={universe.id}
              onClick={() => router.push(`/universe/${universe.id}`)}
              className="cursor-pointer rounded-xl border border-border-default bg-bg-elevated p-4 transition-colors hover:bg-bg-raised"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                    <Globe className="h-4 w-4 text-text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">{universe.name}</p>
                    <p className="text-xxs text-text-muted mt-0.5">
                      {universe.canon_mode} · {new Date(universe.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(universe.id); }}
                  className="rounded p-1 text-text-muted hover:bg-bg-raised hover:text-error"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {universe.tone && (
                <span className="mt-2 inline-block rounded-full bg-bg-raised px-2 py-0.5 text-xxs text-text-muted">
                  {universe.tone}
                </span>
              )}
              {universe.boundaries.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {universe.boundaries.slice(0, 3).map((b, i) => (
                    <span key={i} className="rounded-full bg-error/10 px-1.5 py-0.5 text-xxs text-error">
                      {b}
                    </span>
                  ))}
                  {universe.boundaries.length > 3 && (
                    <span className="text-xxs text-text-muted">+{universe.boundaries.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmationDialog
        open={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Delete Universe"
        message="Delete this universe? This cannot be undone."
        confirmVariant="danger"
      />
    </div>
  );
}
