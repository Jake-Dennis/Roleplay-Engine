"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EventTimeline } from "@/components/narrative/event-timeline";
import { useActiveUniverse } from "@/contexts/active-universe";
import { useApp } from "@/contexts/app-context";

interface Event {
  id: string;
  title: string;
  event_type: string;
  session_id: string | null;
  location_id: string | null;
  outcome: string | null;
  occurred_at: string;
}

export default function EventsPage() {
  const { activeUniverse } = useActiveUniverse();
  const { activeGroup } = useApp();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("discovery");
  const [outcome, setOutcome] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function loadEvents() {
    try {
      const params = new URLSearchParams();
      if (activeUniverse) params.set("universe_id", activeUniverse.id);
      if (activeGroup) params.set("group_id", activeGroup.id);
      const res = await fetch(`/api/events${params.toString() ? "?" + params.toString() : ""}`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEvents(); }, [activeUniverse?.id, activeGroup?.id]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          eventType,
          outcome: outcome.trim() || null,
          universe_id: activeUniverse?.id || null,
          group_id: activeGroup?.id || null,
        }),
      });
      setShowCreate(false);
      setTitle("");
      setOutcome("");
      await loadEvents();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Events</h1>
          <p className="mt-1 text-xs text-text-muted">Narrative events and story milestones</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New Event
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-border-default bg-bg-elevated p-5">
          <h2 className="text-sm font-medium text-text-primary mb-4">Record Event</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-text-secondary">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary" placeholder="e.g., Battle of the Ridge" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-text-secondary">Type</label>
                <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary">
                  <option value="combat">Combat</option>
                  <option value="discovery">Discovery</option>
                  <option value="conversation">Conversation</option>
                  <option value="betrayal">Betrayal</option>
                  <option value="journey">Journey</option>
                  <option value="ritual">Ritual</option>
                  <option value="death">Death</option>
                  <option value="alliance">Alliance</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary">Outcome</label>
                <input value={outcome} onChange={(e) => setOutcome(e.target.value)} className="w-full rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary" placeholder="e.g., Victory" />
              </div>
            </div>
            <button type="submit" disabled={creating || !title.trim()} className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              {creating ? "Creating..." : "Record Event"}
            </button>
          </form>
        </div>
      )}

      <EventTimeline
        events={events}
        loading={loading}
        onDelete={(id) => setDeleteTarget(id)}
      />

      <ConfirmationDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Delete Event"
        message="Delete this event? This cannot be undone."
        confirmVariant="danger"
      />
    </div>
  );
}
