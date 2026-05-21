"use client";

import { useEffect, useState, use } from "react";
import { ArrowLeft, GitBranch, Plus, X, CheckCircle, PauseCircle, AlertTriangle, Trash2 } from "lucide-react";
import Link from "next/link";

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

const ARC_TYPE_LABELS: Record<string, string> = {
  thread: "Thread",
  arc: "Arc",
  subplot: "Subplot",
  main_plot: "Main Plot",
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-success",
  paused: "text-warning",
  resolved: "text-accent",
  abandoned: "text-text-muted",
};

const ESCALATION_COLORS: Record<string, string> = {
  low: "bg-success/10 text-success",
  medium: "bg-warning/10 text-warning",
  high: "bg-error/10 text-error",
  critical: "bg-error/20 text-error font-semibold",
};

export default function NarrativeThreadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [thread, setThread] = useState<NarrativeThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadThread() {
    try {
      const res = await fetch(`/api/narrative-threads?id=${id}`);
      if (res.ok) {
        const json = await res.json();
        setThread(json.thread);
        setEditTitle(json.thread?.title || "");
        setEditDescription(json.thread?.description || "");
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadThread(); }, [id]);

  async function handleSave() {
    if (!thread || !editTitle.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/narrative-threads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: thread.id,
          title: editTitle.trim(),
          description: editDescription.trim() || null,
        }),
      });
      setEditing(false);
      await loadThread();
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(status: string) {
    if (!thread) return;
    await fetch("/api/narrative-threads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: thread.id, status }),
    });
    await loadThread();
  }

  async function handleAddItem() {
    if (!thread || !newItem.trim()) return;
    const items = [...(thread.unresolved_items || []), newItem.trim()];
    await fetch("/api/narrative-threads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: thread.id, unresolvedItems: items }),
    });
    setNewItem("");
    await loadThread();
  }

  async function handleRemoveItem(index: number) {
    if (!thread) return;
    const items = thread.unresolved_items.filter((_, i) => i !== index);
    await fetch("/api/narrative-threads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: thread.id, unresolvedItems: items }),
    });
    await loadThread();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
        <GitBranch className="h-4 w-4 animate-pulse" />
        <span className="text-xs">Loading thread...</span>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
        <h3 className="text-sm font-medium text-text-primary">Thread not found</h3>
        <Link href="/narrative-threads" className="mt-3 text-xs text-accent hover:underline">
          ← Back to threads
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/narrative-threads" className="rounded-lg p-1.5 text-text-muted hover:bg-bg-raised hover:text-text-primary">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="text-base font-semibold text-text-primary bg-transparent border-none outline-none w-full"
              maxLength={200}
            />
          ) : (
            <h1 className="text-base font-semibold text-text-primary truncate">{thread.title}</h1>
          )}
          <div className="flex items-center gap-2 text-xxs text-text-muted mt-1">
            <span className="capitalize">{ARC_TYPE_LABELS[thread.arc_type] || thread.arc_type}</span>
            <span>·</span>
            <span className={`capitalize ${STATUS_COLORS[thread.status] || "text-text-muted"}`}>{thread.status}</span>
            <span>·</span>
            <span className={`rounded px-1.5 py-0.5 ${ESCALATION_COLORS[thread.escalation_level] || "bg-bg-raised text-text-muted"}`}>
              {thread.escalation_level} escalation
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {thread.status === "active" && (
            <button onClick={() => handleStatusChange("resolved")} title="Mark resolved" className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-success">
              <CheckCircle className="h-4 w-4" />
            </button>
          )}
          {thread.status === "active" && (
            <button onClick={() => handleStatusChange("paused")} title="Pause" className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-warning">
              <PauseCircle className="h-4 w-4" />
            </button>
          )}
          {(thread.status === "paused" || thread.status === "resolved") && (
            <button onClick={() => handleStatusChange("active")} title="Reactivate" className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-success">
              <GitBranch className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => { setEditing(!editing); if (!editing) { setEditTitle(thread.title); setEditDescription(thread.description || ""); } }} className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-text-primary" title="Edit">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <h2 className="text-sm font-medium text-text-primary mb-2">Description</h2>
        {editing ? (
          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
            rows={4}
            maxLength={5000}
          />
        ) : thread.description ? (
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{thread.description}</p>
        ) : (
          <p className="text-sm text-text-muted italic">No description</p>
        )}
        {editing && (
          <div className="mt-3 flex gap-2">
            <button onClick={handleSave} disabled={saving || !editTitle.trim()} className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setEditing(false)} className="rounded-lg bg-bg-raised px-4 py-2 text-xs font-medium text-text-muted hover:text-text-primary">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Unresolved Items */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-text-primary flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Unresolved Items ({thread.unresolved_items?.length || 0})
          </h2>
        </div>

        {/* Add item */}
        <div className="flex gap-2 mb-3">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddItem(); } }}
            className="flex-1 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
            placeholder="Add an unresolved item..."
          />
          <button onClick={handleAddItem} disabled={!newItem.trim()} className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Items list */}
        {thread.unresolved_items?.length === 0 ? (
          <p className="text-xs text-text-muted italic">No unresolved items</p>
        ) : (
          <ul className="space-y-1.5">
            {thread.unresolved_items?.map((item, index) => (
              <li key={index} className="flex items-center justify-between rounded-lg bg-bg-raised px-3 py-2 text-sm text-text-secondary">
                <span className="flex-1">{item}</span>
                <button onClick={() => handleRemoveItem(index)} className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-error">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Metadata */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <h2 className="text-sm font-medium text-text-primary mb-3">Details</h2>
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-text-muted">Created</dt>
            <dd className="text-text-secondary mt-0.5">{new Date(thread.created_at).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Last Updated</dt>
            <dd className="text-text-secondary mt-0.5">{new Date(thread.updated_at).toLocaleString()}</dd>
          </div>
          {thread.resolved_at && (
            <div>
              <dt className="text-text-muted">Resolved</dt>
              <dd className="text-text-secondary mt-0.5">{new Date(thread.resolved_at).toLocaleString()}</dd>
            </div>
          )}
          {thread.session_id && (
            <div>
              <dt className="text-text-muted">Session</dt>
              <dd className="text-text-secondary mt-0.5">
                <Link href={`/session/${thread.session_id}`} className="text-accent hover:underline">
                  View Session
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
