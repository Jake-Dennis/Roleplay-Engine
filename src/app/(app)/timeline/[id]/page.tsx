"use client";

import { useEffect, useState, use, useCallback } from "react";
import { CONTENT_LIMITS } from "@/lib/config";
import { ArrowLeft, Clock, Trash2, Layers } from "lucide-react";
import Link from "next/link";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { LayerManager } from "@/components/timeline/layer-manager";

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

const ENTRY_TYPE_LABELS: Record<string, string> = {
  event: "Event",
  milestone: "Milestone",
  era_start: "Era Start",
  era_end: "Era End",
  note: "Note",
};

const ENTRY_TYPE_ICONS: Record<string, string> = {
  event: "bg-accent/10 text-accent",
  milestone: "bg-warning/10 text-warning",
  era_start: "bg-success/10 text-success",
  era_end: "bg-error/10 text-error",
  note: "bg-bg-raised text-text-muted",
};

const IMPORTANCE_COLORS: Record<string, string> = {
  low: "text-text-muted",
  medium: "text-text-secondary",
  high: "text-accent",
  critical: "text-error font-semibold",
};

export default function TimelineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [entry, setEntry] = useState<TimelineEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editOccurredAt, setEditOccurredAt] = useState("");
  const [editEra, setEditEra] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLayers, setShowLayers] = useState(false);

  const loadEntry = useCallback(async () => {
    try {
      const res = await fetch(`/api/timeline?id=${id}`);
      if (res.ok) {
        const json = await res.json();
        setEntry(json.entry);
        setEditTitle(json.entry?.title || "");
        setEditDescription(json.entry?.description || "");
        // Format datetime-local value
        const d = new Date(json.entry?.occurred_at);
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - offset * 60000);
        setEditOccurredAt(local.toISOString().slice(0, 16));
        setEditEra(json.entry?.era || "");
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { queueMicrotask(() => loadEntry()); }, [loadEntry]);

  async function handleSave() {
    if (!entry || !editTitle.trim() || !editOccurredAt) return;
    setSaving(true);
    try {
      await fetch("/api/timeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entry.id,
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          occurredAt: editOccurredAt,
          era: editEra.trim() || null,
        }),
      });
      setEditing(false);
      await loadEntry();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry) return;
    await fetch(`/api/timeline?id=${entry.id}`, { method: "DELETE" });
    window.location.href = "/timeline";
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
        <Clock className="h-4 w-4 animate-pulse" />
        <span className="text-xs">Loading entry...</span>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
        <h3 className="text-sm font-medium text-text-primary">Entry not found</h3>
        <Link href="/timeline" className="mt-3 text-xs text-accent hover:underline">
          ← Back to timeline
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/timeline" className="rounded-lg p-1.5 text-text-muted hover:bg-bg-raised hover:text-text-primary">
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
            <h1 className={`text-base font-semibold truncate ${IMPORTANCE_COLORS[entry.importance] || "text-text-primary"}`}>
              {entry.title}
            </h1>
          )}
          <div className="flex items-center gap-2 text-xxs text-text-muted mt-1">
            <span>{new Date(entry.occurred_at).toLocaleString()}</span>
            <span>·</span>
            <span className="capitalize">{ENTRY_TYPE_LABELS[entry.entry_type] || entry.entry_type}</span>
            {entry.era && (
              <>
                <span>·</span>
                <span>{entry.era}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowLayers(!showLayers)} className={`rounded p-1.5 transition-colors ${showLayers ? "text-accent bg-accent/10" : "text-text-muted hover:bg-bg-raised hover:text-text-primary"}`} title="Manage Layers">
            <Layers className="h-4 w-4" />
          </button>
          <button onClick={() => { setEditing(!editing); }} className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-text-primary" title="Edit">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          </button>
          <button onClick={() => setShowDeleteConfirm(true)} className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-error" title="Delete">
            <Trash2 className="h-4 w-4" />
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
            maxLength={CONTENT_LIMITS.MEDIUM}
          />
        ) : entry.description ? (
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{entry.description}</p>
        ) : (
          <p className="text-sm text-text-muted italic">No description</p>
        )}
        {editing && (
          <div className="mt-3 flex gap-2">
            <button onClick={handleSave} disabled={saving || !editTitle.trim() || !editOccurredAt} className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setEditing(false)} className="rounded-lg bg-bg-raised px-4 py-2 text-xs font-medium text-text-muted hover:text-text-primary">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Edit fields (when editing) */}
      {editing && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
          <h2 className="text-sm font-medium text-text-primary mb-3">Edit Details</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Date</label>
              <input
                type="datetime-local"
                value={editOccurredAt}
                onChange={(e) => setEditOccurredAt(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Era</label>
              <input
                value={editEra}
                onChange={(e) => setEditEra(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary"
                placeholder="e.g., Age of Fire"
              />
            </div>
          </div>
        </div>
      )}

      {/* Layer Management */}
      {showLayers && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
          <h2 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
            <Layers className="h-4 w-4 text-accent" />
            Timeline Layers
          </h2>
          <LayerManager timelineId={id} />
        </div>
      )}

      {/* Metadata */}
      <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
        <h2 className="text-sm font-medium text-text-primary mb-3">Details</h2>
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-text-muted">Type</dt>
            <dd className="mt-0.5">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${ENTRY_TYPE_ICONS[entry.entry_type] || "bg-bg-raised text-text-muted"}`}>
                <Clock className="h-3 w-3" />
                {ENTRY_TYPE_LABELS[entry.entry_type] || entry.entry_type}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Importance</dt>
            <dd className={`mt-0.5 capitalize ${IMPORTANCE_COLORS[entry.importance] || "text-text-secondary"}`}>{entry.importance}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Created</dt>
            <dd className="text-text-secondary mt-0.5">{new Date(entry.created_at).toLocaleString()}</dd>
          </div>
          {entry.session_id && (
            <div>
              <dt className="text-text-muted">Session</dt>
              <dd className="text-text-secondary mt-0.5">
                <Link href={`/session/${entry.session_id}`} className="text-accent hover:underline">
                  View Session
                </Link>
              </dd>
            </div>
          )}
          {entry.thread_id && (
            <div>
              <dt className="text-text-muted">Thread</dt>
              <dd className="text-text-secondary mt-0.5">
                <Link href={`/narrative-threads/${entry.thread_id}`} className="text-accent hover:underline">
                  View Thread
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </div>

      <ConfirmationDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Timeline Entry"
        message="Delete this timeline entry? This cannot be undone."
        confirmVariant="danger"
      />
    </div>
  );
}
