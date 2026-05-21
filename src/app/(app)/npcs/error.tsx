"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("NPCs error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-8">
      <div className="w-full max-w-md rounded-xl border border-border-default bg-surface-elevated p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error/10">
          <AlertTriangle className="h-8 w-8 text-error" />
        </div>
        <h1 className="mb-2 text-lg font-semibold text-text-primary">Something went wrong</h1>
        <p className="mb-6 text-sm text-text-muted">
          An unexpected error occurred. Please try again.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-raised px-4 py-2 text-xs font-medium text-text-primary hover:bg-surface-overlay"
          >
            <Home className="h-3.5 w-3.5" />
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
