/**
 * EventTimeline Component
 *
 * Displays a list of narrative events with type icons and importance badges.
 * Extracted from events/page.tsx.
 *
 * Usage:
 *   <EventTimeline events={events} loading={loading} onEventClick={(id) => navigate(id)} />
 */

"use client";

import { Calendar, Sparkles, Trash2 } from "lucide-react";

interface Event {
  id: string;
  title: string;
  event_type: string;
  session_id: string | null;
  location_id: string | null;
  outcome: string | null;
  occurred_at: string;
}

interface EventTimelineProps {
  events: Event[];
  loading: boolean;
  onEventClick?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  combat: "text-error",
  discovery: "text-accent",
  conversation: "text-success",
  betrayal: "text-warning",
  journey: "text-info",
  ritual: "text-purple-400",
  death: "text-error",
  alliance: "text-success",
};

export function EventTimeline({ events, loading, onEventClick, onDelete }: EventTimelineProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-elevated px-4 py-8 text-text-muted">
        <Sparkles className="h-4 w-4 animate-pulse" />
        <span className="text-xs">Loading events...</span>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-12 text-center">
        <Calendar className="mx-auto h-10 w-10 text-text-muted" />
        <h3 className="mt-3 text-sm font-medium text-text-primary">No events</h3>
        <p className="mt-1 text-xs text-text-muted">Record narrative milestones as your story unfolds</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {events.map((evt) => (
        <div
          key={evt.id}
          className="flex items-center justify-between rounded-lg border border-border-default bg-bg-elevated px-4 py-3"
        >
          <div
            className={`flex items-center gap-3 ${onEventClick ? "cursor-pointer" : ""}`}
            onClick={() => onEventClick?.(evt.id)}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-raised">
              <Calendar className={`h-4 w-4 ${EVENT_TYPE_COLORS[evt.event_type] || "text-text-muted"}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{evt.title}</p>
              <div className="flex items-center gap-2 text-xxs text-text-muted mt-0.5">
                <span className="capitalize">{evt.event_type}</span>
                {evt.outcome && <><span>·</span><span>{evt.outcome}</span></>}
                <span>·</span>
                <span>{new Date(evt.occurred_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(evt.id);
              }}
              className="rounded p-1.5 text-text-muted hover:bg-bg-raised hover:text-error"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
