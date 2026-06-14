"use client";

import { useState, useEffect } from "react";
import {
  Tags,
  Loader2,
  Eye,
  CheckCircle,
  XCircle,
  Filter,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useApp } from "@/contexts/app-context";

const DEFAULT_TYPES = ["entity", "concept", "source", "synthesis"];
const STATUS_OPTIONS = ["", "draft", "reviewed", "locked", "rejected"];

interface RecategorizeChange {
  path: string;
  proposed: {
    subtype?: string;
    tags?: string[];
    newFolder?: string;
    type?: string;
    status?: string;
  };
}

interface RecategorizeResult {
  changes: RecategorizeChange[];
  errors: Array<{ path: string; error: string }>;
  totalAffected: number;
}

export function BulkRecategorizeTab() {
  const { activeUniverse } = useApp();
  const universeId = activeUniverse?.id;

  // Filters
  const [filterType, setFilterType] = useState("");
  const [filterSubtype, setFilterSubtype] = useState("");
  const [filterTags, setFilterTags] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Changes
  const [newSubtype, setNewSubtype] = useState("");
  const [newType, setNewType] = useState("");
  const [newTags, setNewTags] = useState("");
  const [addTags, setAddTags] = useState("");
  const [removeTags, setRemoveTags] = useState("");
  const [newStatus, setNewStatus] = useState("");

  // Dynamic options loaded from config
  const [typeOptions, setTypeOptions] = useState<string[]>(["", ...DEFAULT_TYPES]);
  const [subtypeOptions, setSubtypeOptions] = useState<string[]>([""]);

  // Load wiki config for dynamic type/subtype options
  useEffect(() => {
    fetch(`/api/wiki/config${universeId ? `?universe_id=${universeId}` : ""}`)
      .then((r) => r.json())
      .then((config) => {
        const types = config.types ? Object.keys(config.types) : DEFAULT_TYPES;
        setTypeOptions(["", ...types]);
        const subtypes = Array.isArray(config.subtypes) ? config.subtypes : [];
        setSubtypeOptions(["", ...subtypes]);
      })
      .catch(() => {
        // Fallback to defaults
        setTypeOptions(["", ...DEFAULT_TYPES]);
      });
  }, [universeId]);

  // State
  const [previewResult, setPreviewResult] = useState<RecategorizeResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function buildFilter() {
    const filter: Record<string, string | string[]> = {};
    if (filterType) filter.type = filterType;
    if (filterSubtype) filter.subtype = filterSubtype;
    if (filterTags) filter.tags = filterTags.split(",").map((t) => t.trim()).filter(Boolean);
    if (filterStatus) filter.status = filterStatus;
    return filter;
  }

  function buildChanges() {
    const changes: Record<string, string | string[]> = {};
    if (newSubtype) changes.newSubtype = newSubtype;
    if (newType) changes.newType = newType;
    if (newTags) changes.newTags = newTags.split(",").map((t) => t.trim()).filter(Boolean);
    if (addTags) changes.addTags = addTags.split(",").map((t) => t.trim()).filter(Boolean);
    if (removeTags) changes.removeTags = removeTags.split(",").map((t) => t.trim()).filter(Boolean);
    if (newStatus) changes.newStatus = newStatus;
    return changes;
  }

  function hasChanges() {
    return !!(newSubtype || newType || newTags || addTags || removeTags || newStatus);
  }

  function hasFilters() {
    return !!(filterType || filterSubtype || filterTags || filterStatus);
  }

  async function handlePreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewResult(null);

    const changes = buildChanges();
    if (Object.keys(changes).length === 0) {
      setPreviewError("At least one change field must be specified.");
      setPreviewLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/wiki/bulk-recategorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter: buildFilter(),
          changes,
          universeId,
          dryRun: true,
        }),
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

    const changes = buildChanges();
    try {
      const res = await fetch("/api/wiki/bulk-recategorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter: buildFilter(),
          changes,
          dryRun: false,
          universeId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPreviewError(json.error || "Apply request failed");
      } else {
        setPreviewResult(json);
      }
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : "Failed to apply");
    } finally {
      setApplyLoading(false);
      setShowConfirm(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filter section */}
      <div className="rounded-lg border border-border-default bg-bg-elevated">
        <div className="flex items-center gap-2 border-b border-border-default px-4 py-2.5">
          <Filter className="h-4 w-4 text-text-muted" />
          <span className="text-xs font-medium text-text-primary">Filter Pages</span>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xxs font-medium tracking-wider text-text-muted uppercase">Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent"
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>{t || "Any"}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xxs font-medium tracking-wider text-text-muted uppercase">Subtype</label>
            <select
              value={filterSubtype}
              onChange={(e) => setFilterSubtype(e.target.value)}
              className="rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent"
            >
              {subtypeOptions.map((s) => (
                <option key={s} value={s}>{s || "Any"}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xxs font-medium tracking-wider text-text-muted uppercase">Tags (comma-separated)</label>
            <input
              type="text"
              value={filterTags}
              onChange={(e) => setFilterTags(e.target.value)}
              placeholder="e.g. wizard, istari"
              className="rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xxs font-medium tracking-wider text-text-muted uppercase">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s || "Any"}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Changes section */}
      <div className="rounded-lg border border-border-default bg-bg-elevated">
        <div className="flex items-center gap-2 border-b border-border-default px-4 py-2.5">
          <Tags className="h-4 w-4 text-text-muted" />
          <span className="text-xs font-medium text-text-primary">Changes to Apply</span>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xxs font-medium tracking-wider text-text-muted uppercase">New Type</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent"
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>{t || "No change"}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xxs font-medium tracking-wider text-text-muted uppercase">New Subtype</label>
            <select
              value={newSubtype}
              onChange={(e) => setNewSubtype(e.target.value)}
              className="rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent"
            >
              {subtypeOptions.map((s) => (
                <option key={s} value={s}>{s || "No change"}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xxs font-medium tracking-wider text-text-muted uppercase">New Tags (replace)</label>
            <input
              type="text"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              placeholder="e.g. wizard, maiar"
              className="rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xxs font-medium tracking-wider text-text-muted uppercase">New Status</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s || "No change"}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xxs font-medium tracking-wider text-text-muted uppercase">Add Tags</label>
            <input
              type="text"
              value={addTags}
              onChange={(e) => setAddTags(e.target.value)}
              placeholder="e.g. magical, ancient"
              className="rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xxs font-medium tracking-wider text-text-muted uppercase">Remove Tags</label>
            <input
              type="text"
              value={removeTags}
              onChange={(e) => setRemoveTags(e.target.value)}
              placeholder="e.g. deprecated"
              className="rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePreview}
          disabled={previewLoading || !hasChanges()}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {previewLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          Preview
        </button>
        {!hasChanges() && (
          <span className="text-xxs text-text-muted">Specify at least one change above</span>
        )}
        {hasChanges() && !hasFilters() && (
          <span className="text-xxs text-text-muted">No filter set — will affect all pages</span>
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
          <div className="flex items-center justify-between border-b border-border-default px-4 py-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle
                className={`h-4 w-4 ${previewResult.changes.length > 0 ? "text-success" : "text-text-muted"}`}
              />
              <span className="text-xs font-medium text-text-primary">
                Preview — {previewResult.totalAffected} page{previewResult.totalAffected !== 1 ? "s" : ""} affected
              </span>
            </div>
          </div>

          {previewResult.changes.length > 0 && (
            <div className="max-h-80 overflow-y-auto px-4 py-2 space-y-1">
              {previewResult.changes.map((c) => (
                <div key={c.path} className="rounded-md bg-bg-raised px-3 py-2">
                  <div className="flex items-center gap-2 text-xxs">
                    <Tags className="h-3 w-3 text-text-muted flex-shrink-0" />
                    <span className="font-medium text-text-primary">{c.path}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xxs text-text-muted">
                    {c.proposed.type && (
                      <span>type: <span className="text-text-secondary">{c.proposed.type}</span></span>
                    )}
                    {c.proposed.subtype && (
                      <span>subtype: <span className="text-text-secondary">{c.proposed.subtype}</span></span>
                    )}
                    {c.proposed.status && (
                      <span>status: <span className="text-text-secondary">{c.proposed.status}</span></span>
                    )}
                    {c.proposed.tags && c.proposed.tags.length > 0 && (
                      <span>tags: <span className="text-text-secondary">{c.proposed.tags.join(", ")}</span></span>
                    )}
                    {c.proposed.newFolder && (
                      <span>folder: <span className="text-text-secondary">{c.proposed.newFolder}</span></span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {previewResult.errors.length > 0 && (
            <div className="border-t border-border-default px-4 py-2 space-y-1">
              <span className="text-xxs font-medium text-error">Errors ({previewResult.errors.length})</span>
              {previewResult.errors.map((e) => (
                <div key={e.path} className="flex items-center gap-2 text-xxs text-text-muted">
                  <XCircle className="h-3 w-3 text-error" />
                  <span>{e.path}</span>
                  <span className="text-error">— {e.error}</span>
                </div>
              ))}
            </div>
          )}

          {/* Apply button */}
          {previewResult.changes.length > 0 && (
            <div className="border-t border-border-default px-4 py-2.5">
              <button
                onClick={() => setShowConfirm(true)}
                disabled={applyLoading}
                className="flex items-center gap-1.5 rounded-lg bg-warning px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-warning/90 disabled:opacity-50"
              >
                {applyLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Tags className="h-3.5 w-3.5" />
                )}
                Apply Changes ({previewResult.changes.length})
              </button>
            </div>
          )}

          {/* Empty result */}
          {previewResult.changes.length === 0 && previewResult.errors.length === 0 && (
            <div className="px-4 py-6">
              <EmptyState
                icon={Tags}
                title="No pages matched"
                description="No pages match the current filter criteria."
              />
            </div>
          )}
        </div>
      )}

      {/* Apply confirmation */}
      {showConfirm && (
        <ConfirmationDialog
          open={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={handleApply}
          title="Confirm Bulk Re-categorize"
          message={`Are you sure you want to apply changes to ${previewResult?.changes.length ?? 0} page${(previewResult?.changes.length ?? 0) !== 1 ? "s" : ""}? This may move files between folders and update wikilinks.`}
          confirmVariant="danger"
          confirmLabel="Apply Changes"
        />
      )}
    </div>
  );
}
