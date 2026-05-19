"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Play,
  Pause,
  Trash2,
  RotateCcw,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Zap,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ListTodo,
} from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { StatusBadge, statusToVariant } from "@/components/ui/status-badge";
import { JobProgress } from "@/components/jobs/job-progress";
import { useActiveUniverse } from "@/contexts/active-universe";

const JOB_TYPES = [
  "generate_response",
  "summarize_messages",
  "summarize_message",
  "generate_embeddings",
  "analyze_relationships",
  "decay_relationships",
  "compress_memories",
  "refine_relationship_summary",
  "archival_processing",
  "thread_analysis",
  "idle_enrichment",
  "wiki_ingest",
  "wiki_enrich_entity",
  "wiki_generate_rumors",
  "wiki_deepen_page",
  "wiki_deepen_location",
  "wiki_extract_event",
] as const;

const JOB_TYPE_LABELS: Record<string, string> = {
  generate_response: "AI Response",
  summarize_messages: "Summarize Messages",
  summarize_message: "Summarize Single",
  generate_embeddings: "Embeddings",
  analyze_relationships: "Relationship Analysis",
  decay_relationships: "Relationship Decay",
  compress_memories: "Memory Compression",
  refine_relationship_summary: "Summary Refinement",
  archival_processing: "Archival Processing",
  thread_analysis: "Thread Analysis",
  idle_enrichment: "Idle Enrichment",
  wiki_ingest: "Wiki Ingest",
  wiki_enrich_entity: "Wiki Enrich Entity",
  wiki_generate_rumors: "Wiki Generate Rumors",
  wiki_deepen_page: "Wiki Deepen Page",
  wiki_deepen_location: "Wiki Deepen Location",
  wiki_extract_event: "Wiki Extract Event",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-error",
  medium: "text-warning",
  low: "text-text-muted",
  idle: "text-text-muted/50",
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  queued: { bg: "bg-accent/10", text: "text-accent", dot: "bg-accent" },
  processing: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning animate-pulse" },
  completed: { bg: "bg-success/10", text: "text-success", dot: "bg-success" },
  failed: { bg: "bg-error/10", text: "text-error", dot: "bg-error" },
  cancelled: { bg: "bg-text-muted/10", text: "text-text-muted", dot: "bg-text-muted" },
};

interface Job {
  id: string;
  user_id: string;
  type: string;
  priority: string;
  status: string;
  payload: string;
  progress: number;
  progress_message: string | null;
  created_at: string;
  processed_at: string | null;
  error: string | null;
}

interface Stats {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}

export default function JobsPage() {
  const { activeUniverse } = useActiveUniverse();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats>({ queued: 0, processing: 0, completed: 0, failed: 0, cancelled: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelAllConfirm, setCancelAllConfirm] = useState(false);

  const loadJobs = useCallback(async (status?: string) => {
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (activeUniverse) params.set("universe_id", activeUniverse.id);
      const res = await fetch(`/api/jobs?${params}`);
      const data = await res.json();
      setJobs(data.jobs || []);
      setStats(data.stats || { queued: 0, processing: 0, completed: 0, failed: 0, cancelled: 0, total: 0 });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeUniverse?.id]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // SSE for real-time job progress updates
  useEffect(() => {
    const evtSource = new EventSource("/api/jobs/stream");

    evtSource.addEventListener("job:progress", (e) => {
      try {
        const data = JSON.parse(e.data);
        setJobs((prev) =>
          prev.map((j) =>
            j.id === data.jobId
              ? { ...j, progress: data.progress, progress_message: data.message }
              : j
          )
        );
      } catch {
        // ignore parse errors
      }
    });

    // Also listen for job completion to refresh stats
    evtSource.addEventListener("job:completed", () => {
      loadJobs(statusFilter);
    });

    return () => {
      evtSource.close();
    };
  }, [loadJobs, statusFilter]);

  async function handleProcessNext() {
    setProcessing(true);
    try {
      await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process-next" }),
      });
      await loadJobs(statusFilter);
    } finally {
      setProcessing(false);
    }
  }

  async function handleProcessAll() {
    setProcessing(true);
    try {
      await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process" }),
      });
      await loadJobs(statusFilter);
    } finally {
      setProcessing(false);
    }
  }

  async function handleCancel(id: string) {
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", jobId: id }),
    });
    setCancelTarget(null);
    await loadJobs(statusFilter);
  }

  async function handleCancelAll() {
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel-all" }),
    });
    setCancelAllConfirm(false);
    await loadJobs(statusFilter);
  }

  async function handleQueueIdle() {
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "queue-idle" }),
    });
    await loadJobs(statusFilter);
  }

  function formatTime(ts: string): string {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString();
  }

  function parsePayload(payload: string): Record<string, string> {
    try { return JSON.parse(payload); } catch { return {}; }
  }

  const filteredJobs = jobs.filter((j) => {
    if (typeFilter !== "all" && j.type !== typeFilter) return false;
    return true;
  });

  const statCards = [
    { label: "Queued", value: stats.queued, icon: Clock, color: "text-accent", bg: "bg-accent/10" },
    { label: "Processing", value: stats.processing, icon: Loader2, color: "text-warning", bg: "bg-warning/10" },
    { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
    { label: "Failed", value: stats.failed, icon: XCircle, color: "text-error", bg: "bg-error/10" },
    { label: "Total", value: stats.total, icon: ListTodo, color: "text-text-primary", bg: "bg-bg-raised" },
  ];

  return (
    <>
      {/* Header */}
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
              onClick={() => loadJobs(statusFilter)}
              className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-highlight"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              onClick={handleQueueIdle}
              className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-highlight"
            >
              <Zap className="h-3.5 w-3.5" />
              Queue Idle
            </button>
            <button
              onClick={handleProcessNext}
              disabled={processing || stats.queued === 0}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Process Next
            </button>
            <button
              onClick={handleProcessAll}
              disabled={processing || stats.queued === 0}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Process All
            </button>
            <button
              onClick={() => setCancelAllConfirm(true)}
              disabled={stats.queued === 0}
              className="flex items-center gap-1.5 rounded-lg border border-error/30 bg-bg-elevated px-3 py-1.5 text-xs text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Cancel All
            </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-5 gap-3">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`rounded-xl border border-border-default ${s.bg} px-4 py-3`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xxs text-text-muted">{s.label}</p>
                  <p className={`text-xl font-semibold ${s.color}`}>{s.value}</p>
                </div>
                <Icon className={`h-5 w-5 ${s.color}`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <Filter className="h-4 w-4 text-text-muted" />
        <div className="flex gap-1.5">
          {["all", "queued", "processing", "completed", "failed", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); loadJobs(s); }}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                statusFilter === s
                  ? "bg-accent/10 text-text-accent"
                  : "text-text-muted hover:bg-bg-raised hover:text-text-secondary"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-border-default bg-bg-elevated px-2.5 py-1.5 text-xs text-text-secondary"
          >
            <option value="all">All Types</option>
            {JOB_TYPES.map((t) => (
              <option key={t} value={t}>{JOB_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Job List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-elevated py-12 text-center">
          <Clock className="mx-auto h-8 w-8 text-text-muted" />
          <p className="mt-2 text-sm text-text-muted">No jobs found</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredJobs.map((job) => {
            const isExpanded = expandedId === job.id;
            const statusStyle = STATUS_COLORS[job.status] || STATUS_COLORS.queued;
            const payload = parsePayload(job.payload);

            return (
              <div key={job.id} className="rounded-lg border border-border-default bg-bg-elevated">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(isExpanded ? null : job.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedId(isExpanded ? null : job.id); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left cursor-pointer"
                >
                  <div className={`h-2 w-2 rounded-full ${statusStyle.dot}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text-primary">
                        {JOB_TYPE_LABELS[job.type] || job.type}
                      </span>
                      <span className={`text-xxs font-medium ${PRIORITY_COLORS[job.priority]}`}>
                        {job.priority}
                      </span>
                    </div>
                    <p className="text-xxs text-text-muted truncate">
                      {payload.sessionId && `Session: ${String(payload.sessionId).slice(0, 8)}...`}
                      {payload.entityType && `${String(payload.entityType)}: ${String(payload.entityId || "").slice(0, 8)}`}
                    </p>
                    {/* Progress bar for processing jobs */}
                    {job.status === "processing" && (
                      <div className="mt-1.5">
                        <JobProgress
                          progress={job.progress || 0}
                          message={job.progress_message}
                          status={job.status}
                        />
                      </div>
                    )}
                  </div>

                  <StatusBadge label={job.status} variant={statusToVariant(job.status)} />

                  <span className="text-xxs text-text-muted w-20 text-right">
                    {formatTime(job.created_at)}
                  </span>

                  {job.status === "queued" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setCancelTarget(job.id); }}
                      className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-error"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {isExpanded ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />}
                </div>

                {isExpanded && (
                  <div className="border-t border-border-default px-4 py-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xxs">
                      <div>
                        <span className="text-text-muted">ID:</span>
                        <span className="ml-1 text-text-secondary font-mono">{job.id}</span>
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
                      {job.status === "processing" && (
                        <div className="col-span-2">
                          <JobProgress
                            progress={job.progress || 0}
                            message={job.progress_message}
                            status={job.status}
                          />
                        </div>
                      )}
                      {job.status === "completed" && job.progress !== undefined && (
                        <div className="col-span-2">
                          <JobProgress
                            progress={100}
                            message="Completed"
                            status={job.status}
                          />
                        </div>
                      )}
                      {job.status === "failed" && job.progress !== undefined && (
                        <div className="col-span-2">
                          <JobProgress
                            progress={job.progress || 0}
                            message={job.error || "Failed"}
                            status={job.status}
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <span className="text-xxs text-text-muted">Payload:</span>
                      <pre className="mt-1 rounded-md bg-bg-base px-2 py-1.5 text-xxs text-text-secondary overflow-x-auto">
                        {JSON.stringify(payload, null, 2)}
                      </pre>
                    </div>

                    {job.error && (
                      <div className="rounded-md bg-error/10 px-2 py-1.5">
                        <span className="text-xxs text-error flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {job.error}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel single job confirmation */}
      {cancelTarget && (
        <ConfirmationDialog
          open={!!cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={() => handleCancel(cancelTarget)}
          title="Cancel Job"
          message="Are you sure you want to cancel this job? This action cannot be undone."
          confirmVariant="danger"
          confirmLabel="Cancel Job"
        />
      )}

      {cancelAllConfirm && (
        <ConfirmationDialog
          open={cancelAllConfirm}
          onClose={() => setCancelAllConfirm(false)}
          onConfirm={handleCancelAll}
          title="Cancel All Queued Jobs"
          message={`This will cancel ${stats.queued} queued jobs. This action cannot be undone.`}
          confirmVariant="danger"
          confirmLabel="Cancel All"
        />
      )}
    </>
  );
}
