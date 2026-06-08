"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Move,
  Loader2,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

const FOLDER_OPTIONS = ["entities", "concepts", "sources", "synthesis"];

interface WikiPageRef {
  path: string;
  frontmatter: { title?: string; type?: string; status?: string };
}

interface BulkMoveResult {
  moved: string[];
  failed: Array<{ path: string; reason: string }>;
  linksUpdated: number;
}

export function BulkMoveTab() {
  const [fromFolder, setFromFolder] = useState(FOLDER_OPTIONS[0]);
  const [toFolder, setToFolder] = useState(FOLDER_OPTIONS[1]);
  const [pages, setPages] = useState<WikiPageRef[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [previewResult, setPreviewResult] = useState<BulkMoveResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const loadPages = useCallback(async () => {
    setPagesLoading(true);
    try {
      const res = await fetch("/api/wiki");
      const json = await res.json();
      setPages(json.pages || []);
    } catch {
      // ignore — preview button will handle errors
    } finally {
      setPagesLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => loadPages());
  }, [loadPages]);

  // Filter pages by source folder prefix
  const sourcePages = pages.filter((p) => p.path.startsWith(fromFolder + "/"));

  // Build preview moves: replace top-level folder with destination
  function buildMoves() {
    return sourcePages.map((p) => {
      const rest = p.path.slice(fromFolder.length);
      const newPath = `${toFolder}${rest}`;
      return { oldPath: p.path, newPath };
    });
  }

  async function handlePreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewResult(null);

    const moves = buildMoves();
    if (moves.length === 0) {
      setPreviewError("No pages found in the selected folder.");
      setPreviewLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/wiki/bulk-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moves, dryRun: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPreviewError(json.error || "Preview request failed");
      } else {
        setPreviewResult(json);
      }
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : "Failed to preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleApply() {
    setApplyLoading(true);
    setPreviewError(null);

    const moves = buildMoves();
    try {
      const res = await fetch("/api/wiki/bulk-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moves, dryRun: false }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPreviewError(json.error || "Apply request failed");
      } else {
        setPreviewResult(json);
        // Refresh page listing
        await loadPages();
      }
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : "Failed to apply");
    } finally {
      setApplyLoading(false);
      setShowConfirm(false);
    }
  }

  const candidateCount = sourcePages.length;

  return (
    <div className="space-y-6">
      {/* Folder selectors */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xxs font-medium tracking-wider text-text-muted uppercase">
            From Folder
          </label>
          <select
            value={fromFolder}
            onChange={(e) => { setFromFolder(e.target.value); setPreviewResult(null); }}
            className="rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent"
          >
            {FOLDER_OPTIONS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xxs font-medium tracking-wider text-text-muted uppercase">
            To Folder
          </label>
          <select
            value={toFolder}
            onChange={(e) => { setToFolder(e.target.value); setPreviewResult(null); }}
            className="rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent"
          >
            {FOLDER_OPTIONS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        {fromFolder === toFolder && (
          <div className="flex items-center gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xxs text-warning">
            <AlertTriangle className="h-3 w-3" />
            Source and destination are the same
          </div>
        )}
      </div>

      {/* Preview results area */}
      <div className="space-y-3">
        {/* Preview button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePreview}
            disabled={previewLoading || fromFolder === toFolder || candidateCount === 0}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {previewLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            Preview
          </button>
          {pagesLoading && (
            <span className="text-xxs text-text-muted">Loading pages...</span>
          )}
          {!pagesLoading && (
            <span className="text-xxs text-text-muted">
              {candidateCount} page{candidateCount !== 1 ? "s" : ""} in {fromFolder}
            </span>
          )}
        </div>

        {/* Preview error */}
        {previewError && (
          <div className="flex items-center gap-2 rounded-lg border border-error/20 bg-error/5 px-4 py-2.5">
            <XCircle className="h-4 w-4 text-error flex-shrink-0" />
            <span className="text-xs text-error">{previewError}</span>
          </div>
        )}

        {/* Preview result */}
        {previewResult && (
          <div className="rounded-lg border border-border-default bg-bg-elevated">
            <div className="border-b border-border-default px-4 py-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle
                  className={`h-4 w-4 ${previewResult.moved.length > 0 ? "text-success" : "text-text-muted"}`}
                />
                <span className="text-xs font-medium text-text-primary">
                  Preview — {previewResult.moved.length} file{previewResult.moved.length !== 1 ? "s" : ""} to move
                </span>
                {previewResult.linksUpdated > 0 && (
                  <span className="text-xxs text-text-muted">
                    · {previewResult.linksUpdated} links to update
                  </span>
                )}
              </div>
            </div>

            {previewResult.moved.length > 0 && (
              <div className="max-h-64 overflow-y-auto px-4 py-2 space-y-1">
                {previewResult.moved.map((path) => {
                  const rest = path.slice(fromFolder.length);
                  const newPath = `${toFolder}${rest}`;
                  return (
                    <div key={path} className="flex items-center gap-2 rounded-md bg-bg-raised px-3 py-1.5 text-xxs">
                      <Move className="h-3 w-3 text-text-muted flex-shrink-0" />
                      <span className="text-text-muted line-through truncate">{path}</span>
                      <span className="text-text-muted">→</span>
                      <span className="text-text-primary truncate">{newPath}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {previewResult.failed.length > 0 && (
              <div className="border-t border-border-default px-4 py-2 space-y-1">
                <span className="text-xxs font-medium text-error">Failed</span>
                {previewResult.failed.map((f) => (
                  <div key={f.path} className="flex items-center gap-2 text-xxs text-text-muted">
                    <XCircle className="h-3 w-3 text-error" />
                    <span>{f.path}</span>
                    <span className="text-error">— {f.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Apply button */}
            {previewResult.moved.length > 0 && (
              <div className="border-t border-border-default px-4 py-2.5">
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={applyLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-warning px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-warning/90 disabled:opacity-50"
                >
                  {applyLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Move className="h-3.5 w-3.5" />
                  )}
                  Apply Moves ({previewResult.moved.length})
                </button>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!previewLoading && !previewResult && !previewError && candidateCount === 0 && !pagesLoading && (
          <EmptyState
            icon={Move}
            title="No pages to move"
            description={`The "${fromFolder}" folder is empty.`}
          />
        )}
      </div>

      {/* Apply confirmation */}
      {showConfirm && (
        <ConfirmationDialog
          open={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={handleApply}
          title="Confirm Bulk Move"
          message={`Are you sure you want to move ${previewResult?.moved.length ?? 0} page${(previewResult?.moved.length ?? 0) !== 1 ? "s" : ""} from "${fromFolder}" to "${toFolder}"? This will update all wikilinks pointing to moved pages.`}
          confirmVariant="danger"
          confirmLabel="Apply Move"
        />
      )}
    </div>
  );
}
