'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Sparkles, Loader2, CheckCircle, ExternalLink, AlertCircle } from 'lucide-react';
import { JobProgress } from '@/components/jobs/job-progress';

interface LoreExtractionTriggerProps {
  universeId: string;
}

type ExtractionStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed';

export function LoreExtractionTrigger({ universeId }: LoreExtractionTriggerProps) {
  const [status, setStatus] = useState<ExtractionStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup SSE connection on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // Connect to SSE stream for job progress
  const connectSSE = useCallback(() => {
    // Close existing connection
    eventSourceRef.current?.close();

    const es = new EventSource('/api/jobs/stream');
    eventSourceRef.current = es;

    es.addEventListener('job:progress', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.jobId === jobId) {
          setProgress(data.progress ?? 0);
          setMessage(data.message ?? null);
        }
      } catch {
        // Ignore parse errors
      }
    });

    es.addEventListener('job:completed', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.jobId === jobId) {
          setStatus('completed');
          setProgress(100);
          setMessage(null);
          es.close();
        }
      } catch {
        // Ignore parse errors
      }
    });

    es.addEventListener('error', () => {
      // SSE connection error - don't fail the job, just stop listening
      es.close();
    });
  }, [jobId]);

  // Connect SSE when job starts
  useEffect(() => {
    if (status === 'queued' || status === 'processing') {
      connectSSE();
    }
  }, [status, connectSSE]);

  const triggerExtraction = async () => {
    setTriggering(true);
    setError(null);
    setProgress(0);
    setMessage(null);

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'queue',
          type: 'extract_lore_comprehensive',
          universe_id: universeId,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json();
        throw new Error(errorBody.error || 'Failed to queue extraction job');
      }

      const json = await res.json();
      setJobId(json.jobId);
      setStatus('queued');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('failed');
    } finally {
      setTriggering(false);
    }
  };

  const reset = () => {
    eventSourceRef.current?.close();
    setStatus('idle');
    setProgress(0);
    setMessage(null);
    setJobId(null);
    setError(null);
  };

  // Idle state - show trigger button
  if (status === 'idle') {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
            <Sparkles className="h-5 w-5 text-accent" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-text-primary">Extract Lore</h3>
            <p className="text-xs text-text-muted">
              Scan all session messages and extract characters, locations, events, and relationships into wiki pages.
            </p>
          </div>
          <button
            onClick={triggerExtraction}
            disabled={triggering}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {triggering ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Extract
              </>
            )}
          </button>
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-error shrink-0" />
            <p className="text-xs text-error">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // Completed state - show success + link to review
  if (status === 'completed') {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
            <CheckCircle className="h-5 w-5 text-success" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-text-primary">Extraction Complete</h3>
            <p className="text-xs text-text-muted">
              New wiki pages have been created. Review them before they go live.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/wiki/_review"
              className="rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-bg-highlight flex items-center gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Review Queue
            </Link>
            <button
              onClick={reset}
              className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Extract Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Failed state
  if (status === 'failed') {
    return (
      <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-error/10">
            <AlertCircle className="h-5 w-5 text-error" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-text-primary">Extraction Failed</h3>
            <p className="text-xs text-error">{error || 'An unexpected error occurred'}</p>
          </div>
          <button
            onClick={reset}
            className="shrink-0 rounded-lg border border-border-default bg-bg-raised px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-bg-highlight"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Processing/queued state - show progress
  return (
    <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
          <Loader2 className="h-5 w-5 text-accent animate-spin" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-text-primary">
            {status === 'queued' ? 'Queued for Extraction' : 'Extracting Lore...'}
          </h3>
          {message && (
            <p className="text-xs text-text-muted">{message}</p>
          )}
        </div>
      </div>
      <JobProgress
        progress={progress}
        message={message}
        status={status === 'queued' ? 'queued' : 'processing'}
      />
    </div>
  );
}
