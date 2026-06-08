"use client";

import { useState, useCallback } from "react";
import {
  Merge,
  Loader2,
  Search,
  CheckCircle,
  XCircle,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";

const STRATEGIES = [
  { value: "A", label: "A — Same title, different paths", desc: "Cheapest — compares page titles across folders" },
  { value: "B", label: "B — High wikilink overlap", desc: "Medium — pages that link to the same targets" },
  { value: "C", label: "C — LLM analysis", desc: "Expensive — LLM analysis of top candidates (stub)" },
] as const;

interface MergeCandidate {
  pageA: string;
  pageB: string;
  confidence: number;
  reason: string;
  strategy: string;
}

interface MergeResult {
  mergedFrom: string;
  kept: string;
  linksUpdated: number;
  redirectCreated: boolean;
}

export function MergeSuggestionsTab() {
  const [strategy, setStrategy] = useState("A");
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);

  // Merge state
  const [mergingPair, setMergingPair] = useState<MergeCandidate | null>(null);
  const [keepRedirect, setKeepRedirect] = useState(true);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  async function handleScan() {
    setScanLoading(true);
    setScanError(null);
    setHasScanned(false);
    setCandidates([]);

    try {
      const params = new URLSearchParams({ strategy, limit: "20" });
      const res = await fetch(`/api/wiki/merge-suggestions?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setScanError(json.error || "Scan request failed");
      } else {
        setCandidates(json.candidates || []);
        setHasScanned(true);
      }
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : "Failed to scan");
    } finally {
      setScanLoading(false);
    }
  }

  function openMergeDialog(candidate: MergeCandidate) {
    setMergingPair(candidate);
    setMergeResult(null);
    setMergeError(null);
    setKeepRedirect(true);
  }

  async function handleMerge() {
    if (!mergingPair) return;
    setMergeLoading(true);
    setMergeError(null);

    try {
      const res = await fetch("/api/wiki/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keepPath: mergingPair.pageA,
          mergePath: mergingPair.pageB,
          redirect: keepRedirect,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMergeError(json.error || "Merge request failed");
      } else {
        setMergeResult(json);
        // Remove merged pair from candidates list
        setCandidates((prev) =>
          prev.filter(
            (c) =>
              !(c.pageA === mergingPair.pageA && c.pageB === mergingPair.pageB)
          )
        );
      }
    } catch (err: unknown) {
      setMergeError(err instanceof Error ? err.message : "Failed to merge");
    } finally {
      setMergeLoading(false);
    }
  }

  function confidenceColor(confidence: number): string {
    if (confidence >= 0.8) return "bg-error";
    if (confidence >= 0.5) return "bg-warning";
    return "bg-accent";
  }

  function confidenceLabel(confidence: number): string {
    if (confidence >= 0.8) return "High";
    if (confidence >= 0.5) return "Medium";
    return "Low";
  }

  return (
    <div className="space-y-6">
      {/* Strategy selector */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5 min-w-64">
          <label className="text-xxs font-medium tracking-wider text-text-muted uppercase">
            Strategy
          </label>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent"
          >
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="text-xxs text-text-muted">
            {STRATEGIES.find((s) => s.value === strategy)?.desc}
          </span>
        </div>

        <button
          onClick={handleScan}
          disabled={scanLoading}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {scanLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Scan
        </button>
      </div>

      {/* Scan error */}
      {scanError && (
        <div className="flex items-center gap-2 rounded-lg border border-error/20 bg-error/5 px-4 py-2.5">
          <XCircle className="h-4 w-4 text-error flex-shrink-0" />
          <span className="text-xs text-error">{scanError}</span>
        </div>
      )}

      {/* Candidates list */}
      {scanLoading && (
        <LoadingState message={`Scanning with strategy ${strategy}...`} icon={Search} />
      )}

      {!scanLoading && hasScanned && candidates.length === 0 && (
        <EmptyState
          icon={Merge}
          title="No merge candidates found"
          description={`Strategy ${strategy} did not find any duplicate pages. Try a different strategy.`}
        />
      )}

      {!scanLoading && candidates.length > 0 && (
        <div className="rounded-lg border border-border-default bg-bg-elevated">
          <div className="border-b border-border-default px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Merge className="h-4 w-4 text-text-accent" />
              <span className="text-xs font-medium text-text-primary">
                {candidates.length} candidate pair{candidates.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="divide-y divide-border-default">
            {candidates.map((c, idx) => (
              <div key={`${c.pageA}-${c.pageB}-${idx}`} className="px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Page A vs Page B */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="truncate max-w-[180px] text-text-primary font-medium">{c.pageA}</span>
                      <span className="text-text-muted">vs</span>
                      <span className="truncate max-w-[180px] text-text-primary font-medium">{c.pageB}</span>
                    </div>

                    {/* Reason */}
                    <div className="text-xxs text-text-muted">{c.reason}</div>

                    {/* Confidence bar */}
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-bg-raised overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${confidenceColor(c.confidence)}`}
                          style={{ width: `${Math.round(c.confidence * 100)}%` }}
                        />
                      </div>
                      <span className={`text-xxs font-medium ${
                        c.confidence >= 0.8 ? "text-error" : c.confidence >= 0.5 ? "text-warning" : "text-text-accent"
                      }`}>
                        {confidenceLabel(c.confidence)}
                      </span>
                      <span className="text-xxs text-text-muted">
                        ({Math.round(c.confidence * 100)}%)
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => openMergeDialog(c)}
                    className="flex items-center gap-1 rounded-lg border border-border-default bg-bg-raised px-2.5 py-1.5 text-xxs text-text-secondary transition-colors hover:bg-bg-highlight hover:text-text-primary flex-shrink-0"
                  >
                    <Merge className="h-3 w-3" />
                    Merge
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Merge dialog */}
      {mergingPair && (
        <Modal
          open={!!mergingPair}
          onClose={() => { setMergingPair(null); setMergeResult(null); setMergeError(null); }}
          title="Confirm Merge"
          size="md"
        >
          <div className="space-y-4">
            {!mergeResult ? (
              <>
                <div className="rounded-lg bg-bg-raised px-3 py-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-text-muted">Keep (A):</span>
                    <span className="font-medium text-text-primary">{mergingPair.pageA}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-text-muted">Merge (B):</span>
                    <span className="font-medium text-text-primary">{mergingPair.pageB}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-text-muted">Confidence:</span>
                    <span className={`font-medium ${
                      mergingPair.confidence >= 0.8 ? "text-error" : mergingPair.confidence >= 0.5 ? "text-warning" : "text-text-accent"
                    }`}>
                      {Math.round(mergingPair.confidence * 100)}%
                    </span>
                  </div>
                </div>

                <p className="text-xs text-text-secondary leading-relaxed">
                  Merge <strong className="text-text-primary">{mergingPair.pageB}</strong> into{" "}
                  <strong className="text-text-primary">{mergingPair.pageA}</strong>?
                  Content from the merge page will be appended, and wikilinks will be rewritten.
                  The merge page will be marked as dormant.
                </p>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepRedirect}
                    onChange={(e) => setKeepRedirect(e.target.checked)}
                    className="rounded border-border-default bg-bg-raised text-accent focus:ring-accent"
                  />
                  <span className="text-xs text-text-secondary">
                    Create redirect from merged page
                  </span>
                </label>

                {mergeError && (
                  <div className="flex items-center gap-2 rounded-lg border border-error/20 bg-error/5 px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-error flex-shrink-0" />
                    <span className="text-xxs text-error">{mergeError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => { setMergingPair(null); setMergeResult(null); setMergeError(null); }}
                    disabled={mergeLoading}
                    className="rounded-lg border border-border-default bg-bg-raised px-3.5 py-2 text-xs font-medium text-text-muted hover:text-text-primary disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMerge}
                    disabled={mergeLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {mergeLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Merge className="h-3.5 w-3.5" />
                    )}
                    Merge B into A
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center gap-3 py-4">
                  <CheckCircle className="h-10 w-10 text-success" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-text-primary">Merge Complete</p>
                    <p className="mt-1 text-xs text-text-muted">
                      Merged from <span className="font-mono text-text-secondary">{mergeResult.mergedFrom}</span>
                    </p>
                    <p className="text-xs text-text-muted">
                      Kept <span className="font-mono text-text-secondary">{mergeResult.kept}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xxs text-text-muted">
                    <span>{mergeResult.linksUpdated} links updated</span>
                    <span>·</span>
                    <span>Redirect: {mergeResult.redirectCreated ? "Yes" : "No"}</span>
                  </div>
                </div>

                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => { setMergingPair(null); setMergeResult(null); setMergeError(null); }}
                    className="rounded-lg border border-border-default bg-bg-raised px-3.5 py-2 text-xs font-medium text-text-secondary hover:text-text-primary"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
