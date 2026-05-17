/**
 * ThreadTracker Component
 *
 * Displays active narrative threads with unresolved counts and importance badges.
 *
 * Usage:
 *   <ThreadTracker threads={threads} onThreadClick={(id) => navigate(id)} />
 */

"use client";

import { GitBranch, CheckCircle, PauseCircle, XCircle } from "lucide-react";

interface NarrativeThread {
  id: string;
  title: string;
  status: string;
  escalation_level: string;
  unresolved_items: string[];
  updated_at: string;
}

interface ThreadTrackerProps {
  threads: NarrativeThread[];
  onThreadClick: (id: string) => void;
  filter?: "all" | "active" | "resolved";
}

const STATUS_ICONS: Record<string, typeof GitBranch> = {
  active: GitBranch,
  paused: PauseCircle,
  resolved: CheckCircle,
  abandoned: XCircle,
};

const ESCALATION_COLORS: Record<string, string> = {
  low: "bg-bg-raised text-text-muted",
  medium: "bg-amber-500/10 text-amber-500",
  high: "bg-error/10 text-error",
  critical: "bg-error/20 text-error font-medium",
};

export function ThreadTracker({
  threads,
  onThreadClick,
  filter = "all",
}: ThreadTrackerProps) {
  const filtered =
    filter === "all"
      ? threads
      : threads.filter((t) => t.status === filter);

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated px-6 py-8 text-center">
        <GitBranch className="mx-auto h-8 w-8 text-text-muted" />
        <h3 className="mt-2 text-sm font-medium text-text-primary">No threads</h3>
        <p className="mt-1 text-xs text-text-muted">
          Narrative threads will appear here when created
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {filtered.map((thread) => {
        const Icon = STATUS_ICONS[thread.status] || GitBranch;
        const daysAgo = Math.round(
          (Date.now() - new Date(thread.updated_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        return (
          <button
            key={thread.id}
            onClick={() => onThreadClick(thread.id)}
            className="w-full rounded-xl border border-border-default bg-bg-elevated p-4 text-left transition-colors hover:bg-bg-raised/50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
                  <Icon className="h-3.5 w-3.5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">{thread.title}</p>
                  <div className="flex items-center gap-2 text-xxs text-text-muted mt-0.5">
                    <span>{thread.unresolved_items.length} unresolved</span>
                    <span>·</span>
                    <span>{daysAgo === 0 ? "Today" : `${daysAgo}d ago`}</span>
                  </div>
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xxs font-medium ${
                  ESCALATION_COLORS[thread.escalation_level] || ESCALATION_COLORS.low
                }`}
              >
                {thread.escalation_level}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
