"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { StatusBadge, statusToVariant } from "@/components/ui/status-badge";
import { JobProgress } from "@/components/jobs/job-progress";
import { formatRelativeTime } from "@/lib/date-formatter";
import { safeParse } from "@/lib/safe-json";
import {
  JOB_TYPE_LABELS,
  PRIORITY_COLORS,
  STATUS_COLORS,
  type Job,
} from "@/lib/jobs/types";

interface JobTableProps {
  jobs: Job[];
  loading?: boolean;
  variant?: "cards" | "table";
  /** @default null */
  expandedId?: string | null;
  /** Required when variant="cards" */
  onToggleExpand?: (id: string | null) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  /** @default null */
  actionLoading?: string | null;
}

export function JobTable({
  jobs,
  loading = false,
  variant = "cards",
  expandedId = null,
  onToggleExpand,
  onCancel,
  onRetry,
  actionLoading = null,
}: JobTableProps) {
  const formatTime = (ts: string): string => formatRelativeTime(ts);

  const formatAbsoluteTime = (ts: string): string => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  const parsePayload = (payload: string): Record<string, unknown> => {
    return safeParse(payload) ?? {};
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
      </div>
    );
  }

  // Empty state
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated py-12 text-center">
        <Clock className="mx-auto h-8 w-8 text-text-muted" />
        <p className="mt-2 text-sm text-text-muted">No jobs found</p>
      </div>
    );
  }

  // Cards variant (expandable job list — jobs page)
  if (variant === "cards") {
    return (
      <div className="space-y-1">
        {jobs.map((job) => {
          const isExpanded = expandedId === job.id;
          const statusStyle = STATUS_COLORS[job.status] || STATUS_COLORS.queued;
          const payload = parsePayload(job.payload);

          return (
            <div key={job.id} className="rounded-lg border border-border-default bg-bg-elevated">
              {/* Clickable header */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onToggleExpand?.(isExpanded ? null : job.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggleExpand?.(isExpanded ? null : job.id);
                  }
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left cursor-pointer"
              >
                <div className={`h-2 w-2 rounded-full ${statusStyle.dot}`} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-primary">
                      {JOB_TYPE_LABELS[job.type] || job.type}
                    </span>
                    <span className={`text-xxs font-medium ${PRIORITY_COLORS[job.priority]}`}>
                      {job.priority}
                    </span>
                  </div>
                  <p className="truncate text-xxs text-text-muted">
                    {payload.sessionId ? `Session: ${String(payload.sessionId).slice(0, 8)}...` : ""}
                    {payload.entityType
                      ? `${String(payload.entityType)}: ${String(payload.entityId || "").slice(0, 8)}`
                      : ""}
                  </p>
                  {job.status === "processing" && (
                    <div className="mt-1.5">
                      <JobProgress progress={job.progress || 0} message={job.progress_message} status={job.status} />
                    </div>
                  )}
                </div>

                <StatusBadge label={job.status} variant={statusToVariant(job.status)} />

                {job.status === "failed" ? (
                  <span className="whitespace-nowrap text-xxs text-text-muted">
                    Retry {(job.retry_count ?? 0)}/{(job.max_retries ?? 3)}
                  </span>
                ) : (job.retry_count ?? 0) > 0 ? (
                  <span className="whitespace-nowrap text-xxs text-text-muted">(retry {job.retry_count})</span>
                ) : null}

                <span
                  className="w-20 text-right text-xxs text-text-muted"
                  title={formatAbsoluteTime(job.created_at)}
                >
                  {formatTime(job.created_at)}
                </span>

                {job.status === "queued" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancel(job.id);
                    }}
                    className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-error"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                )}
                {job.status === "failed" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetry(job.id);
                    }}
                    disabled={(job.retry_count ?? 0) >= (job.max_retries ?? 3)}
                    className={`rounded p-1 transition-colors ${
                      (job.retry_count ?? 0) >= (job.max_retries ?? 3)
                        ? "cursor-not-allowed text-text-muted/30"
                        : "text-text-muted hover:bg-bg-raised hover:text-warning"
                    }`}
                    title={(job.retry_count ?? 0) >= (job.max_retries ?? 3) ? "Max retries reached" : "Retry job"}
                  >
                    <RotateCcw
                      className={`h-3.5 w-3.5 ${(job.retry_count ?? 0) >= (job.max_retries ?? 3) ? "opacity-50" : ""}`}
                    />
                  </button>
                )}

                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-text-muted" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-text-muted" />
                )}
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="space-y-2 border-t border-border-default px-4 py-3">
                  <div className="grid grid-cols-2 gap-2 text-xxs">
                    <div>
                      <span className="text-text-muted">ID:</span>
                      <span className="ml-1 font-mono text-text-secondary">{job.id}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Created:</span>
                      <span className="ml-1 text-text-secondary">{new Date(job.created_at).toLocaleString()}</span>
                    </div>
                    {job.processed_at && (
                      <div>
                        <span className="text-text-muted">Processed:</span>
                        <span className="ml-1 text-text-secondary">{new Date(job.processed_at).toLocaleString()}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-text-muted">Priority:</span>
                      <span className={`ml-1 font-medium ${PRIORITY_COLORS[job.priority]}`}>{job.priority}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Retries:</span>
                      <span className="ml-1 text-text-secondary">
                        {(job.retry_count ?? 0)}/{(job.max_retries ?? 3)}
                      </span>
                    </div>
                    {job.status === "processing" && (
                      <div className="col-span-2">
                        <JobProgress progress={job.progress || 0} message={job.progress_message} status={job.status} />
                      </div>
                    )}
                    {job.status === "completed" && job.progress !== undefined && (
                      <div className="col-span-2">
                        <JobProgress progress={100} message="Completed" status={job.status} />
                      </div>
                    )}
                    {job.status === "failed" && job.progress !== undefined && (
                      <div className="col-span-2">
                        <JobProgress progress={job.progress || 0} message={job.error || "Failed"} status={job.status} />
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="text-xxs text-text-muted">Payload:</span>
                    <pre className="mt-1 overflow-x-auto rounded-md bg-bg-base px-2 py-1.5 text-xxs text-text-secondary">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
                  </div>

                  {job.error && (
                    <div className="rounded-md bg-error/10 px-2 py-1.5">
                      <span className="flex items-center gap-1 text-xxs text-error">
                        <AlertTriangle className="h-3 w-3" />
                        {job.error}
                      </span>
                      <button
                        onClick={() => onRetry(job.id)}
                        disabled={(job.retry_count ?? 0) >= (job.max_retries ?? 3)}
                        className={`ml-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xxs transition-colors ${
                          (job.retry_count ?? 0) >= (job.max_retries ?? 3)
                            ? "cursor-not-allowed bg-error/10 text-error/50"
                            : "bg-error/20 text-error hover:bg-error/30"
                        }`}
                        title={(job.retry_count ?? 0) >= (job.max_retries ?? 3) ? "Max retries reached" : "Retry"}
                      >
                        <RotateCcw
                          className={`h-3 w-3 ${(job.retry_count ?? 0) >= (job.max_retries ?? 3) ? "opacity-50" : ""}`}
                        />
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Table variant (admin page)
  return (
    <div className="overflow-x-auto rounded-xl border border-border-default">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border-default bg-bg-raised">
            <th className="px-3 py-2.5 text-xxs font-medium uppercase tracking-wider text-text-muted">Status</th>
            <th className="px-3 py-2.5 text-xxs font-medium uppercase tracking-wider text-text-muted">Type</th>
            <th className="px-3 py-2.5 text-xxs font-medium uppercase tracking-wider text-text-muted">Created</th>
            <th className="px-3 py-2.5 text-xxs font-medium uppercase tracking-wider text-text-muted">Attempts</th>
            <th className="px-3 py-2.5 text-xxs font-medium uppercase tracking-wider text-text-muted">
              Progress / Error
            </th>
            <th className="w-20 px-3 py-2.5 text-xxs font-medium uppercase tracking-wider text-text-muted">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr
              key={job.id}
              className="border-b border-border-default bg-bg-elevated transition-colors last:border-b-0 hover:bg-bg-raised/50"
            >
              <td className="px-3 py-2.5">
                <StatusBadge label={job.status} variant={statusToVariant(job.status)} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-text-primary">
                {JOB_TYPE_LABELS[job.type] || job.type}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-xxs text-text-muted">
                {formatTime(job.created_at)}
              </td>
              <td className="px-3 py-2.5 text-xxs text-text-muted">
                {job.status === "failed" || (job.retry_count ?? 0) > 0 ? (
                  <span className={job.status === "failed" ? "text-error" : ""}>
                    {(job.retry_count ?? 0)}/{(job.max_retries ?? 3)}
                  </span>
                ) : (
                  <span className="text-text-muted/50">&mdash;</span>
                )}
              </td>
              <td className="max-w-xs px-3 py-2.5">
                {job.status === "processing" ? (
                  <div className="min-w-[160px]">
                    <JobProgress progress={job.progress || 0} message={job.progress_message} status={job.status} />
                  </div>
                ) : job.status === "failed" && job.error ? (
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0 text-error" />
                    <span className="truncate text-xxs text-error" title={job.error}>
                      {job.error.length > 80 ? `${job.error.slice(0, 80)}...` : job.error}
                    </span>
                  </div>
                ) : job.status === "completed" && job.progress !== undefined ? (
                  <div className="min-w-[160px]">
                    <JobProgress progress={100} message="Completed" status={job.status} />
                  </div>
                ) : (
                  <span className="text-xxs text-text-muted/50">&mdash;</span>
                )}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-1">
                  {job.status === "failed" && (
                    <button
                      onClick={() => onRetry(job.id)}
                      disabled={
                        (job.retry_count ?? 0) >= (job.max_retries ?? 3) || actionLoading === job.id
                      }
                      className={`rounded p-1 transition-colors ${
                        (job.retry_count ?? 0) >= (job.max_retries ?? 3)
                          ? "cursor-not-allowed text-text-muted/30"
                          : "text-text-muted hover:bg-bg-raised hover:text-warning"
                      }`}
                      title={
                        (job.retry_count ?? 0) >= (job.max_retries ?? 3) ? "Max retries reached" : "Retry job"
                      }
                    >
                      <RotateCcw
                        className={`h-3.5 w-3.5 ${(job.retry_count ?? 0) >= (job.max_retries ?? 3) ? "opacity-50" : ""}`}
                      />
                    </button>
                  )}
                  {(job.status === "queued" || job.status === "processing") && (
                    <button
                      onClick={() => onCancel(job.id)}
                      disabled={actionLoading === job.id}
                      className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-error"
                      title="Cancel job"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
