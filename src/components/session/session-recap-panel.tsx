"use client";

/**
 * SessionRecapPanel Component
 *
 * Generates an AI-powered recap of the current session.
 * Triggers a background job, polls for progress, and displays the result.
 *
 * Usage:
 *   <SessionRecapPanel
 *     sessionId={sessionId}
 *     onClose={() => setShowRecapPanel(false)}
 *   />
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Loader2, X, AlertCircle, FileText, RotateCcw } from "lucide-react";
import { JobProgress } from "@/components/jobs/job-progress";
import { safeParse } from "@/lib/safe-json";

interface SessionRecapPanelProps {
  sessionId: string;
  onClose: () => void;
}

type RecapStatus = "idle" | "running" | "completed" | "failed";

export function SessionRecapPanel({ sessionId, onClose }: SessionRecapPanelProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<RecapStatus>("idle");
  const [recap, setRecap] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [triggering, setTriggering] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Poll job status every 2s
  const pollJob = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/jobs`);
        if (!res.ok) return;
        const json = await res.json();
        const job = (json.jobs || []).find((j: { id: string }) => j.id === id);
        if (!job) return;

        setProgress(job.progress || 0);
        setProgressMessage(job.progress_message || null);

        if (job.status === "completed") {
          setStatus("completed");
          // Extract recap from job result or payload
          const result = job.result
            ? typeof job.result === "string"
              ? safeParse<Record<string, unknown>>(job.result)
              : job.result
            : null;
          setRecap(result?.recap || result?.content || job.progress_message || "Recap generated successfully.");
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (job.status === "failed") {
          setStatus("failed");
          setError(job.error || "Recap generation failed.");
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (job.status === "cancelled") {
          setStatus("failed");
          setError("Recap generation was cancelled.");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Network error — keep polling
      }
    },
    []
  );

  // Start polling when job ID is set
  useEffect(() => {
    if (!jobId || status !== "running") return;

    // Poll immediately
    pollJob(jobId);

    // Then every 2s
    pollRef.current = setInterval(() => pollJob(jobId), 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, status, pollJob]);

  const generateRecap = async () => {
    setTriggering(true);
    setError("");
    setRecap("");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/recap`, { method: "POST" });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to start recap generation");
      }
      const json = await res.json();
      setJobId(json.jobId);
      setStatus("running");
      setProgress(0);
      setProgressMessage("Queued...");
    } catch (err: unknown) {
      setStatus("failed");
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setTriggering(false);
    }
  };

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setJobId(null);
    setStatus("idle");
    setRecap("");
    setProgress(0);
    setProgressMessage(null);
    setError("");
  };

  return (
    <div className="rounded-lg border border-border-default bg-bg-elevated">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h3 className="text-xs font-semibold text-text-primary">Session Recap</h3>
        </div>
        <div className="flex items-center gap-1">
          {status !== "idle" && (
            <button
              onClick={handleReset}
              className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
              title="Reset"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-secondary"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4">
        {/* Idle state — generate button */}
        {status === "idle" && (
          <div className="text-center">
            <FileText className="mx-auto mb-2 h-8 w-8 text-text-muted" />
            <p className="mb-3 text-xxs text-text-muted">
              Generate an AI-powered summary of this session&apos;s events, characters, and key moments.
            </p>
            <button
              onClick={generateRecap}
              disabled={triggering}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-xs text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {triggering ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate Recap
                </>
              )}
            </button>
          </div>
        )}

        {/* Running state — progress bar */}
        {status === "running" && jobId && (
          <div>
            <JobProgress
              progress={progress}
              message={progressMessage}
              status="processing"
              className="mb-3"
            />
            <p className="text-xxs text-text-muted">
              This may take a moment depending on session length...
            </p>
          </div>
        )}

        {/* Completed state — recap text */}
        {status === "completed" && (
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-success" />
              <span className="text-xxs font-medium text-success">Recap generated</span>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border-default bg-bg-base p-3">
              <pre className="whitespace-pre-wrap text-xs text-text-primary leading-relaxed">
                {recap}
              </pre>
            </div>
          </div>
        )}

        {/* Failed state — error message */}
        {status === "failed" && (
          <div className="text-center">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-error" />
            <p className="mb-1 text-xs font-medium text-error">Recap generation failed</p>
            <p className="mb-3 text-xxs text-text-muted">{error}</p>
            <button
              onClick={generateRecap}
              disabled={triggering}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-xs text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {triggering ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Retry
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
