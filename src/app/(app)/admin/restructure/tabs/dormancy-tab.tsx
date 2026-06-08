"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Moon,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Trash2,
  Clock,
  BookOpen,
} from "lucide-react";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { formatRelativeTime } from "@/lib/date-formatter";

interface DormantPage {
  path: string;
  frontmatter: {
    title?: string;
    type?: string;
    subtype?: string;
    status?: string;
    created?: string;
    updated?: string;
    tags?: string[];
    superseded_by?: string;
  };
}

export function DormancyTab() {
  const [pages, setPages] = useState<DormantPage[]>([]);
  const [allPages, setAllPages] = useState<DormantPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [wakeTarget, setWakeTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wiki");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to fetch pages");
      } else {
        const raw = json.pages || [];
        // API may or may not return dormant pages; we filter client-side
        const dormant = raw.filter(
          (p: DormantPage) => p.frontmatter?.status === "dormant"
        );
        setAllPages(raw);
        setPages(dormant);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch pages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => loadPages());
  }, [loadPages]);

  async function handleWake(path: string) {
    setActionLoading(path);
    setActionError(null);
    try {
      const slug = path.replace(/\.md$/i, "").split("/");
      const res = await fetch(`/api/wiki/${slug.map(encodeURIComponent).join("/")}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontmatter: { status: "draft" },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || "Failed to wake page");
      } else {
        // Remove from dormant list
        setPages((prev) => prev.filter((p) => p.path !== path));
        setWakeTarget(null);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to wake page");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(path: string) {
    setActionLoading(path);
    setActionError(null);
    try {
      const slug = path.replace(/\.md$/i, "").split("/");
      const res = await fetch(`/api/wiki/${slug.map(encodeURIComponent).join("/")}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || "Failed to delete page");
      } else {
        // Remove from dormant list
        setPages((prev) => prev.filter((p) => p.path !== path));
        setDeleteTarget(null);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to delete page");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-text-muted">
            Manage dormant (superseded) wiki pages. Wake to restore as draft, or delete permanently.
          </p>
        </div>
        <button
          onClick={loadPages}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-highlight disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-error/20 bg-error/5 px-4 py-2.5">
          <XCircle className="h-4 w-4 text-error flex-shrink-0" />
          <span className="text-xs text-error">{error}</span>
        </div>
      )}

      {/* Action error toast */}
      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/5 px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
          <span className="text-xs text-warning">{actionError}</span>
        </div>
      )}

      {/* Loading */}
      {loading && <LoadingState message="Loading wiki pages..." />}

      {/* Empty state */}
      {!loading && !error && pages.length === 0 && allPages.length === 0 && (
        <EmptyState
          icon={Moon}
          title="No wiki pages found"
          description="There are no wiki pages to check for dormancy."
        />
      )}

      {!loading && !error && pages.length === 0 && allPages.length > 0 && (
        <EmptyState
          icon={Moon}
          title="No dormant pages"
          description="All wiki pages are active. Dormant pages will appear here when pages are merged or marked as superseded."
        />
      )}

      {/* Dormant pages list */}
      {!loading && pages.length > 0 && (
        <div className="rounded-lg border border-border-default bg-bg-elevated overflow-hidden">
          {/* Header row */}
          <div className="flex items-center gap-3 border-b border-border-default bg-bg-raised px-4 py-2 text-xxs font-medium text-text-muted">
            <div className="flex-1">Title</div>
            <div className="w-48">Path</div>
            <div className="w-20">Type</div>
            <div className="w-28">Date</div>
            <div className="w-32 text-right">Actions</div>
          </div>

          <div className="divide-y divide-border-default">
            {pages.map((page) => {
              const title = page.frontmatter?.title || page.path.split("/").pop()?.replace(".md", "") || "";
              const type = page.frontmatter?.type || "—";
              const updated = page.frontmatter?.updated || page.frontmatter?.created || "";
              const isLoading = actionLoading === page.path;

              return (
                <div key={page.path} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Moon className="h-3.5 w-3.5 text-text-muted flex-shrink-0" />
                      <span className="text-xs font-medium text-text-primary truncate">
                        {title}
                      </span>
                      {page.frontmatter?.superseded_by && (
                        <span className="text-xxs text-text-muted truncate">
                          superseded by {page.frontmatter.superseded_by}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-48 min-w-0">
                    <span className="text-xxs text-text-muted truncate block">{page.path}</span>
                  </div>
                  <div className="w-20">
                    <span className="text-xxs capitalize text-text-secondary">{type}</span>
                  </div>
                  <div className="w-28 flex items-center gap-1">
                    <Clock className="h-3 w-3 text-text-muted flex-shrink-0" />
                    <span className="text-xxs text-text-muted">
                      {updated ? formatRelativeTime(updated) : "—"}
                    </span>
                  </div>
                  <div className="w-32 flex justify-end gap-1">
                    <button
                      onClick={() => setWakeTarget(page.path)}
                      disabled={isLoading}
                      className="rounded p-1.5 text-text-muted transition-colors hover:bg-success/10 hover:text-success disabled:opacity-50"
                      title="Wake to draft"
                    >
                      {isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(page.path)}
                      disabled={isLoading}
                      className="rounded p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                      title="Delete permanently"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Wake confirmation */}
      {wakeTarget && (
        <ConfirmationDialog
          open={!!wakeTarget}
          onClose={() => setWakeTarget(null)}
          onConfirm={() => handleWake(wakeTarget)}
          title="Wake Page"
          message={`Restore "${wakeTarget}" to draft status? The page will become active and editable again.`}
          confirmVariant="default"
          confirmLabel="Wake to Draft"
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmationDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
          title="Delete Page Permanently"
          message={`Are you sure you want to permanently delete "${deleteTarget}"? This action cannot be undone, and the page will be removed from disk.`}
          confirmVariant="danger"
          confirmLabel="Delete Permanently"
        />
      )}
    </div>
  );
}
