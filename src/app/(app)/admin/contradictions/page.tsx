"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  Filter,
  RefreshCw,
  Clock,
} from "lucide-react";
import { StatusBadge, statusToVariant } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/date-formatter";

interface Contradiction {
  id: string;
  entityName: string;
  pageA: string;
  pageB: string;
  claimA: string;
  claimB: string;
  contradictionType: string;
  severity: string;
  status: string;
  detectedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

const STAT_FILTERS = ["all", "open", "resolved", "dismissed"] as const;

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function getWikiPageHref(pageName: string): string {
  // Try to find the wiki page - uses catch-all [[...slug]] route
  return `/wiki/${encodeURIComponent(pageName)}`;
}

export default function AdminContradictionsPage() {
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadContradictions = useCallback(async (status?: string, cursor?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "50");
      const res = await fetch(`/api/admin/contradictions?${params}`);
      const json = await res.json();
      if (cursor) {
        setContradictions((prev) => [...prev, ...(json.contradictions || [])]);
      } else {
        setContradictions(json.contradictions || []);
      }
      setNextCursor(json.nextCursor);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => loadContradictions(statusFilter));
  }, [loadContradictions, statusFilter]);

  async function handleStatusChange(id: string, newStatus: "resolved" | "dismissed") {
    setActionLoading(id);
    try {
      await fetch(`/api/admin/contradictions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      // Update local state
      setContradictions((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: newStatus, resolvedAt: new Date().toISOString() } : c
        )
      );
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  async function handleFilterChange(filter: string) {
    setStatusFilter(filter);
    setExpandedId(null);
    setNextCursor(null);
  }

  function loadMore() {
    if (nextCursor) {
      loadContradictions(statusFilter, nextCursor);
    }
  }

  // Sort: open first, then by severity
  const sortedContradictions = [...contradictions].sort((a, b) => {
    const statusOrder = { open: 0, resolved: 1, dismissed: 2 };
    const aStatus = statusOrder[a.status as keyof typeof statusOrder] ?? 3;
    const bStatus = statusOrder[b.status as keyof typeof statusOrder] ?? 3;
    if (aStatus !== bStatus) return aStatus - bStatus;
    return (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
  });

  const stats = {
    all: contradictions.length,
    open: contradictions.filter((c) => c.status === "open").length,
    resolved: contradictions.filter((c) => c.status === "resolved").length,
    dismissed: contradictions.filter((c) => c.status === "dismissed").length,
  };

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertTriangle className="h-3.5 w-3.5 text-error" />;
      case "high":
        return <AlertTriangle className="h-3.5 w-3.5 text-warning" />;
      case "medium":
        return <AlertTriangle className="h-3.5 w-3.5 text-blue-500" />;
      default:
        return <AlertTriangle className="h-3.5 w-3.5 text-text-muted" />;
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "text-error";
      case "high": return "text-warning";
      case "medium": return "text-blue-500";
      default: return "text-text-muted";
    }
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-text-accent" />
            <h1 className="text-lg font-semibold text-text-primary">Contradiction Review</h1>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Flagged contradictions between wiki pages and lore sources
          </p>
        </div>
        <button
          onClick={() => loadContradictions(statusFilter)}
          className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-highlight"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-border-default bg-bg-elevated px-4 py-3">
          <p className="text-xxs text-text-muted">Total</p>
          <p className="text-xl font-semibold text-text-primary">{stats.all}</p>
        </div>
        <div className="rounded-xl border border-border-default bg-amber-500/5 px-4 py-3">
          <p className="text-xxs text-text-muted">Open</p>
          <p className="text-xl font-semibold text-warning">{stats.open}</p>
        </div>
        <div className="rounded-xl border border-border-default bg-success/5 px-4 py-3">
          <p className="text-xxs text-text-muted">Resolved</p>
          <p className="text-xl font-semibold text-success">{stats.resolved}</p>
        </div>
        <div className="rounded-xl border border-border-default bg-bg-raised px-4 py-3">
          <p className="text-xxs text-text-muted">Dismissed</p>
          <p className="text-xl font-semibold text-text-muted">{stats.dismissed}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <Filter className="h-4 w-4 text-text-muted" />
        <div className="flex gap-1.5">
          {STAT_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => handleFilterChange(s)}
              className={`rounded-md px-2.5 py-1 text-xs capitalize transition-colors ${
                statusFilter === s
                  ? "bg-accent/10 text-text-accent"
                  : "text-text-muted hover:bg-bg-raised hover:text-text-secondary"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Contradiction List */}
      {loading && contradictions.length === 0 ? (
        <LoadingState message="Loading contradictions..." />
      ) : sortedContradictions.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title="No contradictions found"
          description={
            statusFilter !== "all"
              ? `No ${statusFilter} contradictions to show`
              : "No contradictions have been flagged yet"
          }
        />
      ) : (
        <div className="space-y-1">
          {/* Header row */}
          <div className="flex items-center gap-3 rounded-lg bg-bg-raised px-4 py-2 text-xxs font-medium text-text-muted">
            <div className="flex-1">Entity</div>
            <div className="w-48">Sources</div>
            <div className="w-20 text-center">Severity</div>
            <div className="w-22 text-center">Status</div>
            <div className="w-28 text-right">Detected</div>
            <div className="w-28 text-right">Actions</div>
            <div className="w-6" />
          </div>

          {sortedContradictions.map((c) => {
            const isExpanded = expandedId === c.id;
            const isOpen = c.status === "open";
            const isLoading = actionLoading === c.id;

            return (
              <div key={c.id} className="rounded-lg border border-border-default bg-bg-elevated">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setExpandedId(isExpanded ? null : c.id);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left cursor-pointer transition-colors hover:bg-bg-highlight ${
                    c.status === "open" ? "border-l-2 border-l-warning" : "border-l-2 border-l-transparent"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-text-primary">{c.entityName}</span>
                  </div>
                  <div className="w-48 flex items-center gap-1.5 text-xxs text-text-muted">
                    <span className="truncate max-w-[90px]">{c.pageA}</span>
                    <span className="text-text-muted">vs</span>
                    <span className="truncate max-w-[90px]">{c.pageB}</span>
                  </div>
                  <div className="w-20 flex items-center justify-center gap-1">
                    {severityIcon(c.severity)}
                    <span className={`text-xxs font-medium capitalize ${severityColor(c.severity)}`}>
                      {c.severity}
                    </span>
                  </div>
                  <div className="w-22 flex justify-center">
                    <StatusBadge
                      label={c.status}
                      variant={statusToVariant(c.status)}
                    />
                  </div>
                  <div className="w-28 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3 text-text-muted" />
                      <span className="text-xxs text-text-muted">{formatRelativeTime(c.detectedAt)}</span>
                    </div>
                  </div>
                  <div className="w-28 flex justify-end gap-1">
                    {isOpen ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(c.id, "resolved");
                          }}
                          disabled={isLoading}
                          className="rounded p-1 text-success/70 transition-colors hover:bg-success/10 hover:text-success disabled:opacity-50"
                          title="Resolve"
                        >
                          {isLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(c.id, "dismissed");
                          }}
                          disabled={isLoading}
                          className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary disabled:opacity-50"
                          title="Dismiss"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="text-xxs text-text-muted">—</span>
                    )}
                  </div>
                  <div className="w-6">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-text-muted" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-text-muted" />
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border-default px-4 py-3 space-y-3">
                    {/* Claim A */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <a
                          href={getWikiPageHref(c.pageA)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-medium text-text-accent hover:text-accent-hover transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {c.pageA}
                        </a>
                        <StatusBadge label="Source A" variant="info" />
                      </div>
                      <div className="rounded-lg bg-bg-raised px-3 py-2 text-xxs text-text-secondary leading-relaxed">
                        {c.claimA}
                      </div>
                    </div>

                    {/* Claim B */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <a
                          href={getWikiPageHref(c.pageB)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-medium text-text-accent hover:text-accent-hover transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {c.pageB}
                        </a>
                        <StatusBadge label="Source B" variant="info" />
                      </div>
                      <div className="rounded-lg bg-bg-raised px-3 py-2 text-xxs text-text-secondary leading-relaxed">
                        {c.claimB}
                      </div>
                    </div>

                    {/* Metadata row */}
                    <div className="flex items-center gap-4 text-xxs text-text-muted">
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        <span className="capitalize">{c.contradictionType.replace(/_/g, " ")}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>Severity:</span>
                        <span className={`font-medium capitalize ${severityColor(c.severity)}`}>{c.severity}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>Detected: {new Date(c.detectedAt).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Resolution info */}
                    {c.status !== "open" && c.resolution && (
                      <div className="rounded-lg bg-bg-raised px-3 py-2">
                        <span className="text-xxs text-text-muted">Resolution:</span>
                        <p className="mt-0.5 text-xxs text-text-secondary">{c.resolution}</p>
                      </div>
                    )}

                    {/* Action buttons for open contradictions */}
                    {isOpen && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleStatusChange(c.id, "resolved")}
                          disabled={isLoading}
                          className="flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-xxs text-success transition-colors hover:bg-success/20 disabled:opacity-50"
                        >
                          {isLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3 w-3" />
                          )}
                          Mark Resolved
                        </button>
                        <button
                          onClick={() => handleStatusChange(c.id, "dismissed")}
                          disabled={isLoading}
                          className="flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xxs text-text-secondary transition-colors hover:bg-bg-raised disabled:opacity-50"
                        >
                          <XCircle className="h-3 w-3" />
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Load more */}
          {nextCursor && (
            <div className="flex justify-center pt-2">
              <button
                onClick={loadMore}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-4 py-2 text-xs text-text-secondary transition-colors hover:bg-bg-highlight disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                Load More
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
