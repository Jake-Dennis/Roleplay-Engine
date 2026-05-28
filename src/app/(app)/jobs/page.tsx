"use client";

import { useEffect, useState, useCallback } from "react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useActiveUniverse } from "@/contexts/active-universe";
import { safeParse } from "@/lib/safe-json";
import { JobsHeader } from "@/components/jobs/jobs-header";
import { StatsCards } from "@/components/jobs/stats-cards";
import { FilterBar } from "@/components/jobs/filter-bar";
import { ReindexSection } from "@/components/jobs/reindex-section";
import { JobTable } from "@/components/jobs/job-table";
import type { Job, Stats } from "@/lib/jobs/types";

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
  const [retryAllConfirm, setRetryAllConfirm] = useState(false);
  const [reindexing, setReindexing] = useState<string | null>(null);
  const [reindexResult, setReindexResult] = useState<string | null>(null);

  const loadJobs = useCallback(async (status?: string) => {
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (activeUniverse) params.set("universe_id", activeUniverse.id);
      setLoading(true);
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
    const interval = setInterval(() => { loadJobs(statusFilter); }, 10000);
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

    const handleRefresh = () => loadJobs(statusFilter);
    evtSource.addEventListener("job:completed", handleRefresh);
    evtSource.addEventListener("job:failed", handleRefresh);

    return () => { evtSource.close(); };
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

  const filteredJobs = jobs.filter((j) => {
    if (typeFilter !== "all" && j.type !== typeFilter) return false;
    return true;
  });

  return (
    <>
      <JobsHeader
        stats={stats}
        onRefresh={() => loadJobs(statusFilter)}
        onQueueIdle={handleQueueIdle}
        onProcessNext={handleProcessNext}
        onProcessAll={handleProcessAll}
        onRetryAll={() => setRetryAllConfirm(true)}
        onCancelAll={() => setCancelAllConfirm(true)}
        processing={processing}
      />
      <StatsCards stats={stats} />
      <ReindexSection onReindex={handleReindex} reindexing={reindexing} reindexResult={reindexResult} />
      <FilterBar
        status={statusFilter}
        type={typeFilter}
        onStatusChange={(s) => { setStatusFilter(s); loadJobs(s); }}
        onTypeChange={setTypeFilter}
      />
      <JobTable
        jobs={filteredJobs}
        loading={loading}
        variant="cards"
        expandedId={expandedId}
        onToggleExpand={setExpandedId}
        onCancel={(id) => setCancelTarget(id)}
        onRetry={handleRetry}
      />

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
    </>
  );
}
