"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  Shield,
  XCircle,
} from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { safeParse } from "@/lib/safe-json";
import { StatsCards, type StatCardItem } from "@/components/jobs/stats-cards";
import { FilterBar } from "@/components/jobs/filter-bar";
import { JobTable } from "@/components/jobs/job-table";
import type { Job, Stats } from "@/lib/jobs/types";

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats>({
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadJobs = useCallback(async (status?: string) => {
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      const res = await fetch(`/api/jobs?${params}`);
      const json = await res.json();
      setJobs(json.jobs || []);
      setStats(
        json.stats || {
          queued: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
          total: 0,
        }
      );
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => loadJobs());
  }, [loadJobs]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadJobs(statusFilter);
    }, 10000);
    return () => clearInterval(interval);
  }, [loadJobs, statusFilter]);

  // SSE for real-time updates
  useEffect(() => {
    const evtSource = new EventSource("/api/jobs/stream");

    evtSource.addEventListener("job:progress", (e) => {
      const data = safeParse<Record<string, unknown>>(e.data);
      if (data?.jobId) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === data.jobId
              ? {
                  ...j,
                  progress: data.progress as number,
                  progress_message: data.message as string | null,
                }
              : j
          )
        );
      }
    });

    evtSource.addEventListener("job:completed", () => {
      loadJobs(statusFilter);
    });

    evtSource.addEventListener("job:failed", () => {
      loadJobs(statusFilter);
    });

    return () => {
      evtSource.close();
    };
  }, [loadJobs, statusFilter]);

  async function handleCancel(id: string) {
    setActionLoading(id);
    try {
      await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", jobId: id }),
      });
      setCancelTarget(null);
      await loadJobs(statusFilter);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRetry(id: string) {
    setActionLoading(id);
    try {
      await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry", jobId: id }),
      });
      setRetryTarget(null);
      await loadJobs(statusFilter);
    } finally {
      setActionLoading(null);
    }
  }

  // Compute completed-today count from fetched jobs
  const completedToday = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    return jobs.filter((j) => {
      if (j.status !== "completed") return false;
      return new Date(j.created_at) >= startOfDay;
    }).length;
  }, [jobs]);

  // Custom stat cards for admin view (Queued, Processing, Failed, Completed Today)
  const statItems: StatCardItem[] = useMemo(
    () => [
      {
        label: "Queued",
        value: stats.queued,
        icon: Clock,
        color: "text-accent",
        bg: "bg-accent/10",
      },
      {
        label: "Processing",
        value: stats.processing,
        icon: Loader2,
        color: "text-warning",
        bg: "bg-warning/10",
      },
      {
        label: "Failed",
        value: stats.failed,
        icon: XCircle,
        color: "text-error",
        bg: "bg-error/10",
      },
      {
        label: "Completed Today",
        value: completedToday,
        icon: CheckCircle,
        color: "text-success",
        bg: "bg-success/10",
      },
    ],
    [stats, completedToday]
  );

  // Client-side filtering for type and date range
  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (typeFilter !== "all" && j.type !== typeFilter) return false;
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        if (new Date(j.created_at) < fromDate) return false;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (new Date(j.created_at) > toDate) return false;
      }
      return true;
    });
  }, [jobs, typeFilter, dateFrom, dateTo]);

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-text-accent" />
            <h1 className="text-lg font-semibold text-text-primary">
              Admin: Job Queue
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Monitor and manage all background jobs
          </p>
        </div>
        <button
          onClick={() => loadJobs(statusFilter)}
          className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-highlight"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <StatsCards stats={stats} items={statItems} className="grid-cols-4" />

      {/* Status + Type filters */}
      <FilterBar
        status={statusFilter}
        type={typeFilter}
        onStatusChange={(s) => {
          setStatusFilter(s);
          loadJobs(s);
        }}
        onTypeChange={setTypeFilter}
      />

      {/* Date range filters (admin-specific) */}
      <div className="mb-4 flex items-center gap-3">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-lg border border-border-default bg-bg-elevated px-2.5 py-1.5 text-xs text-text-secondary"
          title="From date"
        />
        <span className="text-xxs text-text-muted">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-lg border border-border-default bg-bg-elevated px-2.5 py-1.5 text-xs text-text-secondary"
          title="To date"
        />
      </div>

      {/* Auto-refresh indicator */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        <span className="text-xxs text-text-muted">
          Auto-refreshing every 10s
        </span>
        <span className="text-xxs text-text-muted">&middot;</span>
        <span className="text-xxs text-text-muted">
          {filteredJobs.length} job{filteredJobs.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Job Table (admin table variant) */}
      <JobTable
        jobs={filteredJobs}
        loading={loading}
        variant="table"
        onCancel={(id) => setCancelTarget(id)}
        onRetry={(id) => setRetryTarget(id)}
        actionLoading={actionLoading}
      />

      {/* Cancel confirmation dialog */}
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

      {/* Retry confirmation dialog */}
      {retryTarget && (
        <ConfirmationDialog
          open={!!retryTarget}
          onClose={() => setRetryTarget(null)}
          onConfirm={() => handleRetry(retryTarget)}
          title="Retry Job"
          message="This will re-queue the job for processing."
          confirmVariant="default"
          confirmLabel="Retry"
        />
      )}
    </>
  );
}
