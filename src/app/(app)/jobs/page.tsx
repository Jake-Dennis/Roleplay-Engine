"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Database,
  Play,
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
  Tags,
} from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { StatusBadge, statusToVariant } from "@/components/ui/status-badge";
import { JobProgress } from "@/components/jobs/job-progress";
import { useApp } from "@/contexts/app-context";
import { formatRelativeTime } from "@/lib/date-formatter";
import { safeParse } from "@/lib/safe-json";

const JOB_TYPES = [
  "analyze_relationships",
  "archival_processing",
  "compress_memories",
  "decay_relationships",
  "extract_lore_comprehensive",
  "generate_embeddings",
  "generate_session_recap",
  "npc_evolution",
  "refine_relationship_summary",
  "scene_state_extract",
  "summarize_messages",
  "thread_analysis",
  "universe_wiki_sync",
  "wiki_auto_extract",
  "wiki_deepen_location",
  "wiki_deepen_page",
  "wiki_enrich_entity",
  "wiki_extract_event",
  "wiki_generate_rumors",
  "wiki_ingest",
] as const;

const JOB_TYPE_LABELS: Record<string, string> = {
  analyze_relationships: "Relationship Analysis",
  archival_processing: "Archival Processing",
  compress_memories: "Memory Compression",
  decay_relationships: "Relationship Decay",
  extract_lore_comprehensive: "Lore Extraction",
  generate_embeddings: "Embeddings",
  generate_session_recap: "Session Recap",
  npc_evolution: "NPC Evolution",
  refine_relationship_summary: "Summary Refinement",
  scene_state_extract: "Scene State Extract",
  summarize_messages: "Summarize Messages",
  thread_analysis: "Thread Analysis",
  universe_wiki_sync: "Universe Wiki Sync",
  wiki_auto_extract: "Wiki Auto Extract",
  wiki_deepen_location: "Wiki Deepen Location",
  wiki_deepen_page: "Wiki Deepen Page",
  wiki_enrich_entity: "Wiki Enrich Entity",
  wiki_extract_event: "Wiki Extract Event",
  wiki_generate_rumors: "Wiki Generate Rumors",
  wiki_ingest: "Wiki Ingest",
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
  retry_count?: number;
  max_retries?: number;
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
  const { activeUniverse } = useApp();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats>({ queued: 0, processing: 0, completed: 0, failed: 0, cancelled: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelAllConfirm, setCancelAllConfirm] = useState(false);
  const [retryAllConfirm, setRetryAllConfirm] = useState(false);
  const [reindexing, setReindexing] = useState<string | null>(null);
  const [reindexResult, setReindexResult] = useState<string | null>(null);

  const loadJobs = useCallback(async (status?: string) => {
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (activeUniverse) params.set("universe_id", activeUniverse.id);
      if (!jobs.length) setLoading(true);
      const res = await fetch(`/api/jobs?${params}`);
      const json = await res.json();
      setJobs(json.jobs || []);
      setStats(json.stats || { queued: 0, processing: 0, completed: 0, failed: 0, cancelled: 0, total: 0 });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeUniverse]);

  useEffect(() => { queueMicrotask(() => loadJobs()); }, [loadJobs]);

  // Auto-refresh every 10s as fallback for missed SSE events
  useEffect(() => {
    const interval = setInterval(() => {
      loadJobs(statusFilter);
    }, 10000);
    return () => clearInterval(interval);
  }, [loadJobs, statusFilter]);

  // SSE for real-time job progress updates
  useEffect(() => {
    const evtSource = new EventSource("/api/jobs/stream");

    evtSource.addEventListener("job:progress", (e) => {
      const data = safeParse<Record<string, unknown>>(e.data);
      if (data?.jobId) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === data.jobId
              ? { ...j, progress: data.progress as number, progress_message: data.message as string | null }
              : j
          )
        );
      }
    });

    // Refresh full job list when any job completes or fails
    const handleRefresh = () => loadJobs(statusFilter);
    evtSource.addEventListener("job:completed", handleRefresh);
    evtSource.addEventListener("job:failed", handleRefresh);

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

  async function handleRetry(id: string) {
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry", jobId: id }),
    });
    await loadJobs(statusFilter);
  }

  async function handleRetryAll() {
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry-all" }),
    });
    setRetryAllConfirm(false);
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

  async function handleCurate() {
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "queue", type: "wiki_curate_page", priority: "low" }),
    });
    await loadJobs(statusFilter);
  }

  async function handleReindex(type: string) {
    setReindexing(type);
    setReindexResult(null);
    try {
      const res = await fetch("/api/reindex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      setReindexResult(data.success ? data.message : `Error: ${data.error || "Unknown error"}`);
      await loadJobs(statusFilter);
    } catch {
      setReindexResult("Error: Failed to trigger reindex");
    } finally {
      setReindexing(null);
    }
  }

  function formatTime(ts: string): string {
    return formatRelativeTime(ts);
  }

  function formatAbsoluteTime(ts: string): string {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  }

  function parsePayload(payload: string): Record<string, unknown> {
    return safeParse(payload) ?? {};
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between shrink-0">
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
              onClick={handleCurate}
              className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-highlight"
            >
              <Tags className="h-3.5 w-3.5" />
              Curate Pages
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
              onClick={() => setRetryAllConfirm(true)}
              disabled={stats.failed === 0}
              className="flex items-center gap-1.5 rounded-lg border border-warning/30 bg-bg-elevated px-3 py-1.5 text-xs text-warning transition-colors hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry Failed
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

      {/* Reindex Section */}
      <div className="mb-6 rounded-xl border border-border-default bg-bg-elevated px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-text-accent" />
          <span className="text-xs font-medium text-text-primary">Reindex</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => handleReindex("wiki")}
            disabled={reindexing !== null}
            className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-highlight disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reindexing === "wiki" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Rebuild Wiki Index
          </button>
          <button
            onClick={() => handleReindex("embeddings")}
            disabled={reindexing !== null}
            className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-highlight disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reindexing === "embeddings" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Database className="h-3.5 w-3.5" />
            )}
            Reindex All Embeddings
          </button>
          <button
            onClick={() => handleReindex("all")}
            disabled={reindexing !== null}
            className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-raised px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-highlight disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reindexing === "all" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Loader2 className="h-3.5 w-3.5" />
            )}
            Reindex All
          </button>
          {reindexResult && (
            <span className="text-xxs text-text-muted">{reindexResult}</span>
          )}
        </div>
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
      <div className="flex-1 overflow-y-auto min-h-0">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="animate-fade-in rounded-xl border border-border-default bg-bg-elevated py-12 text-center">
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
              <div key={job.id} className="animate-fade-in rounded-lg border border-border-default bg-bg-elevated">
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
                      {payload.sessionId ? `Session: ${String(payload.sessionId).slice(0, 8)}...` : ""}
                      {payload.entityType ? `${String(payload.entityType)}: ${String(payload.entityId || "").slice(0, 8)}` : ""}
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

                  {job.status === "failed" ? (
                    <span className="text-xxs text-text-muted whitespace-nowrap">
                      Retry {(job.retry_count ?? 0)}/{(job.max_retries ?? 3)}
                    </span>
                  ) : (job.retry_count ?? 0) > 0 ? (
                    <span className="text-xxs text-text-muted whitespace-nowrap">
                      (retry {job.retry_count})
                    </span>
                  ) : null}

                  <span
                    className="text-xxs text-text-muted w-20 text-right"
                    title={formatAbsoluteTime(job.created_at)}
                  >
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
                  {job.status === "failed" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRetry(job.id); }}
                      disabled={(job.retry_count ?? 0) >= (job.max_retries ?? 3)}
                      className={`rounded p-1 transition-colors ${
                        (job.retry_count ?? 0) >= (job.max_retries ?? 3)
                          ? "text-text-muted/30 cursor-not-allowed"
                          : "text-text-muted hover:bg-bg-raised hover:text-warning"
                      }`}
                      title={(job.retry_count ?? 0) >= (job.max_retries ?? 3) ? "Max retries reached" : "Retry job"}
                    >
                      <RotateCcw className={`h-3.5 w-3.5 ${(job.retry_count ?? 0) >= (job.max_retries ?? 3) ? "opacity-50" : ""}`} />
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
                      <div>
                        <span className="text-text-muted">Retries:</span>
                        <span className="ml-1 text-text-secondary">{(job.retry_count ?? 0)}/{(job.max_retries ?? 3)}</span>
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
                        <button
                          onClick={() => handleRetry(job.id)}
                          disabled={(job.retry_count ?? 0) >= (job.max_retries ?? 3)}
                          className={`ml-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xxs transition-colors ${
                            (job.retry_count ?? 0) >= (job.max_retries ?? 3)
                              ? "bg-error/10 text-error/50 cursor-not-allowed"
                              : "bg-error/20 text-error hover:bg-error/30"
                          }`}
                          title={(job.retry_count ?? 0) >= (job.max_retries ?? 3) ? "Max retries reached" : "Retry"}
                        >
                          <RotateCcw className={`h-3 w-3 ${(job.retry_count ?? 0) >= (job.max_retries ?? 3) ? "opacity-50" : ""}`} />
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
      </div>

      {retryAllConfirm && (
        <ConfirmationDialog
          open={retryAllConfirm}
          onClose={() => setRetryAllConfirm(false)}
          onConfirm={handleRetryAll}
          title="Retry All Failed Jobs"
          message={`This will re-queue ${stats.failed} failed jobs for processing.`}
          confirmVariant="default"
          confirmLabel="Retry All"
        />
      )}
    </div>
  );
}
