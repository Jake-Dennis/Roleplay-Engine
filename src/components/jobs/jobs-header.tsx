"use client";

/**
 * JobsHeader Component
 *
 * Title + action buttons toolbar with refresh, queue idle, process next,
 * process all, retry all failed, and cancel all buttons.
 */

import {
  ListTodo,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  Zap,
} from "lucide-react";
import type { Stats } from "@/lib/jobs/types";

interface JobsHeaderProps {
  stats: Stats;
  onRefresh: () => void;
  onQueueIdle: () => void;
  onProcessNext: () => void;
  onProcessAll: () => void;
  onRetryAll: () => void;
  onCancelAll: () => void;
  processing: boolean;
}

export function JobsHeader({
  stats,
  onRefresh,
  onQueueIdle,
  onProcessNext,
  onProcessAll,
  onRetryAll,
  onCancelAll,
  processing,
}: JobsHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <div className="flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-text-accent" />
          <h1 className="text-lg font-semibold text-text-primary">Job Queue</h1>
        </div>
        <p className="mt-0.5 text-xs text-text-muted">Manage background processing jobs</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-highlight"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
        <button
          onClick={onQueueIdle}
          className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-highlight"
        >
          <Zap className="h-3.5 w-3.5" />
          Queue Idle
        </button>
        <button
          onClick={onProcessNext}
          disabled={processing || stats.queued === 0}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {processing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Process Next
        </button>
        <button
          onClick={onProcessAll}
          disabled={processing || stats.queued === 0}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {processing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          Process All
        </button>
        <button
          onClick={onRetryAll}
          disabled={stats.failed === 0}
          className="flex items-center gap-1.5 rounded-lg border border-warning/30 bg-bg-elevated px-3 py-1.5 text-xs text-warning transition-colors hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Retry Failed
        </button>
        <button
          onClick={onCancelAll}
          disabled={stats.queued === 0}
          className="flex items-center gap-1.5 rounded-lg border border-error/30 bg-bg-elevated px-3 py-1.5 text-xs text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Cancel All
        </button>
      </div>
    </div>
  );
}
