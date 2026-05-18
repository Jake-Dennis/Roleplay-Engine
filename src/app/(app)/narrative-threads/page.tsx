"use client";

import { useEffect, useState } from "react";
import { GitBranch, Sparkles, Trash2, Plus, CheckCircle, PauseCircle, XCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { ARC_TYPE_LABELS, ESCALATION_COLORS, THREAD_STATUS_ICONS, THREAD_STATUS_COLORS } from "@/lib/entity-constants";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useActiveUniverse } from "@/contexts/active-universe";
import { useApp } from "@/contexts/app-context";

interface NarrativeThread {
  id: string;
  title: string;
  description: string | null;
  arc_type: string;
  status: string;
  escalation_level: string;
  unresolved_items: string[];
  session_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export default function NarrativeThreadsPage() {
  const { activeUniverse } = useActiveUniverse();
  const { activeGroup } = useApp();
  const [threads, setThreads] = useState<NarrativeThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [arcType, setArcType] = useState("thread");
  const [escalationLevel, setEscalationLevel] = useState("low");
  const [creating, setCreating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function loadThreads() {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (activeUniverse) params.set("universe_id", activeUniverse.id);
      if (activeGroup) params.set("group_id", activeGroup.id);
      const url = `/api/narrative-threads${params.toString() ? "?" + params.toString() : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      setThreads(data.threads || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadThreads(); }, [filterStatus, activeUniverse?.id, activeGroup?.id]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/narrative-threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          arcType,
          escalationLevel,
          universe_id: activeUniverse?.id || null,
          group_id: activeGroup?.id || null,
        }),
      });
      setShowCreate(false);
      setTitle("");
      setDescription("");
      await loadThreads();
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch("/api/narrative-threads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await loadThreads();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/narrative-threads?id=${id}`, { method: "DELETE" });
    setThreads((prev) => prev.filter((t) => t.id !== id));
    setDeleteTarget(null);
  }

  const StatusIcon = THREAD_STATUS_ICONS[threads[0]?.status as keyof typeof THREAD_STATUS_ICONS] || GitBranch;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Narrative Threads</h1>
          <p className="mt-1 text-xs text-text-muted">Track story arcs, subplots, and unresolved threads</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New Thread
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {["all", "active", "paused", "resolved", "abandoned"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filterStatus === s
                ? "bg-accent text-white"
                : "bg-bg-raised text-text-muted hover:text-text-primary"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
          <h2 className="text-sm font-medium text-text-primary mb-4">Create Narrative Thread</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
                placeholder="e.g., The Missing Heirloom"
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
                placeholder="What is this thread about?"
                rows={3}
                maxLength={5000}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-text-secondary">Type</label>
                <select value={arcType} onChange={(e) => setArcType(e.target.value)} className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary">
                  <option value="thread">Thread</option>
                  <option value="arc">Arc</option>
                  <option value="subplot">Subplot</option>
                  <option value="main_plot">Main Plot</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary">Escalation</label>
                <select value={escalationLevel} onChange={(e) => setEscalationLevel(e.target.value)} className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={creating || !title.trim()} className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              {creating ? "Creating..." : "Create Thread"}
            </button>
          </form>
        </div>
      )}

      {/* Thread list */}
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span className="text-xs">Loading threads...</span>
        </div>
      ) : threads.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
          <GitBranch className="mx-auto h-10 w-10 text-text-muted" />
          <h3 className="mt-3 text-sm font-medium text-text-primary">No threads</h3>
          <p className="mt-1 text-xs text-text-muted">Create narrative threads to track ongoing storylines</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {threads.map((thread) => {
            const Icon = StatusIcon;
            return (
              <div key={thread.id} className="rounded-lg border border-border-default bg-bg-elevated px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/narrative-threads/${thread.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-bg-raised">
                        <Icon className={`h-3.5 w-3.5 ${THREAD_STATUS_COLORS[thread.status] || "text-text-muted"}`} />
                      </div>
                      <p className="text-sm font-medium text-text-primary truncate">{thread.title}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xxs text-text-muted mt-1 ml-9">
                      <span className="capitalize">{ARC_TYPE_LABELS[thread.arc_type] || thread.arc_type}</span>
                      <span>·</span>
                      <span className={`rounded px-1.5 py-0.5 ${ESCALATION_COLORS[thread.escalation_level] || "bg-bg-raised text-text-muted"}`}>
                        {thread.escalation_level}
                      </span>
                      {thread.unresolved_items?.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <AlertTriangle className="h-3 w-3" />
                            {thread.unresolved_items.length} unresolved
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span>{new Date(thread.updated_at).toLocaleDateString()}</span>
                    </div>
                    {thread.description && (
                      <p className="text-xs text-text-muted mt-1 ml-9 line-clamp-2">{thread.description}</p>
                    )}
                  </Link>
                  <div className="flex items-center gap-1 shrink-0">
                    {thread.status === "active" && (
                      <button
                        onClick={() => handleStatusChange(thread.id, "resolved")}
                        title="Mark resolved"
                        className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-success"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {thread.status === "active" && (
                      <button
                        onClick={() => handleStatusChange(thread.id, "paused")}
                        title="Pause"
                        className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-warning"
                      >
                        <PauseCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {(thread.status === "paused" || thread.status === "resolved") && (
                      <button
                        onClick={() => handleStatusChange(thread.id, "active")}
                        title="Reactivate"
                        className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-success"
                      >
                        <GitBranch className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTarget(thread.id)}
                      className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmationDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Delete Narrative Thread"
        message="Delete this thread? This cannot be undone."
        confirmVariant="danger"
      />
    </div>
  );
}
