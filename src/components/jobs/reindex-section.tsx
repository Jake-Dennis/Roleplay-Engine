"use client";

import { Database, Loader2, RefreshCw } from "lucide-react";

interface ReindexSectionProps {
  onReindex: (type: string) => void;
  reindexing: string | null;
  reindexResult: string | null;
}

export function ReindexSection({ onReindex, reindexing, reindexResult }: ReindexSectionProps) {
  return (
    <div className="mb-6 rounded-xl border border-border-default bg-bg-elevated px-4 py-3">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-text-accent" />
        <span className="text-xs font-medium text-text-primary">Reindex</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={() => onReindex("wiki")}
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
          onClick={() => onReindex("embeddings")}
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
          onClick={() => onReindex("all")}
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
        {reindexResult && <span className="text-xxs text-text-muted">{reindexResult}</span>}
      </div>
    </div>
  );
}
