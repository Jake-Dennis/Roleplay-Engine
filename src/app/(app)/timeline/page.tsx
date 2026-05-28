"use client";

import { useEffect, useState, useCallback } from "react";
import { CONTENT_LIMITS } from "@/lib/config";
import { Clock, Sparkles, Trash2, Plus, ArrowUp, ArrowDown } from "lucide-react";
import Link from "next/link";
import { ENTRY_TYPE_LABELS, IMPORTANCE_COLORS } from "@/lib/entity-constants";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useActiveUniverse } from "@/contexts/active-universe";
import { useApp } from "@/contexts/app-context";

interface TimelineEntry {
  id: string;
  title: string;
  description: string | null;
  occurred_at: string;
  era: string | null;
  entry_type: string;
  importance: string;
  session_id: string | null;
  thread_id: string | null;
  created_at: string;
}

export default function TimelinePage() {
  const { activeUniverse } = useActiveUniverse();
  const { activeGroup } = useApp();
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [era, setEra] = useState("");
  const [entryType, setEntryType] = useState("event");
  const [importance, setImportance] = useState("medium");
  const [creating, setCreating] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterEra, setFilterEra] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("sort", sortOrder);
      if (filterEra !== "all") params.set("era", filterEra);
      if (activeUniverse) params.set("universe_id", activeUniverse.id);
      if (activeGroup) params.set("group_id", activeGroup.id);
      const res = await fetch(`/api/timeline?${params}`);
      const json = await res.json();
      setEntries(json.entries || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [sortOrder, filterEra, activeUniverse, activeGroup]);

  useEffect(() => { queueMicrotask(() => loadEntries()); }, [loadEntries]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !occurredAt) return;
    setCreating(true);
    try {
      await fetch("/api/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          occurredAt,
          era: era.trim() || null,
          entryType,
          importance,
          universe_id: activeUniverse?.id || null,
          group_id: activeGroup?.id || null,
        }),
      });
      setShowCreate(false);
      setTitle("");
      setDescription("");
      setOccurredAt("");
      setEra("");
      await loadEntries();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/timeline?id=${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setDeleteTarget(null);
  }

  // Group entries by era
  const groupedByEra = entries.reduce((acc, entry) => {
    const eraKey = entry.era || "No Era";
    if (!acc[eraKey]) acc[eraKey] = [];
    acc[eraKey].push(entry);
    return acc;
  }, {} as Record<string, TimelineEntry[]>);

  const eras = Object.keys(groupedByEra).sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Timeline</h1>
          <p className="mt-1 text-xs text-text-muted">Chronological record of story events</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New Entry
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setFilterEra("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filterEra === "all" ? "bg-accent text-white" : "bg-bg-raised text-text-muted hover:text-text-primary"
            }`}
          >
            All Eras
          </button>
          {eras.filter((e) => e !== "No Era").map((era) => (
            <button
              key={era}
              onClick={() => setFilterEra(era)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filterEra === era ? "bg-accent text-white" : "bg-bg-raised text-text-muted hover:text-text-primary"
              }`}
            >
              {era}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
          className="ml-auto flex items-center gap-1 rounded-lg bg-bg-raised px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
        >
          {sortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
          {sortOrder === "asc" ? "Oldest first" : "Newest first"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
          <h2 className="text-sm font-medium text-text-primary mb-4">Add Timeline Entry</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
                placeholder="e.g., The Fall of the Northern Kingdom"
                required
                maxLength={200}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
                placeholder="What happened?"
                rows={3}
                maxLength={CONTENT_LIMITS.MEDIUM}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-text-secondary">Date</label>
                <input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary">Era</label>
                <input
                  value={era}
                  onChange={(e) => setEra(e.target.value)}
                  className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
                  placeholder="e.g., Age of Fire"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-text-secondary">Type</label>
                <select value={entryType} onChange={(e) => setEntryType(e.target.value)} className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary">
                  <option value="event">Event</option>
                  <option value="milestone">Milestone</option>
                  <option value="era_start">Era Start</option>
                  <option value="era_end">Era End</option>
                  <option value="note">Note</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary">Importance</label>
                <select value={importance} onChange={(e) => setImportance(e.target.value)} className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={creating || !title.trim() || !occurredAt} className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              {creating ? "Creating..." : "Add Entry"}
            </button>
          </form>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span className="text-xs">Loading timeline...</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
          <Clock className="mx-auto h-10 w-10 text-text-muted" />
          <h3 className="mt-3 text-sm font-medium text-text-primary">No timeline entries</h3>
          <p className="mt-1 text-xs text-text-muted">Record events to build your story&apos;s chronology</p>
        </div>
      ) : (
        <div className="space-y-6">
          {eras.map((eraKey) => (
            <div key={eraKey}>
              {eraKey !== "No Era" && (
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{eraKey}</h3>
              )}
              <div className="space-y-1.5">
                {groupedByEra[eraKey].map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-border-default bg-bg-elevated px-4 py-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                      <Clock className="h-3.5 w-3.5" />
                    </div>
                    <Link href={`/timeline/${entry.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium text-text-primary truncate ${IMPORTANCE_COLORS[entry.importance] || "text-text-primary"}`}>
                          {entry.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xxs text-text-muted mt-0.5">
                        <span>{new Date(entry.occurred_at).toLocaleDateString()}</span>
                        <span>·</span>
                        <span className="capitalize">{ENTRY_TYPE_LABELS[entry.entry_type] || entry.entry_type}</span>
                        {entry.description && (
                          <>
                            <span>·</span>
                            <span className="line-clamp-1">{entry.description}</span>
                          </>
                        )}
                      </div>
                    </Link>
                    <button
                      onClick={() => setDeleteTarget(entry.id)}
                      className="shrink-0 rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmationDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Delete Timeline Entry"
        message="Delete this timeline entry? This cannot be undone."
        confirmVariant="danger"
      />
    </div>
  );
}
